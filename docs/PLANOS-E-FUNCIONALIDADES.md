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

| | **Agenda** | **Crescimento** | **Gestão** |
|---|---|---|---|
| **Preço** | R$ 59/mês | R$ 119/mês | R$ 229/mês |
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

**WhatsApp no plano de entrada.** É a decisão que mais importa. O Trinks cobra como add-on, o Booksy tem função limitada, e é a primeira coisa que o dono pergunta. Colocar no plano base transforma o argumento de venda inteiro em uma frase: *"no Trinks o WhatsApp é à parte; aqui vem no plano de R$ 59"*. O custo por conversa da Meta é baixo o bastante para absorver — e é o que faz o cliente ficar.

**Fidelidade no meio, não na entrada.** Fidelidade não resolve dor de quem está começando; resolve retenção de quem já tem base. Quem não tem 50 clientes recorrentes não usa. Deixar no meio dá um motivo concreto para subir.

**Mensalistas no meio.** É o argumento do BestBarbers ("barbearias com clube faturam 3× mais") e o principal motor de upgrade. Cobra R$ 60 a mais e destrava receita recorrente — o cálculo se paga com **um** mensalista.

**Financeiro no topo, inteiro.** DRE, projeção, ponto de equilíbrio e fechamento em PDF são o que nenhum concorrente entrega. Fragmentar isso entre planos dilui o diferencial: metade de um DRE não é meio produto, é um produto que não decide nada. Ou o dono tem a leitura completa do negócio, ou não tem.

**Números no meio, não no topo.** Ocupação, mapa de calor e clientes sumidos são operação — ajudam a encher a agenda, que é a dor do meio. Não confundir com o financeiro, que responde outra pergunta.

### 3.4 Sobre os preços

| Referência | Preço | Nosso posicionamento |
|---|---|---|
| Barbeiro.app Pro | R$ 59,90 | **Agenda R$ 59** — empata, mas com PWA de marca própria |
| Trinks (1–2 prof.) | ~R$ 76–110 + add-ons | **Crescimento R$ 119** — mais barato que Trinks com WhatsApp e clube somados |
| Barbeiro.app Enterprise | R$ 139,90 | entre Crescimento e Gestão |
| BestBarbers app exclusivo | R$ 299 | **Gestão R$ 229** — 23% abaixo, e com DRE que eles não têm |

**Sempre por barbearia, nunca por profissional.** Uma equipe de 5 paga R$ 300–500/mês no Trinks ou Booksy. Aqui paga R$ 229 no plano de cima. Esse é o comparativo que fecha venda de barbearia com equipe.

**Anual com 2 meses grátis** (−17%). Melhora o caixa e reduz churn no período em que o produto ainda está amadurecendo.

---

## 4. Minha opinião franca sobre a separação

**Três planos é o certo para agora.** Dois não dão espaço para upgrade; quatro confundem quem decide em 5 minutos no balcão.

**O risco real da proposta acima é o plano de entrada ser bom demais.** Com agenda, WhatsApp, PWA de marca própria, encaixe, política de cancelamento e caixa do dia por R$ 59, muita barbearia solo nunca precisa subir. Isso é bom para adoção e ruim para receita média.

Duas formas de tratar, e eu prefiro a primeira:

1. **Aceitar.** Barbearia solo não paga R$ 229 de qualquer jeito — vai para o concorrente de R$ 59. Melhor tê-la pagando R$ 59 e virando referência do que perdê-la. O plano de cima é vendido para quem tem equipe e sente a dor financeira, não para todo mundo.
2. Tirar o caixa do dia da entrada. **Não recomendo:** é o que faz o dono abrir o app todo dia, e sem hábito diário não há renovação.

**O que eu mudaria se os números mostrarem o contrário:** se depois de 30 clientes ninguém subir de plano, o problema não é o preço — é que o financeiro não está sendo *demonstrado*. Aí a correção é a prévia com cadeado mostrando o DRE real do dono, não encarecer a entrada.

**Uma coisa que não deve virar plano:** limite de agendamentos. É o corte que o TopAgenda usa (60/mês no grátis) e pune exatamente o cliente que está indo bem. Se precisar de um plano grátis para captação, limite por *tempo* (trial), não por *volume*.

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
