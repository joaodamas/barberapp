# Bateria de regressão — QA-01

> **A régua:** o sistema não pode afirmar que algo aconteceu quando não
> aconteceu. E não pode deixar de reconhecer algo que aconteceu.

Escrita durante a Rodada 3.2/3.3, com quatro equipes editando em paralelo
(FIN-01 motor financeiro · UX-04 design system · UX-01 navegação). O objetivo
não é cobrir o produto de novo — a cobertura existente é boa — é cobrir **o que
só quebra quando as peças se encontram**.

QA-01 não escreve código de produto. Onde esta bateria encontrou defeito, ele
está documentado abaixo com evidência, e **não** foi corrigido.

*Levantado em 17/08/2026, sobre a árvore de trabalho após `52e015e`.*

---

## 1 · Inventário de cobertura

### O que já está protegido, e por quem

| Invariante | Onde vive | Situação |
|---|---|---|
| Receita: valor sai do fato congelado, nas 3 origens | `fontes-financeiras.test.ts` | 🟢 forte |
| Receita: exclusividade — fato + pagamento não somam em dobro | `fontes-financeiras.test.ts` | 🟢 forte |
| Receita: fallback histórico não é segunda parcela | `fontes-financeiras.test.ts` | 🟢 forte |
| Pagamento **órfão** não vira receita | `fontes-financeiras.test.ts` | 🟢 |
| CMV pelo custo do VENDIDO; compra fora | `fontes-financeiras.test.ts` | 🟢 forte |
| Comissão de produto **sem fallback** (P1-7) | `fontes-financeiras.test.ts` · `analytics.test.ts` | 🟢 forte |
| Comissão de serviço: congelada vence a derivação | `analytics.test.ts` | 🟡 **furo no histórico — DEFEITO 2** |
| Estorno reduz, não apaga (D22) | `estornos.test.ts` · `refunds.test.ts` | 🟢 forte |
| Mensalista contratado ≠ realizado (D20/I5) | `reconciliacao.test.ts` · `mensalidade.test.ts` | 🟢 forte |
| Fluxo de caixa: exclusividade por origem | `fluxo-de-caixa.test.ts` | 🟢 forte |
| Livro caixa: exclusividade por enum fechado (D25) | `caixa.test.ts` (functions) | 🟢 forte |
| Idempotência: id derivado do fato | `payments.test.ts` · `comissoes.test.ts` · `refunds.test.ts` | 🟢 forte |
| Taxa congelada, por instrumento | `financial-events.test.ts` | 🟢 forte |
| Histórico não muda quando o cadastro muda | `financial-events.test.ts` | 🟢 (no servidor) |
| Reconciliação com o ledger humano, linha a linha | `reconciliacao.test.ts` | 🟢 forte |
| Árvore da receita: filhos fecham o cabeçalho (D6) | `rodada-1.test.ts` · `fontes-financeiras.test.ts` | 🟢 |
| Isolamento multi-tenant / regras | `isolamento-multi-tenant.test.ts` · `firestore-rules.test.ts` | 🟢 (só com emulador) |

### O que NÃO estava protegido — os buracos que esta bateria fechou

| # | Buraco | Categoria |
|---|---|---|
| B1 | Duas telas calculam "quanto entrou" e ninguém as compara no mesmo cenário | mesmo número em 2 telas |
| B2 | Dois `PaymentDoc` para o **mesmo** fato (retry, migração parcial) | dupla contagem |
| B3 | A divergência **intencional** caixa × receita não estava fixada — um "conserto" futuro a apagaria | dupla contagem |
| B4 | Compra de estoque em exatamente **um** dos dois lugares (caixa ou CMV) | dupla contagem |
| B5 | Nenhuma varredura de `NaN`/`Infinity` sobre o objeto inteiro numa barbearia nova | borda |
| B6 | Documento histórico sem os campos da 3.1, campo a campo | borda |
| B7 | `netAmount: 0` legítimo confundido com ausente | borda |
| B8 | Identidade do DRE com **devolução** no mês | invariante em comentário |
| B9 | Escada do DRE, degrau a degrau | invariante em comentário |
| B10 | "Ao centavo, nunca ao real" (D1/D5) como varredura, não caso a caso | invariante em comentário |
| B11 | Imposto cai quando há devolução | invariante em comentário |
| B12 | Acumulado do fluxo diário = saldo do resumo (dois números na mesma tela) | mesmo número em 2 telas |
| B13 | `commissions` não tinha a varredura "todo fato nasce dizendo de onde veio" que `payments` ganhou | dupla contagem / perda |

---

## 2 · O que foi escrito

**44 testes**, em 2 arquivos novos. Nenhum arquivo existente foi tocado.

| Arquivo | Testes | Cobre |
|---|---|---|
| `web/src/lib/__tests__/regressao-integracao.test.ts` | 38 | B1–B12 |
| `functions/src/__tests__/regressao-origem-do-fato.test.ts` | 6 | B13 |

Organizados em quatro blocos, na ordem do pedido:

1. **cross-screen** — o mesmo número em duas telas
2. **dupla contagem** — o que uma leitura futura poderia somar duas vezes
3. **borda** — barbearia nova · mês vazio · valor zerado · documento histórico
4. **invariantes** — o que estava escrito em prosa e não em teste

### Preferência por invariante, não por valor fixo

Onde a cobertura existente afirma `expect(dre.cmv).toBe(116)`, esta bateria
afirma `receita − custo = resultado`, `variableCost = cmv + taxas + comissões`,
`Σ(origens) = saldo`, `Σ(filhos) = cabeçalho`. Os valores fixos continuam
valendo — eles vêm do ledger humano e provam coisa diferente. As invariantes
sobrevivem a uma mudança de preço na massa; os literais, não.

Duas varreduras genéricas foram acrescentadas porque pegam **a próxima**
ocorrência de defeitos que já apareceram duas vezes cada:

- **`NaN`/`Infinity` em qualquer campo** de receita, DRE, indicadores e fluxo.
- **fração de centavo em qualquer campo monetário** do DRE — o D1/D5 já foi
  corrigido pontualmente na taxa e no imposto; a varredura pega o campo novo
  que alguém acrescentar com `Math.round` ao real.

Ambas têm guarda contra varredura vazia (`expect(campos.length)
.toBeGreaterThanOrEqual(n)`), no mesmo padrão de *"encontra os arquivos que
gravam pagamento"* — sem isso passariam sobre conjunto vazio no dia em que o
objeto mudasse de forma.

---

## 3 · DEFEITOS DE PRODUTO encontrados

Dois. Nenhum foi corrigido — a regra do stop-the-line é reportar, e a bateria
registra os dois números em vez de falhar, seguindo a convenção que
`reconciliacao.test.ts` já usa para as divergências do ledger.

**Os testes correspondentes falham no dia em que o defeito for corrigido.** É
proposital: é o sinal de que esta seção precisa ser fechada.

---

### DEFEITO 1 · duas telas discordam sobre quanto entrou em dinheiro

**Onde:** `analytics.ts` › `caixaDiario` × `fluxo-de-caixa.ts` › `resumoDoFluxo`
**Gravidade:** média — não erra o total, erra a conferência da gaveta
**Teste:** `regressao-integracao.test.ts` › *"DEFEITO 1 · a DISTRIBUIÇÃO por instrumento NÃO concorda"*

Um `PaymentDoc` com `paymentMethod: null` é classificado de dois jeitos:

```
                    payment { paymentMethod: null, netAmount: 100 }

caixaDiario      →  dinheiro: 100     outros: —        (tela do Financeiro)
resumoDoFluxo    →  dinheiro:   0     outros: 100      (tela de Fluxo de Caixa)
```

| | esperado | obtido |
|---|---|---|
| `caixaDiario().dinheiro` | **0** | `100` |
| `resumoDoFluxo().porMetodo.dinheiro` | 0 | `0` ✅ |
| `resumoDoFluxo().porMetodo.outros` | 100 | `100` ✅ |

**A causa.** `caixaDiario` classifica por eliminação:

```ts
if (p.paymentMethod === "pix") d.pix += valor;
else if (p.paymentMethod === "debit" || p.paymentMethod === "credit") d.cartao += valor;
else d.dinheiro += valor;          // ← null cai aqui
```

`resumoDoFluxo` exige `cash` explícito e manda o resto para `outros`.

**Por que o esperado é `outros`.** Este não é um estado teórico: o servidor
grava `paymentMethod: null` **de propósito** quando o atendimento é concluído
sem informar como o cliente pagou — está testado em
`financial-events.test.ts` › *"materializa o bruto e marca o método como
desconhecido"*, e `domain.ts` documenta o campo como *"Nulo quando o
atendimento foi concluído sem informar como o cliente pagou"*.

Ou seja: o produto **sabe** que não sabe, e uma das duas telas afirma que era
dinheiro. É a régua do projeto na primeira metade — afirmar algo que não
aconteceu — e cai exatamente na coluna que o dono usa para conferir a gaveta no
fim do dia.

**É o D4 outra vez.** Mesma forma — *"o erro está na distribuição, não na
soma"* —, que a Rodada 3.2 corrigiu para a venda de produto e que sobrevive
aqui pela via do método desconhecido. O total fecha nos dois lados, e é isso
que esconde o defeito.

**Nota de ownership:** `caixaDiario` é de FIN-01 e estava sendo reescrito
durante este levantamento. A decisão sobre qual das duas classificações vale é
de FIN-01 — QA-01 só registra que hoje elas discordam.

---

### DEFEITO 2 · comissão histórica sem `origin` é ignorada, e o valor é rederivado do cadastro de hoje

**Onde:** `analytics.ts` › `comissoesDeServico`
**Gravidade:** **alta** — é o P1-7 vivo para todo o histórico anterior à Rodada 3.1
**Teste:** `regressao-integracao.test.ts` › *"DEFEITO 2 · comissão congelada SEM `origin` é IGNORADA e o valor é rederivado"*

`domain.ts` documenta, no próprio tipo `CommissionDoc`:

> *"De que fato veio. **Ausente nas comissões anteriores à Rodada 3.1** — todas
> de serviço, que era a única materializada."*

`comissoesDeServico` monta o mapa de comissões congeladas assim:

```ts
const congelada = new Map(
  (params.commissions ?? [])
    .filter((c) => c.origin === "servico" && dentroDoPeriodo(c.date, periodo))
    .map((c) => [c.bookingId, c])
);
```

O documento histórico não tem `origin`, é descartado do mapa, `doDia` fica
`undefined`, e a comissão volta a ser derivada de `staff.commissionPct` — **o
cadastro de HOJE**.

#### Evidência

Mesmo documento, mesmo atendimento (R$ 100), comissão congelada de 30% no dia.
O cadastro do barbeiro hoje diz 60%.

| cenário | esperado | obtido |
|---|---|---|
| `CommissionDoc` **com** `origin: "servico"` | 30,00 | **30,00** ✅ |
| `CommissionDoc` **sem** `origin` (histórico) | 30,00 | **60,00** ❌ |

E o efeito de ponta, no mesmo teste — mês fechado, mesmo fato, só o cadastro
muda:

```
staff.commissionPct = 30   →  dre.commissionsServico = 30
staff.commissionPct = 60   →  dre.commissionsServico = 60
```

**Por que o esperado é 30.** É o valor congelado no fato. A rodada inteira
existe para que mudar um percentual não reescreva mês fechado — é a definição
do P1-7, e o documento correto está lá, sendo ignorado por um campo ausente.

**A assimetria que confirma o diagnóstico.** `fontes-financeiras.ts` trata
exatamente o mesmo buraco na coleção vizinha:

```ts
const declarada = p.origin ?? (p.bookingId ? "servico" : undefined);
```

com o comentário: *"Pagamentos anteriores ao D29 não gravavam o campo, e todos
eles são de serviço. (…) Exigir `origin` os descartaria."* A camada de
**pagamentos** tolera o documento histórico; a de **comissões** não — e o
`MAPA-DE-FONTES` lista a comissão de serviço como 🟢 *"já correto — é o padrão
a copiar"*.

**O outro lado, coberto no mesmo bloco.** Uma comissão de **produto** sem
`origin` não entra em nenhuma das duas somas (`comissoesDeServico` filtra
`"servico"`, `comissaoDeProduto` filtra `"produto"`): o custo aconteceu e o DRE
não o reconhece — a segunda metade da régua. Hoje o servidor sempre grava o
campo nessa origem, então isso não afeta dado real; o teste é a rede para o dia
em que um caminho novo esquecer.

---

## 4 · O que ficou descoberto, e por quê

| # | Não coberto | Motivo |
|---|---|---|
| D1 | **E2E com emulador** (`test:rules`, `test:isolamento`, `test:concorrencia`, as sete suítes `*-transacao`) | Ficam fora de `npm test` de propósito — exigem `firebase emulators:exec`. Não foram executadas neste levantamento; a bateria nova é toda de função pura. |
| D2 | **Telas / componentes React** | Não há infra de teste de componente no repositório (`environment: "node"`, sem `@testing-library`). Montar essa infra é decisão de arquitetura, não de QA — e colidiria com UX-04, que está reescrevendo `components/ui/**` agora. |
| D3 | **Divergência `receita.atendimentos` × `caixaDiario.appointments`** | Elas divergem quando há atendimento no fallback histórico (booking concluído sem `PaymentDoc`): um conta reservas, o outro pagamentos. Não fixei a divergência porque `caixaDiario` está sendo reescrito por FIN-01 **agora** e o contrato de `appointments` pode mudar. **Fica para FIN-01 decidir e para a 3.3 fixar.** |
| D4 | **`despesasRecorrentesVigentes` colapsa despesas distintas** que compartilhem `categoria\|descrição` (duas unidades com "Aluguel/Aluguel da loja" viram uma) | O comportamento é deliberado e documentado — a dedupe existe para o dono que relança a mesma conta. Fixar o caso oposto exigiria decidir se é defeito, e isso é decisão de produto. **Registrado como pergunta aberta.** |
| D5 | **Fechamento de período** | `DECISOES-DE-MODELO.md` lista como não decidido ("o que marca um período como fechado, e quem fecha"). Não há contrato para testar. |
| D6 | **`expenses` como fato confiável** | D24 — dívida consciente, sem escrita de servidor, sem congelamento, sem idempotência. A bateria consome despesa mas **nenhum teste novo assume que ela é imutável**, conforme a restrição explícita da 3.2. |
| D7 | **Ajuste de estoque com `quantity` negativo** somando ao CMV em vez de subtrair | Não há caminho de escrita que produza isso hoje. Testá-lo seria fixar um comportamento que ninguém decidiu. |

---

## 5 · ⛔ STOP-THE-LINE — a árvore de trabalho está vermelha por outras equipes

Levantado pela regra 16 do `PROTOCOLO-MULTI-AGENTE.md`. **Não é achado de
QA-01 e não foi corrigido** — os arquivos são de outras equipes.

### A baseline se moveu durante o levantamento

`web/src/lib/__tests__/analytics.test.ts` foi reescrito às 23:28:45, no meio
desta sessão. Três execuções da mesma suíte, minutos de intervalo:

```
23:28   Tests  12 failed | 439 passed (451)     reconciliacao · seis-visoes · analytics
23:31   Tests   8 failed | 445 passed (453)     reconciliacao · seis-visoes
23:41   Tests   5 failed | 514 passed (519)     contraste-de-tokens
```

FIN-01 estava trocando a assinatura de `caixaDiario`
(`{bookings, movements, periodo}` → `{payments, periodo}`) com os testes
consumidores ainda desatualizados. **Isso já se resolveu** — as falhas de
`reconciliacao` e `seis-visoes` desapareceram.

### O que continua vermelho agora

`web/src/lib/__tests__/contraste-de-tokens.test.ts` — arquivo **novo**, de
UX-04, com 5 falhas de contraste WCAG AA contra os tokens de
`globals.css`:

```
etiqueta dourada    4.42  <  4.5     (texto sobre a própria tinta)
etiqueta positiva   4.24  <  4.5
etiqueta negativa   4.15  <  4.5
contorno de controle 2.77 <  3
anel de foco          —   <  3
```

São o teste de UX-04 contra os tokens de UX-04. **QA-01 não toca** —
`components/ui/**` e `globals.css` são ownership exclusivo de UX-04 pela
divisão da rodada, e a regra é explícita: se um teste existente estiver errado,
parar e reportar, não corrigir.

### Consequência para o critério de conclusão

O critério pedia `npx vitest run` verde. **Ele não está verde, e não está no
alcance de QA-01 deixá-lo verde** sem editar arquivo de outra equipe. O estado
real:

| suíte | resultado |
|---|---|
| `functions` › `npm test` | ✅ **390 passed (22 arquivos)** — inclui os 6 novos |
| `web` › `npx vitest run` | ⚠️ **514 passed · 5 failed** — as 5 são de UX-04 |
| **só os arquivos de QA-01** | ✅ **44/44** |

`git status` confirma: **nenhum arquivo de produto foi modificado por QA-01.**
As únicas adições desta equipe são os dois arquivos de teste e este documento.

---

## 6 · Recomendações ao orquestrador

1. **DEFEITO 2 primeiro.** É o de maior gravidade e o mais barato de corrigir:
   copiar em `comissoesDeServico` a mesma tolerância que
   `indexarPagamentos` já usa —
   `c.origin ?? (c.bookingId ? "servico" : undefined)`. Uma linha, e fecha o
   P1-7 no histórico. Owner: FIN-01.
2. **DEFEITO 1 é decisão, não conserto.** Alguém precisa dizer qual das duas
   classificações vale para método desconhecido. A recomendação de QA-01 é
   `outros` nas duas, pela régua. Owner: FIN-01.
3. **UX-04 precisa fechar o contraste** antes da integração, ou marcar as 5
   falhas como dívida explícita. Do jeito que está, a próxima equipe herda uma
   suíte vermelha e para de ler o sinal.
4. **Rodar as suítes de emulador** (`npm run test:tudo` em `functions`) antes
   do merge da rodada — nada nesta bateria as cobre.
