# Funcionalidades e planos

**Data:** 2026-08-02 · **Base:** inventário levantado do código, não da imaginação.

---

## 1. O que a plataforma tem hoje

17 telas, 10 Cloud Functions, 13 políticas configuráveis por barbearia e 14 funções de análise financeira. Cada linha abaixo existe e funciona — o que ainda não existe está na seção 2.

### 1.1 Agenda e atendimento

| Funcionalidade | Onde | Estado |
|---|---|---|
| Agendamento em 4 passos (serviço → dia → horário → pagamento) | `/agendar` | ✅ |
| Motor de slots com jornada própria, antecedência mín./máx., dias fechados | `lib/slots.ts` | ✅ |
| Soma de durações — combo de 60 min não cabe no último slot de 30 | `lib/slots.ts` | ✅ |
| Pagamento flexível: Pix, cartão ou no salão | `/agendar` | ⚠️ escolha sim, cobrança não |
| Solicitação de encaixe em horário ocupado | `/agendar` | ✅ (aprovação manual) |
| Agenda do dia com KPIs derivados das reservas | `/painel` | ✅ |
| Marcar atendimento como concluído | `/painel` | ✅ |
| Aprovar/recusar encaixe abrindo o WhatsApp com texto pronto | `/painel` | ✅ |
| Reagendar com janela e limite por reserva | `/reservas` | ✅ |
| Cancelar com devolução calculada pela política | `/reservas` | ✅ cálculo; estorno não |
| Histórico de atendimentos do cliente | `/reservas` | ✅ |

### 1.2 Financeiro

| Funcionalidade | Onde | Estado |
|---|---|---|
| Caixa do dia por meio de pagamento, derivado das reservas | `/painel` | ✅ |
| Fluxo de caixa dia a dia com totalizador | `/painel/financeiro/fluxo-caixa` | ✅ |
| Lançamento de despesas, com recorrente × eventual | `/painel/financeiro/despesas` | ✅ |
| **DRE com margem de contribuição, custo fixo × variável e imposto** | `/painel/financeiro/dre` | ✅ |
| **Ponto de equilíbrio calculado** | `/painel/financeiro` | ✅ |
| **Projeção de caixa de 30 dias**, separando confirmado de estimado | `/painel/financeiro/projecao` | ✅ |
| Simulador de cenário de crescimento | `/painel/financeiro/dre` | ✅ |
| Taxas de gateway por método, para comparação | `/painel/financeiro` | ✅ referência |
| Rateio de comissão sobre o lucro bruto (%barbeiro + %barbearia = 100) | `lib/business-rules.ts` | ✅ |

### 1.3 Indicadores

| Funcionalidade | Onde | Estado |
|---|---|---|
| Faturamento, atendimentos, ticket médio, ocupação, no-show | `/painel/numeros` | ✅ |
| Comparação com o mês anterior | `/painel/numeros` | ✅ |
| Top serviços, com rateio de combo | `/painel/numeros` | ✅ |
| Mapa de calor dia × horário | `/painel/numeros` | ✅ |
| **Recorrência por hábito do cliente**, não por prazo fixo | `/painel/numeros` | ✅ |
| Insights derivados do próprio mapa de calor | `/painel/numeros` | ✅ |

### 1.4 Mensalistas, loja e fidelidade

| Funcionalidade | Onde | Estado |
|---|---|---|
| Catálogo de planos e checkout | `/planos` | ⚠️ sem cobrança |
| Lista de assinantes com MRR cobrável × contratado | `/painel/mensal` | ✅ |
| Régua de cobrança D-5 → D+5 | `/painel/mensal` | ⚠️ visual |
| Produtos com estoque e alerta de mínimo | `/painel/loja` | ✅ |
| Precificação com comissão e imposto na prévia | `/painel/loja` | ✅ |
| **Fidelidade por transação**, com crédito automático e resgate | `functions/loyalty.ts` | ✅ |

### 1.5 Plataforma

| Funcionalidade | Estado |
|---|---|
| Multi-barbearia com isolamento provado por 37 testes de regra | ✅ |
| Subdomínio próprio → PWA instalável com ícone e nome da barbearia | ✅ |
| Cadastro self-service com slug atômico e e-mail verificado | ✅ |
| Onboarding guiado de 4 passos, com prévia da grade ao vivo | ✅ |
| Trial de 7 dias | ✅ |
| Login por e-mail, Google e SMS | ⚠️ SMS depende do provider |
| App instalável, funciona offline no que já carregou | ✅ |
| 13 políticas configuráveis por barbearia | ✅ |
| Catálogo dos 16 templates de WhatsApp validados contra a Meta | ⚠️ sem envio |

---

## 2. O que ainda não existe

Nenhum destes pode ser vendido hoje:

| Faltando | Impacto |
|---|---|
| **Envio de WhatsApp** (client, webhook, gatilhos) | É o diferencial nº 1 do PRD |
| **Gateway de pagamento** | Sem ele não há pagamento antecipado nem cobrança de mensalista |
| **Estorno via API** | O cancelamento calcula a devolução e ninguém devolve |
| **Cobrança do próprio SaaS** | Sem isso, trial não vira receita |
| NFS-e | Critério de compra recorrente; dois concorrentes têm |
| Fechamento mensal em PDF | Materializa a vantagem financeira |
| Fila de espera | Objeção contra o AppBarber |
| Multi-profissional | O rateio já está pronto; falta agenda por profissional |

---

## 3. A separação por planos

### 3.1 O princípio

**O que corta não é "quanto", é "qual dor".** Cortar por volume (X agendamentos/mês) pune o cliente que está crescendo — exatamente quem você quer manter. Cortar por profissional é o erro do Trinks e do Booksy, e é o argumento de venda mais forte contra eles.

Corte por **camada de necessidade**:

1. Toda barbearia precisa **parar de perder horário** → plano de entrada
2. Algumas querem **receita previsível e mais faturamento** → plano do meio
3. Poucas querem **enxergar o negócio como empresa** → plano de cima

### 3.2 A proposta

> **Revisão de 02/08 — os preços subiram.** A versão anterior era R$ 59/119/229,
> ancorada no Barbeiro.app. Isso é *price-taking*: define o preço pelo
> concorrente mais barato em vez de pelo valor entregue. Ver seção 4.

| | **Agenda** | **Crescimento** | **Gestão** |
|---|---|---|---|
| **Preço** | R$ 97/mês | R$ 197/mês | R$ 297/mês |
| **A dor** | "perco horário e cliente some" | "quero faturar mais e ter previsibilidade" | "não sei se estou ganhando dinheiro" |
| Agendamento online 24h | ✅ | ✅ | ✅ |
| PWA com sua marca e subdomínio | ✅ | ✅ | ✅ |
| Motor de encaixe | ✅ | ✅ | ✅ |
| Política de cancelamento configurável | ✅ | ✅ | ✅ |
| **WhatsApp** (confirmação, lembrete, encaixe) | ✅ | ✅ | ✅ |
| Caixa do dia | ✅ | ✅ | ✅ |
| Lançamento de despesas | ✅ | ✅ | ✅ |
| Fidelidade | — | ✅ | ✅ |
| **Mensalistas com cobrança recorrente** | — | ✅ | ✅ |
| Loja, estoque e comissões | — | ✅ | ✅ |
| Números, mapa de calor, recorrência | — | ✅ | ✅ |
| Pagamento antecipado (Pix/cartão) | — | ✅ | ✅ |
| **DRE gerencial** | — | — | ✅ |
| **Projeção de caixa** | — | — | ✅ |
| **Ponto de equilíbrio e simulador** | — | — | ✅ |
| Fechamento mensal em PDF | — | — | ✅ |
| Multi-profissional e comissões por barbeiro | — | — | ✅ |
| NFS-e | — | — | ✅ |

### 3.3 Por que essas linhas, e não outras

**WhatsApp no plano de entrada.** É a decisão que mais importa. O Trinks cobra como add-on, o Booksy tem função limitada, e é a primeira coisa que o dono pergunta. Colocar no plano base transforma o argumento de venda inteiro em uma frase: *"no Trinks o WhatsApp é à parte; aqui vem já no plano de entrada"*. UTILITY custa uma fração de MARKETING, e é o que faz o cliente ficar. Quem paga a Meta é decisão à parte — ver [`WHATSAPP-ARQUITETURA.md`](./WHATSAPP-ARQUITETURA.md) §6.

**Fidelidade no meio, não na entrada.** Fidelidade não resolve dor de quem está começando; resolve retenção de quem já tem base. Quem não tem 50 clientes recorrentes não usa. Deixar no meio dá um motivo concreto para subir.

**Mensalistas no meio.** É o argumento do BestBarbers ("barbearias com clube faturam 3× mais") e o principal motor de upgrade. Custa R$ 100 a mais e destrava receita recorrente — se paga com **um** mensalista de R$ 149.

**Financeiro no topo, inteiro.** DRE, projeção, ponto de equilíbrio e fechamento em PDF são o que nenhum concorrente entrega. Fragmentar isso entre planos dilui o diferencial: metade de um DRE não é meio produto, é um produto que não decide nada. Ou o dono tem a leitura completa do negócio, ou não tem.

**Números no meio, não no topo.** Ocupação, mapa de calor e clientes sumidos são operação — ajudam a encher a agenda, que é a dor do meio. Não confundir com o financeiro, que responde outra pergunta.

### 3.4 Sobre os preços

Barbearia de referência: **R$ 12.469/mês**, 168 atendimentos, ticket de R$ 74, 7 no-shows por mês (R$ 518 perdidos).

| Preço | % da receita | Se paga com |
|---|---|---|
| R$ 97 | 0,78% | 1,3 no-show evitado |
| R$ 197 | 1,58% | 2,7 no-shows — ou **1 mensalista** (R$ 149/mês) |
| R$ 297 | 2,38% | 4 no-shows |

Gastar 1–2% do faturamento no sistema que roda a operação inteira é normal e defensável. A R$ 59 estávamos capturando 0,47% — menos que o valor de **um único** no-show evitado por mês.

| Referência | Preço | Nosso posicionamento |
|---|---|---|
| Barbeiro.app Pro | R$ 59,90 | **Agenda R$ 97** — 60% acima, com PWA de marca própria e WhatsApp incluso |
| Trinks (1–2 prof.) | ~R$ 76–110 + add-ons | **Crescimento R$ 197** — com WhatsApp e clube somados, o Trinks passa disso |
| BestBarbers app exclusivo | R$ 299 | **Gestão R$ 297** — empata, e entrega DRE que eles não têm |

**Sempre por barbearia, nunca por profissional.** Uma equipe de 5 paga R$ 300–500/mês no Trinks ou Booksy. Aqui paga R$ 297 no plano de cima, e é o comparativo que fecha venda de barbearia com equipe.

**Anual com 2 meses grátis** (−17%). Melhora o caixa e reduz churn enquanto o produto amadurece.

**Preço de fundador:** as primeiras 20 barbearias pagam 50% por 12 meses, travado. Isso compra adoção e referência **sem destruir a âncora** — descontar é fácil e gera boa vontade; subir preço de quem já é cliente churna.

---

## 4. Por que os preços subiram — e o que eu erraria de novo

**O erro da primeira proposta foi ancorar no concorrente.** Defini R$ 59 porque o Barbeiro.app Pro custa R$ 59,90. Isso entra numa guerra de preço com quem já tem base maior e custo marginal menor — e ainda comunica que somos "o outro barato", não o produto que enxerga o negócio.

O que corrigi:

1. **Âncora no valor, não no concorrente.** Um no-show custa R$ 74. O produto que evita no-show não pode custar menos que um no-show.
2. **Paramos de dar de graça o que o líder cobra R$ 299.** O PWA com marca própria entrega ~90% do valor do app white-label do BestBarbers. Cobrar R$ 59 por isso é entregar duas vezes o diferencial: a função e a margem.
3. **A assimetria de errar.** Baixar preço é fácil e gera boa vontade; subir preço de quem já é cliente churna. Com pouca informação, errar para cima é reversível — errar para baixo, não. Daí o preço de fundador em vez de lista barata.

### O que continua sendo risco

**O plano de entrada ainda pode ser bom demais.** Com agenda, WhatsApp, PWA de marca própria, encaixe e caixa do dia por R$ 97, barbearia solo talvez nunca precise subir.

Continuo recomendando **aceitar**: ela não pagaria R$ 297 de jeito nenhum, iria para o concorrente. Melhor tê-la a R$ 97 e virando referência. O plano de cima vende para quem tem equipe e sente a dor financeira.

**Se depois de 30 clientes ninguém subir**, o problema não é preço — é que o financeiro não está sendo *demonstrado*. A correção é a prévia com cadeado mostrando o DRE real do dono, não encarecer a entrada.

### O que não deve virar plano

**Limite de agendamentos.** É o corte do TopAgenda (60/mês no grátis) e pune exatamente o cliente que está indo bem. Se precisar de captação, limite por *tempo* (trial), não por *volume*.

### O que ainda não dá para saber

Estes preços são a melhor hipótese com a informação de hoje, não uma conclusão. Faltam três coisas:

- **O produto não é vendável ainda.** Sem envio de WhatsApp e sem gateway, o plano de entrada não entrega o que a tabela promete. Preço fechado antes disso é preço de algo que não existe.
- **Custo variável do WhatsApp desconhecido.** A Meta cobra por mensagem, e a partir de outubro de 2026 passa a cobrar também as respostas de serviço. Sem histórico de consumo, não dá para saber quanto do R$ 97 sobra. Ver [`WHATSAPP-ARQUITETURA.md`](./WHATSAPP-ARQUITETURA.md) §6.
- **Uma conversa que vale mais que a planilha:** perguntar ao dono da O Siqueira quanto ele pagaria, e quanto ele acha que perde por mês com horário furado. A resposta dele vale mais que qualquer comparação com o Trinks.

---

## 5. Como isso vira código

`TenantFeatures` já existe e ainda não é consumido por nenhuma tela — o corte está totalmente em aberto. A proposta acima pede um ajuste:

```ts
export type TenantFeatures = {
  whatsapp: boolean;        // todos
  loyalty: boolean;         // crescimento+
  subscriptions: boolean;   // crescimento+
  store: boolean;           // crescimento+
  insights: boolean;        // crescimento+  ← novo (tela Números)
  advancedFinance: boolean; // gestão (DRE, projeção, PDF)
  multiProfessional: boolean; // gestão      ← novo
  invoicing: boolean;       // gestão (NFS-e) ← novo
};
```

**Regra de exibição:** tela de plano superior **não some — aparece com cadeado e prévia dos números reais do dono**. Esconder faz o cliente não saber que existe; mostrar bloqueado com o próprio dado é o que converte.

Durante o trial de 7 dias, **tudo liberado** — o dono precisa ver o DRE dele antes de escolher.

---

## 6. Referências

- [`COMPARATIVO-MERCADO-2026-08.md`](./COMPARATIVO-MERCADO-2026-08.md) — preços e posicionamento dos concorrentes
- [`ESTRATEGIA-SAAS.md`](./ESTRATEGIA-SAAS.md) — o que é personalizável e o que é da plataforma
- [`ONBOARDING-SELF-SERVICE.md`](./ONBOARDING-SELF-SERVICE.md) — trial e conversão
