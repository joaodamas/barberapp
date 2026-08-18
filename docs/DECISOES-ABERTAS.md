# As cinco decisões — **fechadas**

> Abertas em 18/08/2026 · `hardening/p0-2026-08-17` em `867b070`
> **Fechadas por João em 18/08/2026.** As diretrizes estão em blocos
> `## ✅ DECIDIDO` dentro de cada seção, e consolidadas no fim do documento.

Nenhuma delas era técnica. Todas mudam **o que o produto afirma**, e por isso
nenhuma podia ser tomada por um agent.

O corpo analítico abaixo — o que foi medido, as opções e o custo de construir —
fica preservado como está: é o que justifica a diretriz, e é o que vai ser
consultado quando alguém perguntar *"por que foi assim?"*. As recomendações eram
recomendações; o que vale agora é o bloco `✅ DECIDIDO`.

**Depois da decisão eu medi mais quatro coisas**, porque três das cinco
diretrizes tocam mecanismos que precisavam ser verificados antes de virar
tarefa. Duas mudam o desenho da implementação e estão em
[Consequências medidas](#consequências-medidas-depois-da-decisão), no fim.

---

# GRUPO A · R1 — correção do meio de pagamento

## Contexto comum: o R1 não abre um caminho, ele fecha um vazamento

Antes de decidir qualquer coisa, o fato que a investigação mediu:

**O caminho de correção já existe e está em produção.** O card crítico
*"Registrar pagamento"* (`action-center.ts:117`) reabre o modal de conclusão
(`page.tsx:316`), que grava `bookings.paymentMethod` (`page.tsx:221`). A reserva
já está `completed`, então `decidirEfeito` devolve `"nada"`
(`financial-events.ts:284`) e **o gatilho não faz nada**.

Resultado hoje, sem nenhuma decisão tomada:

```
bookings/{id}.paymentMethod       "pix"   ✅  a agenda passa a mostrar Pix
payments/pagamento_{id}.method    null    ❌
payments/…feePct · feeAmount      0 · 0   ❌  DRE, Fluxo e Caixa leem daqui
```

E o filtro do card é `!b.paymentMethod` — então **o alerta desaparece**. O
produto declara o problema resolvido no instante em que ele deixa de ser
resolvível pela interface, depois de prometer por escrito que *"a taxa da
maquininha entra como zero e o lucro do mês fica maior do que é"*.

**Consequência para a decisão:** não decidir também é uma escolha, e é a pior
das disponíveis. O vazamento roda hoje.

---

## R1.1 · Qual taxa usar na correção

### O que foi medido, e muda a pergunta

`PaymentDoc` guarda **apenas o `feePct` do método antigo** — não a tabela. Para
calcular a taxa do método novo é preciso uma tabela de taxas.

E aqui está o achado que decide o custo: **não existe tabela histórica.**
`GatewayFeeDoc` com `validFrom` existe em `domain.ts:590`, e tem **zero
consumidores** — é um tipo órfão. As taxas reais vivem em
`policies.paymentFees`, um objeto único, sem histórico, sobrescrito a cada
edição.

⚠️ **Achado colateral, e é um defeito:** a tela do Financeiro afirma ao dono que
*"as taxas são versionadas por data de vigência e não afetam transações já
registradas"* (`financeiro/page.tsx:308`). A segunda metade é verdade — a taxa
congela no `PaymentDoc`. **A primeira descreve um mecanismo que não existe.**

### As opções, com o custo real

| | Desenho | Custo | Consequência |
|---|---|---|---|
| **A** | tabela de hoje | **zero** — já disponível | Corrigir em setembro um fato de agosto aplica a taxa de setembro. Contradiz `payments.ts:61` e o teste `financial-events.test.ts:233` |
| **B** | preservar a taxa da data original | **alto** — exige construir o versionamento que o tipo órfão sugere que foi planejado. **Não resolve o histórico já gravado**, que não tem a tabela | Correto, e é a promessa que a tela já faz |
| **C** | recusar quando a taxa mudou desde a conclusão | baixo — comparar `feePct` gravado com a tabela atual | Conservador. O dono não entende por que o produto se recusa |

### Recomendação: **A, com a correção do texto da tela**

A janela em que A erra é estreita: só quando o dono muda a taxa da maquininha
**e** corrige um pagamento anterior. B custa uma frente inteira para cobrir esse
caso e **ainda assim não conserta o passado**, onde o dado não existe.

Mas A só é honesta se a tela parar de prometer versionamento. **Se você preferir
B, ela é a única que honra o texto que já está lá** — e aí o versionamento entra
como frente própria, não como parte do R1.

## ✅ DECIDIDO — **A · taxa vigente no momento da correção**

> *"Não implementar versionamento agora. Usar a taxa vigente no momento da
> correção, deixando explícito que correções retroativas podem alterar apenas a
> taxa daquele pagamento. Não vale abrir uma frente inteira de versionamento de
> gateway agora."* — João, 18/08/2026

Duas obrigações que a diretriz cria, e que não são opcionais:

1. **A tela do Financeiro para de prometer versionamento.** `financeiro/page.tsx:308`
   diz *"taxas versionadas por data de vigência"* e o mecanismo não existe
   (`GatewayFeeDoc` com `validFrom` é tipo órfão, zero consumidores). Enquanto A
   valer, esse texto é uma afirmação falsa — cai junto com o R1, não depois.
2. **"Deixando explícito" é entregável, não intenção.** A confirmação da correção
   precisa dizer qual taxa está sendo aplicada e que ela é a de hoje. Sem isso, A
   vira B mal-feita: o dono acha que preservou o histórico.

O versionamento fica registrado como frente futura — não como dívida silenciosa.

---

## R1.2 · Até quando o dono pode corrigir

### O que foi medido

Não existe conceito de **mês fechado** no produto — já registrado em
`AUDITORIA-CICLO-DE-VIDA-FINANCEIRO.md`: *"nada distingue 'corrigir um lançamento
de ontem' de 'reescrever o resultado de um trimestre'."*

Dois fatos que reduzem o susto:

1. **A correção não move o fato de mês.** `PaymentDoc.date` não muda, e toda
   filtragem de período é por `date`. Um Pix de janeiro corrigido em dezembro
   continua em janeiro.
2. **O único número que se move é `feeAmount`** → `gatewayFees` → margem e
   resultado daquele mês. Receita, CMV, comissão e imposto **não mudam** — o
   imposto incide sobre bruto, e o bruto não muda.

Ou seja: o pior caso é o resultado de um mês antigo mudar pelo **delta de uma
taxa**, tipicamente alguns reais.

### As opções

| | Janela | Consequência |
|---|---|---|
| **A** | qualquer momento | Simples. Resultado de mês antigo pode mudar sem aviso |
| **B** | só o mês corrente | Alinha com o horizonte que o dono enxerga nas telas — todas são "do mês" |
| **C** | N dias | Número arbitrário que ninguém vai lembrar de justificar |

### Recomendação: **B — o mês corrente**

Não por rigor contábil, e sim porque **é a janela que o produto já usa em todo
lugar**: DRE, Fluxo, Despesas e Mensalistas são todos "do mês". Uma correção
fora dela é uma operação que nenhuma tela mostra.

E é reversível: começar restritivo e afrouxar é fácil; o contrário exige explicar
ao dono por que ele perdeu uma capacidade.

## ✅ DECIDIDO — **B · até o fechamento do mês**

> *"Permitir correção até o fechamento do mês. Depois do fechamento, o pagamento
> fica congelado. Se houver necessidade excepcional, vira um ajuste
> administrativo futuro. Isso preserva o princípio que já construímos: mês
> fechado não muda silenciosamente."* — João, 18/08/2026

**⚠️ Verificado depois da decisão: fechamento de mês não existe no produto.**

Varri `web/src` e `functions/src` procurando o evento — `mesFechado`, `closedAt`,
trava temporal, qualquer coisa. Não há nada. `competencia` existe, mas é a régua
de faturamento do mensalista (`mensalistas.ts:102`), não um fechamento da
barbearia. Nenhuma tela fecha mês, nenhum documento registra que um mês foi
fechado, nada congela.

Então a diretriz se implementa hoje na sua forma disponível:

> **corrigível enquanto `payments.date` pertencer ao mês corrente.**

É a mesma janela que você descreveu, com a única diferença de que a fronteira é
a virada do calendário em vez de um ato do dono. O princípio — *mês fechado não
muda silenciosamente* — fica preservado, porque nada fora do mês corrente muda.

**O fechamento explícito vira frente própria**, e é onde o "ajuste administrativo
futuro" ganha lugar. Registrado aqui para não virar dívida invisível: enquanto
ele não existir, não há como um mês ser reaberto — nem por engano, nem de
propósito.

---

## R1.3 · Corrigir é alterar o fato ou somar um novo?

**A decisão mais importante das cinco**, e a única em que a doutrina do
repositório e a régua do dono apontam para lados opostos.

### A tensão, literal

`refunds.ts:30-39` declara a regra da casa:

> *"Corrigir histórico é somar fatos, nunca apagar."*

E a régua que você definiu para o R1 exige:

> *"Pix → dinheiro: pagamento corrigido, **NÃO duplicado**."*

As duas só se reconciliam se o "fato novo" for um **ajuste que todo leitor sabe
somar**. E aí está o custo.

### O custo real de cada desenho

| | Desenho | Leitores a mudar | Rastreabilidade |
|---|---|---|---|
| **A** | `update` no mesmo `pagamento_{bookingId}` | **zero** | Só via `audit_log` |
| **B** | fato de ajuste novo, com id próprio | **seis**: `taxasDePagamento`, `caixaDoDia`, `caixaDiario`, `movimentosDeCaixa`, `receitaDeServico`, `receitaDeProduto` | No próprio dado |

A assimetria é grande e vale explicar de onde vem: **não existe nenhum agregado
pré-computado no produto.** Nenhum snapshot mensal, nenhum contador, nenhum
documento de fechamento — verificado. Todo número é recalculado do zero a cada
render. Por isso `update` propaga sozinho para 100% das telas, e um fato de
ajuste obriga seis leituras a aprender a netar.

E há um risco específico do desenho B que o estorno não tem: o estorno é um
**evento econômico real** (dinheiro voltou), então somá-lo é natural. Uma
correção de rótulo não é evento econômico — o dinheiro entrou uma vez só. Um
"pagamento de ajuste de −R$ 1,75 de taxa" é um fato que nunca aconteceu no
mundo.

### Recomendação: **A, com `audit_log` obrigatório**

Com três travas que tornam a exceção segura:

1. **`update`, nunca `set` sem merge nem `delete`+`create`** — o `delete` faria
   `comissoesDeServico` cair no cadastro de hoje e ressuscitar o P1-7 em todo o
   histórico.
2. **Só quatro campos podem ser tocados**: `paymentMethod`, `feePct`,
   `feeAmount`, `netAmount`. `grossAmount`, `date`, `createdAt` e a identidade
   sobrevivem por não serem escritos.
3. **`audit_log` com de/para, quem e quando.** Hoje **a conclusão de um
   atendimento não escreve `audit_log` nenhum** — o evento que materializa
   dinheiro não deixa rastro. O R1 é o lugar certo para isso começar.

Se você preferir B por princípio, é defensável — mas então ela precisa ser uma
frente própria, com as seis leituras no escopo, e não um item dentro do R1.

## ✅ DECIDIDO — **A · `update` do `PaymentDoc` + `audit_log` obrigatório**

> *"Não aconteceu um novo pagamento; aconteceu uma correção da informação do
> pagamento. Criar um novo fato econômico complicaria caixa, DRE e reconciliação
> desnecessariamente. Mas deve existir `audit_log` da alteração."* — João, 18/08/2026

Campos exigidos no registro:

| Campo | Origem |
|---|---|
| pagamento | id do `PaymentDoc` |
| valor anterior | `grossAmount` — não muda, e é o que ancora a leitura |
| meio anterior | `paymentMethod` antes |
| novo meio | `paymentMethod` depois |
| taxa anterior | `feePct` + `feeAmount` antes |
| nova taxa | `feePct` + `feeAmount` depois |
| usuário | quem corrigiu |
| data/hora | quando |

**⚠️ Verificado depois da decisão: `audit_log` é imutável por Security Rule.**

```
firestore.rules:341   match /audit_log/{entryId} {
                        // Log de auditoria é imutável, inclusive para o dono.
                        allow read:  if isOwnerOf(barbershopId) || isPlatformAdmin();
                        allow write: if false;
```

`allow write: if false` vale para **todo cliente autenticado**, dono incluído. Os
três escritores existentes (`provisioning.ts:193`, `signup.ts:214`,
`subscription.ts:156`) são todos Admin SDK, que passa por cima das rules.

**Consequência direta:** a correção **não pode ser um `updateDoc` da tela.** Ou o
`audit_log` não acontece, ou a regra é afrouxada — e afrouxar a imutabilidade do
log de auditoria para poder escrever nele é destruir a propriedade que o torna
útil.

Então o R1 é uma **Cloud Function callable**, não uma edição de tela. Isso está
na direção que a base já segue — todo fato financeiro nasce no servidor
(`createBooking`, `materializeFinancialsOnCompletion`, `refunds`) — e é o que
torna as três travas verificáveis do lado de quem grava, em vez de confiadas ao
cliente.

O formato do documento segue o que já existe:

```ts
{ action: "payment.meio_corrigido", by: uid, at: serverTimestamp(), detail: {…} }
```

`action` no padrão `dominio.verbo_no_particípio`, como `barbershop.plano_definido`.

---

# GRUPO B · Mensalista no `/agendar`

## A contradição, medida na tela

Com um cliente que **é** mensalista Ilimitado, o passo 3 mostra, ao mesmo tempo:

```
Você é mensalista · Ilimitado
"O que estiver incluído NÃO É COBRADO DE NOVO no salão"

  card do serviço      Total            R$ 50,00
  resumo               Corte            R$ 50,00
  resumo               30 min           R$ 50,00
  resumo               Pagamento        No salão
  política             "entre 24h e 6h: retemos 25% de taxa"
```

O card está certo. As quatro linhas ao redor dele dizem o contrário, a 40px de
distância.

---

## N7.1 · Como apresentar o preço para quem tem plano

### ⚠️ A armadilha que precisa entrar na decisão

**A tela não sabe se ESTE atendimento está coberto.** Quem decide é o
fechamento, no servidor, com a cota do mês (`decidirCobertura`). Para o plano
**Ilimitado** a resposta é sempre sim; para um plano com cota
(`servicesIncluded`), o 5º corte de um plano de 4 **é cobrado**.

Mostrar `Total R$ 0,00` a quem está na cota 5 seria a tela afirmando cobertura
que não existe — a mesma classe de defeito do D1, onde o web dizia 40% e o fato
nascia 0. Qualquer opção escolhida precisa ser **condicional ao tipo de plano**,
ou redigida como expectativa e não como fato.

### As opções

| | Apresentação | Avaliação |
|---|---|---|
| **A** | `Valor: R$ 0,00 · Pagamento: coberto pelo plano` | Esconde o valor econômico do benefício. O cliente esquece o que o plano vale |
| **B** | `Valor original R$ 50,00 · Coberto pelo plano −R$ 50,00 · Total R$ 0,00` | Mostra o benefício sem dizer que o corte custa zero |

### Recomendação: **B — e ela é consistente com o produto**

A sua preferência coincide com um **padrão que o produto já provou**: é
exatamente a forma da árvore do DRE, onde a devolução aparece como linha
assinada em vez de sumir do total (`Pomada 3 un. R$ 54,00 / Devolução −R$ 18,00
/ CMV R$ 36,00`). Usar a mesma gramática no lado do cliente é reforçar
identidade, não inventar uma.

Com duas condições, pela armadilha acima:

- **plano ilimitado** → pode afirmar a dedução;
- **plano com cota** → mostrar a posição (*"3 de 4 usados este mês"*) e não
  afirmar o total antes do fechamento.

E o resumo lateral precisa acompanhar: `Pagamento: No salão` vira algo como
`Coberto pelo plano`.

## ✅ DECIDIDO — **B · preço condicionado à cobertura real**

> *"Quando o atendimento estiver coberto pelo plano, mostrar R$ 0,00; quando não
> estiver coberto, mostrar o valor normal. Mas a UI não pode simplesmente assumir
> que todo atendimento de mensalista é grátis. A regra deve vir do mesmo cálculo
> que determina `cobertoPeloPlano`. Assim a tela não inventa a regra."*
> — João, 18/08/2026

```
Coberto:        Corte R$ 50,00 · Coberto pelo plano −R$ 50,00 · Total R$ 0,00
Fora da cota:   Corte R$ 50,00 · Total R$ 50,00
```

**⚠️ Verificado depois da decisão: no momento do agendamento a cobertura ainda
não é decidível — e não por falta de código.**

Três medições, nesta ordem:

**1 · `cobertoPeloPlano` lê um campo, não calcula nada.**

```ts
web/src/lib/domain.ts:424
export function cobertoPeloPlano(booking: Pick<BookingDoc, "cobertura">) {
  return booking.cobertura?.tipo === "plano";
}
```

`cobertura` é gravada pelo servidor **na conclusão** (`financial-events.ts:495`).
No `/agendar` a reserva ainda não existe, e o campo não existe. Não há como
chamar essa função — o argumento não nasceu.

**2 · Quem decide é `decidirCobertura`, e ela conta o passado, não o futuro.**

```ts
functions/src/financial-events.ts:339
const jaCobertosNaCompetencia = doCliente.docs.filter((d) => {
  const cobertura = d.get("cobertura") as Cobertura | undefined;
  return cobertura?.tipo === "plano" && …
}).length;
```

A contagem só enxerga reservas **que já foram concluídas e cobertas**. Reservas
futuras não contam — e não podem contar, porque podem ser canceladas.

Daí o fato incontornável: um cliente com cota 4, três cortes já usados e **duas
reservas futuras no mesmo mês** tem duas reservas disputando **uma** vaga. Qual
delas será coberta depende de qual for concluída primeiro. **A resposta não
existe no momento do agendamento** — não está faltando cálculo, está faltando o
evento que a determina.

**3 · O produto já proibiu, por teste, a saída barata.**

```ts
web/src/lib/__tests__/situacao-da-reserva.test.ts:402
it("o web não tem uma `decidirCobertura` própria", () => {
  expect(semComentarios(modulo)).not.toContain("decidirCobertura");
  expect(semComentarios(modulo)).not.toContain("competenciaDe");
});
```

E um segundo guard, sobre as telas Hoje e Agendar: `expect(codigo).not.toMatch(/cobertura\s*:/)`.
O motivo está escrito em `booking-status.ts:176` — reimplementar a decisão no web
*"recriaria o D1 — o web dizendo 40% e o servidor gravando 0% — só que com
cobertura no lugar da comissão, e num campo que ninguém confere."*

### O que isso faz com a diretriz

Ela é **honrada, não contornada**. *"A tela não inventa a regra"* continua sendo
o critério; o que a medição acrescenta é que, no `/agendar`, a regra ainda **não
tem resposta** — e afirmar uma seria justamente inventá-la.

Então a apresentação se divide por aquilo que é verificável **antes** da
conclusão:

| Situação | O que a tela pode afirmar |
|---|---|
| **Sem plano ativo** | valor cheio. Sem condicional |
| **Plano ilimitado** | a dedução. `unlimited` não depende de cota nem de ordem — a resposta é sim, sempre |
| **Plano com cota** | a **posição** (*"seu plano cobre 4 cortes por mês"*) e a expectativa, **nunca `Total R$ 0,00`** como fato |

O 5º corte de um plano de 4 **é cobrado**. Uma tela que dissesse `Total R$ 0,00`
ali repetiria o D1 com outro nome — e desta vez para o cliente, que é quem menos
tem como conferir.

**A posição na cota tem que vir do servidor.** Contá-la no cliente é exatamente o
que o teste acima proíbe, e por bom motivo: seriam duas contas para a mesma
pergunta. Ou o `/agendar` recebe do servidor um retrato da cota, ou não exibe
posição — mas não a calcula sozinho.

**Ponto que ainda depende de você**, e que aparece só na tela: para o plano com
cota, a linha de expectativa é *"se este corte ainda estiver na sua cota, você
não paga"* ou é melhor mostrar só a posição e o valor cheio? Não decido isso no
escuro — vai como duas variantes na verificação visual do ciclo.

---

## N7.2 · Reembolso quando não houve pagamento

### O que foi medido

O passo 3 mostra a política de cancelamento **incondicionalmente** — inclusive
para quem não vai pagar nada. E `reservas/page.tsx` **já tem a frase certa** para
o caso `sem_pagamento`; o `/agendar` é que não a usa.

### Recomendação: **exatamente a sua formulação**

> *"Este atendimento foi coberto pelo plano e não possui valor pago para
> reembolso."*

E o sistema **não cria estorno financeiro** — coerente com o que o servidor já
faz, já que não existe `PaymentDoc` a estornar.

### Uma precisão a acrescentar

A regra é **por fato, não por visita**. Um mensalista que teve o corte coberto e
comprou uma pomada tem **dois** fatos: o corte sem pagamento e a venda com
pagamento. Cancelar a visita não pode arrastar a venda — ela tem estorno próprio,
que já funciona e está verificado.

## ✅ DECIDIDO — **regra por fato econômico**

> *"Cancelar o agendamento/atendimento não cancela automaticamente uma venda
> associada. Se houver venda de pomada, ela possui seu próprio ciclo. Se houver
> pagamento, possui seu próprio ciclo. Se houver atendimento coberto, possui seu
> próprio fato de cobertura."* — João, 18/08/2026

A diretriz é mais forte do que o caso que a originou: ela vale para os três
fatos, não só para a venda. E responde a pergunta que o R1 vai encostar — o que
acontece com a cota quando um atendimento coberto é cancelado — pela mesma
lógica: a cobertura é um fato próprio, e desfazê-la é um ato explícito, não um
efeito colateral do cancelamento da visita.

**Nada disso está implementado.** A diretriz descreve o comportamento correto;
verificar se o produto já o tem é item da auditoria de implementação, não uma
suposição a carregar.

---

# As cinco decisões, fechadas

| # | Decisão | **Diretriz** |
|---|---|---|
| **R1.1** | taxa na correção | Sem versionamento agora; **taxa vigente na correção**, dita explicitamente na confirmação. A tela do Financeiro para de prometer versionamento |
| **R1.2** | janela | Correção permitida **até o fechamento do mês**. Hoje isso se implementa como *mês corrente*, porque fechamento não existe ainda |
| **R1.3** | alterar × somar | **`update` do `PaymentDoc`** + `audit_log` com de/para, quem e quando |
| **N7.1** | preço do mensalista | **Preço condicionado à cobertura real do plano** — a regra vem do servidor, a tela não a reproduz |
| **N7.2** | cancelamento | **Cancelamento afeta apenas o fato correspondente** |

---

# Consequências medidas depois da decisão

Três diretrizes tocam mecanismos que precisavam ser verificados antes de virar
tarefa. **Duas mudam o desenho.**

### 🔴 R1 deixa de ser edição de tela e vira Cloud Function

`audit_log` é `allow write: if false` — imutável para todo cliente, dono
incluído. Um `updateDoc` da tela não consegue registrar a correção, e afrouxar a
rule destruiria a propriedade que torna o log útil. Os três escritores atuais são
Admin SDK.

Isso não é desvio: é o padrão da base. Todo fato financeiro já nasce no servidor.
E é o que permite verificar as três travas do R1.3 — só quatro campos tocados,
`update` e nunca `delete`+`create` — de dentro de quem grava.

### 🔴 N7.1 não pode afirmar cobertura no `/agendar`

No momento do agendamento a cobertura **não é decidível**: a contagem da cota
enxerga só atendimentos já concluídos, e duas reservas futuras do mesmo mês podem
disputar a mesma vaga. Plano ilimitado pode afirmar; plano com cota mostra
posição e expectativa, nunca `Total R$ 0,00` como fato. E a posição vem do
servidor — o teste `situacao-da-reserva.test.ts:402` proíbe recalculá-la no web.

### 🟡 R1.2 se apoia num fechamento que não existe

Nenhum mecanismo de fechamento de mês em `web/src` ou `functions/src`. A janela
implementável é o mês corrente pelo `date`. O fechamento explícito — e o "ajuste
administrativo" que ele habilita — fica registrado como frente futura.

### 🟢 O formato do `audit_log` já existe e é seguido

`{ action, by, at, detail }`, `action` em `dominio.verbo_no_particípio`.
Nada a inventar.

---

# Quatro achados que saíram desta análise e não estavam em lista nenhuma

1. O caminho de correção **já existe e vaza** — não decidir mantinha o defeito.
2. A tela do Financeiro promete **versionamento de taxa que não existe**;
   `GatewayFeeDoc` é tipo órfão. Cai junto com o R1.1.
3. **A conclusão de um atendimento não escreve `audit_log`.** O evento que
   materializa dinheiro é o único do produto sem rastro.
4. **A cobertura do plano é indecidível antes da conclusão** — propriedade do
   domínio, não lacuna de implementação. Nenhuma quantidade de código no
   `/agendar` resolve.

---

# Ordem de execução

Definida por João no fechamento:

1. ✅ **Registrar as cinco decisões** — este documento
2. **Auditoria curta da implementação proposta** — só leitura, sem commit de código
3. **R1** — correção do meio de pagamento
4. **N7.1** — preço condicional do mensalista
5. **Verificação integrada na tela** — §19, com os dois lados abertos
6. **Onda 3 / QA-02**

Os passos 3 e 4 vão no **mesmo ciclo**: `/agendar` e o domínio de mensalista têm
relação semântica, e separá-los repetiria o padrão que produziu a quinta coisa
errada duas vezes (§25).
