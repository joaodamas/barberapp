# Isolamento multi-tenant — evidência executável

Frente de segurança de release. Executado em 17/08/2026 sobre o baseline do
Gate A, **sem alterar o produto**.

> **O método.** Não basta saber que as queries filtram por barbearia. Toda
> verificação aqui é uma **tentativa real de violação**, e o resultado esperado
> é que ela **falhe**. Um `assertSucceeds` nos blocos de ataque significaria
> que a plataforma vaza dado de um cliente pagante para outro.

## Resumo

| Frente | Testes | Resultado |
|---|---|---|
| Firestore — ataque sistemático | **76** | ✅ nenhuma violação passou |
| Firestore — regras (suíte anterior) | 66 | ✅ |
| Storage | 16 | ✅ |
| Autorização das Cloud Functions | **24** | ✅ |
| | **182** | |

```bash
cd functions
npm run test:isolamento    # 76 · o ataque
npm run test:rules         # 66 + 16 · regras de Firestore e Storage
npm test                   # inclui os 24 de autorização
```

**Conclusão:** a Alfa opera a própria casa integralmente e **é incapaz de ler ou
modificar qualquer dado da Beta**. Dois pontos de exposição da própria
plataforma foram encontrados — não vazam operação nem dinheiro, e estão na §5.

---

## 1. O atacante

O ataque não é de um anônimo: é do **dono da Alfa**, autenticado, com claim
válido para a própria barbearia. Ele conhece os ids da Beta — um slug é público
por desenho, e um id de documento vaza em qualquer print de tela ou export.

Também foram exercidos o **barbeiro da Alfa** (claim `staff`) e o **cliente**,
que atravessa barbearias por natureza.

## 2. Leitura cruzada — 19 subcoleções

Documento a documento, com id conhecido, e depois a listagem inteira:

| Coleção | Dono da Alfa lê da Beta? |
|---|---|
| `members`, `bookings`, `schedules` | 🔒 negado |
| `expenses`, `cash_entries`, `commissions` | 🔒 negado |
| `payments`, `refunds` | 🔒 negado |
| `subscriptions`, `subscription_invoices` | 🔒 negado |
| `inventory_movements`, `loyalty_transactions` | 🔒 negado |
| `client_occurrences`, `whatsapp_messages`, `audit_log` | 🔒 negado |
| `private` (contrato e cobrança) | 🔒 negado |
| `services`, `staff`, `plans`, `products` | ⚪ **permitido — é vitrine** |

A última linha é decisão registrada nas regras: o **cliente** precisa ver
catálogo e barbeiros para escolher com quem cortar, e a permissão é para
qualquer autenticado. Nome e preço de serviço são a informação da fachada.
Comissão fica em `commissions`, que o cliente não alcança.

Também foram tentados e negados:

- listagem da coleção inteira (`getDocs`), que é uma porta diferente da leitura
  por id;
- **query filtrada pelo cliente da Beta** — a tentativa mais sofisticada, pedindo
  "só o que é do cliente" em vez da coleção. A regra compara com o **próprio**
  uid de quem chama.

## 3. Escrita cruzada

Todas negadas, nas 19 subcoleções:

- criar documento novo;
- alterar documento existente (preço de serviço, valor de despesa);
- apagar documento (reserva, serviço);
- alterar a ficha da Beta;
- **sequestrar o slug da Beta** apontando-o para a Alfa;
- apagar a barbearia Beta.

## 4. Collection group — a porta lateral

`match /barbershops/{id}/bookings/{id}` **não** autoriza uma consulta de
collection group; ela exigiria `match /{path=**}/bookings/{id}`, que as regras
não têm.

Testado e negado para `bookings`, `payments`, `commissions`, `expenses` e
`subscriptions` — inclusive filtrando pelo próprio uid.

> O teste existe para o dia em que alguém acrescentar essa regra para "resolver"
> uma consulta. Ela abriria exatamente esta porta, e a suíte avisa.

## 5. O que a plataforma expõe de si mesma

Dois achados. **Nenhum vaza operação ou dinheiro de barbearia nenhuma** — mas os
dois expõem o mapa comercial da plataforma.

### D15 · A lista de todas as barbearias é enumerável, sem login

`allow read: if true` no documento da barbearia vale também para a **listagem da
coleção**. Uma requisição sem autenticação devolve todas as barbearias com nome,
slug, `status` e `plan`.

Um concorrente lê, numa chamada: quantos clientes a plataforma tem, quem são,
quem está **suspenso** e quem paga o **plano de cima**.

### D16 · O índice de slugs também é enumerável

Mesma origem, mesmo efeito.

**Por que não foi corrigido aqui:** a leitura pública por id é o que resolve o
subdomínio antes de existir login — é o primeiro passo de toda visita. Fechar a
listagem sem fechar a leitura exige separar `get` de `list` nas regras, e isso é
alteração de produto, que esta fase não faz.

| | |
|---|---|
| Severidade | 🟡 exposição comercial, não vazamento de dado de cliente |
| Correção | `allow get: if true; allow list: if isPlatformAdmin();` |
| Decisão | pendente — junto com o próximo gate |

## 6. Cloud Functions — o `tenantId` arbitrário

As regras do Firestore protegem o **dado**, e o Admin SDK **as ignora**. Toda
function roda com privilégio total: a única barreira entre um usuário autenticado
e a barbearia de outra pessoa é a guarda escrita no handler.

O ataque: o dono da Alfa chama `completeOnboardingStep` com o `barbershopId` da
Beta. Token válido, Admin SDK escreveria sem reclamar.

**24 verificações**, cobrindo as 21 functions:

| Categoria | Function | Guarda |
|---|---|---|
| **Exige vínculo** | `completeOnboardingStep` | `role !== "owner"` |
| | `encerrarConta`, `reabrirConta` | `ehDono` |
| | `cancelBooking`, `rescheduleBooking` | dono da reserva **ou** da barbearia |
| | `grantShopRole` | `platformAdmin` ou `owner` daquela barbearia |
| | `provisionBarbershop`, `definirPlano` | `platformAdmin` |
| | `setOwnerRole` | `role === "owner"` |
| **Pública por desenho** | `createBooking`, `availableSlots` | qualquer um agenda em qualquer barbearia — é o produto |
| | `checkSlugAvailability`, `healthcheck` | sem dado sensível |
| | `signUpBarbershop` | cria a **própria**; não recebe id de outra |
| | `redeemLoyaltyReward` | resgata do próprio saldo |
| **Webhook público** | `whatsappWebhook` | assinatura HMAC + autoria por evento |

Verificações extras nas públicas, porque a ausência de guarda só é segura
enquanto elas não fizerem nada privilegiado:

- nenhuma escreve em `private`, `payments` ou `commissions`;
- **`createBooking` usa o `uid` de quem chamou como `clientId`**, nunca um id
  recebido — sem isso, qualquer um criaria reserva em nome de qualquer pessoa, e
  o limite por cliente seria contornável usando o uid dos outros.

### O webhook

Sem `request.auth` — quem chama é a Meta. A guarda é outra e foi verificada:

1. **assinatura HMAC sobre o corpo cru** (reserializar o JSON quebraria o hash);
2. **401** quando não bate;
3. a barbearia vem do **payload assinado**, não de parâmetro solto;
4. **autoria por evento**: confirmar/cancelar é do cliente da reserva; aprovar
   encaixe é de quem toca a barbearia — necessário porque todos os clientes de
   todas as barbearias conversam com o **mesmo número**;
5. reserva em estado terminal não é ressuscitada por toque de botão.

> Este bloco nasceu de uma falha do próprio teste: a primeira versão marcou o
> webhook como violação, porque ele não tem `request.auth`. Ao investigar, a
> conclusão foi que ele tem a guarda **que cabe ao tipo dele**. O teste foi
> corrigido para verificar a guarda certa, em vez de ser afrouxado.

## 7. O que a Alfa continua podendo

Isolamento que trava a operação não é isolamento, é bug. Verificado que a Alfa:

- lê e escreve as próprias despesas, agenda, catálogo e equipe;
- lê o próprio contrato em `private`;
- o barbeiro lê a agenda da casa dele;
- o cliente lê a própria reserva;
- a **vitrine é pública** — `slugs/{slug}` e `barbershops/{id}` sem login, que é
  o que resolve o subdomínio antes de haver usuário.

## 8. O que este teste NÃO cobre

Honestidade sobre o alcance:

- **Não testa as functions em execução.** A verificação de autorização é
  estrutural: confere o padrão no código-fonte, não o comportamento no
  emulador de Functions. Pega a function nova que esquecer a guarda; não pega
  uma guarda escrita de forma errada.
- **Não testa App Check.** Ele não existe (bloqueador registrado): qualquer um
  chama as functions de fora do app. O isolamento entre barbearias vale mesmo
  assim, porque as guardas leem o claim — mas o consumo é livre.
- **Não testa a superfície de rede.** CSP, CORS e rate limit não entram aqui.

---

*182 verificações, sem alteração de produto. Os dois achados (D15, D16) são de
exposição da plataforma, não de vazamento entre barbearias.*
