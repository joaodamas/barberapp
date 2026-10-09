# Arquitetura da rede/franquia — plano aprovado para a fase "demo" (09/10/2026)

## Andamento

| PR | Conteúdo | Estado |
|---|---|---|
| PR0 | `functions/src/claims.ts`: `mutarClaims` (teto de 900 bytes) e `papelNaBarbearia`; escritores soltos refatorados | #165 |
| PR1 | `redes/{r}`, `private/contrato`, `redes_slugs`, `redeId` (proibido ao dono), `redeId` no Tenant, `rede.ts` (`sincronizarAcessoDaRede`, `criarRede`, `vincularUnidade`, `desvincularUnidade`, `definirDonoDaRede`) | este PR |
| PR2+ | seletor de unidade, painel da rede, trava do gerente, ... | a fazer |

Notas de implementação do PR1: o id da rede é automático (o slug fica em
`redes_slugs`); `definirDonoDaRede` SUBSTITUI o dono (contrato com um dono só);
`desvincularUnidade` e a troca de dono passam `unidadesRetiradas`/`donosRetirados`
para a sincronização, que é sem estado e só toca em membros com
`origem:"rede"` e o `redeId` da rede. A conferência de tamanho dos claims é feita
para TODAS as contas antes de gravar a primeira. Falta, em produção, o papel
`serviceAccountTokenCreator` para o seletor (PR2).

Decisões do dono: (1) gerente de unidade = `owner` só daquela unidade (sem papel novo); (2) cliente único na rede (fase posterior, PRs 6–8); (3) dono da rede com uma conta, painel somado e seletor de unidade sem novo login.

Modelo FEDERADO: cada unidade continua `barbershops/{id}` com o código de hoje. Tudo novo fica atrás de `shop.redeId`; sem `redeId` (O Siqueira) o caminho executado é o de hoje, linha por linha.

## A. Entidade e papéis
- `redes/{r}` (vitrine): nome, slug, marca{name,accentColor,logo}, unidades:[{id,slug,nome,dominio?,cidade?}], status, politicas{fidelidade, mensalidadeValeNaRede}, createdAt. get público (como barbershops, firestore.rules:214); list só platformAdmin; write false (só callables).
- `redes/{r}/private/contrato`: donos:[uid], maxUnidades (padrão 20), hubTenantId?, criadoPor. Lê: dono da rede e platformAdmin. Write false.
- `redes_slugs/{slug}` → {redeId}: get público, list platformAdmin, write false. Namespace separado de `slugs` (não tocar loadTenantBySlug). Criar rede confere os dois namespaces.
- `barbershops/{id}.redeId`: só o servidor grava. OBRIGATÓRIO: incluir 'redeId' nos campos proibidos ao dono em firestore.rules (~243-274). `redeId` público e entra no Tenant (web/src/lib/tenant-shape.ts ~56).
- Dono da rede = claims DERIVADOS: `redes:{r:"dono"}` + `barbershops[u]="owner"` em cada unidade. Regras e callables (`vinculosDe`, functions/src/acesso.ts:84-90) funcionam sem mudança, sem get() nas regras.
- Limite de 1000 bytes de custom claims: 58 + 31·N ≤ 1000 → teto de 20 unidades no modo derivado (maxUnidades=20). Medir e recusar acima de 900 bytes.
- `sincronizarAcessoDaRede(redeId)` idempotente: para cada uid em contrato.donos, grava redes[r]="dono" e barbershops[u]="owner" para cada unidade, e `barbershops/{u}/members/{uid}` = {role:"owner", origem:"rede", redeId}. Retirar remove SÓ papéis com origem:"rede" e revoga sessão; conceder não revoga (a tela força getIdToken(true)), como definirAcessoDeBarbeiro (functions/src/convite-equipe.ts:154-180).
- PR0 (pré-requisito): `functions/src/claims.ts` com `mutarClaims(uid, fn)` (read-modify-write centralizado, mede tamanho, recusa > 900 bytes com mensagem clara) e helper `papelNaBarbearia(request, id)` embrulhando vinculosDe. Refatorar os escritores soltos: provisioning.ts:448 (grantRole), convite-equipe.ts:174, signup.ts:274, data-deletion.ts:294, account.ts:81 — sem mudar comportamento.
- Trava do gerente (PR2b): em unidade com redeId, `encerrarConta` (data-deletion.ts:377), `reabrirConta` (:422), `comecarDoZero` (comecar-do-zero.ts:187), `escolherPlano` e `pedirCancelamento` (hub/pedidos.ts:84, :118) passam a ser só do dono da rede (claim redes[r]=="dono" E uid em contrato.donos). Sem redeId: igual a hoje.

## C. Painel da rede v1 (demo)
- Rota `web/src/app/rede/page.tsx`, só no domínio raiz (host sem slug). Guarda: `claims.redes`. (Em dev: `localhost:3001/rede`.)
- Para cada unidade de `rede.unidades`: carregar o Tenant (get público + conversão de tenant-shape.ts) e embrulhar um card em `<TenantProvider tenant={unidade}>` (web/src/lib/tenant-context.tsx:31-46), reaproveitando hooks (useBookings, usePayments, useExpenses, useCommissions, useSubscriptionInvoices em use-shop-data.ts) e as funções puras de web/src/lib/analytics.ts. Totais por função pura `somarResumosDaRede(resumos[])` com teste. Agenda do dia por unidade. Funciona porque o dono da rede tem owner derivado.
- Mostrar por unidade e somado: recebido hoje e no mês, atendimentos, ocupação, ticket médio, faltas, despesas e resultado do mês (DRE resumido), agenda do dia (próximos e atrasados), barbeiros ativos. Botão "Abrir unidade" usa o passe (seletor).
- Custo: hooks assinam coleção inteira; aceitável para demo; v2 (pré-agregação, PR11) depois.
- Visual: seguir o sistema aprovado no #160 (tokens novos, sem caixa alta, faixa de resumo, rounded-controle/superficie). Nada de cara de template.

## Seletor sem novo login (PR2)
- Callable `passeParaUnidade({barbershopId})`: exige vinculosDe(request)[id] ∈ {owner, staff}; chama `criarCodigoDeEntrada(uid, slug)` (functions/src/entrada.ts:26-32); devolve `urlDaBarbearia(shop)` (functions/src/destinos.ts:28-33) + `/painel#entrada=…`.
- No destino: o hook `useEntradaPorCodigo` (web/src/lib/entrada-por-codigo.ts, hoje só em web/src/app/comecar/page.tsx:64) entra no layout web/src/app/painel/(dashboard)/layout.tsx e em /login.
- Voltar ao /rede na raiz: slug sentinela "@raiz" aceito por trocarCodigoDeEntrada (entrada.ts:34-59, comparação :48).
- Seletor no cabeçalho do painel a partir de `meusDestinos` (destinos.ts:36-63) estendido com redeId/redeNome; no login da raiz (web/src/app/login/page.tsx:156-181), se houver claims.redes, oferecer /rede.
- Em DEV/local: urlDaBarbearia deve produzir `http://{slug}.localhost:{porta}` quando o ambiente for local (ver o PR #164 que faz *.localhost resolver o tenant em dev) — confira como destinos.ts monta a URL e permita configurar o domínio raiz por variável.
- Pré-requisito de produção: papel serviceAccountTokenCreator (entrada.ts:20-23) — documente.

## Callables de plataforma (PR1)
`criarRede`, `vincularUnidade`, `desvincularUnidade`, `definirDonoDaRede` — só platformAdmin; todas chamam sincronizarAcessoDaRede.

## Fora da demo (fases seguintes): PR4 criarUnidadeNaRede + convite de gerente; PR5 página pública /r/[slug]; PR6 identidade única de cliente; PR7 fidelidade na rede; PR8 mensalidade na rede (cota cross-unidade); PR9 repasse no DRE; PR10 script de migração; PR11 resumos diários.

## Testes por PR
- PR0: unitários de tamanho; suíte atual verde, sem mudança de comportamento.
- PR1: test:rules — dono não grava redeId; anônimo get sim, list não; gerente não escreve na rede. Isolamento: unidade da rede X vs Y; dono da rede lê as duas. Sincronização idempotente; revogação só de origem rede.
- PR2: autorização (sem vínculo negado; mustChangePassword negado; código preso ao slug).
- PR2b: autorizacao-functions.test.ts.
- PR3: unitário da soma.
