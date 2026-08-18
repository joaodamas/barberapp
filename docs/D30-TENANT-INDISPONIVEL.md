# D30 — Falha de infraestrutura expulsa o dono do produto

> **Estado:** IMPLEMENTADO e TESTADO na camada de resolução. **NÃO VERIFICADO** —
> ninguém abriu a tela. E **parado** na última ligação, que exige arquivo de
> outra equipe. Ver §7 e §8.

Equipe INFRA-01 · 18/08/2026 · baseline `bc336bc` (563 testes).

---

## 1 · O relato

O dono estava logado, no painel, olhando o financeiro. O Firestore caiu. Em vez
de uma tela dizendo *"não consegui carregar, tente de novo"*, ele foi mandado
para fora do produto — a mesma experiência de quem nunca teve conta.

A camada de tenant traduz **"não consegui carregar"** para **"você não pertence
a este painel"**.

É separado do **D27**, que é uma coleção falhando dentro de uma tela que já
carregou. Aqui o dono perde o painel inteiro.

---

## 2 · O que foi reproduzido

**Não há navegador nesta rodada.** A reprodução é por evidência de
infraestrutura real (emulador + `curl`) mais teste automatizado sobre o código
de resolução verdadeiro. O que ninguém observou está declarado em §8.

### 2.1 · Evidência bruta — emulador real

Emulador `firestore,auth` no projeto `day-in-the-life`, semeado com
`scripts/semear-day-in-the-life.mjs` (`slug: osiqueira` →
`barbershopId: shop-day-in-the-life`, dono `dono@osiqueira.teste` com claim
`{ "shop-day-in-the-life": "owner" }`).

Os dois `GET` que `tenant-server.ts` faz, na mesma REST que ele usa:

```
# 1 · emulador no ar, slug existe
GET /v1/projects/day-in-the-life/databases/(default)/documents/slugs/osiqueira
HTTP 200
{ "fields": { "barbershopId": { "stringValue": "shop-day-in-the-life" } } }

# 2 · emulador no ar, slug NÃO existe
GET .../documents/slugs/naoexiste
HTTP 404
{"error":{"code":404,"message":"Document (...) not found.","status":"NOT_FOUND"}}

# 3 · emulador DERRUBADO (java morto na porta 8080)
GET .../documents/slugs/osiqueira
HTTP 000
curl: (7) Failed to connect to 127.0.0.1 port 8080 after 2001 ms
```

O caso 2 e o caso 3 são fatos opostos: um é *"esta barbearia não existe"*, o
outro é *"não consegui perguntar"*. No código, os dois caíam no mesmo
`return null`.

### 2.2 · Reprodução determinística em teste

Antes de qualquer correção, um teste dirigiu o `getTenant()` real com `fetch`
substituído, e registrou o comportamento de então. Os cinco pontos passaram:

| # | cenário | resultado observado |
|---|---|---|
| controle | Firestore no ar | `tenant.id === "shop-day-in-the-life"` |
| defeito 1 | `fetch` lança | `tenant.id === "cortehub"`, `brand.name === "CorteHub"` |
| defeito 2 | 503 vs 404 | **id idêntico** nos dois |
| defeito 3 | claim do dono sob o id trocado | `papel === undefined`, `isOwner === false` |
| defeito 4 | host sem slug | `isPlatformRoot() === true` → `/landing` |

Esse arquivo era andaime e foi removido; o que ficou é
`web/src/lib/__tests__/tenant-indisponivel.test.ts`, que trava o comportamento
**corrigido** e mantém a mesma matriz de cenários.

---

## 3 · O caminho mapeado

### 3.1 · Onde o tenant é resolvido

`web/src/lib/tenant-server.ts` — no **servidor**, por `fetch` na REST do
Firestore. Duas leituras: `/slugs/{slug}` → `/barbershops/{id}`.

`getTenant()` é consumido por cinco lugares: `app/layout.tsx` (raiz e
`generateMetadata`), `app/manifest.ts`, `app/(cliente)/layout.tsx`,
`app/painel/(dashboard)/layout.tsx` e `app/privacidade/page.tsx`.

### 3.2 · O que acontecia quando a leitura falhava

`loadTenantBySlug` devolvia `null` em **cinco** situações estruturalmente
diferentes, e `getTenant` transformava todas no mesmo `DEFAULT_TENANT`
(`id: "cortehub"`):

```
!projectId              configuração ausente
!slugRes.ok             404 do slug   OU   503 do Firestore
!barbershopId           documento de slug quebrado
!shopRes.ok             404 da ficha  OU   503 do Firestore
catch                   rede, DNS, timeout, conexão recusada
```

E o log dizia, para todos eles:

```
console.warn(`[tenant] subdomínio sem barbearia: ${slug}`)
```

Numa queda de banco esse log é **falso**. Quem lesse o incidente concluiria que
o cliente tinha sumido da base.

### 3.3 · Quem decide redirecionar, e por quê

Ninguém decide "expulsar". A expulsão é consequência de uma pergunta respondida
com informação trocada.

`web/src/components/auth-guard.tsx:26-28`:

```ts
const papel = claims.barbershops?.[tenant.id] ?? claims.role;
const isOwner = papel === "owner";
const authorized = !!user && (!requireOwner || isOwner);
```

O claim do dono é `{ "shop-day-in-the-life": "owner" }`. Com `tenant.id` valendo
`"cortehub"`, a busca devolve `undefined`, `claims.role` é o modelo
single-tenant morto, e `isOwner` vira `false`. Então (`auth-guard.tsx:49`):

```ts
router.replace(user ? "/" : "/login");
```

O painel monta assim (`app/painel/(dashboard)/layout.tsx:31-33`):

```tsx
<TenantLive inicial={tenant}>
  <AuthGuard requireOwner>
```

### 3.4 · Onde ele para

Depende do host, e os dois destinos são a mesma perda:

- **Produção, `osiqueira.jpproject.com.br`** — o host ainda tem slug, então
  `isPlatformRoot()` é `false`. Ele cai em `/`, a **vitrine do cliente**,
  vestida de **CorteHub** — "Sua barbearia". O dono vira visitante da
  plataforma.
- **Host sem slug** (`localhost`, `*.web.app`, domínio raiz) —
  `app/(cliente)/layout.tsx:18` faz `redirect("/landing")`. É a **landing
  pública** do relato, literal.

Em nenhum dos dois aparece uma frase explicando o que aconteceu, e a URL em que
ele estava se perde.

### 3.5 · O que já estava certo

`tenant-live.tsx` **já** degradava bem: o `onSnapshot` que falha só registra no
log e mantém o valor do servidor — *"sem rede, a ficha de cinco minutos atrás é
melhor que tela nenhuma"*. O defeito não está na assinatura em tempo real; está
na resolução do primeiro byte.

`web/src/lib/db/use-collection.ts` **não** participa: ele expõe
`status: "erro"` e foi endereçado no D27. O D30 acontece antes — a tela nem
chega a montar.

---

## 4 · Os casos, distinguidos

O `else` era um só. São quatro coisas diferentes:

| caso | natureza | recarregar resolve? | comportamento correto |
|---|---|---|---|
| host sem subdomínio | permanente | não | landing da plataforma |
| slug nunca existiu (404) | permanente | não | tenant padrão / landing |
| ficha removida (404) | permanente | não | tenant padrão / landing |
| slug sem `barbershopId` | permanente (dado quebrado) | não | tenant padrão |
| 5xx, 429 | **transitório** | **sim** | *"não consegui carregar"* |
| rede, DNS, timeout | **transitório** | **sim** | *"não consegui carregar"* |
| `projectId` ausente | falha de configuração | não, mas nunca é "não existe" | *"não consegui carregar"* |

**Barbearia encerrada não entra nesta tabela.** `status: "encerrada"` é campo da
ficha, resolvido com sucesso, e quem trata é `acessoDaBarbearia` — modo leitura,
não porta fechada (`docs/COBRANCA-E-ENTRADA.md`). Nunca foi um caso de
resolução, e não muda.

**Usuário sem vínculo também não.** Tenant resolvido + claim ausente é uma
resposta verdadeira: essa pessoa realmente não é dona desta barbearia, e o
redirecionamento continua sendo o certo. É exatamente o comportamento que os
testes de §6 protegem.

---

## 5 · A proposta

### O que muda

`loadTenantBySlug` para de devolver `Tenant | null` e passa a devolver o **estado**
junto:

```ts
export type EstadoDoTenant =
  | "resolvido"       // achei a barbearia
  | "sem-barbearia"   // o host não tem slug
  | "inexistente"     // o Firestore respondeu, e não há barbearia
  | "indisponivel";   // não consegui perguntar

export type ResolucaoDeTenant = { estado: EstadoDoTenant; tenant: Tenant };

export const resolverTenant = cache(async (): Promise<ResolucaoDeTenant> => …);
```

O painel, que é o único lugar com um dono para expulsar, consome `resolverTenant()`
e, quando o estado é `indisponivel`, mostra `ErroAoCarregar` **acima** do
`AuthGuard` — que assim nunca é consultado sobre uma barbearia que não carregou.

### O que continua igual

- **`getTenant()` mantém assinatura e comportamento.** Continua
  `Promise<Tenant>`, continua devolvendo `DEFAULT_TENANT` em qualquer falha. Os
  cinco consumidores não mudam uma linha. Há teste para isso.
- **O tipo `Tenant` não muda.** Nenhum campo novo, nenhum campo opcional. O
  contrato compartilhado por todo o produto fica intacto — era a condição de
  stop-the-line do briefing.
- **A vitrine pública continua degradando em silêncio.** É a decisão já
  registrada no código: *"barbearia fora do ar é pior que barbearia com a marca
  da plataforma"*. Quem quer marcar corte na sexta não deve tomar uma tela de
  erro porque o painel do dono não abriria.
- **Redirecionamento legítimo continua acontecendo**, nos quatro casos
  permanentes.

### O risco, declarado

O erro simétrico — tratar como transitório algo que era permanente — é **pior**
que o defeito atual: um dono expulso volta quando o banco volta; um visitante
preso num *"tente de novo"* que nunca funciona não tem saída, e o sintoma é
indistinguível de produto quebrado.

Por isso a classificação é deliberadamente **conservadora**: só entram em
`indisponivel` os sinais **inequívocos** de infraestrutura — `status >= 500`,
`429`, exceção de `fetch` e ausência de configuração. Todo o resto (404, 403,
dado quebrado) permanece permanente e **mantém exatamente o comportamento de
hoje**. Na dúvida, o código escolhe o comportamento antigo.

---

## 6 · O que foi implementado

Três arquivos, todos dentro do ownership da INFRA-01:

| arquivo | mudança |
|---|---|
| `web/src/lib/tenant-server.ts` | `EstadoDoTenant`, `ResolucaoDeTenant`, `resolverTenant()`; classificação por código HTTP; `getTenant()` delega e não muda; log deixa de mentir |
| `web/src/lib/tenant-live.tsx` | prop opcional `indisponivel` (padrão `false`); quando verdadeira, renderiza `ErroAoCarregar` no lugar dos filhos e não assina o documento do substituto |
| `web/src/lib/__tests__/tenant-indisponivel.test.ts` | 15 testes |

`ErroAoCarregar` é **consumido, não editado** — UX-04 é a dona. A frase que o
dono lê passa a ser *"Não foi possível carregar o painel da sua barbearia. Pode
ser a conexão ou uma permissão que mudou. Nada foi perdido."*, com **Tentar de
novo**.

Nenhum `router.replace`: quem é expulso perde a URL em que estava.

### Os testes que provam que o redirecionamento legítimo continua funcionando

Cinco dos quinze existem só para isso — `sem-barbearia` em host sem slug (com
`isPlatformRoot()` ainda `true`), 404 no slug, 404 na ficha, slug sem
`barbershopId`, e 403. Todos continuam em tenant padrão.

E o teste que trava o defeito: `503` e `404` deixam de produzir o mesmo estado,
continuando a produzir o mesmo tenant substituto.

### Verificação executável

```
npx tsc --noEmit            exit 0
npx eslint src --max-warnings=0   exit 0
npx vitest run              28 arquivos · 578 testes · 0 falhas   (eram 563)
npm run build               ✓ Compiled successfully · 28/28 páginas
```

---

## 7 · ⛔ STOP-THE-LINE — a última ligação é de outra equipe

A correção está construída e **inerte**. Falta uma ligação de duas linhas, e ela
mora em arquivo proibido para a INFRA-01.

```
CONFLITO DE OWNERSHIP

Arquivo:      web/src/app/painel/(dashboard)/layout.tsx
Equipe A:     UX-01 — dona de layout.tsx (protocolo §17, conflito 3)
Equipe B:     INFRA-01 — dona da resolução de tenant (D30)
Mudanças:     trocar `getTenant()` por `resolverTenant()` e repassar o estado
              ao `TenantLive`, que já sabe o que fazer com ele
Contrato em disputa:  nenhum — `resolverTenant` é contrato NOVO, produzido pela
              INFRA-01; `getTenant` fica intacto para todos os outros
Decisão necessária:   quem aplica o diff abaixo
```

O diff completo, para UX-01 ou para o orquestrador:

```diff
-import { getTenant } from "@/lib/tenant-server";
+import { resolverTenant } from "@/lib/tenant-server";

-  const tenant = await getTenant();
+  const { estado, tenant } = await resolverTenant();
   const { brand } = tenant;

-    <TenantLive inicial={tenant}>
+    <TenantLive inicial={tenant} indisponivel={estado === "indisponivel"}>
```

Enquanto não for aplicado, **o D30 continua aberto**: o dono segue sendo expulso.
Nada regride por isso — `indisponivel` é `false` por padrão.

### Por que não foi feito aqui

O briefing manda parar quando a correção exigir arquivo de outra equipe, e o
protocolo §15 proíbe resolver conflito de ownership automaticamente. Não há
caminho alternativo: o estado nasce no servidor e só chega ao cliente por prop,
e o único componente servidor entre a resolução e o `AuthGuard` é esse layout.

---

## 8 · O que precisa ser observado em tela (Regra 19)

Sem navegador, **nada aqui está VERIFICADO**. Depois de aplicado o diff de §7,
alguém precisa abrir e olhar:

1. **O caso do relato.** Logar como `dono@osiqueira.teste`, abrir
   `/painel/financeiro`, **derrubar o emulador do Firestore**, recarregar.
   Esperado: a frase *"Não foi possível carregar o painel da sua barbearia"* com
   **Tentar de novo** — e **não** a vitrine nem a landing.
2. **A volta.** Subir o emulador de novo e clicar em *Tentar de novo*.
   Esperado: o painel volta, na mesma URL.
3. **O redirecionamento legítimo, que não pode ter quebrado.** Com o emulador no
   ar, abrir um subdomínio inexistente. Esperado: comportamento de hoje, sem
   tela de erro.
4. **Usuário sem vínculo.** Logar como cliente e tentar `/painel`. Esperado:
   continua indo para a área do cliente.
5. **A vitrine com o banco fora do ar.** Abrir `/agendar` como cliente.
   Esperado: continua degradando com a marca da plataforma — **não** deve
   aparecer tela de erro.
6. **Contraste e alvo de toque** do `ErroAoCarregar` centralizado em viewport de
   celular, que é onde o dono opera.

Só depois disso o D30 pode ser marcado como fechado no `BACKLOG-FASE-3.md`.

---

## 9 · Achado colateral

O log era falso. `[tenant] subdomínio sem barbearia: ${slug}` saía também para
`503` e para conexão recusada — os dois momentos em que alguém está lendo o log
justamente para descobrir o que caiu. Agora cada ramo diz o que aconteceu, e o
que é infraestrutura sai como `console.error`, não `warn`.

Vale registrar porque é a mesma classe do defeito principal, uma camada abaixo:
**o sistema afirmava um fato que não tinha como conhecer.**
