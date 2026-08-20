# D-Caso-2 — como o produto passa a ter uma segunda evidência

> **20/08/2026** · briefing de decisão, sobre `hardening/p0-2026-08-17` em `c9311a2`.
> **Nenhuma recomendação.** As três opções estão descritas com o mesmo nível de
> detalhe, de propósito: a escolha é de produto e precisa ficar registrada como
> decisão do dono, não derivada de uma preferência minha.
>
> Base: `docs/agent-reports/R1-CASO-2.md` (auditoria read-only de 20/08),
> reverificada contra o código nesta data.

---

# 1 · O que exatamente está sendo decidido

O **caso 2** é o meio de pagamento **preenchido e errado**. O dono registra
"Pix" num atendimento que foi pago em dinheiro — ou o contrário.

O caso 1 (campo vazio) é detectável porque a ausência é um fato do sistema: o
campo está nulo, e nulo é observável. O produto já o trata bem — card crítico,
causa explicada na linha, quarta coluna no caixa.

O caso 2 não é detectável porque **o campo está preenchido**, e:

> Todo registro de meio de pagamento no produto desce de uma única digitação
> humana, e não existe nenhuma segunda origem contra a qual compará-la.

```
dono escolhe no modal
       ↓
bookings.paymentMethod          (a digitação)
       ↓ trigger
payments.paymentMethod          (cópia da digitação)
       ↓ derivado
feePct · feeAmount · netAmount  (consequência aritmética da cópia)
       ↓ derivado
refunds.paymentMethod           (cópia da cópia)
       ↓ derivado
DRE · Caixa · Fluxo · Projeção  (leituras da cópia)
```

Nenhum nó desse grafo tem aresta de entrada vinda do mundo. A auditoria
considerou **dezesseis** candidatos a sinal e descartou os dezesseis.

**A decisão não é "qual alerta construir".** É **de onde virá a segunda
evidência** — porque sem ela qualquer alerta teria confiança `insufficient`, e o
invariante 3 do Action Center barra `insufficient` na porta. Um alarme sem
coleta é falsa segurança, que é pior que a ausência dele.

## 1.1 · A assimetria que decide o valor de cada opção

Nem todo erro do caso 2 custa o mesmo, e nem todo erro deixa o mesmo rastro:

| Erro | Deixa rastro físico? | Move dinheiro? | Move taxa? |
|---|---|---|---|
| dinheiro ↔ Pix | **sim** — a gaveta não bate | não | não (ambos 0%) |
| dinheiro ↔ cartão | **sim** — a gaveta não bate | não | sim |
| **Pix ↔ débito ↔ crédito** | **não** | não | **sim** |

A metade **invisível** (Pix ↔ cartão) é a de **maior** consequência financeira,
porque é onde a taxa muda. A metade com traço físico é justamente a que envolve
dinheiro vivo.

⚠️ **Com as taxas zeradas — que é o padrão de nascença (`tenant.ts:153`) — o
caso 2 move só a coluna e nenhum centavo.** Isso muda a urgência, não a
natureza: no dia em que o dono cadastrar as taxas, o erro passa a mover
dinheiro retroativamente em todo pagamento novo.

---

# 2 · Opção B — fechamento de caixa

O dono digita, no fim do expediente, **quanto tem de dinheiro na gaveta**. O
sistema calcula o esperado e compara.

### O que muda no produto
Uma rotina nova de fim de dia, com tela própria. É a primeira vez que o produto
**pede** algo ao dono no fechamento — hoje ele não pede nada.

### Qual evidência passa a existir
**A contagem física da gaveta.** É o primeiro fato do produto que não desce de
uma digitação sobre o atendimento: ele vem do mundo, e é a única das três que
não depende de terceiros (nem banco, nem cliente).

### Como o sistema detectaria divergência
`caixaDoDia().dinheiro` + entradas de dinheiro em `cash_entries` do dia,
comparado ao contado. Diferença ≠ 0 acende.

### Impacto para o dono / barbeiro
**Obrigação operacional nova, diária.** Contar a gaveta e digitar, todo dia. O
produto nunca pediu nada assim, e uma rotina que o dono abandona na segunda
semana não gera evidência nenhuma — vira campo vazio que enfraquece o alarme.

### Esforço técnico
**Alto.** Coleção nova + callable + tela + o modelo do "esperado", que **não
existe hoje**: `livro-caixa.ts:10-14` declara explicitamente que as duas metades
do caixa não se somam.

**Já preparado:** `caixa.ts:57` tem o tipo `ajuste`, descrito como *"sobra ou
falta encontrada ao conferir"*. O lugar onde a diferença aterrissa já está
modelado — e a doutrina de exclusividade de `cash_entries` (só entra o que não
deriva de outro fato) já cobre esse caso sem duplicar dinheiro.

### Impacto no fluxo de fechamento
Cria um fechamento de **dia** onde hoje não existe nenhum. Observação
importante: o R1 já registrou que **fechamento de mês também não existe** no
produto. Esta opção introduz o primeiro marco de fechamento da plataforma, e
isso tem consequências além do caso 2.

### O que fica impossível detectar mesmo depois
**Toda a metade invisível.** Pix ↔ débito ↔ crédito não passam pela gaveta: a
diferença é zero e o alarme não acende. E é a metade em que a taxa dói.

Além disso, a diferença **não identifica o pagamento culpado**: ela diz "faltam
R$ 50,00", não "o atendimento do Marcos foi em dinheiro". O salto de um para o
outro é inferência — e inferência é `insufficient`.

### Consequência de não implementar
O erro que envolve dinheiro vivo continua sem qualquer testemunha. É o caso mais
provável no balcão (troco, pressa, cliente que muda de ideia na hora).

### 🔴 Decisão embutida
**O que fazer com a diferença encontrada.** Virar `ajuste` de caixa — que
reconhece a diferença **sem tocar no fato** — ou abrir a porta de correção do
R1, que **reescreve o pagamento**? São tratamentos **opostos** do mesmo dinheiro.
Escolher errado ou faz o caixa fechar com o DRE errado, ou reescreve um pagamento
por inferência.

---

# 3 · Opção E — conciliação com o extrato da maquininha / Pix

O extrato do adquirente entra no sistema e é casado com os pagamentos
registrados.

### O que muda no produto
Uma frente inteira de integração financeira: entrada do extrato (importação de
arquivo ou API do adquirente), casamento por valor + data, e uma tela de
tratamento de divergência.

### Qual evidência passa a existir
**O registro do adquirente** — o único que sabe, independentemente do balcão,
que uma transação de crédito de R$ 50,00 existiu naquele dia.

### Como o sistema detectaria divergência
Pagamento marcado como `credit` sem transação correspondente no extrato, e
transação no extrato sem pagamento correspondente. É comparação entre duas
fontes independentes — a definição de evidência real.

### Impacto para o dono / barbeiro
Depende do desenho: importação manual mensal é pouco intrusiva; integração via
API exige credenciais do adquirente e uma conversa que o produto nunca teve com
o dono.

### Esforço técnico
**Muito alto, e nada está preparado.** Não há gateway, não há upload de arquivo,
não há parser. É maior que o R1 inteiro, e depende de decisões de integração que
ninguém tomou — inclusive **de qual adquirente**, já que a tela do Financeiro
hoje só exibe taxas de referência de mercado (Stone / InfinitePay) sem
integração com nenhum.

### Impacto no fluxo de fechamento
Introduz conciliação — provavelmente mensal. Encosta na mesma lacuna de
"fechamento de mês" que o R1 registrou como frente futura.

### O que fica impossível detectar mesmo depois
**Dinheiro vivo.** Não há extrato de dinheiro. Um pagamento em espécie
registrado como Pix continua invisível por esta via — é o espelho exato do
alcance da opção B.

### Consequência de não implementar
A metade de maior consequência financeira — Pix ↔ cartão, onde a taxa muda —
permanece sem qualquer possibilidade de detecção. Nenhuma das outras duas opções
a cobre.

### Observação
O produto **já orienta o dono a fazer essa conferência à mão** e desenhou as
colunas para ela (`analytics.ts:352-354`, `fluxo-de-caixa.ts:47`, `:261-263`). O
passo que falta é o extrato entrar no sistema.

---

# 4 · Opção F — recibo ao cliente + caminho de contestação

Depois da conclusão, o cliente recebe o registro do que foi cobrado e como, com
um caminho para dizer "não foi assim".

### O que muda no produto
O registro interno de pagamento vira **declaração ao cliente**. E abre-se um
fluxo de contestação que o produto não tem.

### Qual evidência passa a existir
**Um segundo humano olhando o dado** — a única pessoa, além de quem digitou, que
sabe a verdade sobre como pagou.

### Como o sistema detectaria divergência
Não detecta sozinho: **espera a contestação**. É a única das três em que a
evidência é reativa e não pode ser varrida por consulta.

### Impacto para o dono / barbeiro
Cria trabalho de atendimento a disputas, que hoje não existe. E muda a relação:
o dono passa a ter de responder ao cliente sobre um registro interno.

### Esforço técnico
**Médio, com um bloqueio externo.** O canal está construído — `whatsapp/client.ts`,
`webhook.ts`, `validate.ts`, e um catálogo de **34 templates**. Mas:

- **nenhum dos 34 é de recibo ou comprovante** — o template seria novo, e
  template novo exige **aprovação da Meta**;
- o canal depende de `WHATSAPP_TOKEN` (`whatsapp/config.ts:20`) e o produto
  **nunca enviou uma mensagem** — falta verificação comercial e credenciais.

Ou seja: o esforço de código é médio, mas há uma dependência externa fora do
nosso controle e de prazo desconhecido.

### Impacto no fluxo de fechamento
Nenhum direto. É a única das três que não cria marco de fechamento.

### O que fica impossível detectar mesmo depois
**Tudo que o cliente não conferir.** Quem não abre o app ou não lê a mensagem não
testemunha — e a cobertura passa a depender de engajamento, que varia por
barbearia e por cliente. Não é uma varredura: é uma amostra de tamanho
desconhecido.

### Consequência de não implementar
A informação continua **exposta e desperdiçada**: o cliente **já vê** o método
hoje na tela de reservas (`(cliente)/reservas/page.tsx:374`), sem qualquer meio
de dizer que está errado.

### 🔴 Decisão embutida
Afirmar ao cliente *"você pagou com Pix"* é declaração de produto sujeita à
**§27** — a interface não afirma o que o sistema não sabe. E o sistema, neste
caso exato, **não sabe**: é a digitação que ele está exibindo como fato.

---

# 5 · O que cada opção cobre, lado a lado

| Erro | B · gaveta | E · extrato | F · cliente |
|---|---|---|---|
| dinheiro ↔ Pix | ✅ | ❌ | 🟡 se contestar |
| dinheiro ↔ cartão | ✅ | 🟡 parcial | 🟡 se contestar |
| **Pix ↔ débito ↔ crédito** | ❌ | ✅ | 🟡 se contestar |
| identifica o pagamento culpado | ❌ | ✅ | ✅ |
| funciona sem terceiros | ✅ | ❌ | ❌ |
| varre o histórico | ✅ | ✅ | ❌ |

**Nenhuma das três cobre tudo.** B e E são complementares por construção — uma
cobre exatamente o que a outra não alcança. F é ortogonal às duas e é a única
que aponta o pagamento específico sem inferência.

---

# 6 · A observação transversal, que não é escolha

Sem **B**, **E** ou **F**, nenhum alarme de caso 2 pode ter confiança `real`.
`insufficient` não entra no Action Center por invariante. **Alarme exige coleta
antes** — qualquer desenho que pule essa etapa está inventando o alerta que o
enunciado pediu para não inventar.

E há a alternativa de **não construir nenhuma**, que é honesta e tem custo zero:
a porta do R1 continua sendo a resposta inteira, e a descoberta do erro continua
sendo humana. O que ela aceita é a frase do próprio briefing do R1 permanecendo
verdadeira:

> *"É exatamente o tipo de erro financeiro silencioso que você não quer descobrir
> depois que uma barbearia já começou a usar o sistema."*

---

# 7 · Perguntas que a decisão precisa responder

1. **A conferência da gaveta deve virar obrigação diária do dono?** (opção B)
2. **O que fazer com a diferença encontrada** — `ajuste` de caixa, ou porta de
   correção? São tratamentos opostos. (embutida em B)
3. **O produto vai depender de integração com adquirente?** (opção E)
4. **O cliente pode ser transformado em testemunha**, e o registro interno vira
   declaração a ele? (opção F, §27)
5. **Qual metade do erro importa mais para o piloto** — a que envolve dinheiro
   vivo, ou a que move taxa?
6. **O caso 2 bloqueia o piloto, ou é aceito como risco conhecido** com a porta
   do R1 como única resposta?

---

# 8 · O que este documento NÃO faz

Não recomenda. Não ordena as opções por preferência. Não deriva a escolha de
nenhuma regra existente — porque nenhuma das cinco perguntas acima é derivável
do que já foi decidido.

Quando a decisão for tomada, ela entra aqui como **D-Caso-2**, com data, e o
`ESTADO-DO-PROJETO.md` passa a apontar para ela.
