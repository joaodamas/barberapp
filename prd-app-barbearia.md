# PRD — Aplicativo de Gestão e Agendamento para Barbearia

**Versão:** 1.0 (pronto para desenvolvimento) · **Data:** 30/07/2026
**Plataforma:** **PWA (Progressive Web App)** — 100% web, responsivo e mobile-first. Sem app nativo iOS/Android nesta fase.
**Status:** Pré-desenvolvimento — documento base para alinhamento antes de codar

---

## 1. Visão Geral

O produto é uma plataforma de agendamento e gestão para barbearia, composta por um **app/site do cliente** (reservar horário, pagar, acompanhar fidelidade, comprar produtos) e um **painel gerencial** (agendas, financeiro, mensalistas, estoque e dashboards de decisão).

A estratégia é **começar operando em uma barbearia** (validação real do fluxo) e evoluir para **SaaS multi-barbearias**. Por isso, mesmo no MVP, a arquitetura já nasce **multi-tenant** (todo dado pertence a uma `barbershop_id`), evitando reescrita futura.

### Objetivos de negócio

1. Reduzir no-show com confirmação automática via WhatsApp e pagamento antecipado opcional (incentivado, nunca obrigatório) na reserva.
2. Gerar receita recorrente e previsível com planos de mensalistas cobrados automaticamente.
3. Dar ao gestor visão financeira real (fluxo de caixa, DRE, dashboards) sem planilhas paralelas.
4. Aumentar ticket médio com catálogo de produtos e programa de fidelidade.

### Métricas de sucesso (pós-lançamento)

- Taxa de no-show < 5% entre quem paga antecipado e < 15% no geral (referência de mercado sem pré-pagamento: 15–30%) — sustentada pela régua de confirmação via WhatsApp e pela salvaguarda automática de pagamento obrigatório após faltas (seção 6).
- ≥ 70% dos agendamentos feitos pelo app (vs. WhatsApp manual/balcão).
- Inadimplência de mensalistas < 8% após a régua de cobrança.
- Tempo de fechamento de caixa diário < 10 minutos.

### Situação atual (baseline)

Hoje a barbearia usa uma página de agendamento (BarberCloud) com o fluxo: perfil do barbeiro (endereço, Instagram, botões WhatsApp/Ligar) → lista de serviços com duração, preço e descrição → calendário com dias disponíveis → grade de horários (incluindo slots de **"encaixe"** para horários já ocupados) → cadastro rápido (login Google ou nome + e-mail + WhatsApp) → finalizar agendamento. **Não há pagamento na reserva nem cobrança automática** — este é o principal gap que o novo produto resolve, mantendo o que já funciona bem no fluxo atual (agendamento em poucos toques, login com Google, resumo claro da reserva, conceito de encaixe).

---

## 2. Perfis de Usuário (Personas)

**Cliente final** — agenda pelo celular, escolhe pagar na reserva (Pix ou cartão) ou pagar no salão, recebe confirmações no WhatsApp, acumula pontos de fidelidade, pode assinar plano mensal e comprar produtos.

**Barbeiro/Profissional** — vê a própria agenda do dia, marca atendimento como concluído, registra venda de produto no atendimento, acompanha suas comissões. **Na fase 1, o dono é o próprio barbeiro** (perfil único com permissões de gestor + agenda própria); o sistema já nasce preparado para múltiplos profissionais, mas a interface do MVP é otimizada para operação solo.

**Recepção/Atendente** (opcional na fase 1) — faz agendamentos por telefone/balcão em nome do cliente, recebe pagamentos presenciais, gerencia encaixes.

**Gestor/Dono** — configura serviços, preços, horários e políticas; acompanha dashboards, fluxo de caixa, DRE, mensalistas e estoque; gerencia equipe e comissões.

**(Fase SaaS) Admin da plataforma** — gerencia as barbearias assinantes, planos do SaaS, onboarding e suporte.

---

## 3. Escopo por Fases

### Fase 1 — MVP (barbearia própria, operação solo)
Agendamento online com pagamento na reserva opcional (Pix, cartão ou no salão) · mensagens automáticas de WhatsApp (confirmação + lembrete + cancelamento) · política de cancelamento com taxa e reembolso · agenda única (dono = barbeiro), com suporte a **encaixe** como no fluxo atual · painel gerencial básico (agenda do dia, caixa do dia, relatório simples). O catálogo de serviços parte do cardápio real de hoje (ex.: Sobrancelha R$ 15/20min, Pezinho R$ 15/15min, Barba R$ 35/30min, Corte infantil R$ 50/30min, Corte + sobrancelha R$ 70/30min, Barba + corte infantil R$ 80/60min, Luzes a partir de R$ 80/60min, Corte + barba R$ 90/60min, Alinhamento dos fios a partir de R$ 100/90min, Corte + barba + sobrancelha R$ 100/60min, Adulto + Infantil R$ 100/60min, Adulto corte e barba + Infantil R$ 130/90min, Adulto corte e barba + 2 Infantil R$ 170/120min).

### Fase 2 — Gestão completa
Mensalistas com cobrança recorrente e régua de avisos · fidelidade · catálogo e venda de produtos com estoque · fluxo de caixa completo, DRE e dashboards · comissões de barbeiros.

### Fase 3 — SaaS
Onboarding self-service de novas barbearias · planos de assinatura do SaaS · personalização (logo, cores, subdomínio) · split/conta de recebimento por barbearia · app white-label ou app único multi-lojas.

### Fora de escopo (por ora)
Emissão de NF-e/NFS-e automática (fica como integração futura) · marketplace público de barbearias · folha de pagamento.

---

## 4. Módulo: Agendamento

### Conceitos

- **Serviço:** nome, duração (min), preço, quais profissionais executam. **Pagamento antecipado é opcional na reserva online** (Pix ou cartão) — o cliente pode optar por pagar no salão. Quando paga antecipado, é sempre integral, sem sinal parcial.
- **Agenda do profissional:** grade semanal de trabalho, intervalos, folgas, férias e bloqueios pontuais.
- **Slot disponível:** calculado em tempo real = jornada do profissional − agendamentos existentes − bloqueios, respeitando a duração do serviço escolhido.

### Fluxo do cliente

1. Escolhe serviço(s) → escolhe profissional (ou "qualquer disponível") → vê calendário com dias/horários livres.
2. Seleciona horário → revisa resumo (serviço, profissional, data, valor).
3. Escolhe a forma de pagamento: **Pix**, **cartão** ou **pagar no salão** (dinheiro/maquininha no dia). Se pagar na hora, o slot fica **em espera (hold)** até o pagamento cair (ex.: 15 min para Pix) e libera automaticamente se não confirmar. Se escolher pagar no salão, a reserva confirma **na hora**, sem hold — não há checkout para esperar.
4. Recebe confirmação no app e no WhatsApp.

### Regras de negócio

- Reserva confirma com **pagamento antecipado aprovado** OU com a escolha explícita de **pagar no salão**.
- Slot fica **em espera (hold)** apenas durante o checkout de pagamento antecipado, para evitar dupla reserva; expira e libera automaticamente. Reserva com "pagar no salão" não passa por hold — confirma direto.
- Cliente com **2+ faltas/cancelamentos tardios** em reservas sem pagamento antecipado (janela e limite configuráveis pelo gestor) passa a ter **pagamento antecipado obrigatório** nas próximas reservas — salvaguarda automática contra no-show (ver seção 6). O app avisa o cliente do porquê ao aplicar a exigência.
- Reagendamento permitido até **N horas** antes (configurável, sugestão: 6h) sem custo, limitado a X reagendamentos por reserva.
- Cliente pode agendar múltiplos serviços em sequência (corte + barba) — o sistema soma durações.
- Encaixe manual: recepção/gestor pode criar agendamento fora da grade (com ou sem pagamento antecipado).
- **Encaixe visível ao cliente** (como no fluxo atual): horários ocupados podem aparecer como "solicitar encaixe" — geram um pedido com aprovação pelo próprio WhatsApp do barbeiro. Configurável (ligar/desligar).

### Fluxo de aprovação de encaixe (via WhatsApp do barbeiro)

1. Cliente solicita encaixe → `booking.status = fit_in_requested`; o valor **não** é capturado ainda (ou é pré-autorizado, a definir no discovery).
2. O barbeiro recebe mensagem no **seu WhatsApp** com o resumo (cliente, serviço, dia/hora, valor) e botões **"Aprovar ✅" / "Recusar ❌"**.
3. **Aprovou** → confirma a reserva (com a forma de pagamento escolhida pelo cliente — antecipado ou no salão) e dispara a confirmação normal (seção 7). Se o cliente optou por pagar antecipado e não paga no prazo, o encaixe expira e o barbeiro é avisado. **Gestor pode exigir pagamento antecipado obrigatório especificamente para encaixes** (parâmetro separado da regra geral), dado o maior risco de furar a agenda à toa.
4. **Recusou** → o sistema calcula automaticamente os **próximos horários livres** (ex.: 3 a 5 opções nos próximos dias, no mesmo período do dia que o cliente tentou) e envia ao cliente: "O horário solicitado não pôde ser encaixado 😕 Mas tenho estes horários livres: [opções]. Reserve aqui: [link do app]". O link já abre com serviço pré-selecionado.
5. **Sem resposta do barbeiro em X minutos** (configurável, ex.: 30–60 min): o pedido expira e o cliente recebe a mesma mensagem de horários alternativos + link — nenhum pedido fica no limbo.
6. Todo o ciclo fica logado (quem aprovou/recusou, tempo de resposta) e alimenta o dashboard (taxa de aprovação de encaixes, tempo médio de resposta).
- Antecedência mínima para agendar (ex.: 1h) e máxima (ex.: 60 dias), configuráveis.

---

## 5. Módulo: Pagamentos na Reserva

### Gateway

**Decisão validada (30/07): Pagar.me (grupo Stone) como motor de pagamentos.** A API v5 cobre todos os fluxos desenhados: pagamento avulso (Pix e cartão), **estorno total e parcial via API** (essencial para o cancelamento com taxa — devolver 75% e reter 25%), **assinaturas com cobrança recorrente e gestão de inadimplência nativa**, e tokenização de cartões para cobranças futuras. A **InfinitePay permanece como alternativa de checkout simples** (Pix + crédito 12x via Checkout Integrado com verificação por API), mas sem estorno/recorrência documentados via API — insuficiente sozinha para o produto completo. Próximo passo: conta + sandbox Pagar.me e teste dos 3 fluxos (pagamento de reserva, estorno parcial, assinatura).

### Fluxo técnico (visão macro)

**Se o cliente escolhe pagar antecipado (Pix/cartão):**
1. Cliente confirma horário e forma de pagamento → backend cria `booking` com status `pending_payment` e um hold no slot.
2. Backend gera checkout na InfinitePay com `order_nsu` = ID da reserva.
3. Cliente paga → retorno/webhook → backend valida via `payment_check` → `booking.status = confirmed`.
4. Pagamento não confirmado no prazo → reserva expira, slot liberado, cliente notificado.

**Se o cliente escolhe pagar no salão:**
1. Cliente confirma horário → backend cria `booking` direto com status `confirmed` e `payment_method = local`, sem hold. Nenhum checkout é gerado.
2. Cobrança acontece manualmente no salão (dinheiro/maquininha), registrada pelo barbeiro/recepção no atendimento (seção 11 — comanda/caixa do dia).

### Modalidades

- **Pagamento antecipado opcional** — o cliente escolhe entre Pix, cartão (sempre integral, sem sinal parcial) ou pagar no salão, em toda reserva feita pelo app.
- **Pagamento presencial** (dinheiro/maquininha): disponível tanto para reserva online do cliente que optou por "pagar no salão" quanto para agendamentos criados internamente pelo barbeiro/recepção (encaixes manuais, cliente de balcão).
- Mensalistas não pagam por agendamento: debitam do saldo do plano (seção 8).
- Salvaguarda: cliente que acumular faltas/cancelamentos tardios sem pagamento antecipado perde a opção de "pagar no salão" temporariamente (seção 6).

### Taxas de pagamento mapeadas

Cadastro por barbearia das taxas de cada meio: **Pix %, débito %, crédito à vista %, crédito parcelado (por nº de parcelas) e custo fixo mensal da maquininha/gateway**. Como todo pagamento passa pela aplicação, cada transação já grava a taxa aplicada e o valor líquido — o fechamento mensal mostra o total pago em taxas por método, a taxa efetiva média e insights (ex.: economia potencial ao migrar volume de crédito para Pix). Alterações de tarifa do gateway são versionadas por data de vigência.

### Fechamento do mês (relatório exportável)

Todo mês o sistema consolida automaticamente um **fechamento exportável em PDF**: recebido, a receber, atrasado, despesas e resultado; receita por categoria (serviços, produtos, mensalidades); taxas por método; ponto de equilíbrio (quanto da receita cobre os custos e em que dia do mês o equilíbrio foi atingido); receita × despesa dos últimos 6 meses; e o DRE. É o documento de referência do gestor — e, na fase SaaS, um diferencial de valor percebido. Se o mês estiver sem despesas manuais lançadas (aluguel, luz etc.), o painel alerta em "Precisa de você" e o fechamento marca o resultado como parcial — evitando que entrada seja lida como lucro.

### Conciliação

Toda transação do gateway é registrada em `payments` com taxa do gateway, valor líquido e data prevista de recebimento, alimentando o fluxo de caixa (seção 11).

---

## 6. Módulo: Cancelamento, Taxa e Reembolso

A política de reembolso desta seção só se aplica a reservas **com pagamento antecipado** — não há o que devolver de uma reserva com "pagar no salão", já que nenhum valor foi cobrado. Para essas, o controle de risco é o registro de ocorrência + a salvaguarda automática abaixo.

### Política para reservas pagas antecipadamente (parametrizável pelo gestor)

| Momento do cancelamento | Reembolso ao cliente |
|---|---|
| Até 24h antes | 100% (ou crédito integral no app) |
| Entre 24h e 6h antes | Reembolso com **taxa de cancelamento** (sugestão: 20–30%) |
| Menos de 6h antes / não comparecimento | Sem reembolso (ou crédito parcial, a critério do gestor) |

### Política para reservas com "pagar no salão"

| Momento do cancelamento/falta | O que acontece |
|---|---|
| Cancelou dentro da janela normal (ex.: até 6h antes) | Sem penalidade — apenas libera o slot |
| Cancelou tarde ou não compareceu (no-show) | Registrado como **ocorrência** no histórico do cliente; nada a cobrar retroativamente |
| **2ª ocorrência** em uma janela configurável (sugestão: 90 dias) | Cliente perde temporariamente a opção "pagar no salão" — próximas reservas exigem pagamento antecipado. Reversível após um período sem novas ocorrências (configurável). |

### Regras

- Os percentuais, janelas e o limite de ocorrências são **configuráveis por barbearia** (essencial para o futuro SaaS).
- Alternativa ao reembolso em dinheiro: **crédito na carteira do app** (sem taxa ou com taxa menor), incentivando o cliente a remarcar em vez de sacar.
- Reembolso Pix tende a ser rápido; estorno em cartão segue prazos da bandeira — o app deve comunicar o prazo estimado ao cliente.
- Todo cancelamento ou no-show gera registro com motivo, quem cancelou (cliente/loja), forma de pagamento da reserva e valor retido/devolvido (quando houver) — dados que alimentam o dashboard (taxa de cancelamento e de no-show por período/profissional/forma de pagamento).
- Cancelamento pela **loja** (barbeiro faltou, imprevisto): reembolso 100% (se pago antecipado) + mensagem automática de desculpas + oferta de reagendamento prioritário. Não gera ocorrência para o cliente.

### Ponto técnico crítico

Confirmar no discovery se a InfinitePay expõe **estorno via API** (total e parcial). Se não expuser, o reembolso com taxa será operacionalizado via **Pix manual/transferência registrada no sistema** ou priorizando o modelo de **crédito em carteira**, e isso deve estar decidido antes do desenvolvimento do módulo.

---

## 7. Módulo: Mensagens Automáticas (WhatsApp)

### Canal

**WhatsApp Business Platform (Cloud API da Meta)**, diretamente ou via BSP (Twilio, Zenvia, 360dialog, etc.). Mensagens iniciadas pela empresa exigem **templates pré-aprovados pela Meta** — os textos abaixo precisam ser submetidos para aprovação antes do go-live.

### Régua de mensagens de agendamento

1. **Confirmação de reserva** (imediata — após pagamento aprovado quando antecipado, ou assim que a reserva é criada quando "pagar no salão"): resumo do serviço, profissional, data/hora, endereço, política de cancelamento e, se aplicável, lembrete do valor a pagar no salão e a forma esperada.
2. **Lembrete + confirmação de ida** (no dia, ex.: 3h antes ou na manhã do atendimento): mensagem com botões **"Confirmo ✅ / Preciso cancelar ❌"** — é a principal proteção contra no-show nas reservas sem pagamento antecipado, então essa etapa não é pulada nunca.
   - "Confirmo" → status `confirmed_by_client`.
   - "Cancelar" → se pago antecipado, aplica a política da seção 6 e informa o valor de reembolso/retenção; se "pagar no salão", apenas confirma o cancelamento e libera o slot.
   - Sem resposta → mantém a reserva; loja vê status "não confirmado" na agenda do dia.
3. **Cancelamento/Reembolso**: confirmação do cancelamento — com valores (retido e devolvido) quando pago antecipado, ou apenas registro da ocorrência quando "pagar no salão".
4. **Pós-atendimento** (opcional, fase 2): agradecimento + pedido de avaliação + pontos de fidelidade ganhos.

### Régua operacional (WhatsApp do barbeiro/gestor)

1. **Solicitação de encaixe**: resumo do pedido com botões **"Aprovar ✅ / Recusar ❌"** (fluxo detalhado na seção 4). Recusa ou expiração dispara ao cliente a mensagem de **horários alternativos + link do app** com o serviço pré-selecionado.
2. **Resumo do dia** (opcional, ex.: 7h): agenda do dia, quem confirmou/não confirmou, faturamento previsto.
3. **Alertas**: cancelamento de última hora, pagamento de mensalista regularizado, estoque abaixo do mínimo.

Observação técnica: botões interativos exigem templates aprovados pela Meta e o número do barbeiro cadastrado como destinatário na plataforma — o "WhatsApp do barbeiro" recebe mensagens do número oficial da barbearia, não é o barbeiro respondendo clientes direto.

### Fechamentos de agenda e avisos automáticos

- **Todo fechamento de agenda é automático pelo WhatsApp.** Quando o gestor bloqueia períodos — folga, férias, feriado, recesso de fim de ano — o sistema identifica os clientes com horário afetado e dispara aviso com opções de reagendamento em um toque (link com horários livres). Ninguém descobre a porta fechada na hora.
- **Calendário de fim de ano e feriados:** o gestor configura uma vez (recesso, horários especiais de dezembro, feriados nacionais/locais pré-carregados) e o sistema cuida do resto: bloqueia os slots, avisa quem já tinha horário e ajusta a grade exibida no app do cliente.
- **Regra "Avisar cliente" em toda edição:** qualquer ação do gestor que afete uma reserva ou a experiência do cliente (reagendar, cancelar, mudar horário de funcionamento, trocar duração/preço de serviço com agendamento futuro, bloquear agenda) abre uma tela de confirmação com a lista dos clientes impactados e o botão **"Notificar clientes pelo WhatsApp"** — mensagem pré-preenchida e editável, ativada por padrão. Se o gestor optar por não avisar, o sistema registra a escolha no log. Princípio: **o cliente sempre sabe o que está acontecendo.**
- Também disponível como ação avulsa: "Enviar aviso aos clientes" (ex.: comunicado geral, promoção pontual) respeitando opt-in e limites anti-spam da Meta.

### Régua de mensagens de mensalistas (cobrança)

| Quando | Mensagem |
|---|---|
| **D-5** | Aviso: mensalidade vence em 5 dias, com link de pagamento |
| **D-3** | Lembrete de vencimento |
| **D-1** | Último lembrete antes do vencimento |
| **D0** | Cobrança do dia / débito automático processado |
| **D+1** | Aviso de atraso, link para regularizar |
| **D+3** | Segundo aviso de atraso |
| **D+5** | Aviso final: plano será **suspenso** se não regularizado (benefícios pausados) |

### Requisitos

- Toda mensagem enviada fica logada (template, destinatário, status de entrega/leitura) para auditoria.
- Cliente deve dar **opt-in** de WhatsApp no cadastro (LGPD + política da Meta).
- Fallback: se o WhatsApp falhar (número inválido, bloqueio), notificar por push/e-mail e sinalizar na agenda.

---

## 8. Módulo: Mensalistas (Planos de Assinatura)

### Conceito

Planos recorrentes vendidos pela barbearia, ex.: "Corte ilimitado — R$ 149/mês", "2 cortes + 1 barba — R$ 119/mês", "Barba semanal — R$ 99/mês". Cada plano define: preço, ciclo (mensal), serviços incluídos e limites de uso (quantidade/mês ou ilimitado), carência e regras de pausa.

### Cobrança automática

- **Cartão de crédito recorrente** (ideal): cobrança automática no vencimento, sem ação do cliente.
- **Pix recorrente/link mensal** (alternativa): sistema gera cobrança e dispara pela régua D-5/D-3/D-1.
- Decisão técnica pendente: se a InfinitePay não oferecer recorrência tokenizada via API, usar a régua com link de pagamento (D-5 a D0) já resolve o MVP; recorrência em cartão pode vir com Pagar.me/Stone na fase 2. **A régua de mensagens é a mesma independentemente do meio.**

### Regras de negócio

- Uso do plano: ao agendar, o mensalista não paga — o sistema **debita do saldo do plano** (ex.: 1 de 2 cortes do mês). Excedeu o limite → paga avulso (com possível desconto de mensalista).
- Inadimplência: em **D+5 sem pagamento, o plano é suspenso** — agendamentos futuros como mensalista são bloqueados (pode agendar como avulso). Regularizou → reativa na hora.
- Cancelamento de plano: válido até o fim do ciclo pago; sem reembolso proporcional (configurável).
- Pausa de plano (viagem, etc.): até X dias/ano, a critério do gestor.
- Painel do gestor mostra: MRR (receita recorrente mensal), mensalistas ativos/suspensos/cancelados, churn e inadimplência.

---

## 9. Módulo: Fidelidade

### Mecânica (configurável)

- **Pontos por valor gasto** (ex.: R$ 1 = 1 ponto) em serviços e produtos, creditados após o atendimento concluído/pago.
- **Recompensas por resgate**: ex.: 500 pts = pomada grátis; 1.000 pts = corte grátis; ou desconto em % no próximo serviço.
- Alternativa simples estilo "cartão carimbo": a cada 10 cortes, 1 grátis — o gestor escolhe o modelo.

### Regras

- Pontos expiram em X meses (sugestão: 12) para gerar recorrência.
- Resgate feito pelo app (gera cupom/QR validado no balcão) ou aplicado direto no agendamento.
- Mensalistas podem ter multiplicador de pontos (ex.: 1,5x) como benefício extra.
- Tela do cliente: saldo, extrato de pontos, recompensas disponíveis, progresso até a próxima.
- Fraude: pontos só após pagamento confirmado; estorno/cancelamento remove os pontos correspondentes.

---

## 10. Módulo: Catálogo, Estoque e Comissões de Produto

### Cadastro do produto

Nome, fotos, descrição, categoria (pomada, shampoo, acessórios...), ativo/inativo, e os campos financeiros que alimentam o cálculo automático: **custo unitário**, **preço de venda**, **% comissão do barbeiro** e **% comissão da barbearia**. Ao preencher, o sistema mostra em tempo real a margem e o rateio (simulador na própria tela de cadastro).

### Cálculo automático (regra central)

Para cada venda: **Lucro bruto = Preço de venda − Custo do produto**. Sobre esse lucro bruto aplica-se o rateio: **Comissão do barbeiro = Lucro bruto × %barbeiro** e **Parte da barbearia = Lucro bruto × %barbearia** (com %barbeiro + %barbearia = 100%, validado pelo sistema). O custo do produto sempre retorna integralmente à barbearia (repõe o estoque/CMV).

**Exemplo:** pomada com custo R$ 18 e venda R$ 45, rateio 40% barbeiro / 60% barbearia → lucro bruto R$ 27 → barbeiro recebe R$ 10,80 e a barbearia fica com R$ 16,20 + R$ 18 do custo. Tudo lançado automaticamente: comissão em `commissions`, CMV no DRE, entrada no caixa.

- O modelo alternativo (comissão sobre o **preço de venda** em vez do lucro) fica disponível como configuração por barbearia — algumas operam assim; o gestor escolhe a base de cálculo.
- Percentuais padrão definidos globalmente, com possibilidade de **exceção por produto** (ex.: item de margem apertada com comissão menor).
- Mesmo na operação solo (dono = barbeiro), o rateio é registrado: separa o "salário do dono como barbeiro" do resultado da empresa — essencial para o DRE refletir a realidade e para o modelo escalar quando entrarem outros barbeiros.
- O custo unitário usado é o da última entrada em estoque (ou custo médio — definir no discovery), atualizado automaticamente a cada compra registrada.

### Venda e estoque

- **Venda no atendimento**: adicionada à comanda; entra no mesmo pagamento/fechamento.
- **Venda pelo app** (fase 2): cliente compra e retira na barbearia (click & collect). Frete fora do escopo inicial.
- **Estoque**: baixa automática na venda, alerta de estoque mínimo, registro de entradas com custo e fornecedor — alimenta CMV do DRE e o custo do cálculo de comissão.

---

## 11. Módulo Gerencial: Financeiro e Dashboards

### Fluxo de caixa

- Todas as entradas (serviços, produtos, mensalidades, taxas de cancelamento retidas) e saídas (despesas, compras de estoque, comissões pagas, taxas de gateway) em um livro caixa por dia/semana/mês.
- Regime de **caixa** (data de recebimento efetivo, considerando prazo do gateway) e visão por **competência** (data do atendimento) — as duas visões, pois o gestor precisa de ambas.
- Categorias de despesa configuráveis (aluguel, luz, marketing, insumos...), com lançamentos manuais e recorrentes.
- Fechamento de caixa diário: conferência por meio de pagamento (Pix, cartão, dinheiro) vs. registrado.

### DRE gerencial (mensal)

Receita bruta (serviços + produtos + mensalidades) → (−) deduções e taxas de gateway → Receita líquida → (−) CMV (custo dos produtos vendidos) e comissões → Lucro bruto → (−) despesas operacionais por categoria → **Resultado operacional** → margem %. Comparativo mês a mês e vs. mesmo mês do ano anterior.

### Comissões

- Percentual por barbeiro, podendo variar por **serviço** (base: valor do serviço) e por **produto** (base: lucro bruto ou preço de venda, conforme seção 10) — todo cálculo é automático no fechamento da comanda, sem conta manual.
- Relatório de comissões por período com fechamento (marca como "pago") — vira saída no fluxo de caixa.
- Na fase solo, o relatório separa "retirada do dono como barbeiro" (comissões) do lucro da barbearia, dando clareza de quanto a empresa gera além do trabalho na cadeira.

### Dashboards e análises (tomada de decisão)

- **"Precisa de você" (topo da aba Hoje):** central de ações que concentra só o que pede intervenção — mensalista em atraso, encaixe aguardando resposta no WhatsApp, estoque abaixo do mínimo, mês sem despesa manual lançada.
- **Visão do dia:** KPIs (faturado, atendimentos, ocupação), agenda com status de pagamento/plano e confirmação de ida via WhatsApp.
- **Filtros livres (aba Números):** período **Mês / Trimestre / Ano** (consolidados recalculados) × dimensão (serviço, forma de pagamento, origem da reserva, mensalista — qualquer campo do cadastro vira filtro). Visão anual traz faturamento mês a mês, melhor mês, média e ritmo anualizado.
- **Tops:** Top clientes (visitas, gasto total, selo de mensalista — insight: top sem plano é convite na certa) e Top produtos (unidades, receita, margem).
- **Mapa de calor dia × horário:** ocupação % por bloco Seg–Sáb × faixas de horário; toque no bloco mostra o número e a leitura de marketing (≥85% = horário nobre, segurar pra ticket alto; <60% = candidato a promoção/plano). Recalcula conforme os filtros de período.
- **Insights automáticos ("Mapeamento da barbearia"):** horário nobre, janelas ociosas, serviço que puxa a receita, clientes sumidos há 60+ dias com valor estimado de recuperação, efeito do pagamento antecipado sobre o no-show (comparativo de taxa de falta entre reservas pagas e "pagar no salão", receita protegida, taxas retidas, encaixes convertidos).
- **Mensalistas:** MRR **cobrável no mês vs. contratado** (assinaturas novas que iniciam no próximo ciclo), assinantes por status, churn, inadimplência, LTV estimado.
- **Simulador de provisionamento (Financeiro):** controles +/− (atendimentos/semana, ticket, nº mensalistas, despesas fixas, % variáveis) → receita projetada com composição avulso × planos, barra "pra onde vai cada R$ 100" (retirada/fixas/variáveis/resultado com %), margem colorida por faixa, projeção anual, colchão de 3 meses de fixas e quanto guardar por mês. Alerta em vermelho quando o cenário fica negativo.
- **Estoque/Produtos:** mais vendidos, margem por produto, itens abaixo do mínimo.

---

## 12. Mapa de Telas (conforme protótipos)

### App do Cliente (PWA) · abas: Início · Agendar · Planos · Reservas · Perfil
1. Onboarding / login (celular + código WhatsApp/SMS, opção Google)
2. Início: próximo agendamento com status, convite mensalista (some se assinante), fidelidade (10 carimbos), endereço + WhatsApp
3. Agendar (3 passos): serviços → dia/horário (slots livres + "solicitar encaixe" nos ocupados) → pagamento (Pix copia-e-cola/QR ou cartão) com política de cancelamento visível → confirmação
4. Planos: vitrine com preço avulso riscado, −10% e economia; checkout da assinatura (cartão recorrente ou Pix mensal via WhatsApp); plano ativo com uso do ciclo e faturas
5. Reservas: futuras (reagendar/cancelar com a conta do reembolso aberta) e histórico
6. Perfil: dados, plano, notificações, política, ajuda
7. Loja de produtos (fase 2, click & collect)

### Painel do Dono (PWA) · abas: Hoje · Financeiro · Números · Mensal · Loja
1. **Hoje:** KPIs do dia · "Precisa de você" · encaixes (espelho do WhatsApp: pendente com timer + registro de decisões) · agenda com status e check de concluído (fecha comanda, calcula comissão, soma caixa, credita fidelidade)
2. **Financeiro:** caixa do dia por método · taxas de pagamento mapeadas com insight · fluxo de caixa (barras semanais, caixa vs. competência) · DRE completo · fechamento do mês exportável (PDF no modelo `o-siqueira-fechamento-julho.pdf`) · simulador de provisionamento
3. **Números:** filtros período × serviço · consolidados · tops · mapa de calor · insights
4. **Mensal:** MRR cobrável vs. contratado · régua visual D-5→D+5 · assinantes por status
5. **Loja:** catálogo com custo/venda/rateio por produto · alerta de estoque mínimo · simulador de comissão
6. Configurações: serviços e preços, jornada e bloqueios (com "Avisar cliente"), políticas, planos, fidelidade, taxas por método, WhatsApp, calendário de feriados/fim de ano
7. (Fase 3) Admin SaaS

**Referência visual e de componentes:** `o-siqueira-app.jsx` e `o-siqueira-painel.jsx` (protótipos navegáveis com o design system aplicado). Documentos de apoio: `o-siqueira-guia-plataforma.pdf` (fluxos ponta a ponta) e `o-siqueira-fechamento-julho.pdf` (modelo do relatório mensal).

---

## 13. Arquitetura e Modelo de Dados (visão macro)

### Arquitetura (decisão: PWA)

- **Front-end: PWA única em React (Next.js)** servindo os dois produtos por papel/rota: app do cliente (`app.osiqueira.com.br`) e painel do dono (`painel.` ou rota autenticada). **Sem app nativo** nesta fase — nada de loja Apple/Google.
- **Requisitos de PWA:** `manifest.json` (nome, ícones com o logo, tema preto #0F0E0B), service worker com cache dos assets e tela offline básica ("sem conexão — sua reserva está salva"), instalável na tela inicial (Android: prompt de instalação; iOS: instrução "Adicionar à Tela de Início"), splash com a marca.
- **Mobile-first obrigatório:** layout base para 360–430px de largura; painel do dono também operável 100% no celular (o Rômulo trabalha da cadeira). Desktop é adaptação, nunca o ponto de partida. Alvos de toque ≥ 44px, barras de navegação inferiores fixas, teclado numérico nos campos de valor/telefone.
- **Notificações:** o canal primário de notificação é o **WhatsApp** (não depender de Web Push, que é limitado no iOS). Push web fica como melhoria futura para Android.
- **Design system "O Siqueira"** (já aplicado nos protótipos): fundo preto-quente `#0F0E0B`, cards `#1A1712`, dourado `#C8A24B` / `#E3C77E`, marfim `#EFE9DC`, verde `#7FB069`, vermelho `#C96A5A`; tipografia **Oswald** (títulos, caps, tracking) + **Manrope** (texto); assinatura visual: **listra diagonal do barber pole** em progressos, destaques e divisores. Os arquivos `o-siqueira-app.jsx` e `o-siqueira-painel.jsx` são a referência visual e de componentes.
- **Backend API** (Node/NestJS ou Laravel) + **PostgreSQL**, multi-tenant por `barbershop_id` em todas as tabelas desde o dia 1.
- **Jobs agendados** (fila com Redis/BullMQ ou equivalente): expiração de holds de pagamento (15 min), régua de WhatsApp (D-5…D+5), lembrete do dia com botões, expiração de encaixe (45 min) com envio de alternativas, expiração de pontos, geração de cobranças de mensalistas, consolidação do fechamento mensal.
- **Integrações:** **Pagar.me/Stone** (pagamentos, estorno parcial, assinaturas — validado), **WhatsApp Business Cloud API (Meta)** com templates aprovados, (futuro) emissor de NFS-e.
- **Performance:** cálculo de slots < 1s; interações do painel instantâneas (dados agregados pré-calculados por job noturno + tempo real para o dia corrente).

### Entidades principais

`barbershops` · `users` (papéis: cliente, barbeiro, recepção, gestor) · `professionals` + `schedules` (jornadas/bloqueios) · `services` · `bookings` (status: pending_payment, confirmed, confirmed_by_client, completed, no_show, cancelled_by_client, cancelled_by_shop, expired · `payment_method`: pix, cartao, local) · `payments` (gateway, método, valor bruto/taxa/líquido, previsão de recebimento — só existe quando `payment_method` ≠ local) · `refunds` (valor devolvido, taxa retida, meio) · `client_occurrences` (falta/cancelamento tardio sem pagamento antecipado, usada para acionar a exigência automática de pagamento) · `wallet_credits` · `plans` + `subscriptions` + `subscription_invoices` (com estados da régua) · `loyalty_transactions` + `rewards` · `products` + `inventory_movements` · `orders`/`order_items` (comanda) · `commissions` · `cash_entries` (fluxo de caixa) · `expense_categories` · `whatsapp_messages` (log) · `audit_log`.

---

## 14. Requisitos Não Funcionais

- **LGPD:** consentimento de comunicação (opt-in WhatsApp), política de privacidade, direito de exclusão de dados, dados de pagamento nunca armazenados no nosso banco (tokenização/checkout do gateway).
- **Segurança:** autenticação com verificação por código, papéis e permissões por perfil, logs de auditoria em ações financeiras (estornos, edições de caixa, descontos).
- **Disponibilidade:** agendamento é o coração — meta de 99,5%+; filas de mensagens com retry.
- **Fuso e horários:** tudo em timezone da barbearia; atenção a horário de verão se voltar.
- **Performance:** cálculo de slots < 1s; agenda do dia em tempo (quase) real para a equipe.
- **Escalabilidade SaaS:** isolamento por tenant, configurações por barbearia (políticas, taxas, réguas, fidelidade), preparo para subdomínios/white-label.

---

## 15. Riscos e Pontos em Aberto (resolver no discovery técnico)

1. ~~Estorno via API~~ **Resolvido:** Pagar.me/Stone confirma estorno total e parcial via API (Pix com janela de 90 dias). Cancelamento com taxa viável tecnicamente.
2. ~~Recorrência tokenizada~~ **Resolvido:** Pagar.me tem motor de assinaturas nativo (planos, cobrança automática, gestão de inadimplência, cartão tokenizado).
3. **WhatsApp:** escolher Cloud API direta vs. BSP (custo por conversa vs. simplicidade), e submeter templates com antecedência (aprovação da Meta pode levar dias).
4. **Taxa de cancelamento — juridicamente:** validar redação dos termos de uso (CDC) para retenção de valores; deixar a política visível no momento da reserva.
5. **Definições de negócio pendentes:** percentuais e janelas de cancelamento; valores e limites dos planos; modelo de fidelidade (pontos vs. carimbos); percentuais de comissão; base de custo do produto (última entrada vs. custo médio).
6. **NFS-e:** fora do MVP, mas decidir cedo o emissor para desenhar a integração.

---

## 15.5. Sugestões pro Dono — Automações de Receita (Fase 2.5)

Recomendações de evolução após o MVP estabilizar, todas rodando sozinhas em cima da base já mapeada:

1. **Lista de espera automática:** horário cheio → cliente entra na fila; houve cancelamento → o sistema oferece a vaga no WhatsApp para a fila e o primeiro que pagar leva. Cancelamento vira receita recuperada em minutos.
2. **Reativação de clientes sumidos:** 45 dias sem cortar → mensagem automática "tá na hora" com link e o horário de costume sugerido.
3. **Ficha técnica do corte:** foto do resultado + número de máquina/pente + observações por cliente — atendimento premium de memória infinita.
4. **Botão "estou atrasado":** um toque avisa os próximos clientes do atraso estimado.
5. **Aniversariantes do mês:** mensagem automática com mimo (ex.: sobrancelha grátis no próximo corte).
6. **Pós-atendimento → avaliação no Google:** cliente satisfeito recebe o link de avaliação; reputação local como motor de aquisição.

---

## 15.7. Plano de Execução — Épicos de Desenvolvimento

Ordem sugerida de construção (cada épico entregável e testável isoladamente):

1. **Fundação:** projeto Next.js PWA (manifest, service worker, design system O Siqueira) + API + banco multi-tenant + autenticação por celular/código.
2. **Catálogo e agenda:** serviços (seed do cardápio real), jornada/bloqueios do profissional, motor de slots (jornada − ocupados − bloqueios, antecedências mín/máx).
3. **Reserva com pagamento opcional:** cliente escolhe Pix/cartão (hold de 15 min → checkout Pagar.me → webhook → confirmação) ou pagar no salão (confirmação direta, sem hold). Estados do `booking` conforme seção 13.
4. **WhatsApp base:** Cloud API, templates submetidos à Meta (confirmação, lembrete com botões, cancelamento, encaixe, régua de cobrança, avisos de agenda), log de mensagens, opt-in.
5. **Cancelamento e reembolso:** janelas parametrizáveis, estorno parcial via API, crédito em carteira, registro de motivo/retenção; registro de ocorrências para reservas sem pagamento antecipado e gatilho automático de pagamento obrigatório após reincidência.
6. **Encaixe:** solicitação → mensagem com botões no WhatsApp do dono → aprovação (cobra e confirma) / recusa ou expiração em 45 min (alternativas automáticas + link com serviço pré-selecionado) → espelho e log no painel.
7. **Painel Hoje:** KPIs, "Precisa de você", agenda com status, check de concluído (comanda → comissão → caixa → fidelidade).
8. **Mensalistas:** planos (preço = avulso × 0,9), assinatura Pagar.me (cartão tokenizado) ou Pix mensal, régua D-5→D+5, débito de uso no agendamento, suspensão/reativação automáticas, MRR cobrável vs. contratado.
9. **Financeiro:** taxas por método (versionadas por vigência), caixa do dia, fluxo de caixa, DRE, despesas manuais/recorrentes, fechamento mensal exportável em PDF (modelo pronto), ponto de equilíbrio.
10. **Loja e comissões:** produtos com custo, rateio automático sobre o lucro, estoque com mínimo e entradas, simulador.
11. **Números:** agregados por período, filtros livres, tops, mapa de calor, insights automáticos, simulador de provisionamento.
12. **Fidelidade:** carimbos/pontos com crédito pós-pagamento, resgate, expiração.
13. **Avisos de agenda:** regra "Avisar cliente" em toda edição impactante, fechamento de agenda/fim de ano com notificação e reagendamento automáticos.
14. **Fase 2.5 (pós-estabilização):** lista de espera, reativação de sumidos, ficha técnica do corte, botão "estou atrasado", aniversariantes, avaliação no Google.

---

## 16. Roadmap Sugerido

| Fase | Entregas | Estimativa* |
|---|---|---|
| Discovery técnico | Validar InfinitePay (estorno/recorrência), WhatsApp API, fechar políticas da seção 15 | 1–2 semanas |
| MVP (Fase 1) | Agendamento + pagamento + WhatsApp básico + cancelamento/reembolso + painel de agenda e caixa do dia | 8–12 semanas |
| Fase 2 | Mensalistas + régua completa, fidelidade, produtos/estoque, DRE e dashboards, comissões | +8–10 semanas |
| Fase 3 (SaaS) | Onboarding multi-barbearias, planos da plataforma, personalização | +8 semanas |

*Estimativas macro para 2–3 devs; refinar após discovery.

---

**Próximos passos:** revisar este documento em conjunto → fechar os pontos da seção 15 → os protótipos e o guia já cumprem o papel de wireframes → iniciar pelo Épico 1 da seção 15.7.

---

## 17. Análise Competitiva (pesquisa 30/07/2026) — visão para a venda do SaaS

### Principais concorrentes no Brasil

| Sistema | Força principal | Fraqueza explorável |
|---|---|---|
| **AppBarber** | App cliente + profissional consolidado, fidelidade, promoções, fila de espera | Exige download de app proprietário (fricção); financeiro raso |
| **Trinks** | Marca forte, comissões automáticas + maquininha própria (Belezinha, split), clube de assinaturas, NFS-e, estoque | Generalista (salões/estética); WhatsApp é só lembrete |
| **BestBarbers** | Clube de assinaturas nativo como carro-chefe, app white-label, NFS-e automática, 1.200+ barbearias | Comunicação presa ao app próprio; sem operação via WhatsApp |
| **Booksy / Fresha** | Marketplace de descoberta de novos clientes | Gestão financeira fraca; barbearia vira "mais uma" na vitrine |
| **Opero** | Bot de agendamento no WhatsApp (Cloud API oficial), sem download | Base pequena, produto em construção |
| **Barbeiro.app / TopAgenda / Navalha** | Preço acessível, não cobram por profissional; pautam pagamento antecipado | Pouca profundidade em qualquer módulo |
| **BarberCloud** (atual) | Página de agendamento simples e funcional | Sem pagamento, sem cobrança, sem gestão — é só agenda |

### Leitura do mercado

Duas tendências dominam 2026: **(a)** o modelo de **assinatura/mensalista** como pilar de receita previsível, e **(b)** o movimento **anti-app** — cliente agendando sem baixar nada, via WhatsApp ou link. Nenhum player entrega as duas coisas com profundidade financeira ao mesmo tempo.

### Nossos diferenciais defensáveis (posicionamento do SaaS)

1. **WhatsApp como centro operacional de mão dupla** — não só lembrete: o **dono decide o encaixe pelo WhatsApp** (aprovar/recusar com botões) e o sistema resolve sozinho recusas e silêncio (alternativas + link). Nenhum concorrente mapeado opera assim.
2. **Pagamento flexível com cancelamento civilizado** — cliente escolhe pagar antecipado (Pix/cartão, com **estorno parcial automático via API** e taxa configurável) ou no salão, sem fricção obrigatória; o risco de no-show é coberto pela confirmação via WhatsApp e por uma salvaguarda automática que exige pagamento antecipado de quem falta. Concorrentes ou pautam pagamento antecipado obrigatório (fricção) ou não cobram nada (sem proteção); nós entregamos os dois mundos.
3. **Financeiro de gente grande num produto de barbearia** — DRE, ponto de equilíbrio, taxas por método mapeadas, fechamento mensal em PDF, provisionamento com projeção. O mercado entrega "relatórios"; nós entregamos leitura de negócio.
4. **PWA sem download** — a experiência de app alinhada à tendência anti-app.
5. **Insights prontos** — mapa de calor com leitura de marketing por bloco, tops, clientes sumidos com valor de recuperação.

### Gaps a endereçar no roadmap SaaS (o que eles têm e nós ainda não)

- **NFS-e automática** (BestBarbers/Trinks têm): elevar de "fora de escopo" para **Fase 3 prioritária** — é critério de compra recorrente.
- **Split automático de comissão no recebimento** (Trinks/Belezinha): o Pagar.me suporta split — ativar quando entrar o 2º barbeiro / multi-tenant.
- **Fila de espera** (AppBarber): já prevista na Fase 2.5 — antecipar se virar objeção de venda.
- **App white-label** (BestBarbers): nossa Fase 3; a PWA com subdomínio + ícone da barbearia entrega 90% do valor sem loja de app.
- **Modelo de preço:** avaliar não cobrar por profissional (argumento do Barbeiro.app) — precificar por barbearia/plano de recursos.

### Pitch de uma linha para o SaaS

*"O único sistema em que a barbearia inteira — reserva com pagamento flexível, encaixe, cobrança de mensalista e aviso de cliente — acontece no WhatsApp, e o dono enxerga o negócio como um empresário: DRE, ponto de equilíbrio e fechamento do mês prontos."*
