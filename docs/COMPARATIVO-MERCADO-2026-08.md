# Relatório Comparativo de Mercado — Software para Barbearia

**Data:** agosto de 2026 · **Objeto:** posicionamento do produto O Siqueira frente aos sistemas concorrentes no Brasil
**Método:** pesquisa em fontes públicas (páginas de preço oficiais, comparativos publicados por concorrentes, lojas de aplicativo) cruzada com a análise competitiva do PRD §17 (30/07/2026) e com o estado real do código auditado em 02/08/2026.

> **Aviso sobre as fontes.** Boa parte dos comparativos disponíveis é publicada pelos próprios concorrentes e é enviesada — o guia do Barbeiro.app, por exemplo, afirma ser "o único que oferece clube de assinatura integrado", o que é falso: BestBarbers e Trinks têm o recurso. Preços de faixas superiores são "sob consulta" em quase todos. Tratei valores divulgados como **indicativos**, não como tabela fechada, e sinalizo onde a informação não pôde ser confirmada.

---

## 1. Sumário executivo

O mercado brasileiro de software para barbearia em 2026 está estratificado em quatro apostas, e **nenhum player cobre bem mais de duas ao mesmo tempo**:

| Aposta | Quem lidera | O que entrega |
|---|---|---|
| **Descoberta** (marketplace) | Booksy, Fresha | tráfego de clientes novos |
| **Recorrência** (clube de assinatura) | BestBarbers, Trinks | receita previsível |
| **Anti-app** (WhatsApp / link) | Opero, Barbeiro.app | zero fricção de download |
| **Gestão profunda** (financeiro real) | Trinks (parcial) | comissão, NFS-e, estoque |

O produto O Siqueira está posicionado na interseção **Recorrência + Anti-app + Gestão profunda** — e a auditoria confirma que a *gestão profunda* é hoje o ativo mais desenvolvido do código (DRE com margem de contribuição, ponto de equilíbrio calculado, custo fixo separado de variável, projeção de caixa dia a dia, simulador de cenário). Isso é raro no segmento.

**A conclusão desconfortável:** o diferencial mais defensável do PRD — WhatsApp de mão dupla com aprovação de encaixe por botão — **é o único módulo que ainda não existe em código**. Existe o catálogo de 16 templates (agora validado contra as regras da Meta), e nada além disso. Concorrentes com bot de WhatsApp já operando (Opero) estão construindo exatamente nesse terreno.

**Prioridade estratégica:** submeter os templates à Meta imediatamente (aprovação leva dias e é caminho crítico) e construir o webhook de encaixe antes que a janela de diferenciação feche.

---

## 2. Panorama dos concorrentes

### 2.1 Tabela comparativa

| Sistema | Preço indicativo | Modelo de cobrança | Clube de assinatura | WhatsApp | NFS-e | App próprio | Financeiro |
|---|---|---|---|---|---|---|---|
| **Trinks** | a partir de ~R$ 76–110/mês (1–2 prof.); acima disso sob consulta | por faixa de profissionais, com adicional por profissional | ✅ (add-on) | ⚠️ add-on / planos superiores | ✅ (add-on) | ❌ (site + link) | ✅ conta digital, estoque, comissões |
| **BestBarbers** | grátis (básico) · a partir de **R$ 299/mês** (app exclusivo) | por barbearia | ✅ **carro-chefe** | ⚠️ notificações push, não WhatsApp operacional | ✅ automática | ✅ **white-label nas lojas** | ✅ caixa, comissões, multi-unidade, totem |
| **AppBarber** | não divulgado | não divulgado | ✅ | ⚠️ integrações com custo extra | ⚠️ não confirmado | ✅ app proprietário | ⚠️ raso |
| **Booksy** | ~R$ 69–179/mês | **por assento** (escala linear com a equipe) | ⚠️ limitado | ⚠️ limitado | ❌ | ✅ marketplace | ⚠️ raso |
| **Barbeiro.app** | grátis · Pro R$ 59,90 · Enterprise R$ 139,90 | **por faixa** (1–2, 3–5, 6–15, 16+), sem cobrança por assento | ✅ | ✅ em todos os planos | ⚠️ não confirmado | ❌ | ⚠️ médio |
| **TopAgenda** | grátis (60 atend./mês) · R$ 49 · R$ 79 | por barbearia | ⚠️ não confirmado | ✅ integrado | ❌ | ✅ Android | ⚠️ raso |
| **Opero** | incluso no plano (valor não divulgado) | por barbearia | ⚠️ não confirmado | ✅ **bot com Cloud API oficial + IA** | ⚠️ | ❌ (é o ponto) | ✅ comissão, caixa, sinal por Pix |
| **Prit / Avec / Salon Soft** | R$ 79 / R$ 89 / sob consulta | por barbearia | ❌ | ❌ nativo | ⚠️ | ⚠️ | ⚠️ genérico (salão) |
| **O Siqueira** *(nosso)* | — (uso próprio; SaaS na Fase 3) | por barbearia (decisão do PRD) | ✅ planos + régua D-5→D+5 *(UI pronta, cobrança não)* | 🔜 **catálogo pronto, integração pendente** | ❌ fora de escopo | ✅ PWA instalável | ✅ **DRE, ponto de equilíbrio, projeção** |

**Legenda:** ✅ entrega · ⚠️ parcial, add-on ou não confirmado · ❌ não tem · 🔜 projetado, não implementado

### 2.2 Leitura por concorrente

**Trinks** — a marca mais estabelecida (desde 2015) e a gestão mais completa entre os generalistas: conta digital, estoque, comissões, NFS-e. A fraqueza é comercial, não técnica: **WhatsApp, clube de assinaturas, fidelidade e NFS-e são todos add-ons**, e a faixa de preço acima de 2 profissionais é opaca ("sob consulta"). Uma barbearia de 5 cadeiras pode chegar a R$ 300–500/mês somando módulos. É generalista de beleza — barbearia é um caso de uso, não o produto.

**BestBarbers** — o concorrente mais perigoso para a nossa tese. Construiu o produto **em cima do clube de assinatura** (argumento de venda: barbearias com clube faturam ~3× mais) e entrega app white-label nas lojas + NFS-e automática + totem de autoatendimento. O preço de R$ 299/mês para o app exclusivo posiciona no topo. **A brecha:** toda a comunicação passa pelo app próprio e por push — não há operação por WhatsApp. Quem não instala o app não é alcançado.

**AppBarber** — base consolidada e fila de espera automatizada, mas exige download de app proprietário (fricção) e o financeiro é raso. Preço não divulgado publicamente.

**Booksy / Fresha** — vendem **descoberta**, não gestão. Cobrança por assento escala mal para equipes. A barbearia vira "mais uma" na vitrine e o cliente é do marketplace, não da barbearia. Complementares, não substitutos.

**Barbeiro.app / TopAgenda** — a faixa de preço acessível e o argumento **anti-cobrança-por-profissional** (R$ 59,90–139,90 por faixa) são fortes contra Trinks e Booksy. WhatsApp em todos os planos. Pouca profundidade em qualquer módulo específico — competem por preço.

**Opero** — o concorrente direto na nossa tese anti-app: bot de WhatsApp com **Cloud API oficial da Meta** (sem risco de bloqueio), IA treinada no vocabulário de barbearia, sinal antecipado por Pix, comissão automática e fechamento financeiro. Base pequena e produto em construção, mas **está exatamente onde queremos estar**. É a evidência de que a janela do diferencial nº 1 do PRD não fica aberta indefinidamente.

---

## 3. Onde o nosso produto realmente está

Esta seção cruza a promessa do PRD com o que a auditoria de 02/08/2026 encontrou em código, após as correções aplicadas.

| Módulo | PRD | Em código | Situação |
|---|---|---|---|
| Agendamento + encaixe | completo | fluxo de 4 passos, motor de slots com jornada, antecedência mín./máx., dias fechados e soma de durações | ✅ lógica pronta; falta persistir |
| Pagamento na reserva | Pix/cartão/no salão, hold de 15 min | escolha de forma; checkout simulado | ❌ sem gateway |
| Cancelamento e reembolso | janelas parametrizáveis, taxa 20–30% | política centralizada em `business-rules.ts`, taxa 25%, janela e limite de reagendamento aplicados | ✅ regra correta; falta estorno via API |
| WhatsApp | 16 templates, botões, webhook | catálogo validado contra as regras da Meta + teste no CI | 🔜 **falta client, webhook e gatilhos** |
| Mensalistas | régua D-5→D+5, suspensão automática | UI, MRR derivado dos assinantes, régua visual | ⚠️ sem cobrança recorrente |
| Fidelidade | pontos, expiração, resgate | carimbos estáticos | ⚠️ sem resgate |
| Loja e comissões | rateio %barbeiro + %barbearia = 100% | rateio do PRD implementado (40/60) + imposto, simulador na tela de cadastro | ✅ regra correta; falta baixa de estoque |
| Financeiro | DRE, ponto de equilíbrio, fechamento PDF | **DRE com margem de contribuição, fixo × variável, imposto, ponto de equilíbrio calculado, projeção de 30 dias, simulador de cenário** | ✅ **o mais maduro**; falta exportar PDF |
| Multi-tenant | Fase 3 | claim `workspaceId` lido e não usado | ❌ não iniciado |
| Persistência | Firestore | Security Rules versionadas (deny-all + por coleção); nenhuma tela grava | ❌ **bloqueio principal** |

### O que já é vantagem real

1. **Profundidade financeira acima do segmento.** DRE separando custo fixo de variável, margem de contribuição em %, imposto sobre o resultado, ponto de equilíbrio **calculado** e projeção de caixa dia a dia com distinção entre receita confirmada e estimada. Os concorrentes entregam "relatórios" e "fluxo de caixa"; isso aqui é leitura de negócio. **É o argumento de venda mais defensável hoje.**
2. **PWA sem download** — alinhado à tendência anti-app, sem os 15 dias de publicação em loja que o BestBarbers precisa.
3. **Pagamento flexível** (antecipado *ou* no salão) — os concorrentes tendem a um extremo: fricção obrigatória ou nenhuma proteção contra no-show.
4. **Regras de negócio versionadas e testadas.** Política de cancelamento, rateio de comissão e motor de slots vivem em módulos únicos com 40 testes automatizados. Nenhum percentual escrito à mão em tela. Isso vira **configuração por barbearia** quase de graça quando o SaaS chegar — que é exatamente o que o Trinks cobra como add-on.

### O que ainda é só promessa

1. **WhatsApp operacional** — o diferencial nº 1 do PRD, com concorrente ativo no mesmo terreno.
2. **Persistência** — nada é salvo; o produto não pode ser vendido a terceiros nesse estado.
3. **NFS-e** — BestBarbers e Trinks têm, e é **critério de compra recorrente**. O PRD colocou como fora de escopo; o mercado diz que precisa subir para Fase 3 prioritária.
4. **Split de comissão no recebimento** (Trinks/Belezinha) — relevante quando entrar o 2º barbeiro.

---

## 4. Matriz de posicionamento

```
              Gestão financeira profunda
                        ▲
                        │
      Trinks ●          │          ● O SIQUEIRA
   (add-ons caros)      │        (falta WhatsApp
                        │         e persistência)
                        │
  BestBarbers ●         │        ● Opero
   (preso ao app)       │      (raso, base pequena)
                        │
  ──────────────────────┼──────────────────────▶
   Preso a app próprio  │   Sem download (WhatsApp/PWA)
                        │
      AppBarber ●       │        ● Barbeiro.app
                        │        ● TopAgenda
        Booksy ●        │
      (marketplace)     │
                        │
              Gestão financeira rasa
```

**O quadrante superior direito está vazio de concorrente maduro.** É onde o produto quer estar e onde já chegou pela metade: a gestão profunda existe, a operação sem download existe como PWA, mas o WhatsApp de mão dupla — que é o que torna o "sem download" completo — não.

---

## 5. Recomendações

### 5.1 Produto — reordenação sugerida do roadmap

| Prioridade | Ação | Por quê |
|---|---|---|
| **P0** | **Submeter os 16 templates à Meta agora** | Aprovação leva dias e é caminho crítico de tudo que é WhatsApp. Os templates já passam na validação automatizada; não há motivo para esperar o client ficar pronto. |
| **P0** | Persistência (Firestore) + provisionamento de claims | Sem isso não há produto vendável. As Security Rules já estão versionadas e negando por padrão. |
| **P1** | Webhook de encaixe com botões Aprovar/Recusar | É o diferencial nº 1 e tem concorrente ativo (Opero) construindo no mesmo terreno. |
| **P1** | Gateway de pagamento + cobrança recorrente de mensalista | O clube de assinatura é a aposta que o BestBarbers usa para justificar R$ 299/mês. Nossa UI está pronta e a cobrança não existe. |
| **P2** | **Elevar NFS-e de "fora de escopo" para Fase 3 prioritária** | Critério de compra recorrente; dois concorrentes de topo já entregam. |
| **P2** | Fechamento mensal exportável em PDF | Materializa a vantagem financeira num artefato que o dono leva ao contador — argumento de venda tangível. |
| **P3** | Fila de espera | Objeção de venda contra o AppBarber; já prevista na Fase 2.5. |

### 5.2 Precificação

O argumento anti-cobrança-por-profissional do Barbeiro.app é o mais eficaz do mercado contra Trinks e Booksy, e o PRD já sinaliza essa direção. Recomendo firmar:

- **Cobrança por barbearia, por faixa de recursos** — nunca por assento.
- Faixa de entrada competindo com Barbeiro.app Pro (~R$ 60–80/mês), com **WhatsApp incluído desde o plano base** — é justamente o que o Trinks cobra à parte.
- Faixa superior (~R$ 200–300/mês) ancorada no BestBarbers, justificada por **DRE + projeção de caixa + fechamento em PDF**, que nenhum deles entrega.

### 5.3 Posicionamento de venda

O pitch do PRD continua correto e agora tem lastro parcial em código. Sugiro ajustá-lo para liderar com o que já existe:

> *"O único sistema em que o dono da barbearia enxerga o negócio como empresário — DRE, ponto de equilíbrio e projeção de caixa prontos — e opera tudo pelo WhatsApp, sem obrigar o cliente a baixar nada."*

A inversão importa: **hoje a gestão financeira é entregável e demonstrável; o WhatsApp ainda é promessa.** Vender primeiro o que se pode demonstrar reduz o risco de a demo desmoronar.

---

## 6. Riscos competitivos

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Opero (ou outro) consolidar o WhatsApp de mão dupla antes de nós | **alta** | alto — perde o diferencial nº 1 | Submeter templates já; priorizar o webhook de encaixe |
| BestBarbers adicionar operação por WhatsApp ao clube | média | alto — fecha os dois quadrantes | Acelerar a profundidade financeira, que eles não têm |
| NFS-e virar bloqueio de venda | **alta** | médio | Subir para Fase 3 prioritária |
| Trinks baixar preço dos add-ons | média | médio | Incluir WhatsApp no plano base como política |
| Produto não sair do estado de demonstração | **alta** | crítico | Persistência é P0; nada mais importa antes disso |

---

## 7. Fontes

- [Planos e Preços do Sistema de Gestão Trinks](https://negocios.trinks.com/planos/)
- [BestBarbers — Sistema para Barbearia com App Próprio e Clube de Assinaturas](https://www.bestbarbers.app/sistema-para-barbearia)
- [BestBarbers: App de barbearias — Google Play](https://play.google.com/store/apps/details?id=bestbarbers.app&hl=en_US)
- [Melhor Sistema para Barbearia em 2026: Guia Completo — Barbeiro.app](https://www.barbeiro.app/blog/melhor-sistema-para-barbearia-2026)
- [Melhores Apps para Barbearia em 2026: Comparativo — TopAgenda](https://topagenda.online/melhores-apps-para-barbearia)
- [AppBarber Alternativa: 5 sistemas para barbearia — Opero](https://operosistemas.com.br/blog/comercial/appbarber-alternativa-sistemas-barbearia-2026)
- [Sistema para Barbearia com Agendamento pelo WhatsApp — Opero](https://gestaoparabarbearia.com.br/)
- [Agendar Salão e Barbearia WhatsApp: Guia 2026 — SocialHub](https://www.socialhub.pro/blog/agendamento-salao-barbearia-whatsapp-2026-automacao/)
- [`../prd-app-barbearia.md`](../prd-app-barbearia.md) §17 — análise competitiva de 30/07/2026
- [`./AUDITORIA-2026-08-02.md`](./AUDITORIA-2026-08-02.md) — estado real do código
