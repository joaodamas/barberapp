# Rodada 1 — as promessas falsas e os números que mentem

> **Encerra a categoria FALSE PROMISE do produto.** Nenhum item toca o modelo
> financeiro: D3 e D8/D11 continuam intactos e pendentes de decisão.

Baseline de comparação: `aadf76f` (`gate-b/congelado-2026-08-17`).

---

## 1. A régua aplicada

Para cada um dos dez itens, nesta ordem:

| | |
|---|---|
| **ANTES** | reproduzir a evidência · escrever o teste que captura o comportamento **incorreto** e vê-lo falhar |
| **CORREÇÃO** | menor mudança possível · sem refatoração oportunista · sem alterar regra financeira estrutural |
| **DEPOIS** | teste novo passa · revalidar a superfície indicada · **verificar que a correção não criou outra afirmação falsa** |

O terceiro item do DEPOIS não é formalidade. Ele pegou **três defeitos que eu
mesmo introduzi** nesta rodada — estão na §4, com nome.

---

## 2. O resultado

| Item | Antes | Correção | Teste | Revalidação | Status |
|---|---|---|---|---|---|
| **D14** | 15 templates prometiam pagamento online, estorno automático, cobrança recorrente, autoatendimento de plano e avaliação — **30 ocorrências**. A única mensagem que o produto **já envia** prometia devolução integral | corpo, exemplo e gatilho reescritos em 15 templates · 4 parâmetros renomeados · 2 preservados de propósito | `promessas.test.ts` — 10 casos, **8 falhavam** | catálogo · **65** testes de WhatsApp, validação Meta inclusa | 🟢 |
| **P1-11** | *"Pix e cartão contam assim que confirmados"* — nenhum meio conta antes da conclusão | 1 frase, reescrita a partir de `isReceived` | `rodada-1.test.ts` — 4 casos ligando a frase à invariante | Dashboard | 🟢 |
| **D10** | previsão do dia somava a falta já confirmada: barra em 0% de um valor que não vinha | `previsaoDoDia` — desconta `no_show`, **mantém** a ocupação | `rodada-1.test.ts` — 5 casos, inclusive a contraprova da cadeira | Dashboard · previsão | 🟢 |
| **D6 / P1-2** | filhos somavam **928** sob cabeçalho de **680**; DRE e Financeiro discordavam sobre o que compõe a receita | `composicaoDaReceita` como fonte única das duas telas | `rodada-1.test.ts` (5) + `seis-visoes.test.ts` (2) | DRE · 6 visões | 🟢 |
| **P1-1** | KPIs diziam *"no mês"* e somavam o histórico inteiro, com **"julho de 2026"** cravado | `resumoDeDespesas(expenses, periodo)` · rótulos derivados do mês exibido | `rodada-1.test.ts` — 5 casos | Despesas · DRE | 🟢 |
| **P1-15** | login abria em **"Celular"** com o provider Phone desabilitado — primeiro contato de todo cliente, quebrado por padrão | `metodos-de-login.ts`: o padrão passa a ser derivado dos métodos que funcionam | `metodos-de-login.test.ts` — 5 casos | login | 🟢 |
| **D2** | ticket médio dividia receita **com produto** por atendimentos de **serviço**: R$ 85,00 onde o serviço médio é R$ 48,75 — **74% maior** | numerador corrigido · `avgTicketComProduto` preserva a informação | `rodada-1.test.ts` (3) + `reconciliacao.test.ts` (2) | Números | 🟢 |
| **D9** | KPI **"Despesas"** mostrava R$ 2.997,50 — o custo total | rótulo vira **"Custo total"**, com a enumeração das **seis** parcelas | `rodada-1.test.ts` — 3 casos, um deles fechando a soma | Financeiro | 🟢 |
| **P1-14** | *"acumulado nos 30 dias"* em **todos** os quatro horizontes | legenda derivada de `HORIZONTES[horizonte].dias` | `rodada-1.test.ts` — 2 casos | Projeção | 🟢 |
| **P1-9** | sob "Faturamento da loja" (R$ 290), a legenda mostrava R$ 222,50 — a comissão do mês inteiro | `commissionsLoja` no lugar de `commissions` | `rodada-1.test.ts` — 1 caso | Financeiro | 🟢 |

### Verificação no fechamento

| | Antes (`aadf76f`) | Agora |
|---|---|---|
| `web` — typecheck · lint · testes | 268 | ✅ **303** |
| `web` — build de produção | ✅ | ✅ compilado |
| `functions` — typecheck · testes | 212 | ✅ **222** |
| `functions` — concorrência (emulador) | 13 | ✅ **13** |
| `functions` — isolamento multi-tenant | 76 | ✅ **76** |
| `functions` — regras Firestore + Storage | 66 | ✅ **66** |
| | **635** | **680** |

> **Correção de um número meu.** `GATE-B.md` §1 registrava **82** para as regras
> e **651** no total. Os arquivos de regras não mudaram desde então — e declaram
> 66 testes (52 Firestore + 14 Storage), que é o que roda. O 82 era erro de
> transcrição na minha folha, não uma suíte que encolheu. **A baseline correta é
> 635.** Corrigido em `GATE-B.md` com nota, e o 651 não é preservado em lugar
> nenhum por consistência narrativa: a evidência é o que manda.

### O que 680 não significa

**Não significa produto pronto.** Lido corretamente, o estado é:

> **680 verificações automatizadas válidas + evidência operacional humana ainda
> pendente.**

Continua valendo a regra 1 da auditoria: *teste verde não promove nada para
validado*. A suíte diz que o código faz o que o autor imaginou. Se o dono
entende a tela, confia no número e consegue tocar o dia — isso nenhum dos 680
responde, e é o Day in the Life que responde.

---

## 3. O que a correção NÃO fez

A instrução era explícita: *"não quero que vocês simplesmente façam os números
baterem"*. Estes são os pontos onde bater o número teria sido mais fácil.

### D6 — o mensalista não foi escondido

Os R$ 248 saíram da árvore da receita **realizada** e continuam no cartão de
receita **contratada**, com nome próprio. A regra, escrita:

> **Contratado projeta; realizado fatura.**

`seis-visoes.test.ts` ganhou um teste que **falha se alguém zerar o campo** para
fazer a árvore fechar.

### D2 — o significado mudou, não o número

`avgTicket` passou a medir receita de serviço ÷ atendimentos de serviço. Os R$ 85
não sumiram: viraram `avgTicketComProduto`, que é um indicador legítimo — quem
vende bem no balcão precisa enxergar isso. Duas perguntas, duas respostas.

Sobra **R$ 0,25** contra o ledger, e ela **não é de D2**: `indicadores` arredonda
ao real, não ao centavo. Isso é **D1/D5, aberto**, e está registrado como tal em
`reconciliacao.test.ts`. A correção de um achado não pode varrer outro.

### P1-15 — o login ficou utilizável, não só diferente

O padrão agora é **derivado** dos métodos que funcionam. A invariante que faltava
virou teste:

> **O método padrão precisa estar entre os disponíveis.**

Ela vale nos dois estados da chave. Ligar o provider Phone restaura a aba e o
padrão anterior — a correção **desligou** um recurso, não o apagou.

### D14 — o que descreve ato humano continua no catálogo

A linha que separou o que sai do que fica:

> **O produto não move dinheiro. Uma pessoa move.**

`reembolso_processado` **ficou**: a barbearia recebeu em mãos e pode devolver em
mãos, e registrar isso por escrito é verdadeiro e útil. O que era falso estava só
no exemplo, que descrevia reversão automática sobre o instrumento original.

`promessas.test.ts` tem um teste de contraprova que **cairia** se a correção
tivesse sido "apagar tudo que fala de dinheiro".

---

## 4. Três defeitos que a própria rodada criou — e o passo que os pegou

Registrados porque são a evidência de que o terceiro item da régua funciona.

| O que eu quebrei | Como apareceu |
|---|---|
| Cartão **"Lançamentos"** ficou com `expenses.length` sob o rótulo do mês recortado — o mesmo P1-1 que eu estava corrigindo, num cartão vizinho | revalidação da tela inteira, não só da linha alterada |
| Estado vazio dizia *"Nenhuma despesa lançada **ainda**"* — com recorte por mês, um mês vazio não significa que nunca houve despesa. O dono lançaria de novo o que já lançou | leitura do render completo |
| Legenda do **"Custo total"** enumerava **cinco** parcelas. `payroll` entra em produção por `folhaMensal(staff)` e ficou de fora: uma enumeração incompleta apresentada como completa | o teste que soma as parcelas e compara com `totalCost` **não fechou** |

O terceiro é o mais instrutivo: eu tinha acabado de trocar um rótulo falso por
outro rótulo, e só a aritmética do teste mostrou que o novo também não descrevia
o número. **Rótulo corrigido por leitura continua sendo rótulo não verificado.**

---

## 5. D14 — o achado cresceu na execução

O backlog estimava **"baixo — reescrever 2 templates"**. A varredura encontrou
**15 templates e 30 ocorrências**, em seis famílias de promessa. Nenhuma foi
promovida por leitura de catálogo: cada uma tem o ponto no código que prova a
ausência da capacidade.

| Capacidade prometida | Evidência de que não existe | Templates |
|---|---|---|
| pagamento online | `booking.ts:68` recusa `paymentOrigin` ≠ `in_person`; `:234` grava sempre `in_person`. Sem gateway no projeto | 5 |
| estorno automático | `refundAmountFor` devolve `sem_pagamento` quando `paymentMethod` é nulo — e `booking.ts:237` o grava nulo até a conclusão. Reserva cancelada nunca chegou a `completed` | 3 |
| cobrança recorrente | `subscription.ts:27` — *"não há checkout: a contratação é humana, por WhatsApp"*. `subscriptions` não é escrita por caminho nenhum (G2) | 5 |
| pagamento já recebido | `formaPagamento(null)` → *"pagar no salão"*. Nenhuma reserva nasce paga | 2 |
| autoatendimento de plano | `definirPlano` exige operador da plataforma. `/planos` virou vitrine quando P0-1 removeu o checkout falso | 3 |
| avaliação de atendimento | **não existe nota, estrela nem review em lugar nenhum** — nem web, nem functions, nem domínio. O link ia para `/perfil` | 1 |

**A última é achado novo desta rodada — e é a única que NÃO fecha aqui.**
`pos_atendimento` convidava o cliente a avaliar o atendimento num endereço onde
não há o que avaliar. É a mesma classe, com uma diferença: a promessa não era de
dinheiro, era de voz.

O convite saiu do template e `promessas.test.ts` impede que volte. Mas **D17
permanece formalmente aberto no Bloco 2**: a capacidade continua não existindo, e
parar de afirmar não é o mesmo que passar a fazer.

### O que mais pesa

`confirmacao_reserva` prometia *"cancelamento até 24h antes tem 100% de
devolução"* — e é **a única mensagem que o produto já envia hoje**, por
`notifyBookingCreated`. D14 estava classificado como latente; nesta parte, não
era. Prometia devolver dinheiro que nunca foi cobrado, com uma régua de 24h/6h
cravada no texto enquanto `policies.cancellation` é configurável por barbearia.

---

## 6. O que precisa ser revalidado

Conforme a regra da Fase 3.

| Frente alterada | Revalidação | Estado |
|---|---|---|
| Mensagens e templates | catálogo · validação Meta | ✅ 65 testes |
| Motor financeiro — **apresentação apenas** | ledger · 6 visões · reconciliação | ✅ 303 testes web |
| Dashboard · DRE · Financeiro · Despesas · Projeção · Números | build + suíte | ✅ |
| Login | build + suíte | ✅ · **falta abrir a tela** |
| Regras, autorização, agenda, concorrência | não tocadas | ✅ 155 testes, sem regressão |

### O que a suíte não cobre

**Nenhuma destas telas foi aberta.** O que os 680 testes provam é que os números
e os textos estão certos na origem. Se a legenda nova ficou legível no cartão, se
o login sem abas parece incompleto, se "Custo total" com seis parcelas cabe na
linha — isso é o **Day in the Life**, com executor humano que não participou da
construção. Continua pendente, e continua sendo a evidência que falta.

---

## 7. O que vem depois

**Rodada 2 — a operação que falta:** `D13 · G1 · G2 · P1-4 · P1-13`.

Não D3/D8/D11. G1 (venda de produto) muda o dado que alimenta D3 e D4 — corrigir
o cálculo antes de existir a entrada seria corrigir no escuro.

---

*Executada em 17/08/2026 sobre `aadf76f`. Dez itens pedidos, dez fechados; um
achado novo (**D17**, que segue aberto como gap) e três defeitos próprios
corrigidos no caminho.*
