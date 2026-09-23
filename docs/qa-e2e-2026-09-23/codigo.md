# CorteHub: code quality audit (qa/e2e-2026-09-23 = origin/main @ 162d815)

This review was read-only. Every finding below comes from reading the code. The float-rounding numbers were checked in node. Nothing was run against the emulator or production. Per HANDOFF §3, treat each item as 🟡 until it has been reproduced.

Context correction: the functions run in **southamerica-east1**, not us-central1 (`functions/src/index.ts:19`). The process clock is still UTC, so the timezone concerns still apply.

---

## P0: wrong data in a documented, normal flow

### P0-1. The DRE shows the wrong commission for any re-concluded booking (map keeps the last entry)
- `web/src/lib/analytics.ts:471-478` builds `congelada = new Map(commissions.map(c => [c.bookingId, c]))`, which keeps **one** document per booking.
- After concluir → desfazer (no_show/confirmed) → concluir, which is the P1-7 flow the trigger was rebuilt for, a booking has **three** service commission docs, all with `origin: "servico"` and the same `bookingId`:
  - `comissao_{id}` (+20)
  - `comissao_estorno_{id}_{ev}` (−20) (`functions/src/comissoes.ts:248-258`)
  - `comissao_{id}_{ev}` (+20) (`comissoes.ts:274-276`)
- Whichever doc iterates last wins. `useCommissions` orders by `date desc`, and all three share the same date, so the tie falls to document-name order. The estorno sorts last whenever the booking id's first character sorts above `e`, roughly a third of auto-ids. In that case the DRE and `comissaoPorBarbeiro` show **−R$ 20 instead of +R$ 20** for a service that happened. When another doc wins, the result is right only by accident.
- Why it matters: this is the barber settlement line, and it is wrong on exactly the flow P1-7 was meant to make safe.
- Fix: sum every service commission doc per `bookingId` (net value), and use the booking-derived fallback only when a booking has no doc at all. Add a regression test with the three docs.
- Test gap: no test in `web/src/lib/__tests__` feeds an estorno or a new-cycle commission into `comissoesDeServico`.

---

## P1

### P1-1. The financial trigger is not transactional and trusts the event snapshot, so fast undo/redo corrupts the fact
`functions/src/financial-events.ts:441-765` (and `loyalty.ts:27-66`):
- Every decision is made from `event.data.after`. Firestore triggers carry no ordering guarantee and fire seconds after the write. The trigger then writes facts and booking fields in an un-transacted `Promise.all`.
- Scenario A: complete (T1), then quickly mark no_show (T2), and T2 runs first.
  - T2 finds no `comissao_{id}` yet, so it writes no estorno and stores `cicloFinanceiro {comissao:null, pagamento:null}`.
  - T1 then materializes `payments/pagamento_{id}` and the commission.
  - Result: a **no_show booking with revenue and commission**.
- Scenario B: complete, undo, complete again before T2 has written `cicloFinanceiro`.
  - T3 sees no cycle and treats itself as the first conclusion. It rewrites `comissao_{id}`, which T2 has already negated, so the barber nets **zero**.
  - T3 also re-reads `staff.commissionPct` from the current profile, which breaks the "money frozen at the fact" rule.
  - T2's `reservaRef.set({paymentMethod:null,...})` can land after T3 and blank the method on a completed booking.
- Loyalty has the same ordering problem: `ref.delete()` from the reversal can land after the credit `set`.
- The reversal branch swallows the write that stores the cycle: `reservaRef.set(...).catch(() => undefined)` at `:557-568`. If it fails, scenario B happens deterministically.
- The triggers have no `retry: true`, so any failure is permanent and silent.
- Fix, either of:
  - (a) inside the trigger, open a transaction that re-reads the **current** booking and commission docs, and act on the current status, not the event's; or
  - (b) move concluir/desfazer to a callable that writes the status and the facts in one transaction, which also removes the trigger latency.
  - Also stop swallowing the `cicloFinanceiro` write, and enable retries now that the writes are idempotent.
- Test gap: the handler never runs in tests. Only the pure helpers are covered (`financial-events.test.ts`, `p1-7-comissao-do-ciclo.test.ts`).

### P1-2. cancelBooking and rescheduleBooking check state outside the transaction
- **cancel** (`functions/src/booking.ts:990-1042`):
  - It reads the booking, checks `EM_ABERTO`, then runs a plain `bookingRef.update`.
  - If the owner completes the booking in between, it becomes `cancelled_by_*` while `pagamento_`, `comissao_` and the loyalty credit all survive (`decidirEfeito` returns "nada").
  - The comment at `:1002-1016` describes the guard as closing this hole, but a concurrent write gets straight past it.
- **reschedule** (`booking.ts:798-918`):
  - Status (`:809`) and `rescheduleCount` (`:869`) are checked outside the transaction.
  - Then `tx.update` **forces `status: "confirmed"`** (`:909`).
  - A booking completed or cancelled between the pre-read and the transaction gets resurrected. completed → confirmed is `reverter`, which **deletes the payment of a real service**.
  - The comment at `:861-867` says the count is checked "dentro da mesma transação". It is not: two concurrent reschedules both pass the cap, and only the increment is atomic.
- Fix: do `tx.get(bookingRef)` inside `runTransaction` and re-check status and count there. Use `tx.update` in cancel as well.

### P1-3. rescheduleBooking validates differently from createBooking (two sources answering the same question)
`booking.ts:813-879` against `validarPedido` (`:206-388`):
- It ignores the **barber's** schedule. It uses shop `schedule` only (`:819-830`), while create and `availableSlots` use `barbeiro.get("schedule")`.
- It ignores the barber's `slotMinutes` (`:878` against `:343`).
- It has **no in-expediente check**. The `horariosDaJornada` guard at `:365-377` is missing, and `HORA = /^\d{2}:\d{2}$/` accepts `99:99`.
- Effects:
  - A direct call can move a booking to 23:00, into the lunch break, or onto a day the barber is off (when the shop opens that day).
  - Through the UI, a barber who works on a day the shop is closed has slots offered by `availableSlots` that the server then rejects.
- Fix: reschedule should call `validarPedido({... staffId: booking.staffId, exigirAntecedencia: !ehDono})` and reuse its `slotMinutes` and `duracaoDaReserva`.

### P1-4. Shared Firestore listeners never evict an errored subscription, and the cache key ignores the user
`web/src/lib/db/repository.ts:99-160`:
- On an `onSnapshot` error, the `assinaturas` entry stays in the map. The listener is dead, `ultimo` holds whatever it had, and the error is broadcast only once.
- Any later subscriber with the same key joins the dead entry and either:
  - never receives data or an error, so it spins on "carregando" forever; or
  - immediately receives the stale `ultimo`.
- Realistic triggers:
  - A missing index or a permission-denied before claims refresh, then navigating away and back within 30s.
  - On a shared counter tablet, logout/login as a different user within 30s: the key `barbershopId:collection:options` has no uid, so the new user is served the previous user's cached items.
- Also: if the 30s timer fires before `getDb()` resolves, `nova.unsubscribe` is still the no-op, `cancelado` never flips, and the listener leaks.
- Fix:
  - In the error callback, delete the entry and cache the error so late joiners receive it.
  - Include `auth.currentUser?.uid` in the key.
  - Keep `cancelado` in a closure that the returned unsubscribe can set before `getDb` resolves.

### P1-5. Clients with area code 55 (RS) cannot book, and their numbers are stored without the country code
`web/src/lib/whatsapp-numero.ts:23-39`:
- `whatsappValido("(55) 99123-4567")` gives digits `55991234567`. `.replace(/^55/,"")` leaves 9 digits, so the number is **rejected**, and the booking CTA stays disabled (`agendar/page.tsx:257-260`).
- `normalizarWhatsapp` keeps a national number that starts with 55 as if it already had the DDI, so wa.me links and the webhook sender match both break.
- Fix: decide by length. 10-11 digits means national, so prepend 55. 12-13 digits starting with 55 already has the DDI.
- Test: add DDD 55 cases to `whatsapp-numero.test.ts`.

### P1-6. The WhatsApp webhook does its work after sending the HTTP response (latent until Meta verification)
`functions/src/whatsapp/webhook.ts:125-131`:
- It sends `res.status(200)` and then awaits `processar`. On Cloud Functions v2 (Cloud Run), work after the response is not guaranteed CPU and can be dropped, so "Cancelar"/"Confirmo" taps can be lost silently.
- The same handler (`:272-281`) has three more problems:
  - The terminal list omits `no_show`, so a late "Confirmo" turns a no-show into `confirmed_by_client`.
  - The status check and the update are not transactional.
  - CANCEL_BOOKING bypasses `cancelBooking`: no `cancelledAt`, no `refundedAmount`, and a second cancellation path.
- Also verify against real traffic: Meta `wa_id` for Brazilian mobiles often lacks the 9th digit, so `donoDaReserva === de` (`:257`) may reject the client's own taps.
- Fix:
  - Process first and respond second. Idempotency is already handled by message ids and dedupe.
  - Run the status change in a transaction that shares `desfechoDoCancelamento`.
  - Compare phone numbers with a normalization that tolerates the missing 9th digit.

### P1-7. Every panel read subscribes to whole collections, with no limit and no date range
- `web/src/lib/db/use-shop-data.ts:20-109`. `ListOptions` (`repository.ts:40-47`) has no limit or range support at all.
- The "Hoje" screen (`painel/(dashboard)/page.tsx:68,80-81`) listens to **every booking ever** in order to filter today's.
- DRE, Números and fluxo-caixa (`use-financeiro.ts`) listen to all bookings, payments, commissions, expenses and movements.
- Cost, memory and snapshot re-processing grow linearly with history. At about 30 bookings a day, that is about 11k docs per collection per panel open after one year, and every snapshot change re-runs the analytics.
- Fix:
  - Add `where("date", ">=", from)` / `<=` range options. "Hoje" needs today plus the open backlog, and financeiro needs the selected period.
  - Keep the full-history reads only where they are genuinely needed (client history), paginated.

---

## P2

1. **The client app reads platform constants instead of tenant policy.**
   - `web/src/app/(cliente)/reservas/page.tsx:19-53,180-187` uses `reschedulePolicy` and `cancellationPolicy` from `business-rules`. A shop that set `minHoursBefore: 2` or `maxPerBooking: 3` shows the client a different rule from the one the server enforces. The panel side already fixed this same bug (`page.tsx:173-179`).
   - `lib/slots.ts:68-85` uses the global `bookingPolicy.maxAdvanceDays/visibleDays`.
   - `agendar/page.tsx:66-67` computes the initial day with `bookableDays()` against the DEFAULT schedule, not `tenant.schedule`, which `reservas` does correctly.
2. **"Hoje" is computed in UTC in the client app.**
   - `(cliente)/page.tsx:26` and `(cliente)/reservas/page.tsx:71` use `new Date().toISOString().slice(0,10)`. After 21:00 BRT, today's remaining bookings drop out of "próximas" and the manage/cancel card.
   - Use `toISODate` or `hojeNoFuso(tenant.locale.timeZone)`.
   - Also, `reservas:75` picks `futuras[futuras.length-1]`, which is ordered by date only: same-day ordering is arbitrary, and it can include a slot from earlier today.
3. **An availability error is displayed as "no times available".** `agendar/page.tsx:221-223` and `reservas/page.tsx:147-148` map a failed `availableSlots` call to `slots: []`, which is the fully-booked state. This breaks the trust lens (the system asserts something it doesn't know). Add an `"erro"` state to `estado-dos-horarios`.
4. **soAvisaSeGravou violations.**
   - `painel/(dashboard)/loja/page.tsx:107-118` uses `void createDoc(...)`, then `setModalOpen(false)` runs immediately. On failure, `formError` is set inside a modal that is already closed (it renders at `:388`), so the owner sees success and the form is lost.
   - `components/servicos-editor.tsx:129-139` (`adicionar`) uses the same `void` pattern.
   - Both should await via `soAvisaSeGravou`.
5. **The read-only mode and plan gates apply only to Firestore-SDK writes.**
   - `lib/db/trava-de-escrita.ts:11-15` says "todo caminho de escrita do painel passa por repository.ts". That is false: `callFunction` (`lib/firebase.ts:105-110`) has no `conferirEscrita`.
   - No callable checks shop `status` or `plan`: `inventory`, `refunds`, `caixa`, `mensalistas`, `correcao-de-pagamento`, `comecar-do-zero` and `createBookingAtCounter` (grep finds none).
   - A suspended or trial-expired shop can still sell, refund, move cash, book at the counter and wipe its data.
   - Fix: call `conferirEscrita()` in `callFunction`, excluding the client-app callables. Server-side, the callables already read the shop doc, so they can reject for `suspenso/encerrada/trial vencido` and for plan features at almost no cost.
6. **No max horizon and no input-format validation on the server.**
   - `validarPedido` never checks `maxAdvanceDays`; the 60-day horizon exists only in the web layer, so a direct call can book in 2030.
   - `createBookingAtCounter` (`booking.ts:451`) validates neither the date nor the time format. `"25:00"` passes because `horariosDaJornada` runs only for clients. An invalid date throws a RangeError in `diaDaSemanaNoFuso` (`locale.ts:88-94`), which reaches the client as `internal`.
   - `serviceIds` has no length cap and no dedupe; `["corte","corte"]` doubles price and duration.
7. **Server policy defaults are duplicated inline, and there is no server-side normalizer.**
   - There are 12 `?? n` fallbacks across `booking.ts:136,297,521,558,840,850,868,948-950`, `availability.ts:134` and `loyalty.ts:90`.
   - HANDOFF §4 says `tenant-shape.ts` is "usada pelo servidor". It is used only by Next (`tenant-server.ts`); Cloud Functions never import it.
   - Concrete hole: `stampsForReward: 0` makes `meta = 0`, so `redeemLoyaltyReward` allows unlimited redemptions (`loyalty.ts:90-110`).
   - Fix: add a `functions/src/politicas.ts` normalizer with the same minimum-wins semantics, plus a parity test against `business-rules.ts`.
8. **Float money rounding.**
   - `Math.round(x*100)/100` on reais: `payments.ts:92,107`, `financial-events.ts:177`, `refunds.ts:146-224`, `inventory.ts:138,176`, `caixa.ts:168,185`.
   - A grid of R$5–300 prices × 0.01–10% fees gives **901 half-cent mis-roundings**, for example R$10 at 1.45% gives 0.14 instead of 0.15, and R$5 at 2.9% gives 0.14 instead of 0.15.
   - The DRE fallback rounds commission to **whole reais**: `Math.round(base*pct/100)` at `analytics.ts:490` and `:685`.
   - Fix: store integer cents, or at least one shared `centavos()` that computes in integer arithmetic (`Math.round(bruto*100) * pct` then divide).
9. **No idempotency key on booking creation**, while sales, refunds and cash have one (`chave-de-idempotencia`). If a timeout lands after the commit and the client retries, the second call fails its conflict check against the client's own new booking. The client sees "Esse horário acabou de ser reservado" for a booking that was actually saved.
10. **`window.open` runs after an `await`.** `painel/(dashboard)/page.tsx:314-337` calls `avisarCancelamento`, which opens wa.me after `await callFunction`. iOS Safari's popup blocker drops opens outside the user gesture, so the notice silently never opens. Render a "Avisar no WhatsApp" link or button once the call succeeds.
11. **Slot logic exists twice inside `functions/`.**
    - `availability.ts:152-173` loops by hand, while create uses `horariosDaJornada`.
    - The slotMinutes fallbacks differ: `Number(dele.slotMinutes ?? loja.slotMinutes) || 30` against `Number(dele) || Number(loja) || 30`.
    - `OCUPAM_SLOT` is declared twice in the same package (`booking.ts:44`, `availability.ts:27`).
    - Extract both into `agenda.ts`.
12. **`resolverCobertura` counts the quota outside any transaction** (`financial-events.ts:384-439`). Two concurrent completions for the same subscriber can both be "covered" past the quota.

---

## P3

- **The refund path is effectively dead.** Open bookings always have `paymentMethod: null` (`booking.ts:168,616`; the reversal nulls it at `financial-events.ts:561`), and `cancelBooking` refuses completed bookings. So `refund` is always 0, and the tiers in `desfechoDoCancelamento`, `refundAmountFor` and the refund copy on both screens can never trigger. Either drop them or document them as reserved for prepaid.
- **Role inconsistency.** Staff can `createBookingAtCounter` but cannot cancel or reschedule, which is owner-only (`booking.ts:803-806,994-996`). A staff member at the counter gets permission-denied. The regex test `autorizacao-functions.test.ts:212-217` locks this behavior in.
- **Generous auth fallback.** `claims.barbershops?.[tenant.id] ?? claims.role` in `components/auth-guard.tsx:31`, `app/login/page.tsx:117` and `components/owner-panel-link.tsx:16`: the deprecated global `role: owner` opens any tenant's panel shell (the rules still block the data). This is the `?? ALL` pattern HANDOFF §5.3 forbids.
- **`functions/src/billing.ts` has `DRY_RUN = true` hard-coded.** The daily scheduler never suspends anyone. `ativo` accounts with unpaid bills are only logged.
- **`comecar-do-zero.ts`: the products stock reset is one `db.batch()`**, which fails above 500 products.
- **Loyalty.**
  - Credits are written on every plan, even when `features.loyalty` is false.
  - Walk-in clients (clientId ≠ uid) accumulate stamps they can never redeem, because `redeemLoyaltyReward` queries by `uid`.
- **An invalid `locale.timeZone` in a shop doc breaks everything.** `Intl.DateTimeFormat` throws, so every booking callable for that shop returns `internal`. Validate it in the normalizer.
- **`"use client"` on non-component modules** (`lib/db/repository.ts`, `lib/db/perfil.ts`). Harmless, but it is noise.
- **Tests.**
  - The authorization tests regex the source text (`autorizacao-functions.test.ts:184-217`). They check code shape, not behavior.
  - Nothing behavioral covers `rescheduleBooking`, the `cancelBooking` handler, `materializeFinancialsOnCompletion` or `creditLoyaltyOnCompletion`, all of which are critical paths.
  - The concurrency proof (`booking-concorrencia.test.ts`) runs only on the emulator, whose transaction and lock semantics differ from production.
  - A deterministic slot-lock doc (`slots/{staffId}_{date}_{HHmm}` per grid cell) would make double-booking prevention independent of query-lock semantics.
- **Oversized client component.**
  - `painel/(dashboard)/page.tsx` (1,210 lines): one `PainelHojePage` owns 11 `useState`s, four modals, the action center, the clock store and helpers.
  - Split it into `AgendaDoDia`, `FechamentoModal`, `CancelamentoModal`, `ResumoDoDia` and `useRelogio`.
  - `dre/page.tsx` (794 lines) and `agendar/page.tsx` (786 lines) are in the same situation.

---

## Top 10 largest source files (lines)

| # | File | Lines |
|---|---|---|
| 1 | web/src/lib/analytics.ts | 1409 |
| 2 | web/src/app/painel/(dashboard)/page.tsx | 1210 |
| 3 | functions/src/booking.ts | 1046 |
| 4 | web/src/lib/__tests__/analytics.test.ts | 1020 |
| 5 | web/src/lib/__tests__/regressao-integracao.test.ts | 1006 |
| 6 | functions/src/whatsapp/templates.ts | 977 |
| 7 | functions/src/__tests__/inventory-transacao.test.ts | 859 |
| 8 | functions/src/inventory.ts | 852 |
| 9 | web/src/app/painel/(dashboard)/financeiro/dre/page.tsx | 794 |
| 10 | web/src/app/(cliente)/agendar/page.tsx | 786 |

(Next: `financial-events.ts` 766, `mensalistas.ts` 670, `domain.ts` 667.) A large share of the line count is explanatory block comments. `booking.ts` would drop by about 40% as code. The real split candidates are `analytics.ts` (15+ unrelated report functions) and the "Hoje" page.

## Checked and found sound
- Slot conflict on create is a real transaction, with window-overlap logic shared through `agenda.ts`.
- Idempotent ids on the triggers for the single-event retry case.
- `soAvisaSeGravou` is used correctly on concluir/falta.
- WhatsApp send dedupe.
- `acessoDaBarbearia` normalizes to the minimum.
- `useShopCollection` effect cleanup.
- `useRelogio` clears its interval.
