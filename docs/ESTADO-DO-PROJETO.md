# Estado do projeto — CorteHub / JP Barber

> **20/08/2026** · `hardening/p0-2026-08-17` em `3f460e2` · consolidado com o João.
>
> Substitui `STATUS-ATUAL.md` (12/08) como fotografia de referência. Aquele
> documento descreve um repositório que já não existe: foi escrito antes do
> fechamento de D1–D4, antes do R1 e antes do N7.
>
> **Este documento diz o que É.** O que **falta** continua em
> `GO-LIVE-READINESS.md`; a fila de execução, em `FILA-DE-EXECUCAO.md`.

---

# 1 · A trajetória, em uma linha

```
protótipo → validação funcional → multi-tenant → hardening → LGPD
         → motor financeiro → decisões de domínio → R1 → Gate P0 → piloto
```

O projeto saiu da construção. **A pergunta deixou de ser "funciona?" e passou a
ser "o número que ele mostra é o fato?"** — e é essa troca que explica por que
uma rodada inteira pode terminar sem feature nova e ainda assim ter sido a mais
produtiva.

---

# 2 · O que está fechado

| Frente | Estado | Onde |
|---|---|---|
| **D1** — comissão padrão da casa | ✅ 40% barbeiro / 60% casa, gravado na criação | `96565f3` · `provisioning.ts:163` · `financial-events.ts:96` |
| **D2** — atendimento coberto pelo plano | ✅ reserva ganhou `cobertura`; caixa do dia nasce do pagamento | `96565f3` + `0b4e8ce` |
| **D3** — falha de leitura não vira zero | ✅ | `12056c7` |
| **D4** — receita × caixa × ticket | ✅ nomes distintos | `12056c7` |
| **N7** — área do cliente | ✅ `/agendar` não afirma "não há horário" antes de perguntar | `e9eea9b` |
| **ROOT_DOMAIN / tenant** | ✅ login identifica "O Siqueira Barbearia" — reconfirmado na tela em 20/08 | `9559d4b` |
| **R1** — correção de pagamento | ✅ **FECHADO** — Gate P0 executado na tela em 20/08, 9 passos e 9 cenários | `a9c5eca` · `GATE-P0-R1-EXECUTADO.md` |
| **P1-7** — comissão do atendimento reconcluído | ✅ **FECHADO e provado em execução** — ver §4.2.1 | `financial-events.ts` · `comissoes.ts` |
| **LGPD técnica** | 🟡 política, termos, links, exclusão e 11 testes; pendência jurídica | — |
| **Suíte** | ✅ 781 web · 471 functions · 33 emulador; typecheck, lint e build limpos | — |

**D1–D4 não bloqueiam mais nada.** É a correção mais importante ao registro
anterior, que os tratava como bloqueio ativo.

---

# 3 · O que o R1 ensinou

Começou como *"deixar editar o meio de pagamento"*. Terminou em outro lugar:

> O problema não era **editar um campo**. Era **corrigir um fato financeiro já
> materializado** — que move pagamento, comissão, caixa, DRE e projeção de uma vez.

Por isso virou callable dono-only, alterando pagamento + reserva + `audit_log`
na **mesma** transação, com `update` nunca `set`, campos congelados intocados e
taxa vigente reusada, não reimplementada.

E duas descobertas não vieram de rodar teste — vieram de perguntar *quem escreve
isto*:

- **`audit_log` é `allow write: if false`** (`firestore.rules:341`), imutável até
  para o dono. Um `updateDoc` de tela não registra correção nenhuma.
- **A cobertura do plano é indecidível antes da conclusão** — duas reservas
  futuras do mesmo mês disputam a mesma vaga da cota.

Daí as duas regras novas do protocolo:

- **§26** — toda mudança de fato financeiro define seu próprio rastro.
- **§27** — a interface não afirma o que o sistema ainda não sabe.

---

# 4 · Três portões, e misturá-los é erro

A distinção não é burocrática: **bloquear o R1 pelo defeito nº 2 deixaria o
produto exatamente igual**, com o P1-7 vivo e sem a única porta que corrige
pagamento. Piora em vez de melhorar.

## 4.1 · Portão do R1 — ✅ FECHADO em 20/08

O Gate P0 rodou na bancada com **auth + firestore + functions**, primeira execução
real de `materializeFinancialsOnCompletion` neste repositório. Os 9 passos e os 9
cenários estão em `GATE-P0-R1-EXECUTADO.md`.

O passo decisivo foi o **8**: com o cadastro do barbeiro em 50%, uma escrita em
`bookings` que não fosse `status` não moveu documento nenhum — a comissão ficou
congelada em 60% e o `createdAt` do pagamento não mudou.
`decidirEfeito("completed","completed") === "nada"` passou de asserção de função
pura a **fato observado**. Era a premissa do R1, e ela é verdadeira em runtime.

Um cenário da matriz falhou — o **6**, "Veio depois não recalcula histórico". Ele
falha contra a **expectativa do briefing**, não contra o R1: a reabertura nunca
preservou o histórico, e o R1 apenas tornou o dano visível.

## 4.2 · Portão do piloto — três itens

| | Bloqueio | Por quê |
|---|---|---|
| ✅ | ~~**P1-7**~~ — fechado em 20/08, ver §4.2.1 | — |
| 🟡 | **Cobertura re-decidida** — a parte **silenciosa** foi fechada pelo D-3, ver §4.2.2 | resta o caso em que o dono escolhe "Concluir sem cobrar" sobre um atendimento que já tinha pagamento: o valor sai, por decisão dele, e nada avisa que havia receita ali |
| 🔴 | **Caso 2** — meio de pagamento preenchido e errado | indetectável hoje: não há segunda origem |
| 🔴 | **D18** — mensalista contado duas vezes no DRE | o problema conceitual mais importante em aberto |

### 4.2.1 · P1-7 — fechado, e provado em execução

**D-2 decidida:** a comissão de um atendimento reconcluído nasce do **fato**, não
do cadastro de hoje — e o histórico se corrige **somando**, nunca apagando. É a
mesma regra que `refunds.ts:495` já aplicava à venda de produto, com a mesma
justificativa (*"é o P1-7 tentando entrar pela porta de saída"*), e que a porta
do atendimento nunca teve. A diferença entre as duas portas nunca foi escolhida:
foi herdada.

O que passou a valer:

- **A reversão preserva a comissão original.** Onde havia `comissaoRef.delete()`
  agora entra uma linha negativa com o percentual **congelado** do documento
  vigente.
- **A reconclusão usa `pctCongelado`, não o cadastro.** A ordem
  `pctCongelado ?? staffSnap…` é o que fecha o defeito — invertida, o cadastro de
  hoje volta a vencer, em silêncio.
- **O segundo ciclo estorna a linha vigente**, não a original. Sem isso, a
  segunda reversão negaria algo que a primeira já negou, e o barbeiro ficaria
  devendo dinheiro que recebeu uma vez só.
- **`comissaoVigenteId`** (em `bookings.cicloFinanceiro`) é o que identifica a
  linha válida de cada ciclo.
- **O bruto sai do congelado**, não de `booking.value` — o que também fecha o
  defeito 🟡 do `grossAmount` recriado.

Medido na bancada com trigger real, **com o cadastro do barbeiro em 80%**:

```
comissao_{bk}                    pct=30   +15   conclusão original
comissao_estorno_{bk}_{ev1}      pct=30   −15   reversão
comissao_{bk}_{ev2}              pct=30   +15   reconclusão — CONGELADO
SALDO                                     +15
```

Antes, a reconclusão gravaria R$ 40,00. E o **segundo ciclo** fecha em zero,
negando a linha certa.

Verde: **486 functions · 781 web**, typecheck, lint e build. Os 11 testes de
emulador (`test:tudo`) não rodaram — usam as mesmas portas da bancada; nenhum
deles exercita `financial-events`.

**Aberto:** nenhuma tela lê as linhas do ciclo. O saldo do barbeiro está certo,
mas o dono não tem onde ver as três linhas que o explicam — mesma família do
`audit_log` sem leitor (§26 item 3).

### 4.2.2 · D-3 — a cobrança do dono vence a cobertura do plano

**O achado que mudou o problema:** o relatório descrevia "a cobertura pode
virar" como defeito da reabertura. A medição de 20/08 mostrou **duas** variantes,
e a segunda não estava registrada em lugar nenhum — nem dependia do ciclo
`no_show`.

| | Variante | Estado |
|---|---|---|
| 1 | Dono clica **"Concluir sem cobrar"** e a receita anterior sai | 🟡 é escolha dele, mas nada avisa que havia valor ali |
| 2 | Dono escolhe **Pix** e o servidor decide `plano` assim mesmo | ✅ **fechada** |

A variante 2 acontecia em **toda** conclusão de mensalista em que o dono
informasse um método — primeira vez inclusive. O resultado era:

```
payments/pagamento_{bk}   NÃO EXISTE          a receita não era registrada
bookings.paymentMethod    "pix"               afirmação sem lastro nenhum
a tela                    "Coberto pelo plano" a escolha do dono, descartada
```

**D-3 decidida:** método informado é afirmação de que houve dinheiro, e ela
vence a decisão do servidor. O caminho de cobertura continua existindo e é
explícito — "Concluir sem cobrar" conclui sem método, e aí o plano manda.

A regra coube numa função pura (`decidirCobertura`), com a guarda **depois** de
toda a régua: `plano_nao_cobre` e `cota_esgotada` continuam sendo ditos, porque
são a explicação real da cobrança. O motivo novo, `cobrado_no_balcao`, descreve
só o caso em que o plano cobriria e o dono cobrou assim mesmo — e o atendimento
**não consome vaga da cota**, porque foi pago à parte.

Medido na bancada, com o Pedro mensalista Ilimitado e o dono escolhendo Pix:
pagamento criado, `Recebido hoje` subindo de R$ 50,00 para R$ 100,00, e a linha
dizendo *"Pix — Fora do plano: o plano cobriria, e você registrou a cobrança"*.

Verde: **499 functions · 781 web**, typecheck, lint e build.

## 4.3 · Portão do Go-Live

Mobile sem uma única medição · pendência jurídica da LGPD · deploy completo
(403 nas regras do Storage).

---

# 5 · Os dois achados que a auditoria de 20/08 acrescentou

Recuperados de worktrees onde ficaram órfãos; hoje em `docs/agent-reports/`.

## "Veio depois" apaga a correção — `R1-VEIO-DEPOIS.md`

Não são quatro campos. O `PaymentDoc` **inteiro** é deletado e renasce com o
**mesmo id** (`pagamento_{bookingId}`): nada duplica, a contagem de documentos
não muda e **nenhuma tela pode notar**. A comissão renasce do cadastro de hoje,
a cobertura é re-decidida, e se o cliente ganhou plano no intervalo o pagamento
é apagado — a receita some. O `audit_log` sobrevive intacto, descrevendo um
pagamento que já não existe.

Três achados que ninguém tinha escrito: `bookings.paymentMethod` fica órfão no
`no_show` (uma linha "Não compareceu" exibindo "Crédito"); o `grossAmount`
renasce de `booking.value` de hoje, não do congelado; e **a erosão não deixa
rastro em lugar nenhum**.

## O caso 2 é indetectável — `R1-CASO-2.md`

Dezesseis candidatos a sinal, dezesseis descartados. Todo registro de meio de
pagamento desce de uma digitação humana, e o produto não tem segunda origem:

```
dono escolhe no modal → bookings.paymentMethod → payments.paymentMethod
   → feePct · feeAmount · netAmount → refunds → DRE · Caixa · Fluxo · Projeção
```

Nenhum nó desse grafo tem aresta de entrada vinda do mundo. **Alarme exige
coleta antes** — fechamento de caixa, extrato da maquininha ou recibo ao
cliente. Sem isso, qualquer alerta seria `insufficient` e o invariante 3 do
Action Center o barra na porta.

Achado lateral não registrado em documento nenhum: **o card do caso 1 só enxerga
reservas de hoje** (`page.tsx:117`). Um `completed` sem método de anteontem não
gera card nem tem linha na tabela.

---

# 6 · Estado técnico

| | |
|---|---|
| HEAD | `3f460e2` (18/08) — `9559d4b` ficou **26 commits** atrás |
| Worktrees | 3 ativas |
| Relatórios recuperados | `docs/agent-reports/R1-VEIO-DEPOIS.md` · `R1-CASO-2.md` |
| Bancada | emuladores **auth + firestore + functions** de pé, com `materializeFinancialsOnCompletion` registrado |

**O trigger não é exercitado por nenhum teste automatizado.** Os 12 scripts de
emulador (`functions/package.json:15-25`) usam `--only firestore`; nenhum sobe
`functions`. O Gate P0 de 20/08 foi a **primeira execução real** — e o que ela
mediu está em `GATE-P0-R1-EXECUTADO.md`. A lacuna na suíte **continua aberta**:
o que provou o comportamento foi uma bancada montada à mão, não a esteira.

## Dois defeitos de bancada, encontrados ao montá-la

1. **O seed não roda como documentado.** `node scripts/semear-day-in-the-life.mjs`
   falha com `ERR_MODULE_NOT_FOUND: firebase-admin` — o pacote só existe em
   `functions/node_modules`, e o resolver ESM não sobe até lá a partir de
   `scripts/`. Correção de uma linha, e **todo roteiro de bancada começa por aí**.
2. **`export PATH="$JAVA_HOME/bin:$PATH"` quebra em silêncio no Git Bash** quando
   o caminho é estilo Windows: o `C:` é o próprio separador de `PATH`. Com JDK 21
   instalado, o Firebase recusava por "Java version before 21". Só o caminho
   POSIX (`/c/Program Files/...`) funciona. É irmão do tropeço já registrado
   (`VAR=x npm run dev` não propaga).

---

# 7 · O próximo passo

**Não é construir feature.**

```
Gate P0 ✅ → P1-7 ✅ → cobertura silenciosa ✅ → D18 → caso 2 → Go-Live
```

**O D18 é o próximo alvo** — mensalista contado duas vezes no DRE, o problema
conceitual mais importante em aberto. E o D-3 acabou de tocar a fronteira dele:
`cobrado_no_balcao` cria, de propósito, o caso em que um mensalista **gera
receita de serviço** — o que é correto (ele pagou à parte), mas encosta na
mesma pergunta que o D18 faz sobre o que a mensalidade cobre.

Três correções 🟡 seguem sem depender de decisão nenhuma:

- `paymentMethod` órfão no `no_show` (uma linha na perna de reversão);
- o alcance da porta do R1, que só enxerga hoje enquanto o servidor já concede
  o mês corrente;
- **`page.tsx:100` ordena a agenda com `a.time.localeCompare(b.time)` sem
  guarda** — um único booking sem `time` derruba a tela inteira do dia com
  "Esta tela não abriu". Encontrado por acidente, escrevendo um documento
  incompleto direto no banco; as regras permitem essa escrita ao dono e à
  equipe (`firestore.rules:246`).

A quarta (`grossAmount` recriado de `booking.value`) **caiu junto com o P1-7**.

## Uma sequência de evidência que vale preservar

```
Gate P0 → R1 fechado → P1-7 fechado → cobertura re-decidida
```

Cada marco tem commit próprio, de propósito: misturar correções faria uma
mudança futura esconder qual delas resolveu qual dano.

## O marco de retomada

> **JP Barber — R1 FECHADO com gate na tela, D1–D4 fechadas, piloto bloqueado
> por P1-7, cobertura re-decidida, caso 2 e D18.**
