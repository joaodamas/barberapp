# Auditoria de segurança e LGPD — CorteHub

Branch `qa/e2e-2026-09-23` @ `162d815` (= origin/main). Somente leitura; nenhum arquivo do repo foi alterado.

**Provas executáveis** (fora do repo, em `<scratchpad da sessão>/audit/`, emulador próprio na porta 8185, projeto `audit-sec`):

| Arquivo | O que prova | Resultado |
|---|---|---|
| `audit/rules-audit.test.ts` | 15 casos contra o `firestore.rules` real | 15/15 passaram, ou seja, os furos existem |
| `audit/hijack.test.ts` | sequestro de identidade via `gravarComTravaDeHorario` + `resolverCliente` reais | passou, ou seja, o furo existe |
| `audit/slots-dos.test.ts` | `availableSlots` real (lib compilada) com `slotMinutes` negativo | lança `Invalid time value`; não entra em laço (hipótese de DoS descartada, ver P3-5) |

Para reexecutar: `cd scratchpad/audit && firebase emulators:exec --only firestore --project audit-sec "./node_modules/.bin/vitest run --config vitest.config.mts"`

Legenda: **CONFIRMADO** = provado por teste ou por rastreio exato do código. **PROVÁVEL** = só pela leitura, ou depende de configuração que não está no repo.

---

## Itens já conhecidos: conferidos no código

| Item | Veredito |
|---|---|
| SEC-001 (SA de runtime é Editor) | Consistente com o código: nenhuma function define `serviceAccount`, então todas usam a SA default do Compute. O IAM não dá para ver pelo repo |
| App Check ausente | **CONFIRMADO**: zero referências em `web/src` e em `functions/src`. O único freio é `maxInstances: 10` (`functions/src/index.ts:19`) |
| SEC-002 (conta pessoal) | Não é verificável pelo código |
| Exclusão LGPD em DRY_RUN | **CONFIRMADO**: `data-deletion.ts:28` com `DRY_RUN = true`, e o mesmo em `billing.ts:23`. **Há defeitos além do DRY_RUN** (P1-5) |
| Regras do Storage fora do deploy | **CONFIRMADO**: `.github/workflows/deploy.yml` publica índices, regras do Firestore, functions e hosting; não publica storage |

---

## P1 — corrigir antes do primeiro cliente real

### P1-1 · Barbeiro (`staff`) reescreve qualquer reserva, inclusive os campos que o gatilho financeiro usa como verdade congelada — CONFIRMADO

- **Regra:** `firestore.rules:246`, com `allow update, delete: if isStaffOf(barbershopId);`. Não há validação de campo nenhuma.
- **Gatilho que confia nesses campos:** `functions/src/financial-events.ts`
  - `:596-600`: o valor sai de `depois.cicloFinanceiro.pagamento.grossAmount` quando existe `revertidoEm`.
  - `:621`: o percentual sai de `ciclo.comissao.commissionPct`, que o cliente escreve.
  - `:637-652`: `depois.cobertura`, se presente, "MANDA". Com `tipo: "plano"` nenhum `payment` nasce (`:733-735`).
  - `:674`: `staffId` vem da reserva, e `uid` do cadastro desse staff.
- **Exploit** (provado nos casos A1–A4 de `rules-audit.test.ts`): um barbeiro com claim `staff` executa este `updateDoc`, que as regras aceitam:
  ```js
  updateDoc(bookingDeOutroBarbeiro, { status:"completed", staffId:"<meu staffId>", value:99999,
    paymentMethod:"cash", cicloFinanceiro:{ revertidoEm:"x", comissao:{commissionPct:100}, pagamento:{grossAmount:99999} } })
  ```
  O gatilho grava então `commissions/comissao_<id>` com `commissionAmount = 99999` no uid dele, e `payments` com R$ 99.999 de receita falsa no DRE do dono.
- **Outras variantes, todas aceitas:**
  - `cobertura:{tipo:"plano"}`: o barbeiro recebe em dinheiro e nenhum pagamento é registrado. É desvio de caixa invisível.
  - Trocar `clientId` para outra conta: essa conta passa a ler nome e telefone do cliente (A3). O carimbo de fidelidade também vai para ela (`loyalty.ts:44-51`).
  - `deleteDoc` na reserva (A4): o histórico some, e `payments`/`commissions` ficam órfãos, porque não há gatilho em delete.
- **O dono tem o mesmo poder.** Isso quebra a promessa de "financeiro escrito só pelo servidor" (`firestore.rules:304-308`). O ✅ "Comissão congelada" do GO-LIVE não vale contra quem escreve direto na reserva.
- **Hoje:** a UI não concede `staff` (`grantShopRole` não é chamado pelo web). Mas o dono chama o callable direto, e a regra de comissões por `uid` existe justamente para barbeiro com conta.
- **Correção:**
  1. Nas regras, `update` só com allowlist de chaves (`affectedKeys().hasOnly(['status','paymentMethod','paymentFormId','paymentFormLabel'])`), com `status` restrito às transições do painel e `delete: if false`.
  2. Tirar do documento da reserva o estado que o servidor precisa confiar (`cicloFinanceiro`, `cobertura`), levando-o para uma coleção irmã com `write: if false`.
  3. Idealmente, concluir por callable `concluirAtendimento`, como já é feito com cancelar.

### P1-2 · Sequestro da identidade de cliente de balcão pelo WhatsApp não verificado — CONFIRMADO (`hijack.test.ts`)

- **Onde:**
  - `booking.ts:147-158`: `createBooking` aceita `clientWhatsapp` livre, de qualquer conta autenticada.
  - `clients.ts:176-205`: se o número existe num cadastro de balcão (`uid:null`), ele é **fundido** na conta do chamador (`active:false, mergedInto:<atacante>`).
  - `clients.ts:208-218` e `:112-121`: o próximo `createBookingAtCounter` com esse número reusa o doc **do atacante**.
- **Cenário:**
  1. O atacante cria uma conta (REST do Auth, grátis).
  2. Chama `createBooking` na barbearia X com o WhatsApp da vítima.
  3. Quando a vítima liga e o dono marca pelo balcão, a reserva nasce com `clientId = uid do atacante`, e o cadastro do atacante é renomeado com o nome da vítima.
- **O que o atacante ganha:**
  - lê a reserva (nome, telefone, serviço, valor) pela regra `clientId == auth.uid`;
  - **cancela e remarca** (`booking.ts:996-1000`, `:805-808`);
  - fica com os carimbos de fidelidade dela e lê o `payment` dela (`ownsResource`).
- **Vítima com conta no app:** também é afetada. Ficam dois docs ativos com o mesmo número, e `acharClientePorWhatsapp` pega o primeiro por id.
- **Correção:**
  - Não deduplicar nem fundir por telefone vindo de `createBooking` enquanto o número não for verificado (OTP).
  - Na reutilização de balcão, ignorar docs com `uid != null`, ou exigir que o dono escolha o cadastro.
  - A fusão vira sugestão para o dono aprovar, nunca automática.

### P1-3 · Plataforma dispara WhatsApp para qualquer número (latente até ligar o envio) — PROVÁVEL

- **Onde:** `whatsapp/notify.ts:89-107` envia `confirmacao_reserva` para `reserva.clientWhatsapp`, que vem sem verificação de `createBooking`.
- **Limite atual:** 3 reservas ativas por conta por barbearia, com contas ilimitadas e sem App Check.
- **Cenário:** um script usa o número verificado da plataforma para mandar mensagens a terceiros. Custo por conversa, denúncias e queda do quality rating na Meta, e o número único derruba **todas** as barbearias.
- **Correção:** verificar o número por OTP antes do primeiro envio, ter teto por número de destino por dia, e App Check.

### P1-4 · Direitos do titular (art. 18) sem caminho no produto — CONFIRMADO (grep)

- **O que os documentos prometem:**
  - Política §7: o cliente pede à barbearia.
  - Termos §7: "Nós damos o suporte técnico" para cópia, correção, portabilidade e exclusão.
  - Termos §8 e Política §6: 30 dias para exportar.
- **O que existe no código:**
  - O **dono não consegue apagar nem anonimizar um cliente**. `clients` tem `write: if false` (`firestore.rules:221`) e nenhuma function apaga ou edita `clients`.
  - **Não existe exportação** nenhuma: sem CSV, sem Blob, sem callable.
  - `encerrarConta` **não é chamado por nenhuma tela** (o grep dos `callFunction` do web não o encontra). O dono não consegue encerrar a conta, e a promessa dos 30 dias não tem gatilho.
  - O **cliente final** não tem "excluir minha conta". Pode apagar `users/{uid}` pelas regras, mas não a conta do Auth nem `clients/{uid}`/`bookings` nas barbearias.
  - `users/{uid}` (nome e WhatsApp, entre barbearias) e a conta do Auth são dados em que o CorteHub é **controlador de fato**, embora a Política o apresente só como operador.
- **Correção:**
  - Callable `atenderTitular({barbershopId, clientId, acao:"exportar"|"anonimizar"})` só para o dono: exporta `clients`, `bookings`, `payments` e `loyalty`; anonimiza nome e telefone em `clients` e `bookings`, preservando valores fiscais.
  - Callable do cliente "excluir minha conta": apaga `users/{uid}` e o Auth user, e anonimiza `clients/{uid}` em cada barbearia.
  - Botões de encerrar conta e de exportar no painel.

### P1-5 · A rotina de expurgo está errada além do DRY_RUN — CONFIRMADO (leitura exata + teste D1)

Desligar o `DRY_RUN` como está produziria exclusão incompleta e irreversível:

1. **Ordem.** `data-deletion.ts:190-207` apaga a **árvore da barbearia primeiro**. Se qualquer passo seguinte falhar (índices de WhatsApp, slug), a próxima execução não reencontra a conta: a query `status=="encerrada"` (`:168-171`) depende do documento já apagado. Telefones em `whatsapp_conversations` e o slug ficam órfãos para sempre. A árvore tem que ser o **último** alvo. Também não há try/catch por barbearia: uma falha aborta as demais.
2. **Não apaga:**
   - usuários do Firebase Auth (dono, equipe);
   - o claim `barbershops[id]` nos tokens;
   - `platform_users/{uid}` (hash da senha provisória);
   - objetos do Storage em `barbershops/{id}/**`;
   - `users/{uid}` dos clientes;
   - logs.
3. **O dono reescreve `encerradaEmMs`** (teste D1 passou). As regras bloqueiam `status`, mas não `encerradaEmMs`/`encerradaEm`/`encerradaPor` (`firestore.rules:146-151`).
   - Gravar `1` apaga tudo na madrugada seguinte, pulando a janela de 30 dias, que é justamente a proteção contra "briga com um sócio" (`data-deletion.ts:14-16`).
   - Gravar uma string faz a conta nunca ser expurgada, o que quebra a promessa da política.
4. **Contradição com a política.** A Política §6 diz que os registros fiscais ficam "pelo prazo que a lei exigir, mesmo após a exclusão". O `recursiveDelete` apaga `payments` e `audit_log` junto.
5. **Alvo morto.** O alvo `grupo memberships` (`:77`) aponta para uma coleção que nada escreve, e varre o collection group inteiro da plataforma (`:203`).
6. **Efeito colateral.** `reabrirConta` (`:143`) sempre grava `status:"suspenso"`: um cliente `ativo` pagante que encerra e reabre fica suspenso.

- **Correção:** reordenar; incluir Auth, claims, Storage, `platform_users` e anonimização de `users`; mover os campos `encerrada*` para `private/` ou para a denylist; definir e reter os registros fiscais.

---

## P2 — corrigir em seguida

### P2-1 · `changeInitialPassword` troca a senha de QUALQUER conta sem reautenticação — CONFIRMADO (leitura)

- **Onde:** `account.ts:44-84`. Exige só `request.auth`, e não confere `mustChangePassword === true` nem a idade do login. Chama `updateUser(uid, {password})` e depois `revokeRefreshTokens`.
- **Cenário:** um ID token vazado (XSS, extensão, log) vale 1 hora. Com ele, o atacante define uma senha nova e **derruba as sessões do dono legítimo**. É tomada permanente de conta, contornando o `requires-recent-login` do Firebase.
- **Correção:** recusar se `token.mustChangePassword !== true`, e exigir `auth_time` recente.

### P2-2 · `mustChangePassword` só é aplicado na interface — CONFIRMADO (grep)

- **Onde:** existe apenas em `auth-guard.tsx:37`, `login/page.tsx:97`, `comecar/page.tsx:77` e `trocar-senha`. Nenhuma regra e nenhuma function checam o claim.
- **Cenário:** quem tiver a senha provisória que viajou por WhatsApp usa o SDK (Firestore e callables) com acesso de dono completo, sem nunca trocar a senha.
- **Correção:** nas regras, `isOwnerOf/isStaffOf` com `&& request.auth.token.get('mustChangePassword', false) != true`, e um helper equivalente nas functions.

### P2-3 · Open redirect pós-login — CONFIRMADO

- **Onde:** `login/page.tsx:63-66`. `destinoInterno` aceita qualquer coisa que comece com `/` e não com `//`.
- **Exploit:** `https://<loja>.jpproject.com.br/login?next=/%5Cevil.com`. O `URLSearchParams` decodifica para `/\evil.com`, e `new URL("/\\evil.com", origem)` dá `https://evil.com/` (testado no node). O App Router trata origem diferente como `completeHardNavigation` (`next/dist/.../navigate-reducer.js:34-35`). Quem já está logado é redirecionado na hora.
- **Uso:** phishing ("sessão expirou") sob o domínio da barbearia.
- **Correção:** resolver com `new URL(v, location.origin)`, exigir mesma origem e recusar `\`.

### P2-4 · Qualquer conta autenticada lê dados internos de QUALQUER barbearia — CONFIRMADO (B1, B2)

- **Onde:** `firestore.rules:171-195, 249-251` liberam `read: if isSignedIn()` para `staff`, `products`, `plans`, `schedules` e `services`.
- **O que vaza:**
  - `staff.commissionPct`, que é salário. O comentário em `:179-182` afirma que a comissão fica fora de `staff`, e isso é falso: `equipe/page.tsx:172` grava ali.
  - `products.cost` e `stock`, que são custo de compra e margem.
- **Quem lê:** o cliente de outra barbearia, o concorrente, ou uma conta criada pelo REST.
- **Correção:** levar `commissionPct` para `staff_private/{id}` com leitura `isOwnerOf`; `products` com leitura `isStaffOf` (vitrine via projeção pública sem `cost`).

### P2-5 · Ficha da barbearia legível E listável sem login — CONFIRMADO (C1, C2)

- **Onde:** `firestore.rules:134` (`allow read: if true`, que inclui `list`) e `:363` (`slugs`).
- **Exploit:** `getDocs(collection(db,"barbershops"))` anônimo devolve **todas** as barbearias com:
  - `status` e `suspendedReason: "inadimplencia"`;
  - `plan` e `trial`;
  - `policies` (percentual de comissão, taxas da maquininha);
  - `createdBy` (uid do dono);
  - `encerramentoMotivo`.
- **Consequência:** a inadimplência de um cliente fica pública, e a base inteira de clientes fica enumerável.
- **Correção:** `allow get: if true; allow list: if false;`, e mover o estado contratual e as políticas financeiras para `private/` ou para um subdoc `public` com só a vitrine. O `tenant-server.ts` já lê via `get`.

### P2-6 · A escrita do dono na ficha é por denylist, não allowlist — CONFIRMADO (D1, D2)

- **Onde:** `firestore.rules:146-151`. Além de `encerrada*` (P1-5), o dono grava `suspendedAt`/`suspendedReason` e qualquer chave nova.
- **Risco:** o próximo campo de estado que o servidor passar a gravar nasce editável pelo dono. É o mesmo padrão que já custou `features`/`trial`.
- **Correção:** `affectedKeys().hasOnly([brand, contact, schedule, policies, onboarding…])`.

### P2-7 · Senha fraca para quem guarda dado de terceiros — PROVÁVEL

- **Onde:** `login/page.tsx:399` e o default do Firebase aceitam 6 caracteres para o dono self-service. `validatePassword` (8) só vale na troca de senha provisória. Não há MFA.
- **Correção:** Password Policy do Identity Platform com mínimo de 8 e complexidade, e MFA opcional para `owner`. A política configurada no console não é visível pelo repo.

### P2-8 · Transferência internacional incompleta na Política §5 — PROVÁVEL

- **O que falta declarar:**
  - Firebase Authentication (e-mail, telefone, IP de login) processa nos EUA.
  - O Cloud Logging (`_Default`, global) recebe telefones (P3-1).
- **O que não dá para confirmar pelo repo:** que o Firestore está em `southamerica-east1`, como a Política afirma.

---

## P3 — melhorias

1. **PII em logs.** `whatsapp/webhook.ts:199` e `:263-265` logam o telefone (`de`). Trocar por hash ou pelos 4 últimos dígitos.
2. **Legado `setOwnerRole` publicado** (`index.ts:91-127`, e o deploy publica todos os exports). O claim `role:"owner"` é aceito pela UI em **qualquer** barbearia (`auth-guard.tsx:31`, `login/page.tsx:117`, `owner-panel-link.tsx:16`). As regras não o honram, então os dados ficam protegidos, mas quem tiver o claim cunha outros. Remover a função e o fallback `?? claims.role`.
3. **`grantShopRole` não valida `role`.** Aceita qualquer string ou tamanho (`provisioning.ts:227-253`), o que permite ao dono inflar o claim de terceiros até o limite de 1000 bytes e fazer um `signUpBarbershop` futuro deles falhar depois de a transação já ter gravado. Também não valida a existência de `barbershopId` e revela se um e-mail existe.
4. **Webhook do WhatsApp:**
   - A guarda de status (`:273`) não inclui `no_show`: "Confirmo" num lembrete antigo ressuscita a falta para `confirmed_by_client`.
   - Cancelar pelo botão grava o status direto e pula a política de devolução de `cancelBooking`.
   - `action` e `barbershopId` do payload não são validados (`templates.ts:971-977`); um `/` no id muda o caminho.
   - O processamento acontece **depois** de `res.send` (`:125-131`), e no gen2 a CPU pode ser estrangulada após a resposta, com evento perdido e sem retry.
5. **Entradas sem limite em `createBooking`.** `clientName` sem tamanho nem tipo (`booking.ts:149,157`); `serviceIds` sem teto nem deduplicação (N leituras); nada impede reservar numa barbearia `encerrada`. E `schedule.slotMinutes` negativo, gravável pelo dono, faz `availableSlots` lançar `Invalid time value` e derrubar a própria agenda pública (`availability.ts:87,151`; provado em `slots-dos.test.ts`). **Não** é laço infinito, então a hipótese de DoS entre tenants foi descartada.
6. **O cliente lê detalhes internos.** A reserva expõe `cicloFinanceiro.comissao` (percentual e valor do barbeiro, `financial-events.ts:548-553`), e o `payment` expõe `feePct` e líquido. É vazamento pequeno de dado do negócio.
7. **Cabeçalho `x-forwarded-host` usado sem checagem** (`tenant-server.ts:109-111`). Conferir se o Firebase Hosting sobrescreve o valor enviado pelo cliente (senão há envenenamento do cache de borda de 300 s + SWR 24 h) e se a URL direta do Cloud Run `ssraxonbarber` está pública. Só dado de vitrine; PROVÁVEL e de baixo impacto.

---

## O que está correto (conferido)

- **Isolamento entre tenants nas coleções privadas:** `bookings`, `clients`, `payments` e demais financeiras. Um estranho não lê nem lista sem filtro (E1–E3). Nenhum callable age em outra barbearia sem claim, e as guardas de papel estão em todas as funções de escrita.
- **Webhook:** confere HMAC com `timingSafeEqual` sobre `rawBody` e checa o remetente contra a reserva.
- **`completeOnboardingStep`:** allowlist nominal. **`signUpBarbershop`:** exige e-mail verificado e limita uma barbearia por conta.
- **Analytics:** não há rastreamento. `lib/analytics.ts` é só cálculo financeiro, e `getFirebaseAnalytics` nunca é chamado. Isso é coerente com "sem rastreamento de terceiros" na Política §2. O `MEASUREMENT_ID` segue configurado; remover para não ligar por engano.
- **Aviso na captura:** a confirmação da reserva tem o link para `/privacidade` (`agendar/page.tsx:692,776`). As bases legais escolhidas (contrato e legítimo interesse) dispensam consentimento para o agendamento.
- **Configuração web:** CSP, HSTS, `frame-ancestors 'none'`, `nosniff` presentes. Não há segredo em `NEXT_PUBLIC_*`, e não há `.env` versionado.
