# Promoção para produção — o que os 78 commits mudam

> **20/08/2026** · análise de `origin/main` (`659091a`) → `HEAD` (`fc31e3b`).
> **Nenhuma linha de código alterada. Nenhum push. Nenhum PR.**
>
> Feita antes de promover, e pela mesma razão que a rodada inteira seguiu: não
> confiar no número do commit, olhar o efeito real.

---

# 0 · A distância, medida

| | |
|---|---|
| `origin/main` | `659091a` — o commit em que os relatórios de agent dizem *"nasci aqui"* |
| `origin/hardening/p0-2026-08-17` | `4b3d889` — a branch remota parou em "contrato do DRE" |
| `HEAD` local, validado | `fc31e3b` |
| **Distância** | **78 commits** |

**A main não recebeu nada da sequência**: R1, D1–D4, N7, Gate P0, P1-7, D-3, os
🟡 e a tela de horários. O último deploy conhecido é `5a3bef6` (12/08), e ele
veio da main — confirmado por `merge-base`.

**Consequência se O Siqueira fosse provisionado hoje:** ele encontraria o produto
sem a correção de pagamento, com a comissão sendo reescrita retroativamente, e
com a agenda presa em seg–sáb 09h–19h — que é justamente o **item 4** do mínimo
do `CHECKLIST-O-SIQUEIRA.md`.

A esteira publica por **`workflow_dispatch`** (disparo manual, com escolha de
escopo e `needs: qualidade`). Não publica sozinha a cada push.

---

# 1 · Firestore Rules — 🟢 risco baixo

`firestore.rules` é o **único** arquivo de infraestrutura que mudou:
`firestore.indexes.json`, `storage.rules`, `firebase.json`, `.firebaserc` e
`.github/` estão **idênticos**.

São +59/−2, em três mudanças — e **as três FECHAM permissão**:

| Coleção | Antes | Depois |
|---|---|---|
| `clients` | não existia (negado por omissão) | `read` staff **ou o próprio** (`clientId == uid`); `write: false` |
| `cash_entries` | `read, write: if isOwnerOf` | `read` dono; **`write: false`** |
| `inventory_movements` | `read, write: if isStaffOf` | `read` staff; **`write: false`** |

Isso inverte a pergunta de risco: não há abertura indevida de leitura ou escrita.
O risco seria **quebrar escrita que a tela ainda fizesse direto**.

**Verificado:** as únicas escritas diretas do web são em `staff`, `expenses`,
`products`, `bookings` e `services` (via `createDoc`/`putDoc`/`patchDoc`/
`removeDoc` de `repository.ts`). **Nenhuma toca as três coleções afetadas.** As
regras fecham portas que ninguém usava.

**Compatibilidade com dados existentes:** nenhuma regra passa a exigir campo que
documentos antigos não tenham. `clients` casa por id de documento.

---

# 2 · Functions — 🟡 risco concentrado em um ponto

## 2.1 · Onze callables NOVAS

`createBookingAtCounter` · `registrarVendaDeProduto` ·
`registrarEntradaDeEstoque` · `registrarEstorno` ·
`corrigirPagamentoDeAtendimento` · `registrarMovimentoDeCaixa` ·
`criarMensalista` · `cancelarMensalista` · `gerarFaturasDoMes` ·
`registrarPagamentoDeMensalidade` · `definirPlano`

**Adição pura.** Callable nova não roda sozinha e nada a invoca até a tela
correspondente existir — ou seja, até o Hosting subir. Risco próprio: baixo.

## 2.2 · Os dois triggers alterados — é aqui que mora o risco

`materializeFinancialsOnCompletion` (+585 no arquivo) e
`creditLoyaltyOnCompletion` **rodam sozinhos** sobre `bookings` que já existem.

**Compatibilidade verificada campo a campo.** O trigger lê `status`, `clientId`,
`date`, `value`, `cobertura` e `cicloFinanceiro`. Os quatro primeiros existem em
qualquer booking antigo. Os dois novos são lidos **com fallback**:

```
depois.cobertura      ausente → resolverCobertura(...)     comportamento antigo
ciclo?.revertidoEm    ausente → reconclusao = false        comportamento antigo
```

**Nenhum campo novo é obrigatório.** Um booking gravado antes desta rodada
transita exatamente como transitava.

`creditLoyaltyOnCompletion` passou a usar `decidirEfeito` — a mesma régua do
fato financeiro, em vez de uma cópia própria. Muda o comportamento nos estados
de cancelamento, e para melhor: o carimbo passa a nascer e morrer pelo mesmo
critério do pagamento.

## 2.3 · A pergunta que esta análise NÃO responde

**Existem dados em `axon-barber`?** Se houver `bookings` reais, os triggers novos
passam a agir sobre eles na próxima transição de status. Se a base estiver vazia
ou só com dados de teste, o risco é zero.

Não verifiquei: exige acesso a produção, e isso é decisão do dono. **É a
informação que falta para dimensionar o único risco médio desta promoção.**

---

# 3 · Índices — 🟢 nenhum necessário

`firestore.indexes.json` não mudou, e **não precisa mudar**.

A única consulta com dois filtros é `mensalistas.ts:419-420`:

```ts
.where("clientId", "==", …).where("status", "==", "ativo")
```

Duas **igualdades**, que o Firestore resolve por merge dos índices de campo único
— composto só seria exigido com range + igualdade, ou `orderBy` em campo
distinto.

E o caso perigoso foi **evitado de propósito**, com o motivo escrito no código
(`booking.ts:656`):

> *"`where('clientId').where('date','>=')` exigiria índice composto"* — e a
> função filtra em memória em vez disso, *"porque índice faltando derruba o
> caminho em produção"*.

---

# 4 · Hosting / Web — 🟢 risco baixo, e um bloqueador antigo sumiu

| | |
|---|---|
| Rotas novas | **duas**: `/painel/clientes` e `/painel/horarios` |
| Dependências novas | **nenhuma** — `web/package.json` inalterado |
| Variáveis `NEXT_PUBLIC_` novas exigidas | **nenhuma** |

## O `next/font/google` foi eliminado

O bloqueador registrado no changelog — *"o build baixa Oswald e Manrope em tempo
de build, e a Google devolveu 404"* — **não existe mais nesta branch**. O layout
passou a usar `localFont`, com os arquivos **versionados no repositório**
(`web/src/assets/fontes/*.woff2`), e o comentário registra a razão:

> *"Com uma barbearia em operação, a correção urgente de um bug ficaria refém de
> um serviço de terceiro estar de pé. Servidas por nós, publicar depende só de
> nós."*

De quebra, o IP de cada visitante deixa de ir para a Google — o que conversa com
a política de privacidade da LGPD.

**Publicar esta branch é mais seguro que publicar a main atual**, neste aspecto
específico.

---

# 5 · Ordem de publicação recomendada

O `deploy.yml` permite escopo (`tudo` · `somente hosting` · `somente regras e
índices` · `somente functions`). **A ordem importa**, e não é indiferente:

```
1. FUNCTIONS   as callables passam a existir; NADA as chama ainda (a tela
               nova só chega no passo 3). É o momento em que os triggers
               alterados entram em vigor — o ponto de observação.

2. REGRAS      fecham escritas que nenhuma tela faz. As functions usam Admin
               SDK, que ignora rules, então nada que acabou de subir quebra.

3. HOSTING     por último: a tela nova chega quando tudo de que ela depende
               já está no ar.
```

**Publicar hosting primeiro seria o erro**: a tela nova chamaria callables que
ainda não existem, e o dono veria erro em botão que deveria funcionar.

---

# 6 · Veredito

| Bloco | Risco | Por quê |
|---|---|---|
| Firestore Rules | 🟢 baixo | três mudanças, todas fechando; nenhuma tela escreve nas coleções afetadas |
| Índices | 🟢 baixo | nenhum novo necessário; o caso perigoso foi evitado de propósito |
| Hosting / Web | 🟢 baixo | duas rotas, zero dependências, e o bloqueador do `next/font` eliminado |
| Functions | 🟡 médio | 11 callables novas são adição pura; **o risco é o trigger financeiro rodando sobre dados que já existem** |

**Nada aqui recomenda dividir a promoção em partes por causa de risco
estrutural.** O que recomenda cautela é uma única incógnita: **o que existe hoje
em `axon-barber`.**

- **Base vazia ou só com teste** → PR único, deploy nos três escopos na ordem
  acima, smoke test, provisionar.
- **Base com dados reais de operação** → vale conferir quantos `bookings` em
  aberto existem antes de os triggers novos entrarem em vigor.

---

# 7 · Depois do deploy, e antes do Siqueira

**"Deploy concluído" não é "produto validado em produção".** O smoke test
mínimo, na ordem que a rodada provou importar:

1. login e **tenant correto** (o `ROOT_DOMAIN` já derrubou isso uma vez);
2. agenda carrega;
3. **horário configurável** — a tela nova, gravando e refletindo;
4. criar e concluir um atendimento;
5. pagamento registrado com a taxa certa;
6. comissão no valor certo;
7. caixa batendo com o atendimento.

Só então os dados reais do Siqueira.
