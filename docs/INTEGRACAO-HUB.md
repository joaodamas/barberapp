# Integração com o JP Projects Hub (lado do Topete)

> Contrato: `hub/docs/CONTRATO-PLATAFORMA-BARBER.md` (repositório do Hub).
> Código: `functions/src/hub/`. Implementado em 29/09/2026.

## A regra

**O Hub manda no dinheiro, o Topete manda na operação.** O Hub cobra (boleto do
Inter), ativa, suspende e cancela. O Topete conta ao Hub o que aconteceu na
operação: a barbearia existe, terminou o onboarding, o dono escolheu um plano
ou pediu para sair.

Consequência no código: **nada no Topete muda plano ou valor cobrado por
conta própria.** `escolherPlano` e `pedirCancelamento` só registram o pedido e
avisam o Hub; o operador aplica lá (e o plano, aqui, com `definirPlano`).

## 1. Hub → Topete: a API `plataforma`

| | |
|---|---|
| Função | `plataforma` (`onRequest`, `southamerica-east1`) |
| URL da função | `https://southamerica-east1-axon-barber.cloudfunctions.net/plataforma` |
| **`CORTEHUB_API_URL` no Hub** | `https://southamerica-east1-axon-barber.cloudfunctions.net` (sem barra no fim) |
| Autenticação | `Authorization: Bearer <CORTEHUB_TOKEN>`, conferido em tempo constante |

O Hub monta `{CORTEHUB_API_URL}/plataforma/provisionar`, que é a URL da função
seguida de `/provisionar`. A função também aceita o prefixo `/plataforma/`
repetido, para o dia em que a API passar por um rewrite do Hosting.

Respostas comuns às duas rotas:

| Código | Quando |
|---|---|
| `401` | token ausente ou errado |
| `503` | `CORTEHUB_TOKEN` vazio no Topete (recusa tudo, em vez de aceitar tudo) |
| `405` | método diferente de `POST` |
| `404` | rota diferente de `/provisionar` e `/status` |
| `400` | corpo fora do contrato; `error` diz o campo |
| `500` | falha interna; o Hub pode repetir (as duas rotas são idempotentes) |

Erros sempre como `{ ok: false, error: "..." }`, que é o que o Hub lê.

### `POST /provisionar`

```json
{ "hubTenantId": "barbeariax", "slug": "barbeariax", "nome": "Barbearia X",
  "ownerEmail": "dono@x.com", "ownerNome": "Fulano", "plano": null }
```

1. Valida: slug no mesmo formato e com os mesmos reservados do cadastro;
   e-mail; `plano` nulo/vazio → `agenda`; nome de plano com acento ou
   maiúscula é normalizado ("Gestão" → `gestao`); plano desconhecido → `400`
   (não rebaixa em silêncio).
2. Slug já existe:
   - se foi criado pelo Hub para o **mesmo** `hubTenantId` → `200` com a
     barbearia que já existe (`repetido: true`) e o vínculo do dono refeito.
     O Hub espera 20 s; se desistiu de uma resposta que chegou depois, a nova
     tentativa não pode virar erro;
   - senão → `409`.
3. Conta do dono: usa a existente, ou cria **sem senha** (Admin SDK).
4. Cria a barbearia com a mesma função de `provisionBarbershop`
   (`criarBarbeariaAssistida`, atômica: barbearia, índice de slug, política
   financeira, dono como barbeiro e membro, serviços, `private/hub` com o
   `tenantId` do Hub e o aviso `cadastrada` na caixa de saída). Nasce em
   `trial` de 7 dias, com o plano pedido.
5. Dá o papel de dono no claim.
6. Acrescenta `{slug}.topete.com.br` aos domínios autorizados do Firebase Auth
   (para o login com Google funcionar no subdomínio).
7. Se a conta foi criada agora, manda o e-mail de **definir senha** do próprio
   Firebase (`PASSWORD_RESET`), com volta para `https://{slug}.topete.com.br/login`.
   Conta que já existia não recebe e-mail: a pessoa já tem como entrar.

Resposta:

```json
{ "ok": true, "barbershopId": "abc123", "url": "https://barbeariax.topete.com.br",
  "acesso": "email_enviado | conta_existente | email_falhou", "dominioAutorizado": true }
```

Os passos 6 e 7 não desfazem a barbearia se falharem: a resposta continua
`200`, com `acesso: "email_falhou"` ou `dominioAutorizado: false`, e o log de
erro diz o porquê. Resolver pelo console do Firebase (Authentication →
Settings → Authorized domains; e "Redefinir senha" no usuário).

Nenhuma senha volta ao Hub.

### `POST /status`

```json
{ "barbershopId": "abc123", "hubTenantId": "barbeariax",
  "status": "ativo | suspenso | cancelado", "eventoId": "..." }
```

(`externoId` é aceito no lugar de `barbershopId`.)

| Hub | Topete |
|---|---|
| `ativo` | `status: "ativo"`, limpa `suspendedAt/Reason`; de `trial`, grava `trialEncerradoEm`; de `encerrada`, **reabre** (se o expurgo não começou; senão `409`) |
| `suspenso` | `status: "suspenso"`, `suspendedReason: "hub"` — o modo leitura que já existe (`motivoDeLeitura`, `acessoDaBarbearia`) |
| `cancelado` | encerramento com os mesmos campos de `encerrarConta` (`encerradaPor: "hub"`): janela de exportação e depois o expurgo (`DIAS_ATE_O_EXPURGO`) |

- Plano e `features` **não** mudam em nenhum caso.
- `encerrada` é o estado mais forte: suspender não a tira de lá; cancelar de
  novo não reinicia o relógio.
- Idempotente por `eventoId`: cada evento aplicado fica em
  `plataforma_eventos/{sha256(eventoId)}`; o mesmo evento de novo responde
  `{ ok: true, duplicado: true }` sem aplicar nada.
- Trava de cliente: se a barbearia já está ligada a outro `hubTenantId`
  (`barbershops/{id}/private/hub`), `409`. Sem vínculo ainda (o O Siqueira,
  anterior à integração), o primeiro `/status` liga.

Resposta: `{ ok: true, barbershopId, status: "<status no Topete>", aplicado: true|false }`.

## 2. Topete → Hub: os avisos

```
POST https://southamerica-east1-jpproject-hub.cloudfunctions.net/ingestPlataforma
Authorization: Bearer <PLATAFORMA_TOKEN>
```

Corpo (`montarEvento` em `hub/contrato.ts`):

```json
{ "produto": "barber", "evento": "cadastrada", "eventoId": "cadastrada:ZE8iNGVKp3l7OqZFJbqF",
  "externoId": "ZE8iNGVKp3l7OqZFJbqF", "slug": "osiqueira", "nome": "O Siqueira Barbearia",
  "ocorridoEm": "2026-09-28T14:00:00-03:00" }
```

| Evento | Quando | `eventoId` |
|---|---|---|
| `cadastrada` | na transação que cria a barbearia: `signUpBarbershop`, `provisionBarbershop` e `/plataforma/provisionar` | `cadastrada:{id}` |
| `onboarding_concluido` | na transação de `completeOnboardingStep` que grava `onboarding.completedAt` (passo `compartilhar`) | `onboarding_concluido:{id}` |
| `plano_escolhido` | callable `escolherPlano({ barbershopId, plano })`, só o dono; leva `plano`, `valor` (R$/mês) e `ciclo: "mensal"` | `plano_escolhido:{id}:{plano}:{AAAA-MM-DD}` |
| `pediu_cancelamento` | callable `pedirCancelamento({ barbershopId, motivo? })`, só o dono | `pediu_cancelamento:{id}:{AAAA-MM-DD}` |

O dia no id faz o toque duplo virar um aviso só; outro dia, outro pedido. O
pedido fica também em `barbershops/{id}/pedidos_plataforma/{eventoId}` (o dono
lê) para a tela mostrar "pedido enviado". A tela ainda não existe.

`valor` vem de `PRECO_MENSAL` em `hub/contrato.ts` (agenda 97, crescimento 197,
gestao 247). **TODO:** ler de `plans.ts` quando o preço entrar lá.

**A barbearia criada pelo próprio Hub também manda `cadastrada`.** É
idempotente lá, e é o que liga o cliente do Hub ao id daqui caso a resposta do
`/provisionar` tenha se perdido. Ela sai com **2 minutos de atraso**, para o
Hub gravar o `externoId` da resposta antes. Sem isso, um cliente cujo id no
Hub não é o slug poderia ser criado duas vezes lá. O corpo leva também
`hubTenantId`, que o Hub hoje ignora.

### Caixa de saída (`plataforma_saida/{eventoId}`)

O aviso é gravado na mesma transação do fato e enviado depois:

- `enviarAvisoAoHub` (gatilho na criação do documento) envia na hora;
- `reenviarAvisosAoHub` (a cada 10 min) envia o que falhou ou foi adiado.

| Resposta do Hub | Estado | Faz o quê |
|---|---|---|
| `2xx` (inclusive `duplicado`) | `enviado` | nada |
| `400`, `409` | `recusado` | não repete; `console.error` para alguém olhar |
| `401`, `503`, `5xx`, rede, outros | continua `pendente` | tenta de novo com o **mesmo** `eventoId`, esperando 1, 2, 4… min (teto de 6 h), sem limite de tentativas |

Campos para investigar: `tentativas`, `ultimoStatus`, `ultimaResposta`,
`proximaTentativaEmMs`. Para reenviar um `recusado` depois de corrigir: mudar
`estado` para `pendente` no console.

**Só produção (`axon-barber`) fala com o Hub.** No DEV
(`crucial-baton-440119-r8`) os avisos ficam `retido`: cada barbearia de teste
viraria um cliente no painel de verdade.

### Carga inicial

Uma vez, depois do deploy, para as barbearias anteriores à integração (hoje
só o O Siqueira, `ZE8iNGVKp3l7OqZFJbqF`):

```sh
cd functions && npm run build
node scripts/avisar-hub-carga-inicial.mjs            # prévia
node scripts/avisar-hub-carga-inicial.mjs --gravar   # enfileira
```

Idempotente (mesmo `eventoId` da criação), pula encerradas e o que já está na
caixa. No Hub, o O Siqueira é `o-siqueira` e aqui é `osiqueira`. O Hub o acha
pelo domínio `osiqueira.jpproject.com.br`, que é o `dominioRaiz` que ele usa
para o Topete.

## 3. Segredos e configuração

Todos pelo Secret Manager (`defineSecret`). O deploy **falha** se algum não
existir no projeto. Por isso precisam existir nos **dois** projetos que
recebem deploy: `axon-barber` (produção) e `crucial-baton-440119-r8` (DEV).
No DEV podem ter valores de mentira, porque lá nada fala com o Hub.

| Segredo | Valor | Usado por |
|---|---|---|
| `CORTEHUB_TOKEN` | o mesmo do Hub (`firebase functions:secrets:access CORTEHUB_TOKEN --project jpproject-hub`) | `plataforma` (confere o que o Hub manda) |
| `PLATAFORMA_TOKEN` | o mesmo do Hub (`... PLATAFORMA_TOKEN --project jpproject-hub`) | `enviarAvisoAoHub`, `reenviarAvisosAoHub` (assina os avisos) |
| `TOPETE_WEB_API_KEY` | a chave web do projeto, a mesma `NEXT_PUBLIC_FIREBASE_API_KEY` do site (Console → Configurações do projeto → Geral) | `plataforma` (e-mail de definir senha) |

A chave web não é segredo, porque está no JavaScript de toda página. Mora no
Secret Manager porque o deploy roda no GitHub sem `functions/.env`, e o
Secret Manager é o único lugar de configuração que ele já lê.

```sh
firebase functions:secrets:set CORTEHUB_TOKEN --project axon-barber
firebase functions:secrets:set PLATAFORMA_TOKEN --project axon-barber
firebase functions:secrets:set TOPETE_WEB_API_KEY --project axon-barber
# e os três em --project crucial-baton-440119-r8 (DEV)
```

Cuidado com o `\n` no fim ao colar: o token é comparado com `trim()`, mas a
chave web vai na URL.

### Permissões (IAM)

A conta de serviço de execução das funções (em v2, a conta padrão do Compute
`{número}-compute@developer.gserviceaccount.com`, salvo configuração em
contrário) precisa de:

- **criar usuário e gravar claims** (`firebaseauth.users.create/update`): já
  usado por `provisionBarbershop`;
- **ler e atualizar a config do Auth** (`firebaseauth.configs.get`,
  `firebaseauth.configs.update`), para os domínios autorizados. O papel
  `roles/firebaseauth.admin` (Administrador do Firebase Authentication) cobre
  as duas coisas. Se a conta tiver só papéis mínimos, conceder:

```sh
gcloud projects add-iam-policy-binding axon-barber \
  --member=serviceAccount:<número>-compute@developer.gserviceaccount.com \
  --role=roles/firebaseauth.admin
```

- **ler os três segredos**: o deploy concede `secretAccessor` sozinho, como
  já faz com os do WhatsApp.

Chamar a API da função não depende de IAM: `plataforma` é pública na rede,
como o webhook do WhatsApp, e a barreira é o token.

## 4. A acertar com o Hub

- **Domínio:** `PRODUTOS_PLATAFORMA.barber.dominioRaiz` no Hub ainda é
  `jpproject.com.br`. As barbearias novas nascem em `{slug}.topete.com.br`
  (o Hub já pega o domínio certo da `url` que o `/provisionar` devolve). Mas
  o registro que o Hub cria sozinho a partir de um `cadastrada` usa o
  `dominioRaiz`, e o monitor de saúde vai medir o domínio errado. O O
  Siqueira continua em `osiqueira.jpproject.com.br`.
- **Prazo do expurgo:** o código apaga **30 dias** depois de encerrar
  (`DIAS_ATE_O_EXPURGO`, prometido na Política de Privacidade). Não são 90.
  O `cancelado` do Hub usa o mesmo prazo.
- **Plano no `/provisionar`:** nulo vira `agenda`, e a barbearia nasce em
  `trial` no plano de entrada, não no `gestao` do teste self-service. Se a
  ideia for testar com tudo liberado, o Hub precisa mandar `plano: "gestao"`.
- **`ativo` não aplica plano.** Uma barbearia self-service em teste roda em
  `gestao`. Quando o Hub a ativa, ela continua em `gestao` até o operador
  aplicar o plano pedido (`definirPlano`).
- **`GET /api/health`** (§3 do contrato) ficou fora desta entrega.

## Cobranças para o dono (tela de Assinatura, 29/09)

O dono vê plano, boletos e segunda via em `/painel/assinatura`. O Topete pergunta ao Hub **pelo servidor**
(`minhaAssinatura`, `segundaVia` em `functions/src/hub/cobrancas.ts`), com o mesmo `PLATAFORMA_TOKEN` dos avisos.

**O Hub precisa expor** `POST https://southamerica-east1-jpproject-hub.cloudfunctions.net/plataformaCobrancas`,
`Authorization: Bearer <PLATAFORMA_TOKEN>`, com duas ações:

1. Listar — `{ "produto": "barber", "externoId": "<barbershopId>", "acao": "listar" }`
   ```json
   {
     "ok": true,
     "assinatura": { "plano": "Crescimento", "valor": 137.9, "ciclo": "mensal", "status": "ativo", "proximoVencimento": "2026-11-10" },
     "cobrancas": [
       { "id": "<codigoSolicitacao>", "valor": 137.9, "vencimento": "2026-10-10", "situacao": "A_RECEBER", "pagoEm": null }
     ]
   }
   ```
   - Tenant achado por `externoId`; `assinatura` vem de `subscriptions/sub-{tenantId}` (`valor` já com desconto de
     fundadora e barbeiro extra — é o que a tela mostra como mensalidade).
   - `cobrancas`: as 12 mais recentes de `cobrancas` com esse `tenantId`; `situacao` é o valor cru do Inter
     (o Topete traduz); `pagoEm` em ISO ou `null`.
   - Tenant desconhecido → `404`.

2. Segunda via — `{ "produto": "barber", "externoId": "<barbershopId>", "acao": "segunda_via", "id": "<codigoSolicitacao>" }`
   ```json
   { "ok": true, "linhaDigitavel": "...", "pixCopiaECola": "...", "pdfBase64": "..." }
   ```
   - **Conferir que `cobrancas/{id}.tenantId` é o tenant desse `externoId`** — senão `404`. Sem isso, um id de
     outro cliente abriria o boleto dele.
   - Mesma lógica de `interCobrancaEntrega` com `comPdf: true`.

Enquanto a rota não existir (404), a tela diz "Seus boletos ainda não aparecem aqui" — não inventa boleto nem
"em dia". Barbearia `isento` (o O Siqueira) não consulta o Hub.
