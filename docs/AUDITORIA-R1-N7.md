# Auditoria de implementação — R1 e N7.1

> 18/08/2026 · `hardening/p0-2026-08-17` em `a910570`
> **Somente leitura.** Dois auditores `scout` (sem Write, Edit ou Bash) +
> verificação independente do orquestrador nos achados que mudam decisão.
> Nenhum código foi tocado.

Marcação: **[Ó]** lido no código · **[J]** julgamento · **[NV]** não verificado.

---

# ⚠️ Correção de uma afirmação minha

No `DECISOES-ABERTAS.md` eu escrevi, sustentando a decisão R1.2:

> *"O único número que anda é `feeAmount`. Receita, CMV, comissão e imposto
> ficam parados."*

**A segunda frase está certa. A primeira está errada.** `netAmount` também é
gravado, e também anda:

```ts
web/src/lib/analytics.ts:350        const valor = Number(p.netAmount ?? p.grossAmount) || 0;
web/src/lib/fluxo-de-caixa.ts:138   valor: centavos(Number(p.netAmount ?? p.grossAmount) || 0),
```

Então a correção move **seis** leituras, não uma:

| Leitura | Muda? | Por quê |
|---|---|---|
| `taxasDePagamento` (DRE) | ✅ | soma `feeAmount` |
| `caixaDiario` | ✅ | usa `netAmount` **e** reclassifica a coluna |
| `movimentosDeCaixa` / Fluxo | ✅ | `valor: netAmount`, `metodo: paymentMethod` |
| Projeção de caixa | ✅ | recebe `caixaDiario` |
| `caixaDoDia` (Hoje) | ⚠️ parcial | usa `grossAmount` → **total não muda**; a coluna migra e `naoInformado` cai |
| DRE · `grossRevenue`, `tax`, `cmv`, comissão | ❌ | nenhum lê `payments` para valor |

**A decisão R1.2 sobrevive**, porque o que a sustentava era `date` não mudar — e
não muda, então nada atravessa mês. Mas a margem é menor do que eu afirmei: o
efeito é de seis leituras dentro do mês, não de um número isolado.

---

# 1 · R1 — o que a auditoria confirmou

## 1.1 O vazamento é real, e o caminho tem doze elos

Verificado elo a elo. Os quatro que decidem:

```
action-center.ts:117   filtro do card:  status==="completed" && !paymentMethod && !cobertoPeloPlano
page.tsx:316           executarIntencao → setAFechar(alvo)   ← SEM checagem de status
page.tsx:221-224       patchDoc(bookings, { status:"completed", paymentMethod: metodo })
financial-events.ts:284  decidirEfeito("completed","completed") → "nada"
```

O card some porque `!b.paymentMethod` vira falso. O `PaymentDoc` fica com taxa
zero. E `liquidacaoDoAtendimento` (`booking-status.ts:158`) passa a exibir "Pix"
lendo `bookings`, enquanto `payments/pagamento_{id}.paymentMethod` continua
`null`. **[Ó]**

Achado adicional: o botão "Concluir" da tabela **não** alcança reserva concluída
(`page.tsx:607`). O card do Action Center é o **único** caminho de UI que reabre
o modal sobre um `completed`.

## 1.2 🟢 Não existe trigger sobre `payments` — o risco que eu apontei não existe

Era o ponto que mandei olhar com mais atenção. Varredura completa de
`onDocumentUpdated|Written|Created|Deleted`: **três triggers, todos sobre
`bookings`.**

```
financial-events.ts:357   materializeFinancialsOnCompletion   bookings/{bookingId}
loyalty.ts:27             creditLoyaltyOnCompletion           bookings/{bookingId}
whatsapp/notify.ts:29     notifyBookingCreated                bookings/{bookingId}  (onCreate)
```

**Atualizar o `PaymentDoc` não acorda ninguém.** Não há dupla taxa, dupla
comissão nem duplo movimento de caixa a temer — e a razão de fundo é a que o
produto já tinha: nenhum agregado pré-computado, tudo recomputado de
`onSnapshot`. **[Ó]**

**A idempotência do R1 existe para o `audit_log`, não para o dinheiro.** É o
único ponto que duplica, e só se o id for automático (`.doc()` sem argumento).

## 1.3 🔴 O caminho de fuga do `delete`+`create` já existe, e tem botão

Você pediu teste provando que não dá para burlar o histórico. A auditoria achou
onde ele mora — e **não é numa função hipotética**:

```
completed → no_show    decidirEfeito → "reverter"
                       pagamentoRef.delete()          financial-events.ts:387
                       comissaoRef.delete()           financial-events.ts:386
                       cobertura: FieldValue.delete() financial-events.ts:393

no_show → completed    decidirEfeito → "materializar"
                       relê policies e staff AGORA    financial-events.ts:421-434
                       pagamentoRef.set({...})        financial-events.ts:513  ← sem merge
```

A segunda perna **tem botão**: "Veio depois" (`page.tsx:691`). A primeira não
tem botão, mas `firestore.rules:246` permite `update` direto em `bookings` para
qualquer staff — e como diz `booking.ts:952`, *"interface não é guarda"*.

Duas consequências:

1. **Uma correção do R1 pode ser apagada depois** por um `no_show` → `completed`,
   porque `set` sem `{ merge: true }` reescreve o documento inteiro.
2. **A comissão é recalculada do cadastro de hoje** na rematerialização
   (`financial-events.ts:441`) — é o P1-7 ressuscitando em todo o histórico.

Isso não é criado pelo R1. Já está lá. Mas o R1 passa a **depender** de
`decidirEfeito("completed","completed") === "nada"`, e essa dependência precisa
de teste nomeado.

## 1.4 A promessa de versionamento está em três lugares, não um

```
web/src/app/painel/(dashboard)/financeiro/page.tsx:308   texto na tela
web/src/lib/business-rules.ts:210                        comentário
web/src/lib/domain.ts:590                                docstring do tipo órfão
```

E o texto da tela **contradiz o próprio modal de conclusão**, que já diz a
verdade (`page.tsx:846-849`): *"A taxa da maquininha é registrada com o valor de
hoje e não muda depois."* **[Ó]**

## 1.5 Taxas: web e servidor **concordam**

`DEFAULT_PAYMENT_FEES` (`tenant.ts:153`) e `SEM_TAXA` (`financial-events.ts:55`)
são ambos zero nas quatro chaves, com merge raso idêntico. **Não é o D1** — ali
o que divergia era `commissionSplit.barberPct`. **[Ó]**

⚠️ Não confundir com `paymentGateways` (`business-rules.ts:213`): é **referência
de mercado**, não o que a barbearia paga, e nenhum cálculo a lê.

## 1.6 Onde o R1 mora

**Não existe função onde encaixe.** `refunds.ts` é o molde estrutural mais
próximo (callable, transação, idempotência por chave, dono-only), mas estorno
*soma* fato e correção *altera* — não é a mesma operação. **[J]**

Trava dura descoberta: `autorizacao-functions.test.ts:47-52` varre **todo**
`export const X = onCall` e exige uma guarda declarada. A callable nova quebra a
suíte se não tiver. Não é opcional. **[Ó]**

## 1.7 Os quatro campos, confirmados — e um quinto problema

```
paymentMethod   domain.ts:117   ✅ pode mudar
feePct          domain.ts:120   ✅ derivado de paymentMethod + tabela
feeAmount       domain.ts:121   ✅ derivado de grossAmount × feePct
netAmount       domain.ts:122   ✅ derivado de grossAmount − feeAmount
```

Os quatro são **conjunto indivisível**: esquecer `netAmount` deixa Fluxo e Caixa
Diário com o líquido antigo enquanto o DRE já mostra a taxa nova.

Achados de borda **[Ó]**:
- `subscriptionId` (`domain.ts:105`) é **campo morto** — declarado, nenhum writer
  o grava.
- `mensalistas.ts:599-606` **não grava `createdAt`** — pagamento de mensalidade
  nasce sem ele.
- `analytics.ts:350` e `fluxo-de-caixa.ts:138` fazem `netAmount ?? grossAmount`:
  se o R1 gravar `undefined`, as telas caem no bruto **sem erro visível**.

---

# 2 · N7.1 — o que a auditoria confirmou

## 2.1 A contradição é quíntupla

`totalPrice` (`agendar/page.tsx:169`) é impresso sem condicional de plano em
cinco lugares:

| # | linha | o quê |
|---|---|---|
| 1 | `509-514` | card "Total" do topo do passo 3 |
| 2 | `671-675` | **barra fixa do mobile** |
| 3 | `711-714` | resumo lateral, linha por serviço |
| 4 | `755-762` | total do resumo lateral |
| 5 | `748-753` | `Pagamento: No salão`, incondicional |

Os dois viewports mentem por caminhos diferentes. **Corrigir só o card deixa o
mobile mentindo** — e o mobile é onde o cliente agenda. **[Ó]**

O passo 4 **já está correto** (`page.tsx:649-653`), e o card do plano
(`page.tsx:559-573`) **já respeita a §27** hoje: não afirma preço, diz que a
barbearia confirma no atendimento.

## 2.2 🔴 O guard que eu citei como proteção **não protege**

Eu disse que `situacao-da-reserva.test.ts` impedia o web de recalcular cobertura.
**Impede a escrita, não a leitura.** Verifiquei executando a regex:

```
/cobertura\s*:/  →  PEGA    cobertura: { tipo: "plano" }
                    PASSA   b.cobertura?.tipo === "plano"
                    PASSA   bookings.filter(b => b.cobertura?.tipo === "plano").length
```

E o segundo guard lê **apenas** `booking-status.ts` — um módulo novo em
`agendar/` com outro nome passa limpo.

**A doutrina proíbe; o teste não.** Uma contagem local no navegador entraria hoje
sem quebrar nada. É defeito de teste, não decisão — vai na correção.

## 2.3 🔴 Plano com cota **não existe como caminho de produto**

Verifiquei eu mesmo, e a cadeia fecha:

```
1. Nenhuma tela escreve `plans`. Varredura: paths.ts (mapa), usePlans (leitura),
   mensalistas.ts:361 (leitura), testes, seed. Nenhuma escrita.
   domain.ts:37-39 já registrava: "só é lido... só chega por escrita direta".

2. O seed cria:
   { id:"ilimitado", unlimited:true }
   { id:"duplo", name:"2 cortes", price:99 }     ← SEM servicesIncluded

3. Na contratação o campo é copiado:
   servicesIncluded: Number(planoSnap.get("servicesIncluded")) || null   mensalistas.ts:398

4. Na cobertura:
   const cota = Number(assinatura.servicesIncluded) || 0;
   if (cota <= 0) return { tipo:"avulso", motivo:"plano_nao_cobre" }      mensalistas.ts:288-289
```

**O plano chamado "2 cortes" não cobre corte nenhum.** Quem o assinasse pagaria
R$ 99 e teria todos os cortes cobrados como avulso. **[Ó] — isto é defeito, não
pergunta.**

E `planos/page.tsx:109-123` descreve todo plano não-ilimitado como plano de
**desconto** — a ideia de cota não existe em tela nenhuma do cliente.

Consequência para a decisão: **a metade "Plano com cota → mostra posição" atende
zero usuários hoje**, e depende de um caminho de criação que não existe. A
metade "Ilimitado" é a que tem gente real. **[J]**

## 2.4 A afirmação do Ilimitado tem uma janela

`assinaturaAtivaDe` checa só `status === "ativo"` (`booking-status.ts:198`).
`decidirCobertura` checa `status` **e** `valeNaCompetencia`. Para uma assinatura
ativa não há divergência no instante do agendamento — mas o cancelamento grava
`status: "cancelado"` na hora (`mensalistas.ts:447`).

**Cenário:** mensalista agenda hoje para daqui a 20 dias e lê *"Este atendimento
está incluído no seu plano"*. O dono cancela o plano em 5 dias. No atendimento, o
corte sai **cobrado**. A frase era verdadeira quando escrita e falsa quando o
cliente chegou. **[Ó]**

## 2.5 Os desenhos possíveis para a posição — **nenhum escolhido**

| | Desenho | Custo | Risco |
|---|---|---|---|
| **A** | callable `posicaoNoPlano` | médio | se a contagem for **reescrita** em vez de extraída de `financial-events.ts:339`, cria o D1 dentro do servidor |
| **B** | contador denormalizado na assinatura | alto (+ backfill) | seria **o primeiro agregado pré-computado do produto** |
| **C** | sem posição — só os termos + "confirmado no atendimento" | ~zero | não entrega "1 de 4" |
| **D** | contar no navegador | ~zero | passa nos guards atuais e viola a doutrina — listado por completude |
| **E** | estender `availableSlots` | baixo | é porta **pública sem auth** (`availability.ts:42`); misturar dado do cliente ali é o oposto do que ela é |

---

# 3 · Defeitos encontrados que **não** são decisão

Vão para a correção, sem consultar ninguém:

| # | Defeito | Onde |
|---|---|---|
| **D-a** | Plano "2 cortes" do seed não cobre nada — `servicesIncluded` ausente | `scripts/semear-day-in-the-life.mjs:162` |
| **D-b** | Guard `/cobertura\s*:/` não pega leitura; segundo guard cobre só um arquivo | `situacao-da-reserva.test.ts:393,402` |
| **D-c** | Promessa de versionamento em 3 lugares, contradizendo o modal de conclusão | `financeiro/page.tsx:308` + 2 |
| **D-d** | `subscriptionId` é campo morto no `PaymentDoc` | `domain.ts:105` |
| **D-e** | `createdAt` não é gravado no pagamento de mensalidade | `mensalistas.ts:599-606` |
| **D-f** | `subscriptions` não tem teste positivo de leitura pelo cliente — todo o D2 do lado do cliente repousa numa regra que nenhum teste exercita | `firestore-rules.test.ts` |

---

# 4 · Decisões que apareceram — **quinze levantadas, cinco bloqueiam**

Os auditores levantaram 15 perguntas. Dez são deriváveis de decisões já tomadas
ou de precedentes do próprio código, e estão resolvidas abaixo com a
justificativa. **Cinco precisam de você.**

## 4.1 ⛔ As cinco que bloqueiam

| # | Pergunta | Por que não posso derivar |
|---|---|---|
| **A** | **Quem pode corrigir — só o dono, ou staff também?** | O produto tem os dois precedentes: `registrarEstorno` é dono-only (`refunds.ts:593`); venda e mensalidade aceitam staff (`mensalistas.ts:317`). Concluir atendimento é staff. Correção altera o DRE, mas é operada no balcão |
| **B** | **Qual é a fonte da verdade do meio de pagamento?** | Hoje o dado vive em **duas cópias**: `bookings.paymentMethod` (que a agenda, o Action Center e o app do cliente leem) e `payments.paymentMethod` (que o dinheiro usa). Se o R1 só corrigir o pagamento, o card nunca some. Se corrigir os dois, o "fato congelado" passa a ter duas cópias mutáveis |
| **C** | **O `PaymentDoc` ganha marca de correção (`corrigidoEm`/`corrigidoPor`)?** | Contradiz a trava dos quatro campos que você mesmo estabeleceu. Mas **o seu §26 item 3 exige que o dono enxergue o histórico**, e hoje nenhuma tela lê `audit_log`. Sem a marca, "foi corrigido" é invisível ao dono |
| **D** | **Escopo: só serviço, ou também produto e mensalidade?** | `PaymentDoc` de produto (`inventory.ts:476`) e de mensalidade (`mensalistas.ts:599`) têm exatamente o mesmo problema e nenhuma tela de correção |
| **E** | **Construir a variante "plano com cota" agora?** | §2.3: zero usuários, e o caminho de criação não existe. Fazer agora é código para ninguém; não fazer deixa a decisão pela metade |

## 4.2 ✅ As dez que resolvi, e por quê

| Pergunta | Resolução | Fundamento |
|---|---|---|
| Coberto pelo plano não tem `PaymentDoc` — recusa ou cria? | **Recusa**, com mensagem | R1.3 proíbe criar fato novo; N7.2 diz que cada fato tem ciclo próprio |
| Correção repetida idêntica | Devolve a anterior, marca `repetida` | precedente literal de `refunds.ts:362-373` |
| Método novo igual ao atual | Recusa | senão o log registra correção que não corrigiu |
| Id do `audit_log` | Derivado da correção, nunca `.doc()` automático | é o único ponto que duplica (§1.2) |
| `audit_log` dentro ou fora da transação | **Dentro** | `subscription.ts:156` usa `.add()` fora e **não é atômico**; provisioning/signup usam `tx.set` — a atomicidade que você exigiu escolhe o segundo |
| Reusar `competenciaDe` do módulo mensalista? | Sim | é `YYYY-MM-DD → YYYY-MM`, não carrega semântica de mensalista |
| Competência de qual data no `/agendar` | A da **data escolhida** | é o que `financial-events.ts:336` usa; qualquer outra cria duas contas |
| O que mostrar enquanto o retrato carrega | Estado próprio, quatro valores | precedente `estado-dos-horarios.ts`: `null` ≠ `[]`. Cair no preço cheio é o D2 de volta por meio segundo |
| Resumo lateral e barra fixa | Mesma regra §27 | a decisão vale para a tela, não para um card |
| Endurecer o guard de teste | Sim | é correção de defeito (D-b), não decisão de produto |

---

# 5 · Plano de implementação — R1 (sozinho)

## 5.1 Arquivos

| # | Arquivo | Papel | Novo? |
|---|---|---|---|
| 1 | `functions/src/correcao-de-pagamento.ts` | decisões puras + `gravarCorrecao` transacional + callable | **novo** |
| 2 | `functions/src/index.ts` | export | edita |
| 3 | `functions/src/__tests__/correcao-de-pagamento.test.ts` | testes puros | **novo** |
| 4 | `functions/src/__tests__/correcao-transacao.test.ts` | emulador: atomicidade, idempotência, congelados | **novo** |
| 5 | `functions/package.json` | script do emulador + `--exclude` | edita |
| 6 | `web/src/components/corrigir-pagamento.tsx` | modal, molde de `estornar-valor.tsx` | **novo** |
| 7 | `web/src/app/painel/(dashboard)/page.tsx` | novo caminho + parar de reabrir o modal de conclusão sobre `completed` | edita |
| 8 | `web/src/lib/action-center.ts` | novo `intent` | edita |
| 9 | `financeiro/page.tsx:308` + `business-rules.ts:210` + `domain.ts:590` | remover a promessa de versionamento | edita |

Reusa **sem alterar**: `valoresDoPagamento` (`payments.ts:69`), `taxaDoMetodo`,
`SEM_TAXA`, `idDoPagamento`, `hojeNoFuso`, `competenciaDe`, `metodoValido`.
Nenhuma leitura do web muda — é o argumento inteiro da decisão R1.3, e ele se
confirma.

## 5.2 Testes obrigatórios

| # | Teste |
|---|---|
| **T1** | **Atomicidade** — falhar o log dentro da transação e provar que o pagamento não mudou, e vice-versa |
| **T2** | **`delete`+`create`** — mirando onde o caminho realmente está: `completed → no_show → completed` (§1.3), não numa função hipotética |
| **T3** | **Congelados** — `date`, `grossAmount`, `createdAt`, `origin`, `bookingId`, `clientId`, `paymentOrigin` idênticos; só os quatro mudaram; método é `update` e nunca `set` |
| **T4** | **Idempotência** — duas chamadas, um pagamento e **exatamente um** `audit_log` |
| **T5** | **Janela do mês** — inclusive a virada no fuso da barbearia: 31/07 23:50 em São Paulo não pode virar agosto por o processo rodar em UTC |
| **T6** | `decidirEfeito("completed","completed") === "nada"` como invariante nomeado do R1 |
| **T7** | Recusa quando não há `PaymentDoc` (coberto pelo plano) |
| **T8** | Recusa quando o método novo é igual ao atual |
| **T9** | Os quatro campos batem com `valoresDoPagamento` — prova de que a fórmula não foi reimplementada |
| **T10** | `financeiro/page.tsx` não contém "versionadas" |

## 5.3 Riscos de integração

| Risco | Gravidade |
|---|---|
| Rematerialização apaga a correção (`set` sem merge) | 🔴 |
| Escrever em `bookings` dispara dois triggers — hoje inócuo, mas é acoplamento invisível | 🟡 |
| Card "taxas não configuradas" **acende sozinho** ao corrigir Pix→Crédito com taxas zeradas | 🟡 |
| `caixaDoDia` muda de coluna sem mudar o total — o dono vê "Sem forma informada" cair e "Cartão" subir | 🟡 |
| `netAmount: undefined` faz as telas caírem no bruto **sem erro** | 🟡 |
| Correção sobre pagamento já estornado — `RefundDoc` congelou o método antigo | 🟠 decisão |

---

# 6 · Plano de implementação — N7.1 (depois, separado)

## 6.1 A fatia que não depende de nada

**Ilimitado.** `assinaturaAtivaDe` já entrega `unlimited` sem round-trip
(`domain.ts:458`). A frase *"Este atendimento está incluído no seu plano"* pode
ser entregue **sem servidor, sem callable e sem contador** — e é a fatia com
usuário real. **[J]**

## 6.2 Os cinco pontos que precisam mudar juntos

`agendar/page.tsx` linhas `509-514`, `671-675`, `711-714`, `748-753`, `755-762`.
Corrigir menos que os cinco deixa a tela mentindo em um dos viewports.

## 6.3 Guards de fonte propostos

O padrão da casa (`environment: "node"`, sem testing-library, `.test.tsx` nem
seria coletado). Sobre a fonte de `agendar/page.tsx`:

| # | Guard | Por quê |
|---|---|---|
| G1 | importa o módulo de apresentação | precedente `estado-dos-horarios.test.ts:79` |
| G2 | **`not.toContain("formatBRL(totalPrice)")`** | o guard central — elimina o preço solto de raiz |
| G3 | `not.toMatch(/R\$\s*0,00/)` | a saída recusada pela §27 |
| G4 | `not.toMatch(/você não paga/i)` | a segunda saída recusada |
| G5 | um `toContain` por ramo do union | impede ramo que existe e nunca chega à tela — o caso `plural.ts` |
| G6 | `not.toContain("useMyBookings")` + endurecer `/cobertura\s*:/` → `/cobertura/` | fecha o buraco do §2.2 |
| G7 | prova que a posição **vem** do servidor | não basta "não calculada aqui" |
| G8 | contar ocorrências ≥ 3 | a contradição é tripla; sem contagem, corrigir só o card passa no teste **[J]** o mais frágil |

## 6.4 O que só a tela verifica — §19

- Resumo lateral **sem o número grande** parece dado faltando?
- Barra fixa do mobile com uma coluna a menos parece quebrada?
- *"Sua posição no plano: 1 de 4 utilizados"* cabe em 360px?
- Passo 3 e passo 4 contam a mesma história?
- A política de cancelamento (`page.tsx:601-611`) logo abaixo de um bloco que diz
  que não há valor — é o N7.2, **visível no mesmo scroll**.
- O estado "carregando o retrato" pisca?

---

# 7 · O que NÃO foi verificado

- **Nada foi executado.** Nenhum teste rodou, nenhum typecheck, nenhum emulador.
  Auditoria estática.
- **`subscriptions` não tem teste positivo de leitura pelo cliente** — a regra
  permite (`firestore.rules:321`), nenhum teste exercita. Todo o D2 do lado do
  cliente repousa nisso. **[NV]**
- **Estado dos dados em produção** — quantos `PaymentDoc` estão com
  `paymentMethod: null`, quantos `bookings` divergem do pagamento. Se há migração
  a fazer: **[NV]**.
- **Se o Firestore emite `onDocumentUpdated` quando a escrita não altera campo.**
  Afeta o invariante T6. **[NV]**
- **`docs/MAPA-DE-FONTES.md`** não foi lido; pode completar a lista de leitores.
- **Aparência** — §19 inteira permanece aberta.

---

# 8 · A natureza real do R1 — descoberto ao preparar A–D

Fui atrás de "quem cria um atendimento concluído sem forma de pagamento",
para saber se produto e mensalidade tinham o mesmo problema (decisão D). A
resposta mudou o entendimento do R1 inteiro.

## 8.1 Existe **um** escritor de `status: "completed"` no produto

```
web/src/app/painel/(dashboard)/page.tsx:222   patchDoc(bookings, { status:"completed", paymentMethod: metodo })
```

E a função é `concluirCom(metodo: PaymentMethod | null)` — aceita `null`. Quem
passa `null`:

```
page.tsx:803-806   <button onClick={() => void concluirCom(null)}>   ← "Coberto pelo plano"
```

Esse botão **só existe quando `assinaturaDoFechamento` existe**, isto é, quando o
cliente tem plano ativo. Todos os outros caminhos passam um método
(`page.tsx:828-839`). **[Ó]**

## 8.2 Logo: `completed` + `paymentMethod: null` nasce de **um** lugar

O dono concluir um mensalista como coberto pelo plano. Depois disso, o servidor
decide, e há dois desfechos:

```
cobertura = "plano"   → PaymentDoc é DELETADO   financial-events.ts:512
                        card não aparece (action-center.ts:117 filtra !cobertoPeloPlano)

cobertura = "avulso"  → PaymentDoc é CRIADO com paymentMethod null, taxa zero
   (cota esgotada,     card crítico "Registrar pagamento" APARECE — e está certo:
    plano inativo,     o cliente saiu sem pagar e sem cobertura
    plano_nao_cobre)
```

**O card crítico não é sobre esquecimento. É sobre o dono ter dito que o plano
cobria, e o plano não ter coberto.** [J] — e é exatamente o cenário que a §2.3
torna comum: o plano "2 cortes" **nunca** cobre, então todo mensalista desse
plano cai aqui.

## 8.3 O R1 tem **dois** casos, e só um tem porta

| | Caso | Card aparece? | Caminho hoje |
|---|---|---|---|
| **1** | **Vazio** — mensalista concluído como coberto, plano não cobriu | ✅ sim (`!b.paymentMethod`) | existe, e **vaza** |
| **2** | **Errado** — dono escolheu Pix e o cliente pagou em dinheiro | ❌ não — o filtro é `!b.paymentMethod`, e ele está preenchido | **nenhum** |

O caso 2 é invisível ao produto: nenhuma tela o detecta, nenhum alerta o
levanta, e não há caminho de correção. O R1 precisa cobrir os dois.

## 8.4 O que isso faz com as decisões

**D · Escopo — respondido por fato, não por preferência.**

```
functions/src/inventory.ts:586     if (!metodoValido(paymentMethod)) throw "Informe como o cliente pagou."
functions/src/mensalistas.ts:543   if (!metodoValido(paymentMethod)) throw "Informe como o cliente pagou."
```

Venda de produto e pagamento de mensalidade **exigem** o método na origem. Não
existe pagamento sem forma nessas duas. **O caso 1 é exclusivo do serviço.**

O caso 2 (método errado) pode acontecer nas três — mas ali é digitação, não
lacuna estrutural. **[J]** Recomendação: escopo **serviço**, com produto e
mensalidade registrados como frente futura de menor prioridade.

**B · Não é preferência: os dois documentos precisam mudar.**

No caso 1 o `PaymentDoc` já existe com `paymentMethod: null`. Corrigir só
`bookings` é literalmente o vazamento de hoje. Corrigir só `payments` deixa o
card crítico na tela para sempre. **Fechar o ciclo exige os dois.**

A pergunta que sobra não é "qual dos dois", e sim **"quem manda quando
divergirem"** — e aí a divisão é limpa: `payments` é o fato econômico (seis
leituras de dinheiro), `bookings.paymentMethod` é o estado do atendimento (seis
leituras de exibição, nenhuma calcula valor).

Leitores de `bookings.paymentMethod`, verificados **[Ó]**:

```
(cliente)/page.tsx:104        "Valor pago" × "A pagar no salão"
(cliente)/reservas:42,320,374  idem + rótulo
painel/page.tsx:955            passa adiante
action-center.ts:117           o filtro do card
booking-status.ts:158          liquidacaoDoAtendimento
```

Nenhum deles soma dinheiro.
