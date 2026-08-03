# Projeção multi-período e insights de mercado

**Data:** 2026-08-03 · **Base:** [`AUDITORIA-FINANCEIRA-2026-08-03.md`](./AUDITORIA-FINANCEIRA-2026-08-03.md)
**O que é:** especificação da projeção mensal → trimestral → semestral → anual, e o conjunto de insights que o mercado justifica e o produto ainda não calcula.

---

## Parte I — Projeção multi-período

### 1. Onde a projeção está hoje

`projecaoDeCaixa` faz 30 dias, granularidade diária, e responde uma pergunta útil: *"em que dia dos próximos 30 meu caixa aperta?"*

**Três defeitos a impedem de esticar** — todos medidos na auditoria:

| # | Defeito | Efeito ao esticar |
|---|---|---|
| **F5** | Assinatura casa com **uma** data (`nextCharge === date`) | Trimestre perde 2/3 do MRR; ano perde 11/12 |
| **F7** | `diasNoMes = Number(fim.slice(-2))` | Trimestre é tratado como mês de 30 dias |
| **F6** | Vencimento pelo dia-do-mês literal | Despesa de dia 31 some em 4 meses do ano |

E dois que distorcem qualquer horizonte:

| # | Defeito | Efeito |
|---|---|---|
| **F2** | Não desconta custo variável nem imposto | Superestima o resultado em ~26% da receita |
| **F18** | Aprende só com o mês corrente | No dia 2 do mês, projeta em cima de 1 dia de dado |

**Nenhum recurso novo deve ser construído antes destes cinco.** Esticar o horizonte sobre a base atual multiplica o erro pelo horizonte.

---

### 2. A decisão que define o desenho: granularidade acompanha o horizonte

Projeção diária de 365 dias é ruído com aparência de precisão. O erro por dia se acumula, e ninguém decide o dia 217 do ano.

| Horizonte | Granularidade | Pergunta que responde |
|---|---|---|
| **30 dias** | dia | "Em que dia meu caixa aperta?" |
| **Trimestre (3 meses)** | mês | "Dá pra contratar o segundo barbeiro?" |
| **Semestre (6 meses)** | mês | "Dá pra assinar 6 meses de aluguel maior?" |
| **Ano (12 meses)** | mês | "Quanto essa barbearia gera em 12 meses?" |

Cada horizonte é uma **decisão diferente**, não a mesma tela esticada. A interface deve mudar de forma: 30 dias é tabela de dias; os demais são 3 a 12 linhas de mês, com a coluna de premissas visível.

---

### 3. O modelo de cálculo

#### 3.1 Receita

**Curto prazo (dias 1–30)** — o que existe hoje, corrigido:

```
receita(dia) = max(confirmado(dia), média_histórica(dia_da_semana))      ← F11
média_histórica ← últimos 60–90 dias, não só o mês corrente             ← F18
```

**Longo prazo (mês 2 em diante):**

```
receita(mês) = base_mensal × sazonalidade(mês) × (1 + crescimento)
```

Onde:

| Termo | Origem |
|---|---|
| `base_mensal` | média dos últimos 3 meses fechados de receita de balcão |
| `sazonalidade(mês)` | índice do §4 — próprio quando houver 12+ meses; setorial antes disso |
| `crescimento` | **0 por padrão.** Só entra se o dono mexer no cenário |

> **Crescimento embutido é a armadilha clássica de projeção.** Uma projeção que cresce sozinha sempre fecha positiva e nunca serve para decidir. O padrão é crescimento zero; o otimismo é uma alavanca que o dono move conscientemente — e o simulador de cenário do DRE já tem exatamente essa mecânica pronta.

**Mensalistas — corrige F5:**

```
receita_recorrente(mês) = Σ assinantes_ativos.price × (1 − churn)^n
```

`churn` mensal padrão 0, exibido como premissa editável. Com histórico, deriva do próprio dado (cancelamentos ÷ base).

#### 3.2 Custos — corrige F2

A projeção precisa da mesma cadeia do DRE, não de "receita menos despesa fixa":

```
custo_variável(mês) = receita(mês) × (1 − margem_contribuição_%)
custo_fixo(mês)     = Σ despesas recorrentes + pró-labore
resultado(mês)      = receita − custo_variável − custo_fixo − imposto
```

`margem_contribuição_%` vem do histórico real — **depois de F1 corrigido**. Projetar com a margem de 94,6% de hoje produz uma previsão fantasiosa, com a agravante de parecer fundamentada.

**Despesa fixa por competência mensal, não por dia-do-mês** — resolve F6 de graça: no horizonte mensal, a despesa recorrente é simplesmente o total do mês.

#### 3.3 Saída

```ts
export type MesProjetado = {
  mes: string;                  // "2026-09"
  receitaServicos: number;
  receitaRecorrente: number;
  receitaTotal: number;
  custoVariavel: number;
  margemContribuicao: number;
  custoFixo: number;
  imposto: number;
  resultado: number;
  saldoAcumulado: number;
  /** O que é fato e o que é premissa — precisa aparecer na tela. */
  confianca: "confirmado" | "historico" | "setorial";
  fatorSazonal: number;
};
```

**`confianca` não é enfeite.** É a diferença entre um produto financeiro honesto e um gerador de números bonitos:

| Valor | Significado | Como a tela mostra |
|---|---|---|
| `confirmado` | reservas e cobranças já marcadas | sólido |
| `historico` | média do próprio negócio | tracejado |
| `setorial` | índice de mercado — o negócio ainda não tem histórico | tracejado + aviso "estimativa de mercado, não sua" |

Uma barbearia com 2 meses de uso deve ver o ano inteiro marcado como `setorial`, com o aviso. Apresentar isso como previsão dela é o erro que destrói a confiança no produto inteiro.

---

### 4. Sazonalidade — os índices e a honestidade sobre eles

A pesquisa de mercado dá um padrão consistente, mas **não uma série estatística**:

| Achado | Fonte | Confiança |
|---|---|---|
| Dezembro chega a **+30%** de demanda; intervalo de retorno cai de 20–30 para 15–20 dias | imprensa setorial e relato de operadores | média |
| **Janeiro e fevereiro** são os meses mais fracos do varejo (IPTU, matrícula, pós-festas) | varejo geral | média |
| **Agosto** cresce até **+25%** na semana do Dia dos Pais | imprensa setorial | média |
| Maio (Dia das Mães) aquece beleza, menos em barbearia | varejo geral | baixa |
| Clube de assinatura é vendido explicitamente como **anti-sazonalidade** | BestBarbers, imprensa | alta (é a tese deles) |

**Índice setorial proposto** — ponto de partida, não verdade:

| Mês | Índice | Racional |
|---|---|---|
| Jan | 0,85 | mês fraco do varejo |
| Fev | 0,85 | mês fraco; carnaval encurta |
| Mar | 0,95 | normalização |
| Abr | 1,00 | base |
| Mai | 1,05 | Dia das Mães |
| Jun | 1,00 | — |
| Jul | 0,95 | férias, viagem |
| Ago | 1,10 | Dia dos Pais |
| Set | 1,00 | — |
| Out | 1,00 | — |
| Nov | 1,05 | Black Friday, aquecimento |
| Dez | 1,30 | pico claro do setor |

Soma ≈ 12,1 — ligeiramente acima de neutro, coerente com um setor em crescimento. **Normalizar para 12,0** ao aplicar, para que a sazonalidade redistribua sem inventar receita.

**Três regras de uso, inegociáveis:**

1. **Substituir por índice próprio assim que houver 12 meses.** O índice de uma barbearia de bairro comercial (que despenca em janeiro) não é o de uma de bairro residencial (que sobe).
2. **Sempre rotulado.** Enquanto for setorial, a tela diz que é de mercado.
3. **Nunca aplicar no horizonte de 30 dias.** No curto prazo o dado real do próprio negócio é melhor que qualquer índice.

> **Esta é a oportunidade de dado proprietário do produto.** Com 50 barbearias enviando dado real, o índice setorial deixa de ser recorte de reportagem e vira o **primeiro índice de sazonalidade de barbearia do Brasil** — por região, inclusive. Nenhum concorrente tem isso, é um ativo que melhora sozinho com a base de clientes, e é conteúdo de imprensa. Vale desenhar a coleta agora, mesmo que a agregação só entre no ano que vem.

---

### 5. Interface

**Seletor de horizonte** no topo: `30 dias · Trimestre · Semestre · Ano`.

**KPIs por horizonte** (corrigindo a mistura apontada em F2):

| KPI | 30 dias | Trimestre+ |
|---|---|---|
| Resultado projetado | ✅ | ✅ |
| Ponto mais apertado | ✅ dia | ✅ mês |
| Receita confirmada × estimada | ✅ | — |
| Menor mês do período | — | ✅ |
| Total de custo fixo comprometido | — | ✅ |

**Bloco de premissas, sempre visível** — não escondido atrás de um ícone:

```
Premissas desta projeção
  Base de receita      média dos últimos 3 meses (R$ 12.180/mês)
  Crescimento          0% ao mês              [ajustar]
  Sazonalidade         índice de mercado ⚠     [usar meu histórico — precisa de 12 meses]
  Churn de mensalista  0% ao mês              [ajustar]
  Margem de contrib.   58% (seu histórico)
```

Projeção sem premissa visível é adivinhação com formatação bonita. E o bloco de premissas é o que torna a tela **defensável numa conversa com o contador** — que é o momento em que o produto ganha ou perde o cliente.

---

### 6. Ordem de construção

| Etapa | Entrega | Depende de |
|---|---|---|
| 1 | Correções P0 e P1 da auditoria | — |
| 2 | `diasNoPeriodo` + `periodoDeMeses(n)` | F7 |
| 3 | `projecaoMensal(meses)` com custo variável e imposto | F1, F2, F5, F6 |
| 4 | Índice de sazonalidade setorial + flag `confianca` | etapa 3 |
| 5 | Seletor de horizonte e bloco de premissas | etapa 4 |
| 6 | Índice próprio quando houver 12 meses | etapa 5 + tempo |

**Etapas 1 e 2 não são opcionais nem adiáveis.** São a diferença entre estender um motor correto e multiplicar um erro por 12.

---

## Parte II — Insights de mercado

O que a pesquisa mostra que o mercado faz, o que o produto calcula hoje, e onde está a lacuna que vale dinheiro.

### 7. Comissão: o modelo atual é mais simples que o mercado

**O que o mercado pratica:**

| Prática | Faixa |
|---|---|
| Comissão sobre faturamento do profissional | **35% a 60%** |
| Iniciante / aprendiz | 25–35% |
| Intermediário | 35–45% |
| Sênior / especialista | 45–55% |
| Barbeiro com carteira própria | 50–60% |
| **Por tipo de serviço** | corte 40% · barba 50% · hidratação 30% |
| **Escalonada por meta** | até R$ 2.000 → 40% · R$ 2–4 mil → 45% · acima → 50% |

**O que o produto tem:** um único `commissionSplit { barberPct: 40, shopPct: 60 }`, aplicado **só ao lucro da loja** (F1).

**As três lacunas, em ordem de valor:**

1. **Comissão sobre serviço** — não é melhoria, é o defeito F1. Sem isso o DRE de qualquer barbearia com equipe está errado.
2. **Comissão por tipo de serviço** — prática comum e citada em todos os guias do setor. Exige `commissionPct` opcional em `ServiceDoc`, com fallback no rateio do tenant. Barato de construir, e é objeção direta de venda para barbearia com equipe.
3. **Comissão escalonada por meta** — o modelo que mais motiva equipe e o mais trabalhoso de calcular na mão. **É o que faz o dono de 4 cadeiras trocar de sistema.** Exige faixas por profissional e apuração no fechamento.

> **Leitura estratégica:** o [comparativo](./COMPARATIVO-MERCADO-2026-08.md) posiciona o plano "Gestão" (R$ 297) para quem tem equipe. Hoje o produto **não calcula a comissão de equipe** — que é a principal dor desse plano. É a maior distância entre o que a tabela de preços promete e o que o código faz.

### 8. Serviços e produtos: o insight que ninguém entrega

**Preços praticados em 2026:**

| Serviço | Faixa |
|---|---|
| Corte simples | R$ 35–80 |
| Corte + barba | R$ 50–120 |
| Barba | R$ 30–60 |
| Infantil | R$ 25–50 |
| Adicionais (hidratação, sobrancelha, relaxamento) | R$ 20–50 |
| **Ticket médio do setor** | **R$ 70–85** |

**Produtos:** margem de **50% a 100%** sobre o custo; barbearias que trabalham bem a venda adicionam **10% a 20%** ao faturamento mensal.

**O que o produto calcula:** `topServicos` — serviços mais vendidos por receita, com rateio de combo. Correto e útil.

**A lacuna que vale mais que tudo nesta seção:**

> ### Receita por hora de cadeira, por serviço.
> O produto já tem `durationMin` em `ServiceDoc` e o valor em cada reserva. **Ninguém no mercado cruza os dois.**

```
Barba          R$  40 ÷ 30 min  =  R$  80/hora
Corte          R$  50 ÷ 30 min  =  R$ 100/hora
Corte + barba  R$  90 ÷ 60 min  =  R$  90/hora
Hidratação     R$  35 ÷ 45 min  =  R$  47/hora   ← ocupa cadeira e rende menos
```

Isso reordena o negócio inteiro. O combo, que **parece** o melhor serviço porque tem o maior ticket, pode render menos por hora que o corte seco. Em agenda cheia — que é quando o dono acha que está indo bem — **o mix errado é a diferença entre lucro e cansaço**.

Nenhum concorrente entrega. É calculável hoje, com o dado que já existe, e é o insight mais vendável que a auditoria encontrou.

**Dois outros, mais baratos:**

- **Attach rate de produto:** `% de atendimentos com venda de produto`. Com margem de 50–100% e potencial de 10–20% do faturamento, saber que o índice é 4% é acionável na hora.
- **Migração de mix:** o combo cresceu ou caiu como % dos atendimentos? Responde se o aumento de faturamento veio de preço, de volume ou de mix — as três coisas que o dono confunde ([roteiro A6](./marketing/ROTEIROS-VIDEOS.md)).

### 9. Frequência e recorrência

| Achado | Fonte |
|---|---|
| Público masculino visita a barbearia **2 a 3× por mês** | Sebrae |
| Em dezembro o intervalo cai de 20–30 para 15–20 dias | setorial |
| Clube de assinatura é vendido como troca de imprevisibilidade por caixa previsível | BestBarbers |

**O que o produto tem:** `recorrenciaDeClientes` classifica por hábito individual (`em_dia` / `esfriando` / `sumiu`) — genuinamente melhor que o padrão de mercado, que usa prazo fixo.

**As lacunas:**

1. **Intervalo médio agregado, com tendência.** "Seus clientes voltavam a cada 24 dias; agora a cada 31." É o **primeiro sinal de perda de base**, aparece meses antes da queda de faturamento, e é invisível no faturamento mensal.
2. **Valor do cliente ao longo do tempo:** `ticket × (365 ÷ intervalo médio)`. Transforma "perdi um cliente" em "perdi R$ 1.300 por ano" — a conta do [roteiro A3](./marketing/ROTEIROS-VIDEOS.md), hoje feita à mão.
3. **Mensalista × avulso:** o assinante volta mais? Gasta mais em produto? É a única prova de que o clube vale a pena, e o argumento de upgrade do plano do meio.

### 10. Resumo — o que construir e por quê

| Insight | Dado existe? | Esforço | Valor |
|---|---|---|---|
| **Receita por hora de cadeira, por serviço** | ✅ `durationMin` + valor | baixo | **muito alto — ninguém tem** |
| Ponto de equilíbrio em R$ e em atendimentos (F8) | ✅ | baixo | **muito alto — é a promessa do conteúdo** |
| Comissão sobre serviço (F1) | ✅ | médio | **crítico — hoje o DRE está errado** |
| Intervalo médio de retorno, com tendência | ✅ | baixo | alto |
| Attach rate de produto | ✅ | baixo | alto |
| Valor anual do cliente | ✅ | baixo | alto |
| Comissão por tipo de serviço | ⚠️ falta campo | médio | alto (venda p/ equipe) |
| Mensalista × avulso | ✅ | médio | alto (upgrade de plano) |
| Comissão escalonada por meta | ❌ falta modelo | alto | alto (plano de cima) |
| Sazonalidade própria | ⚠️ precisa de 12 meses | médio | médio, cresce com o tempo |
| Índice setorial agregado da plataforma | ❌ precisa de base | alto | **estratégico — ativo proprietário** |

**Os quatro primeiros usam dado que já está no banco e são de esforço baixo a médio.** Entregam a diferença entre "mais um painel" e o único sistema que diz ao dono qual serviço dele dá lucro por hora de cadeira.

---

## Fontes

**Comissão e precificação**
- [6 modelos de comissão para barbeiros — Barba na Hora](https://barbanahora.com.br/blog/6-modelos-de-comissao-para-barbeiros/)
- [Como calcular comissão de barbeiro — BarberCode](https://barbercode.com.br/como-calcular-comissao-de-barbeiro/)
- [Como Calcular Comissão de Barbeiro — Barbeiro.app](https://www.barbeiro.app/blog/como-calcular-comissao-barbeiro)
- [Preço Corte de Cabelo Masculino 2026 — Opero](https://operosistemas.com.br/blog/gestao/quanto-cobrar-corte-cabelo-masculino-2026)
- [Quanto Cobrar na Barbearia? Guia de Precificação 2026 — HubBarber](https://hubbarber.com.br/blog/quanto-cobrar-servicos-barbearia-guia-precificacao)
- [Tabela de Preços para Barbearia 2026 — Barbeiro.app](https://www.barbeiro.app/blog/tabela-precos-barbearia-2026)

**Sazonalidade**
- [Ano novo "na régua": fim de ano tem alta na procura por barbearias — Metrópoles](https://www.metropoles.com/sao-paulo/ano-novo-na-regua-fim-de-ano-tem-alta-na-procura-por-barbearias)
- [Como preparar sua barbearia para um dezembro mais lucrativo — Blog Trinks](https://blog.trinks.com/como-preparar-sua-barbearia-para-um-dezembro-mais-lucrativo/)
- [BR Barbearia projeta aumentar 25% o faturamento no Dia dos Pais](https://economianegocios.com.br/2025/08/06/br-barbearia-projeta-aumentar-em-25-o-seu-faturamento-com-a-chegada-do-dia-dos-pais/)
- [O que é sazonalidade e como lidar com ela — Locaweb](https://www.locaweb.com.br/blog/temas/como-vender-mais/sazonalidade-entenda-como-ela-afeta-os-seus-negocios/)

**Fluxo de caixa e projeção**
- [O que é fluxo de caixa e como criar um — Sebrae](https://sebrae.com.br/sites/PortalSebrae/ufs/pe/artigos/o-que-e-o-fluxo-de-caixa-e-como-criar-um-para-sua-empresa,1425e2bffdac7710VgnVCM100000d701210aRCRD)
- [Como organizar e analisar o fluxo de caixa — Sebrae/PR](https://sebraepr.com.br/como-organizar-e-analisar-o-fluxo-de-caixa-em-uma-empresa/)
- [Fluxo de caixa — e-book Sebrae](https://bibliotecas.sebrae.com.br/chronus/ARQUIVOS_CHRONUS/bds/bds.nsf/a54c29c120d08789e9369c2da15aa9e1/$File/9880.pdf)

**Mercado e margem**
- [Sebrae em Dados — Salões de Beleza](https://www.sebraepr.com.br/comunidade/artigo/sebrae-em-dados-saloes-de-beleza/)
- [Vale a Pena Abrir Uma Barbearia em 2026? — OndeAbrir](https://ondeabrir.com/blog/vale-a-pena-abrir-barbearia-2026)
- [Barbearia por Assinatura: Guia Definitivo — BestBarbers](https://www.bestbarbers.app/blog/barbearia-por-assinatura)
- [Como aumentar o ticket médio — Blog Belio](https://blog.belio.com.br/artigos/como-aumentar-ticket-medio-salao-beleza/)

**Internas**
- [`AUDITORIA-FINANCEIRA-2026-08-03.md`](./AUDITORIA-FINANCEIRA-2026-08-03.md) · [`COMPARATIVO-MERCADO-2026-08.md`](./COMPARATIVO-MERCADO-2026-08.md) · [`PLANOS-E-FUNCIONALIDADES.md`](./PLANOS-E-FUNCIONALIDADES.md) · [`marketing/`](./marketing/)
