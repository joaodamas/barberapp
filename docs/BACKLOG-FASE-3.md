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
| Regras e autorização | suíte de isolamento (182) |
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
| **D13** | **O dono não consegue criar uma reserva.** Nenhuma das 8 telas do painel agenda | Boa parte dos horários chega por telefone e WhatsApp. O blueprint prevê `origin: "balcao"` e `uid: null` — e não descreve como a reserva desse cliente nasce | **alto** | agenda · concorrência · Day in the Life |
| **G1** | **Não há tela de venda de produto.** `inventory_movements` não é escrita por ninguém | Receita de loja, CMV e comissão de produto são estruturalmente zero. A Loja é um cadastro com simulador | médio | ledger · 6 visões · DRE |
| **G2** | **Não há cadastro de mensalista.** `subscriptions` não é escrita por ninguém | A tela Mensal nunca recebe dado, e a régua D-5→D+5 é campo morto. Mensalista está na matriz de planos como recurso vendido | médio | ledger · financeiro |
| **G3** | **Não há ficha de cliente.** O blueprint especifica `clients/{id}` como ❌ criar | Sem ela não há reativação, aniversário, régua de faltas nem histórico por pessoa. É a base do Bloco 3 do blueprint | alto | — |
| **P1-4** | Remarcar oferece horários **já ocupados por outros clientes** — a tela usa cálculo local que só enxerga as reservas do próprio cliente | O cliente tenta remarcar e leva erro. É o defeito que `availableSlots` corrigiu no agendar e não foi aplicado aqui | baixo | agenda |
| **P1-13** | O limite de 2 remarcações vive num `useState` — zera com F5 | A tela anuncia uma regra que não existe | baixo | reservas |
| **P2-4** | Jornada por barbeiro é lida pelo servidor e **não tem interface** | Folga e horário próprio são funcionalidade inalcançável | médio | agenda |
| **D17** | **Não existe avaliação de atendimento.** Nem nota, nem estrela, nem review — em nenhuma camada | A régua pós-atendimento perde o gatilho de reputação, e a barbearia não tem como saber o que o cliente achou. A promessa já saiu do template (Rodada 1); a capacidade continua ausente | médio | catálogo de templates · pós-atendimento |

---

# 🟡 Bloco 3 — Modelo financeiro

*Decisões de modelagem. Mudam o que o produto afirma sobre o negócio.*

| # | O que é | Consequência | Custo | Revalidar |
|---|---|---|---|---|
| **D3** | **CMV soma as compras do período**, não o custo do que foi vendido | Num mês de reposição, o lucro da loja despenca sem nada ter piorado. Cresce com o uso | alto | ledger · DRE · 6 visões |
| **D8 / D11** | **Resultado e caixa não se separam.** Não existe, em lugar nenhum, um número que responda *"quanto sobrou no caixa"* | O Fluxo de Caixa é faturamento diário com nome de fluxo de caixa. É o núcleo da promessa "gestão financeira" | alto | ledger · 6 visões · Fluxo |
| **D4** | A venda de produto entra no caixa **toda como dinheiro** | O caixa por meio de pagamento não fecha com a realidade | médio | ledger · Fluxo |
| **D7** | Venda de produto **não gera taxa de maquininha** | A taxa de cartão sobre produto some do custo | médio | ledger · DRE |
| ~~**D2**~~ | ~~Ticket médio divide receita **com produtos** por atendimentos de serviço~~ | ✅ **fechado na Rodada 1.** `avgTicket` mede serviço; os R$ 85 viraram `avgTicketComProduto` | — | Números |
| **P1-7** | A Loja calcula comissão e imposto com a **constante da plataforma**, não com a política da barbearia | Quem combinou 50/50 vê 40% | baixo | Loja |
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

### Rodada 2 — a operação que falta
`D13 · G1 · G2 · P1-4 · P1-13`

O dono passa a poder agendar, vender produto e cadastrar mensalista. É a rodada
que muda a resposta à pergunta *"isto é uma agenda ou uma plataforma de
gestão?"*. Revalidação: agenda, concorrência e o Day in the Life.

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
