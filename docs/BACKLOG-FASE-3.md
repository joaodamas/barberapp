# Fase 3 — Product Completion

> **Transformar um produto tecnicamente confiável num produto operacionalmente
> vendável.**

O baseline `gate-b/congelado-2026-08-17` (`aadf76f`) é **marco de comparação**,
não portão de desenvolvimento. Ele prova o que foi verificado naquele estado; o
desenvolvimento segue a partir dele.

## A regra desta fase

> **Toda alteração feita depois de `aadf76f` declara o que mudou e o que precisa
> ser revalidado.**

Sem isso, a confiança construída em 635 verificações se dissolve sem ninguém
perceber. Cada item abaixo carrega a coluna **revalidar** — e ela é parte da
tarefa, não uma sugestão.

| Frente alterada | Revalidar |
|---|---|
| Mensagens e templates | catálogo de templates · validação Meta |
| Criação de reserva | agenda · concorrência · Day in the Life |
| Motor financeiro | ledger · 6 visões · reconciliação |
| Fluxo de operação | Day in the Life (trecho afetado) |
| Regras e autorização | suíte de isolamento (87 + 66 de regras) |
| Refactor amplo | tudo que o arquivo tocado alimenta |

---

## Como este backlog está ordenado

Por **impacto comercial**, não por severidade técnica. A pergunta de cada item é:

> Isto impede vender, impede operar, induz o dono ao erro, ou apenas incomoda?

Um erro de arredondamento de R$ 0,14 é tecnicamente um defeito e comercialmente
irrelevante. Uma promessa falsa ao cliente final é o contrário.

---

# ✅ Bloco 1 — Release blockers · **FECHADO**

*Impediam colocar na mão de uma barbearia que paga.*

**Rodada 1 executada em 17/08 sobre `aadf76f`. Relatório em `RODADA-1.md`.**

| # | O que era | Correção | Estado |
|---|---|---|---|
| **D14** | Templates prometiam estorno, pagamento antecipado, cobrança recorrente, autoatendimento de plano e avaliação. Estimado em 2 templates; a varredura achou **15, com 30 ocorrências** — e a única mensagem que o produto **já envia** prometia devolução integral | 15 templates reescritos · `promessas.test.ts` (10 casos, 8 falhavam) | 🟢 |
| **P1-11** | A legenda do caixa ensinava *"Pix e cartão contam assim que confirmados"* | frase reescrita a partir de `isReceived` · 4 testes de invariante | 🟢 |
| **D10** | A previsão do dia não descontava a falta confirmada | `previsaoDoDia` · 5 testes | 🟢 |
| **D6 / P1-2** | Filhos da receita somavam **928** sob cabeçalho de **680** | `composicaoDaReceita` como fonte única · 7 testes | 🟢 |
| **P1-1** | KPIs diziam *"no mês"* e somavam o histórico, com **"julho de 2026"** cravado | `resumoDeDespesas` · rótulos derivados · 5 testes | 🟢 |
| **P1-15** | Login abria na aba "Celular" com o provider SMS desabilitado | `metodos-de-login.ts` · 5 testes, um deles a invariante que faltava | 🟢 |

> **Por que P1-11, D10, D6 e P1-1 estavam aqui e não em "financeiro".** Nenhum
> era erro de cálculo complexo — os quatro eram números ou frases que **induziam
> o dono ao erro**. O critério do bloco não é dificuldade, é consequência.

**Falta ainda:** nenhuma dessas telas foi **aberta**. A suíte prova a origem dos
números; a leitura deles é o Day in the Life, com executor humano.

### D17 · avaliação de atendimento — **permanece aberto**

Achado durante a varredura de D14: `pos_atendimento` convidava o cliente a
*"avaliar o atendimento"* num endereço onde não há o que avaliar.

**O que foi feito:** o convite saiu do template, e `promessas.test.ts` impede que
volte. A mensagem não promete mais.

**Por que continua 🟠 aberto:** tirar a frase resolveu a mentira, não a lacuna.
**Não existe avaliação em lugar nenhum do produto** — nem nota, nem estrela, nem
review, nem no web, nem nas functions, nem no domínio. Enquanto a capacidade não
existir, D17 é gap de produto e fica no Bloco 2, não riscado no Bloco 1.

É a distinção que a régua desta fase exige: **parar de afirmar não é o mesmo que
passar a fazer.**

---

# 🟠 Bloco 2 — Product gaps

*O produto não faz o que a operação de uma barbearia exige.*

| # | O que é | Impacto comercial | Custo | Revalidar |
|---|---|---|---|---|
| ~~**D13**~~ | ~~O dono não consegue criar uma reserva~~ | ✅ **fechado na Rodada 2.** `createBookingAtCounter` + `MarcarNoBalcao` no painel Hoje. Cliente de balcão nasce `origin: "balcao"`, `uid: null`. Verificado **na tela**, com reserva gravada | — | agenda · concorrência |
| ~~**G1**~~ | ~~Não há tela de venda de produto~~ | ✅ **fechado na Rodada 2B.** `registrarVendaDeProduto` com transação atômica, custo congelado, meio de pagamento no fato, carrinho e idempotência. Escrita direta fechada nas regras. **Verificado na tela**, com venda gravada | — | ledger · 6 visões · DRE |
| ~~**G2**~~ | ~~Não há cadastro de mensalista~~ | ✅ **fechado na Rodada 2B.** Assinatura + **fatura por competência** + pagamento. `amount` e `competencia` congelados na emissão, `paymentMethod` no pagamento. `dueStage` deixou de ser campo morto e virou derivado. **Verificado na tela**, ciclo completo | — | ledger · financeiro |
| **G3** | **Ficha de cliente — mínimo entregue na Rodada 2.** `clients/{uid}` para quem tem conta, id gerado para o balcão; WhatsApp único por barbearia; fusão preserva o histórico | ✅ identidade, deduplicação e vínculo existem. **Falta o resto do Bloco 3**: Customer 360, risco de perda, reativação, aniversário | médio (o que resta) | isolamento (87) |
| ~~**P1-4**~~ | ~~Remarcar oferece horários já ocupados por outros clientes~~ | ✅ **fechado na Rodada 2.** A tela passou a usar `availableSlots` com o `staffId` da própria reserva | — | agenda |
| ~~**P1-13**~~ | ~~O limite de 2 remarcações vive num `useState` — zera com F5~~ | ✅ **fechado na Rodada 2.** Era pior: `rescheduleBooking` **nunca soube do limite**. `rescheduleCount` virou campo, gravado com `increment` dentro da transação | — | reservas |
| **P2-4** | Jornada por barbeiro é lida pelo servidor e **não tem interface** | Folga e horário próprio são funcionalidade inalcançável | médio | agenda |
| **D17** | **Não existe avaliação de atendimento.** Nem nota, nem estrela, nem review — em nenhuma camada | A régua pós-atendimento perde o gatilho de reputação, e a barbearia não tem como saber o que o cliente achou. A promessa já saiu do template (Rodada 1); a capacidade continua ausente | médio | catálogo de templates · pós-atendimento |

---

# 🟡 Bloco 3 — Modelo financeiro

*Decisões de modelagem. Mudam o que o produto afirma sobre o negócio.*

| # | O que é | Consequência | Custo | Revalidar |
|---|---|---|---|---|
| **D18** | **Possível dupla contagem no plano ilimitado.** O mensalista paga a mensalidade E o atendimento dele vira `booking` com `value` cheio, que entra na receita realizada. A mesma pessoa fatura duas vezes no mesmo mês | Não vi tratamento em lugar nenhum: `PlanDoc.unlimited` existe e nada o consulta na criação da reserva. É erro de RECEITA, não de apresentação — e cresce com o número de mensalistas | decisão de modelo | ledger · DRE · 6 visões · indicadores |
| ~~**D19**~~ | ~~Não existe entrada de estoque~~ | ✅ **fechado em G1.5.** `registrarEntradaDeEstoque` com transação, `unitCost` congelado no movimento e `products.cost` recalculado por **custo médio ponderado**. **Verificado na tela** | — | ledger · DRE · Loja |
| ~~**D19-orig**~~ | ~~Não existia entrada de estoque.~~ `kind: "compra"` aparece em 4 lugares e os 4 são LEITURA. O estoque inicial vem do formulário do produto e não há tela de reposição | **O CMV é zero estrutural em produção** — o lucro da loja é o faturamento inteiro, e a comissão de produto sai sobre ele. Reenquadra D3: não há compras a somar | médio | ledger · DRE · Loja |
| **D20** | **A fatura de mensalidade não é lida por nenhuma visão financeira.** `useFinanceiro` não passa `subscription_invoices` a lugar nenhum | G2 criou o lastro e ele está órfão: a receita de mensalista continua saindo de `status === "ativo"`. A decisão da Rodada 3 é qual dos dois números o DRE usa | decisão de modelo | ledger · DRE · financeiro |
| ~~**D21**~~ | ~~Venda e mensalidade não geram `payments`~~ | ✅ **fechado em G1.6.** As três origens gravam pagamento com `feePct` congelada e id derivado do fato. **Verificado na tela**: taxa do mês passou de R$ 0,00 para R$ 8,34 | — | ledger · DRE |
| ~~**D21-orig**~~ | ~~Venda e mensalidade não geravam `payments`.~~ Só a conclusão de atendimento escreve lá, e `gatewayFeesTotal` soma `payments` | É a causa localizada de D7: R$ 145 no crédito e R$ 149 de mensalidade no crédito não debitam taxa nenhuma, com o `paymentMethod` gravado nos dois fatos | médio | ledger · DRE |
| **D22** | **O estorno não existe.** `refunds` tem regra, tem caminho e ninguém escreve. `cancelBooking` calcula a devolução e grava em `bookings.refundedAmount`, campo que **nenhuma linha do produto lê** | O dinheiro devolvido não existe no DRE, no fluxo nem em `payments`. Com pagamento em três origens, a assimetria virou tripla | decisão de modelo | ledger · DRE · Fluxo |
| **D23** | **Venda e mensalidade não têm caminho de desfazer.** Serviço tem reversão; produto e mensalidade, não | Venda registrada por engano é irreversível pela interface, com estoque baixado, pagamento gravado e taxa cobrada. O único caminho é editar o banco à mão | decisão de modelo | Loja · Mensal · ledger |
| **D24** | **A despesa é o único fato econômico sem congelamento nem idempotência**, escrita direto pela tela e editável para sempre | Corrigir um aluguel em outubro reescreve o lucro de setembro. E `ExpenseDoc.payment` é vocabulário paralelo — "Cartão" não separa débito de crédito | baixo | Despesas · Fluxo |
| ~~**D26**~~ | ~~Cliente não tem tela~~ | ✅ **fechado.** `/painel/clientes` como área de primeira classe: busca, lista ordenada por última visita, ficha com visitas/ticket/gasto/próximo atendimento/mensalista. Tudo DERIVADO. **Verificado na tela** | — | UI/UX · Clientes |
| **D26-orig** | ~~Cliente não tinha tela.~~ G3 criou a entidade e ela só aparece dentro de modais. Sem "Clientes" no menu não há ficha, correção de nome nem "quem não volta há 2 meses" | É a entidade que conecta agendamento, venda e mensalidade — e a arquitetura de navegação a lista como área de primeira classe | médio | UI/UX · Clientes |
| ~~**D27**~~ | ~~Erro de carregamento mostra "vazio"~~ | ✅ **fechado.** `ErroAoCarregar` em 11 telas; o hook já expunha `status: "erro"` e só 2 telas tratavam. **Não exercido na tela** — ver nota no commit | — | UI/UX · todas |
| **D27-orig** | ~~Erro de carregamento mostrava "vazio".~~ Se o listener do Firestore falhar, a tela diz "nenhuma despesa" em vez de "não consegui ler" | Afirmação falsa num estado que ninguém testou — mesma classe da Rodada 1 | baixo | UI/UX · todas as telas |
| **D28** | **A interface não conta a história inteira do dinheiro.** "Venda de R$ 90,00 registrada" não menciona os R$ 3,14 de taxa que o fato agora carrega | fato → número → interface: os três precisam coincidir. Hoje o terceiro está incompleto | baixo | UI/UX · Loja · Mensal |
| ~~**D25**~~ | ~~`cash_entries` e `client_occurrences` são coleções mortas~~ | ✅ **investigado: NÃO são resíduo.** PRD §13 descreve as duas. `client_occurrences` aciona a exigência de pagamento antecipado (gap de produto); `cash_entries` é o livro caixa, e existe para movimentos SEM outro fato — sangria, troco, aporte, pagamento de comissão. Vira decisão da Rodada 3, não remoção | — | — |
| **D25-b** | ~~`cash_entries` e `client_occurrences` eram tidas como mortas.~~ Declaradas em `paths.ts` e nas regras, zero escritas e zero leituras | Mesma classe de `inventory_movements` antes de G1: coleção que parece implementada. `cash_entries` não tem propósito escrito em documento nenhum | baixo | — |
| **D3** | **CMV soma as compras do período**, não o custo do que foi vendido | Num mês de reposição, o lucro da loja despenca sem nada ter piorado. Cresce com o uso | alto | ledger · DRE · 6 visões |
| **D8 / D11** | **Resultado e caixa não se separam.** Não existe, em lugar nenhum, um número que responda *"quanto sobrou no caixa"* | O Fluxo de Caixa é faturamento diário com nome de fluxo de caixa. É o núcleo da promessa "gestão financeira" | alto | ledger · 6 visões · Fluxo |
| **D4** | A venda de produto entra no caixa **toda como dinheiro** | O caixa por meio de pagamento não fecha com a realidade | médio | ledger · Fluxo |
| **D7** | Venda de produto **não gera taxa de maquininha** | A taxa de cartão sobre produto some do custo | médio | ledger · DRE |
| ~~**D2**~~ | ~~Ticket médio divide receita **com produtos** por atendimentos de serviço~~ | ✅ **fechado na Rodada 1.** `avgTicket` mede serviço; os R$ 85 viraram `avgTicketComProduto` | — | Números |
| ~~**P1-7**~~ | ~~A Loja calcula comissão e imposto com a constante da plataforma~~ | ✅ **fechado na Rodada 3.1.** `splitSale` recebe `barberPct`/`taxPct`; a Loja lê de `policies`, como a Equipe já fazia. **Verificado na tela**: com 50/50 e imposto 4% gravados no tenant, o simulador passou de "40% · R$ 10,80" para "50% · R$ 13,50" e a prévia de precificação acompanhou nos três rótulos | — | Loja |
| **P1-7-orig** | ~~A Loja calculava comissão e imposto com a **constante da plataforma**.~~ Achado pela comissão de produto: o simulador anunciava 40% numa barbearia onde Rafael tem 0% e Léo 50% | Quem combinou 50/50 vê 40%. E a legenda prometia um número que venda nenhuma produzia, agora que a comissão nasce com o percentual do barbeiro | baixo | Loja |
| ~~**P1-9**~~ | ~~Sob "Faturamento da loja", a legenda mostra a **comissão total do mês**~~ | ✅ **fechado na Rodada 1.** `commissionsLoja` no lugar de `commissions` | — | Financeiro |
| **P1-10** | "Crescimento líquido de mensalistas" conta **todos os ativos como novos** | O dado não sustenta a afirmação: falta `createdAt` | baixo | Financeiro |
| ~~**D9**~~ | ~~O KPI **"Despesas"** mostra o custo total (2.997,50), não as despesas (2.550)~~ | ✅ **fechado na Rodada 1.** Virou "Custo total", com as **seis** parcelas enumeradas e somadas por teste | — | Financeiro |
| ~~**P1-14**~~ | ~~A projeção diz *"acumulado nos 30 dias"* em **todos** os horizontes~~ | ✅ **fechado na Rodada 1.** Legenda derivada de `HORIZONTES[horizonte].dias` | — | Projeção |
| **D1 / D5** | Taxas e imposto arredondam **ao real**, não ao centavo | Sistemático e sempre a favor do lucro aparente | baixo | ledger · DRE |
| **D12** | Venda de produto não aparece no **Dashboard** | Quem vende no balcão não vê no caixa do dia | decisão | Dashboard |

> **D3 e D8/D11 são os únicos aqui que mudam o modelo, não a apresentação.** Os
> demais são rótulo, precisão ou fonte errada — corrigíveis sem tocar na
> estrutura. Vale separar as duas coisas na hora de executar.

---

# 🟢 Bloco 4 — Hardening

*Não impedem operar. Impedem crescer com segurança.*

| # | O que é | Estado |
|---|---|---|
| **SEC-001** | Conta de runtime das functions com `roles/editor` no projeto | 🔴 aberto — decisão do dono |
| **SEC-002** | Owner e admin de faturamento **únicos**, na mesma conta pessoal, projeto **fora de organização** | 🔴 aberto — é o único item **sem caminho de recuperação** |
| **App Check** | Ausente — qualquer um chama as functions de fora do app | 🔴 aberto |
| **Observabilidade** | Ninguém é avisado se uma function começar a falhar | 🔴 ausente |
| **Backup** | Sem rotina configurada | 🔴 ausente |
| **D15 / D16** | Lista de barbearias e índice de slugs **enumeráveis sem login** | 🟡 exposição comercial |
| **Storage rules** | Escritas e testadas, **nunca publicadas** — fora do escopo do deploy | 🟡 inofensivo até existir upload |
| **`DRY_RUN`** | `revisarAssinaturas` e `expurgarContasEncerradas` só registram o que fariam | 🟡 desligar exige ler o log uma vez |
| **P2-2, P2-3** | `rescheduleBooking` valida a jornada da loja, não a do barbeiro; nenhuma valida se o horário está **dentro** da jornada | 🟡 |
| **P2-6, P2-7, P2-8, P2-9** | Limite de barbearia por conta fora da transação · fidelidade sem gate de plano · reabrir conta cai em suspenso · expurgo varre collection group | 🟡 |
| **P2-1** | Todo o app do cliente exige login — a vitrine não é pública | 🟠 decisão de produto |

---

# A ordem que eu proporia

Não é a ordem dos blocos. É a que entrega valor comercial mais rápido com menor
risco de revalidação.

### ✅ Rodada 1 — as promessas falsas e os números que mentem
`D14 · P1-11 · D10 · D6 · P1-1 · P1-15 · D2 · D9 · P1-14 · P1-9`

**Executada em 17/08. Dez itens, dez verdes.** Relatório completo em
`RODADA-1.md`. Nenhum tocou o modelo. **A categoria FALSE PROMISE saiu do
produto** — que é o que separa "tem bug" de "mente".

Três coisas que a execução ensinou, e que valem para as próximas rodadas:

1. **A estimativa do backlog é chute até a varredura.** D14 estava orçado em
   "2 templates"; eram 15, com 30 ocorrências e uma família de promessa que
   ninguém tinha visto (avaliação de atendimento).
2. **Corrigir rótulo cria rótulo errado.** Três defeitos nasceram *dentro* desta
   rodada, e o que os pegou foi revalidar a tela inteira e somar as parcelas —
   não reler a linha alterada.
3. **Suíte verde não abriu tela nenhuma.** Os 680 testes provam a origem dos
   números. Se a frase nova cabe no cartão e faz sentido para quem lê, isso
   continua sendo o Day in the Life.

### ✅ Rodada 2 — a operação que falta
`G3-mínimo · D13 · G1 · G2 · P1-4 · P1-13`

**Todos fechados.** Os três fatos que faltavam existem: cliente, venda e
assinatura/cobrança. A Rodada 3 vai reconciliar o modelo financeiro sobre fato
que nasce no produto, e não sobre massa semeada.

G3 entrou na frente porque não estava no plano e é a chave dos três: o cliente de
balcão que D13 cria não tem conta, o mensalista de G2 aponta para um `clientId`,
e a venda de G1 também. Decisão arquitetural: **`clients/{uid}` para quem tem
conta, id gerado para o balcão** — mantém `bookings.clientId` com o significado
que já tinha (o uid) e as regras do Firestore valendo sem alteração.

D13 foi verificado **na tela**, não só por teste: dois atendimentos criados no
painel, cadastro reusado pelo WhatsApp, reserva aparecendo na agenda com
"Concluir" e "Cancelar". Três defeitos apareceram só aí — estão em
`RODADA-2.md`.

### Rodada 3 — o modelo financeiro
`D3 · D8/D11 · D4 · D7 · P1-7 · D1/D5`

Depois da rodada 2, porque G1 (venda de produto) muda o dado que alimenta D3 e
D4 — corrigir o cálculo antes de existir a entrada seria corrigir no escuro.

### Rodada 4 — segurança de plataforma
`SEC-001 · SEC-002 · App Check · observabilidade · backup · D15/D16`

Depende de decisão sua e de acesso ao console — não é trabalho de código.

### Em paralelo, quando houver executor
**Day in the Life.** Deixou de ser o último passo: é uma evidência de operação
que pode rodar sobre qualquer estado, e o que ela encontrar entra no backlog
como qualquer outro item.

---

## O que preservar de tudo que já foi feito

As seis regras da auditoria (`GATE-B.md` §6) continuam valendo na Fase 3 — em
especial esta, que muda como se escreve teste de correção financeira:

> **A expectativa se escreve antes da execução.** Ledger calculado à mão, sobre
> premissas de negócio validadas.

E a régua que organiza tudo:

> O sistema não pode afirmar que algo aconteceu quando não aconteceu. E não pode
> deixar de reconhecer algo que aconteceu.

---

*Backlog consolidado de toda a auditoria de 17/08/2026: 6 P0 (fechados), 16 P1,
12 P2, 16 achados D e 3 gaps de produto. Ordenado por impacto comercial.*
