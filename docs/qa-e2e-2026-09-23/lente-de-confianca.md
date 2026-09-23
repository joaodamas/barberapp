# Trust-lens audit: CorteHub, branch qa/e2e-2026-09-23 (2026-09-23)

Rule from HANDOFF §3.1: the system must never claim something happened when it didn't, and must never fail to acknowledge something that did happen.

Scope: loyalty (fidelidade), inventory (estoque), onboarding, the client app, plus billing, mensalistas, refunds, caixa, comecar-do-zero, availability and booking.
Baseline: functions 524/524 green, web 854/854 green. Every finding below passed those suites.

How findings were checked:
- **CONFIRMED** means I ran real code. Callables were invoked through `.run()` against the Firestore emulator, and the pure modules through vitest. Scratch harness: `<scratchpad da sessão>/fn/*.test.ts` and `<scratchpad da sessão>/web/dre.test.ts`.
- **CONFIRMED (code)** means the behavior is fixed by the code with no runtime dependency, but I did not execute it.
- **PROBABLE** means it needs a race, or a state I did not build.

---

## P1

### P1-1 · A client can redeem a loyalty reward that nobody delivers, and the shop may never have offered one — CONFIRMED
- `functions/src/loyalty.ts:74-113`, `web/src/app/(cliente)/reservas/page.tsx:92-107, 423-432`, `web/src/app/(cliente)/page.tsx:139+`
- **Scenario A:** a shop on plan `agenda` (`features.loyalty=false`) has a client with 10 stamps. `redeemLoyaltyReward` returns `{saldoAnterior:10, saldoAtual:0, recompensa:"1 corte grátis"}`. Reproduced in the emulator. Neither side checks `features.loyalty`. The client app always shows the stamp card and the "Resgatar 1 corte grátis" button.
- **Scenario B:** the redemption writes a `loyalty_transactions` doc with `stamps:-10`. That is its only effect:
  - Nothing in `web/src/app/painel` or `components` reads `loyalty_transactions` (grep finds zero readers).
  - No WhatsApp is sent. The `fidelidade_resgatada` template exists but is never sent.
  - Nothing links the redemption to a booking.
  - The client's stamps are gone, the owner never learns of it, and at closing the owner charges full price.
- **Scenario C:** the owner cannot configure the program. There is no painel screen for `policies.loyalty`, yet the client is still promised "1 corte grátis" every 10 visits by default.
- **Fix:**
  - Gate credit and redemption on `acessoDaBarbearia(...).features.loyalty`, on both server and client.
  - Turn a redemption into a pending voucher that the owner sees and consumes at closing (the reward is a price-0 closing, or a discount on the fact).
  - Send `fidelidade_resgatada` to the owner only after the write succeeds.
  - Until then, hide the button.

### P1-2 · Merging a counter client into an app account orphans the plan and the stamps, and allows a second active subscription — CONFIRMED (emulator)
- `functions/src/clients.ts:182-215` (merge), `financial-events.ts:401-406` (coverage by `clientId`), `mensalistas.ts:417-425` (duplicate check by `clientId`)
- **Scenario:**
  1. The owner creates João at the counter (`clients/WTan…`) and makes him a mensalista of the Ilimitado plan.
  2. João installs the app and books with the same WhatsApp. `resolverCliente` marks `WTan…` as `active:false, mergedInto: joaoUid`, and the booking gets `clientId=joaoUid`.
  3. Result: 0 subscriptions and 0 stamps are visible for `joaoUid`. `criarMensalista(clientId: joaoUid)` **succeeds**, so there are now **2 active subscriptions for the same person**.
- **Consequences:**
  - `resolverCobertura` looks up `joaoUid` and finds no plan. The cut is charged as avulso. If the owner used "Concluir sem cobrar", it is recorded as R$ 50 "não informado" revenue that was never received.
  - `agendar` stops showing "Você é mensalista".
  - `emitirFaturasDaCompetencia` bills both contracts, so MRR counts double.
  - Counter stamps are lost to the app user.
- **Fix:** on merge, move live state inside the same transaction: the active `subscriptions.clientId` and the `loyalty_transactions`. Booking history can stay on the old id, since that is the stated decision. Alternatively, make coverage and loyalty resolve through `mergedInto`.

### P1-3 · The DRE can show a negative commission for a re-concluded appointment — CONFIRMED (pure)
- `web/src/lib/analytics.ts:474-481` (`new Map(commissions.map(c => [c.bookingId, c]))`)
- After revert and re-conclusion (P1-7 design), one booking has three service-commission docs that all carry the same `bookingId`:
  - `comissao_bk` (+20)
  - `comissao_estorno_bk_ev1` (−20)
  - `comissao_bk_ev2` (+20)
- The Map keeps whichever doc comes **last**. With id order the barber's line is **−R$ 20,00, base −50** instead of +R$ 20,00. Reproduced output: `total= -20 … "base":-50,"valor":-20`.
- In production the order comes from `orderBy date desc`, with ties broken by document name. So the result depends on the booking id's first character: roughly 1 in 3 re-concluded bookings go negative, and the rest are right only by accident.
- No test feeds multiple lines per booking.
- **Fix:** aggregate by summing every `origin:"servico"` line per `bookingId` (amount and base), and add a test with the three-line cycle.

### P1-4 · New shops publish R$ 0,00 services, and the server books them — CONFIRMED (emulator)
- `functions/src/signup.ts` (SEED_SERVICES `price: 0, active: true`), `web/src/components/comecar/passo-servicos.tsx` (needs only **1** valid service), `web/src/app/(cliente)/agendar/page.tsx:47-48` (filters only `active`), `functions/src/booking.ts:331-338` (accepts price 0)
- **Scenario:**
  1. During onboarding the owner prices only "Corte".
  2. "Barba", "Corte + barba" and "Sobrancelha" stay active at R$ 0,00.
  3. A client books them. Emulator: `createBooking(["sobrancelha","vazio"])` returned `{value:0,status:"confirmed"}`, and the "vazio" service has an empty name. `servicos-editor.tsx:128-137` creates exactly that kind of service (`name:"", price:0, active:true`).
  4. The WhatsApp confirmation says "R$ 0,00". Concluding records R$ 0 revenue, R$ 0 fee and R$ 0 commission for a service that was charged at the counter.
  5. `corrigirPagamentoDeAtendimento` can fix the method but not the value.
- **Fix:**
  - Seed services with `active:false`, or require every active service to be priced before `servicos` completes.
  - `validarPedido` should reject services with `price <= 0` or an empty `name`.
  - The client catalog should hide them.

## P2

### P2-1 · `rescheduleBooking` ignores the barber's schedule, opening hours, breaks and slot grid — CONFIRMED (emulator)
- `functions/src/booking.ts:813-879`
- Setup: the shop is open Mon–Sat 09–19 with a 12–14 break. Barber Leo is off on Mondays and starts at 10:00. `createBooking` correctly refuses Monday ("Leo não atende neste dia") and 09:00 ("fora do expediente").
- A reschedule of the same booking **accepted** all of these: Monday 10:00 (Leo's day off), Tuesday 23:00, 12:30 (lunch), 09:00 (before Leo starts), and 10:07 (off the grid).
- The UI only offers `availableSlots`, but the callable is public, and the header says "interface não é guarda".
- The transaction also never re-reads the booking status. A cancel that lands between the read at line 798 and the `tx.update` is overwritten with `status:"confirmed"`, which revives a cancelled booking (PROBABLE).
- **Fix:**
  - Call `validarPedido(... exigirAntecedencia:true, staffId: booking.staffId)` and reuse its `slotMinutes` and `duracaoDaReserva`.
  - Inside the transaction, `tx.get(bookingRef)` and re-check `EM_ABERTO`.

### P2-2 · A product sale retried with a changed cart is reported as recorded when part of it was not — CONFIRMED (emulator)
- `functions/src/inventory.ts:390-421`, `web/src/components/vender-produto.tsx:71, 128-163`
- **Scenario:**
  1. The sale of 1 Pomada commits, but the response is lost (network).
  2. The key is kept, which is intended.
  3. The owner edits the cart to 2 Pomada + 1 Óleo and taps again.
  4. The server sees `venda_k1_pomada` exists and returns `repetida:true`, with `movementIds:["venda_k1_pomada","venda_k1_oleo"]` (the second **does not exist**) and `value:45`.
  5. Óleo stock stays 10 and nothing is recorded for the extra items.
  6. The UI shows "venda registrada" using the **cart** item count (`totalItens`).
- **Fix:**
  - Include a cart fingerprint in the key, or rotate the key whenever the cart changes.
  - On `repetida`, compare the requested items with the stored ones and fail loudly if they differ.
  - Show the server's items, not the cart's.

### P2-3 · The client app hides bookings and treats past appointments as upcoming — CONFIRMED (code)
- `web/src/app/(cliente)/reservas/page.tsx:71-76`, `web/src/app/(cliente)/page.tsx:26-30`
- `reservas` renders **one** card, `futuras[futuras.length-1]`, even though the server allows 3 active bookings (`maxActivePerClient`). The other two can't be seen, cancelled or rescheduled from the app.
- `futuras` filters on `OCCUPIES_SLOT`, which includes `completed` and `no_show`. The home "Próximo agendamento" sorts by date only (not time), so today's finished 10:00 cut or a missed appointment can show as "next", with Cancel/Remarcar buttons that the server then refuses.
- `hoje = new Date().toISOString()` is UTC, so from 21:00 BRT onward "today" is already tomorrow.
- **Fix:** list every open booking; filter on `EM_ABERTO` and a future start instant; sort by `date+time`; use a local or shop-timezone date.

### P2-4 · The perfil page makes false claims to mensalistas and about policy — CONFIRMED (code)
- `web/src/app/(cliente)/perfil/page.tsx` ("Meu plano" modal and "Política" modal)
- A mensalista reads "Hoje você paga por atendimento avulso". It is hard-coded. `agendar` already reads `useMinhasAssinaturas` and says the opposite.
- "Corte quantas vezes quiser por um valor fixo no mês" appears even when the shop has only quota or discount plans, or none.
- The policy text promises "faltas repetidas passam a exigir pagamento antecipado" (prepayment was removed; `booking.ts:70-75` rejects it) and "prioridade no reagendamento". No mechanism exists for either.
- "investido na barbearia" sums `value` of covered-by-plan and refunded bookings.
- **Fix:** read `assinaturaAtivaDe(...)`; remove promises with no implementation; compute spending from `payments` minus `refunds`.

### P2-5 · The Planos page shows impossible savings for quota plans — CONFIRMED (arithmetic)
- `web/src/app/(cliente)/planos/page.tsx:71-76, 110-124`
- A 4-cuts plan at R$ 160 against R$ 50 avulso renders "~~R$ 50,00~~ no avulso · **economize −220%**".
- For unlimited plans at exact break-even (R$ 100 vs R$ 50), it says "a partir da 2ª visita o plano já compensa", where it only breaks even.
- **Fix:**
  - Branch on `servicesIncluded`, computing savings as `1 − price/(servicesIncluded × priceAvulso)`.
  - Use `floor(price/avulso) + 1` for "compensa".
  - Hide any savings figure that is not positive.

### P2-6 · Loja "Adicionar produto" closes the modal before the write is confirmed — CONFIRMED (code)
- `web/src/app/painel/(dashboard)/loja/page.tsx:96-118`
- `void createDoc(...).catch(() => setFormError(...)); setModalOpen(false);` is handoff pattern #1 exactly. The error is set on a modal that is already closed, so a failed create is silent.
- `servicos-editor.tsx:128-137` `adicionar()` has the same shape (its error does surface in a banner).
- **Fix:** `soAvisaSeGravou`; close the modal only on success.

### P2-7 · A cancel racing with the owner's completion splits the ledgers — PROBABLE
- `functions/src/booking.ts:990-1042` (read outside any transaction, then a bare `update`), with painel `concluirCom` doing `patchDoc(status:"completed")`
- **Scenario:**
  1. The client taps Cancel while the owner concludes.
  2. The client's update lands last, so the booking ends as `cancelled_by_client`.
  3. `decidirEfeito("completed","cancelled_by_client")` is `"nada"`, so the payment and commission docs remain.
  4. The DRE revenue and commission are booking-driven (`isRevenue`), so the cut disappears from them.
  5. Caixa and fluxo are payments-driven, so they still show the cash.
  6. The loyalty stamp remains.
- **Fix:** run `cancelBooking` in a transaction that re-reads the status. Have the painel completion go through a callable that also checks it.

### P2-8 · A test asserts the mid-month-cancellation promise using a state that cannot happen — CONFIRMED (pure)
- `functions/src/__tests__/cobertura-do-plano.test.ts:156-162` uses `status:"ativo", canceledAt:"2026-09-20"` and expects `plano`.
- `cancelarMensalista` (`mensalistas.ts:489`) always writes `status:"cancelado"` together with `canceledAt`. In that real state:
  - `decidirCobertura` returns `avulso/plano_inativo` (ran it).
  - `resolverCobertura` only queries `status=="ativo"`.
- Meanwhile `valeNaCompetencia` still bills that month (ran it: `true`). The client pays the month, and the cuts after the cancellation are charged again, contradicting `plano_cancelado` ("continua valendo até…").
- Latent today, because no UI calls `cancelarMensalista`. This is the same "test encodes the defect" class as the handoff's example.
- **Fix:** coverage should accept `cancelado` while `valeNaCompetencia` holds, and the lookup should not filter on `ativo`. Rewrite the fixture with the real state.

### P2-9 · Owner and client are not notified of reschedules or client cancellations — CONFIRMED (code)
- `functions/src/index.ts` exports only `notifyBookingCreated`. The templates `reagendamento_confirmado`, `cancelamento_reserva` and `agenda_alterada` exist but are unused.
- An owner who relies on the "nova_reserva" WhatsApp keeps the old time; the client's confirmation also still shows the old time.
- **Fix:** add an `onDocumentUpdated` trigger for date/time/status changes, with the same `dedupeKey` discipline.

## P3

- **No booking horizon on the server.** `createBooking` for 2028-09-26 was accepted (CONFIRMED). The 60-day horizon exists only in `web/src/lib/slots.ts` (`bookingPolicy.maxAdvanceDays`). Combined with `maxAtivas=3`, one account can hold far-future slots indefinitely.
- **The derived-commission fallback rounds to whole reais.** `analytics.ts:486` uses `Math.round(base*pct/100)`: R$ 45,50 at 40% becomes R$ 18 instead of R$ 18,20 (CONFIRMED). This contradicts the D1/D5 "centavos" doctrine. It affects only pre-trigger history.
- **Loyalty stamps are never removed by refunds, and plan-covered cuts earn them.** A fully refunded service keeps its stamp; `refunds.ts` touches loyalty on no path. `loyalty.ts:9-12` quotes PRD §9, which says cancellation removes points. Covered-by-plan and R$ 0 cuts also earn stamps. If a stamp is reverted after a redemption, the balance goes negative and is displayed as 0 until refilled.
- **Suspended client subscriptions keep generating invoices.** `emitirFaturasDaCompetencia` ignores `status` (`valeNaCompetencia` only looks at dates; CONFIRMED). Latent, since nothing writes `suspenso` for client subscriptions yet.
- **`comecarDoZero` inconsistencies:**
  - It deletes `subscriptions` (live contracts), although its own doc says "cadastro fica".
  - It zeroes `products.stock` even when the 5 000-doc cap stops before `inventory_movements` is reached.
  - Restocking afterwards can only go through `registrarEntradaDeEstoque` (kind `compra`), which records a **fake cash outflow** in `fluxo-de-caixa` for goods that were already on the shelf. The same happens for any initial stock count. (PROBABLE)
- **`reservas` uses the platform constants `cancellationPolicy`/`reschedulePolicy` instead of the tenant's.** The server uses the tenant's. They diverge only if policies are written directly; there is no UI for them yet.
- **`signUpBarbershop` sets claims after the transaction.** If `setCustomUserClaims` fails, the shop exists, the owner can't reach it, and a retry hits "Sua conta já tem uma barbearia". The one-shop check is also outside the transaction, so two concurrent signups can create two shops. (PROBABLE)
- **The billing routine never suspends anything.** `billing.ts:23` has `DRY_RUN = true`. The web derives read-only mode on its own (`acessoDaBarbearia`), but the server keeps honoring `features: gestao` from the trial. That is how P1-1 survives a downgrade.
- **The tax model overstates tax for an MEI.** It is a flat 6% of gross (`taxRatePct`, Simples Anexo III): on R$ 6.000/month it books R$ 360, against a fixed MEI DAS of about R$ 76. Many single-chair shops are MEI.
- **Aside, not business logic:** `index.ts:91-125` `setOwnerRole` trusts a global `token.role === "owner"` that no current flow issues. Worth confirming nobody holds it.

## Sector plausibility check (CONFIRMED, pure `resultadoDoMes`)

Scenario:
- 2 barbers at 50% and 40% commission.
- 400 cuts × R$ 50 = R$ 20.000.
- Payment mix: Pix 45% (0%), debit 20% (1,99%), credit 25% (3,49%), cash 10%.
- Fixed costs: rent R$ 3.000, electricity R$ 450, software R$ 150 (all recurring), plus R$ 600 of supplies.

| Line | Value |
|---|---|
| Card fees | R$ 255 |
| Commission | R$ 9.000 |
| Fixed | R$ 4.200 |
| Tax (6%) | R$ 1.200 |
| **Result** | **R$ 5.345 (26,7% net margin)** |
| Contribution margin | 53,7% |
| Break-even | day 22 |

This is inside the Sebrae 15–30% band, so the engine is plausible for the avulso case.

The documented pending decision (`financial-events.ts:721-729`) is what can produce absurd margins. Full commission is paid on plan-covered cuts: an Ilimitado R$ 149 client who cuts 10 × R$ 50 generates R$ 200 of commission against R$ 149 received, a negative margin on that client. P1-3 can also push commission (and so margin) the wrong way.

## Things checked and found sound
- `createBooking` and `createBookingAtCounter` share `validarPedido`: barber schedule, day/hours/break/grid, catalog price.
- The double-booking lock is a window-based transaction.
- Server times use the shop's timezone through `Intl`. Brazil has no DST since 2019, and `instanteNoFuso` is offset-per-date anyway.
- The "Nova reserva" WhatsApp fires only from `onDocumentCreated`, i.e. after commit.
- `agendar` shows success only after `createBooking` resolves; owner cancel opens WhatsApp only after success.
- The planos page is a showcase, not a fake checkout; perfil "Meus dados" persists before it shows "Salvo!".
- Refund limits are transactional.
- Stock sale and purchase are transactional, with frozen cost.
- Mensalidade payment and its `PaymentDoc` are written atomically.
