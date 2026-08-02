# Auditoria Técnica — O Siqueira Barbearia

**Data:** 2026-08-02 · **Commit:** `a881f59` · **Escopo:** repositório completo (web + functions + config + PRD + CHANGELOG)
**Método:** leitura integral dos ~6.640 linhas de TypeScript, execução de `tsc --noEmit`, `eslint`, `next build`, `npm audit`, validação numérica do dataset e dos templates da Meta por script, cálculo de contraste WCAG dos tokens.

---

## Sumário executivo

| Severidade | Qtd. | Natureza |
|---|---|---|
| 🔴 Crítico | 7 | impedem deploy completo, quebram build limpo, ou entregam informação falsa ao usuário |
| 🟠 Alto | 15 | erro de cálculo/regra de negócio, dados contraditórios entre telas, acessibilidade reprovada |
| 🟡 Médio | 19 | duplicação, código morto, lacunas de UX, dívida de robustez |
| ⚪ Baixo | 6 | polimento, documentação, ergonomia |
| **Total** | **47** | |

**Estado de saúde da base:** o código é limpo, bem comentado e internamente coerente na camada de apresentação — `tsc --noEmit` e `eslint` passam sem uma única queixa. Os problemas não são de estilo: são de **fundação ausente** (nada persiste, nada é autorizado no servidor, nada é testado) e de **coerência de dados** (o mesmo mês tem dois faturamentos diferentes em telas vizinhas).

**As três coisas que eu resolveria primeiro:**
1. Destravar `firebase deploy` (AUD-02, AUD-03) e o build limpo (AUD-01) — hoje um clone novo não compila e o deploy só sobe hosting.
2. Corrigir `formatDatePtBR(...).split(",")[0]` (AUD-05) — duas telas financeiras estão sem datas em produção.
3. Reconciliar a base financeira (AUD-08) antes de plugar o Firestore, senão a inconsistência vira dado real.

**O que está notavelmente bem feito:** a decisão do estado único no `AuthProvider` (com o raciocínio documentado no código), o carregamento sob demanda do SDK do Firebase, a estratégia de cache do service worker e o motor de fatores de período do DRE — as três últimas com o histórico do "porquê" escrito junto. Isso é raro e deve ser preservado.

---

## 🔴 Críticos

### AUD-01 · O build falha sem `.env.local`

**Onde:** `web/src/lib/firebase.ts:20`

```ts
export const auth = getAuth(firebaseApp);   // executa no escopo do módulo
```

O `AuthProvider` está no layout raiz, então `lib/firebase` é avaliado durante o prerender de **todas** as rotas. Sem as variáveis `NEXT_PUBLIC_FIREBASE_*`, o build morre:

```
Error occurred prerendering page "/_not-found"
Error [FirebaseError]: Firebase: Error (auth/invalid-api-key)
⨯ Next.js build worker exited with code: 1
```

**Impacto:** clone novo não compila. CI (quando existir) não compila. Onboarding de dev trava sem mensagem útil — `.env.example` existe, mas nada no README diz que ele é obrigatório.

**Correção:** validar a config e falhar com mensagem legível, ou tornar `auth` preguiçoso (`getAuthLazy()`), ou fornecer valores de fallback no ambiente de build. A opção mais barata:

```ts
const missing = Object.entries(firebaseConfig).filter(([, v]) => !v).map(([k]) => k);
if (missing.length) throw new Error(`Firebase: variáveis ausentes: ${missing.join(", ")}. Copie web/.env.example para web/.env.local.`);
```

---

### AUD-02 · `firebase.json` aponta para três arquivos que não existem

**Onde:** `firebase.json:20-26`

```json
"firestore": { "rules": "firestore.rules", "indexes": "firestore.indexes.json" },
"storage":   { "rules": "storage.rules" }
```

Nenhum dos três está no repositório (confirmado por `git ls-files` e `ls`).

**Impacto duplo:**
1. `firebase deploy` (sem `--only hosting`) falha.
2. **Não há nenhuma regra de segurança versionada.** O que estiver valendo hoje no projeto `axon-barber` é invisível ao repositório, não passa por revisão e não tem histórico. Como a autorização da aplicação é 100% client-side (AUD-04), as Rules são a *única* barreira real quando o Firestore entrar.

**Correção:** criar os três arquivos, começando por um `firestore.rules` negando tudo por padrão, e evoluir por coleção junto com cada épico.

---

### AUD-03 · Cloud Functions não têm ponto de entrada

**Onde:** `functions/package.json:4` declara `"main": "lib/index.js"`; `functions/src/` contém **apenas** `whatsapp/templates.ts`.

`tsc` compila `templates.ts` para `lib/whatsapp/templates.js` e nunca gera `lib/index.js`. `firebase deploy --only functions` falha ao carregar o módulo. O `predeploy` do `firebase.json` roda o build e passa — o erro só aparece no carregamento.

**Impacto:** o codebase `default` de functions está declarado e é indeployável. Todo o épico de WhatsApp, webhooks de pagamento e provisionamento de claims depende dele.

**Correção:** criar `functions/src/index.ts` exportando as funções (mesmo que só um `healthcheck` inicial) e rodar `npm --prefix functions install` (o diretório sequer tem `node_modules`).

---

### AUD-04 · Autorização é exclusivamente client-side e o claim `owner` não tem provisionamento

**Onde:** `web/src/components/auth-guard.tsx:20`, `web/src/app/login/page.tsx:42`, `web/src/components/owner-panel-link.tsx:14`

As 19 rotas são arquivos estáticos públicos. `AuthGuard requireOwner` só decide **o que renderizar após a hidratação** — não impede ninguém de baixar o HTML/JS de `/painel/financeiro`.

Hoje o risco de vazamento é baixo porque o HTML prerenderizado dessas rotas contém só o spinner (verificado: `painel.html` tem 15 KB e nenhum conteúdo textual além do título). **Mas** `lib/mock-data.ts` inteiro vai no bundle do cliente — qualquer visitante já baixa "faturamento", "despesas" e "assinantes". Hoje são fictícios.

Agravante: **nenhum código no repositório atribui o claim `role`.** Ele foi gravado fora da aplicação e isso não está documentado em lugar nenhum. Se a conta do dono for recriada, ninguém sabe como restaurar o acesso ao painel.

**Correção:** (a) uma Cloud Function `setOwnerRole` versionada; (b) Firestore Rules que checam `request.auth.token.role == 'owner'`; (c) documentar o procedimento.

---

### AUD-05 · Duas telas financeiras exibem o dia da semana no lugar da data

**Onde:** `financeiro/despesas/page.tsx:170` e `financeiro/projecao/page.tsx:91`

```ts
formatDatePtBR(e.date).split(",")[0]
```

`formatDatePtBR("2026-07-05")` devolve `"domingo, 05 de julho"`. O `.split(",")[0]` extrai **`"domingo"`** — não a data.

Verificado em runtime:
```
completo : domingo, 05 de julho
split[0] : domingo
```

**Impacto:** a coluna "Data" do livro de despesas e a coluna "Dia" da projeção de 30 dias mostram só nomes de dia da semana, repetidos, sem número. Um razão de despesas sem data é inutilizável para conferência — e isso está em produção.

**Correção:** adicionar `formatDateShortPtBR(iso)` em `lib/format.ts` devolvendo `"05/07"` ou `"05 de julho"`, e usar nas duas tabelas.

---

### AUD-06 · 14 dos 16 templates do WhatsApp violam a regra da Meta documentada no próprio arquivo

**Onde:** `functions/src/whatsapp/templates.ts`

O cabeçalho do arquivo declara (linhas 13-14):

> *"Placeholders são posicionais (`{{1}}`, `{{2}}`, ...) e não podem começar nem terminar o corpo da mensagem, nem ficar adjacentes."*

Validação automatizada de todos os 16 templates:

| Template | Violação |
|---|---|
| `confirmacao_reserva` | ✅ ok |
| `lembrete_confirmacao` | ✅ ok |
| `encaixe_solicitacao` | ✅ ok |
| `cancelamento_reserva` | começa **e** termina com placeholder |
| `encaixe_alternativas` | começa **e** termina com placeholder |
| `mensalidade_hoje` | começa **e** termina com placeholder |
| `mensalidade_atraso` | começa **e** termina com placeholder |
| `mensalidade_suspensao` | começa **e** termina com placeholder |
| `agenda_alterada` | começa **e** termina com placeholder |
| `comunicado_geral` | começa e termina com placeholder + adjacentes |
| `alerta_operacional` | termina com placeholder + adjacentes |
| `pos_atendimento`, `resumo_do_dia`, `mensalidade_aviso`, `reativacao_cliente`, `aniversario` | terminam com placeholder |

Casos extremos:
```ts
comunicado_geral.body   = "{{1}}\n\n{{2}}\n\n{{3}}"          // corpo 100% variáveis
alerta_operacional.body = "⚠️ {{1}}\n\n{{2}}\n\nVer no painel: {{3}}"
```

**Impacto:** o CHANGELOG registra que este arquivo é *"a fonte da verdade dos textos que vão para aprovação na Meta"* e que **a aprovação leva dias**. Submeter como está gera rejeição em massa e joga fora o ciclo de aprovação — exatamente o item apontado como caminho crítico do go-live.

**Correção:** reescrever os corpos ancorando início e fim com texto fixo. Ex.: `"Olá {{1}}, sua reserva..."` e `"...é só abrir o app: {{5}} — até logo!"`. Adicionar um teste que valide as regras da Meta no CI antes de qualquer submissão.

---

### AUD-07 · A interface afirma que salvou o que não salvou

**Onde:** múltiplas telas

| Tela | Mensagem exibida | O que realmente acontece |
|---|---|---|
| `agendar/page.tsx:320` | **"Reserva confirmada!"** + "Você recebe a confirmação no WhatsApp" | nada é gravado; `/reservas` continua mostrando a reserva antiga |
| `perfil/page.tsx:61` | botão vira **"Salvo!"** por 900 ms | `saveProfile()` só faz `setSaved(true)` — não escreve nada, nem no perfil do Firebase Auth |
| `planos/page.tsx:224` | **"Plano ativado!"** + "Enviamos a confirmação no seu WhatsApp" | estado local; `/perfil` continua dizendo "Você ainda não é mensalista" |
| `loja/page.tsx:49` | produto aparece na lista | some no reload |
| `despesas/page.tsx:88` | lançamento salvo | some no reload |

O CHANGELOG documenta que "os dados ainda são fictícios" — mas isso é uma nota para o desenvolvedor, não para quem usa. A aplicação está publicada em `osiqueira.jpproject.com.br`.

**Impacto:** um cliente real que agendar acredita ter horário marcado. O dono que lançar uma despesa acredita ter lançado.

**Correção imediata (antes da persistência):** um banner persistente de ambiente de demonstração, e trocar os textos afirmativos por condicionais ("Assim que o pagamento estiver ativo, você receberá..."). Correção definitiva: implementar a persistência.

---

## 🟠 Altos

### AUD-08 · O mesmo mês tem dois faturamentos diferentes na mesma tela

**Onde:** `financeiro/page.tsx:75` vs `financeiro/page.tsx:184`

```ts
<KpiTile label="Recebido"      value={formatBRL(dre.grossRevenue)} />       // R$ 12.480
<QuickLinkCard label="Fluxo de Caixa" value={formatBRL(cashFlowMonthTotal)} /> // R$ 6.210
```

Verificado somando `dailyCashHistory` (27 dias abertos de julho): **R$ 6.210**, média R$ 230/dia. `dre.grossRevenue` é **R$ 12.480**. Fator de 2,01×.

**Impacto:** os dois números aparecem a 100 pixels de distância, ambos rotulados como julho/2026. Qualquer dono que confira vai perder a confiança no painel inteiro — e com razão.

**Correção:** derivar `dailyCashHistory` de `grossRevenue` (ou o contrário) para que a soma feche. É uma correção no mock hoje; se o Firestore entrar antes, vira um problema de modelagem (regime de caixa × competência, que o PRD §11 exige nas duas visões).

---

### AUD-09 · "Despesa fixa" usa dois conjuntos diferentes em telas vizinhas

**Onde:** `dre/page.tsx:121` vs `mock-data.ts:675`

```ts
// DRE — trata TODAS as 10 despesas como fixas
const fixasTree = monthExpenses.map(...)          // R$ 3.499

// Projeção — só as 4 marcadas recurring
const recurringExpenses = monthExpenses.filter(e => e.recurring)   // R$ 2.419
```

O campo `recurring` existe no dado e é exibido na tabela de Despesas com um selo "mensal" — o DRE simplesmente o ignora. Itens claramente não-recorrentes (produtos de limpeza, toalhas, lâminas, revisão da máquina, impulsionamento no Instagram) são somados como custo fixo.

**Impacto conceitual grave num produto financeiro:** a separação fixo × variável é exatamente o que o DRE se propõe a mostrar ("custo fixo × variável e margem de contribuição", subtítulo da tela). O ponto de equilíbrio calculado sobre um custo fixo inflado em 45% está errado.

---

### AUD-10 · A projeção de agosto contradiz o resultado de julho em 3,2×

**Onde:** `mock-data.ts:653-722`

`cashProjection` estima dias sem marcação com `avgRevenueByWeekday`, derivado de `dailyCashHistory` — a série que já está 2× abaixo do DRE (AUD-08).

Resultado calculado:
```
Resultado projetado (30 dias de agosto): R$  2.524
Resultado do mês de julho (DRE):         R$  8.045
Ponto mais apertado: 2026-08-10 → R$ -1.436
Dias estimados: 19  |  Dias confirmados: 6
```

**Impacto:** o painel diz que agosto vai render 69% menos que julho, sem nenhuma causa de negócio. É consequência direta de AUD-08 + AUD-09 (a projeção usa receita subestimada e despesa fixa subestimada, mas em proporções diferentes).

---

### AUD-11 · Divisão por zero produz `NaN%` em CSS e `R$ ∞`

**Onde:** `painel/(dashboard)/page.tsx:154`, `numeros/page.tsx:157`, `fluxo-caixa/page.tsx:92`

```ts
style={{ width: `${Math.min((recebidoReal / previsaoHoje) * 100, 100)}%` }}
```

Verificado: com `previsaoHoje === 0` (dia sem agenda, ou todos os agendamentos cancelados) a expressão gera `width: NaN%` — declaração CSS inválida, a barra fica com largura indefinida.

Mesmo padrão em:
- `numeros/page.tsx:157` — `kpis.revenue / kpis.appointments` → `formatBRL(Infinity)` renderiza **"R$ ∞"**.
- `fluxo-caixa/page.tsx:92` — `d.total / d.appointments` sem guarda.

**Correção:** helper `safeDiv(a, b, fallback = 0)` em `lib/format.ts`.

---

### AUD-12 · Reagendamento ilimitado anula a política de cancelamento

**Onde:** `reservas/page.tsx:96` (`confirmReschedule`)

Cancelar com menos de 6h de antecedência devolve R$ 0. Reagendar é **grátis, ilimitado e sem prazo** — inclusive 10 minutos antes do horário.

```ts
function confirmReschedule() {
  if (!time) return;
  setBooking(b => ({ ...b, date: isoDate, time, status: "confirmed" }));  // nenhuma checagem
}
```

Qualquer cliente aprende em uma tentativa: em vez de cancelar e perder o valor, reagenda para daqui a duas semanas e depois cancela com 100% de devolução.

O PRD §4 é explícito: *"Reagendamento permitido até **N horas** antes (configurável, sugestão: 6h) sem custo, limitado a X reagendamentos por reserva."* Nenhuma das duas regras existe.

---

### AUD-13 · Taxa de cancelamento diverge do PRD

**Onde:** `reservas/page.tsx:57`

```ts
const amount = booking.value / 2;   // devolve 50%
```

PRD §6: *"Entre 24h e 6h antes → Reembolso com **taxa de cancelamento** (sugestão: 20–30%)"* — ou seja, devolução de 70–80%.

O app cobra **50% de taxa**, mais que o dobro do especificado. O percentual não é exibido ao cliente em nenhum lugar (a tela de Agendar diz apenas "taxa de cancelamento"; só o modal de cancelamento mostra o valor final). Também não é parametrizável, embora o PRD exija configuração por barbearia para o SaaS.

---

### AUD-14 · A home ainda saúda "João" — contradiz o CHANGELOG

**Onde:** `(cliente)/page.tsx:26`

```tsx
<p>Bem-vindo de volta,</p>
<h1>João</h1>
```

O CHANGELOG de 2026-07-31 registra em "Alterado": *"Perfil e sidebars passaram a exibir o usuário realmente logado, no lugar de nome e telefone fixos no código."* A home ficou de fora — e é a primeira tela que todo cliente vê.

Causa: `(cliente)/page.tsx` é o **único Server Component de tela** do projeto, então não pode chamar `useAuth()`.

**Correção:** extrair um `<WelcomeHeading />` client component (mesmo padrão de `ProfileIdentity`).

---

### AUD-15 · O motor de agendamento ignora hora atual, dias fechados e duração

**Onde:** `agendar/page.tsx:29-51`

```ts
function nextDays(count) { /* hoje + 9 dias corridos, sem exceção */ }
const slots = useMemo(() => mockSlotsForDay(selectedDayIndex), [selectedDayIndex]);
```

Quatro regras do PRD §4 ausentes:

| Regra do PRD | Situação |
|---|---|
| Antecedência mínima (ex.: 1h) | ausente — às 18h ainda é possível marcar 09:00 **de hoje** |
| Dias/horários de funcionamento | ausente — domingo aparece com grade cheia, embora `dailyCashHistory` trate domingo como fechado |
| Soma de durações dos serviços | calculada e exibida, **nunca usada** — dá para marcar "Corte + barba + sobrancelha" (60 min) às 17:00, o último slot |
| Antecedência máxima (60 dias) | ausente (mitigado: só 10 dias são oferecidos) |

Além disso, `mockSlotsForDay` recebe o **índice** do dia (0–9), não a data — a ocupação de "amanhã" é sempre a mesma independentemente de qual dia seja.

**Impacto:** quando a persistência entrar, isso vira dupla reserva e cliente aparecendo em dia fechado.

---

### AUD-16 · O campo "Observações" da despesa é descartado silenciosamente

**Onde:** `financeiro/despesas/page.tsx:78-86`

```ts
const fields = { category, description, supplier, value, date, payment, recurring };
//                                    ↑ observations NÃO está aqui
setExpenses(prev => editingId ? prev.map(...{...e, ...fields}) : [{id, ...fields}, ...prev]);
```

O `<textarea>` existe (linha 318), o estado existe (`form.observations`), e o valor é jogado fora no salvamento. Ao reabrir a despesa para edição, `openEditModal` sempre repõe `observations: ""` — porque nunca houve o que repor.

O usuário digita uma nota interna sobre um lançamento financeiro e ela desaparece sem aviso.

---

### AUD-17 · Exclusão de despesa sem confirmação nem desfazer

**Onde:** `financeiro/despesas/page.tsx:196`

```tsx
<button aria-label="Excluir" onClick={() => removeExpense(e.id)}>
```

Um clique remove o lançamento. Sem modal, sem undo, sem log. O ícone de lixeira fica a 4px do ícone de editar, ambos 28×28px — alvo pequeno o suficiente para erro em telas de toque.

Contraste com `reservas/page.tsx`, onde cancelar uma reserva abre modal com aviso "não pode ser desfeita". O padrão existe no projeto e não foi aplicado aqui.

---

### AUD-18 · Perfil e Planos discordam sobre o plano do cliente

**Onde:** `perfil/page.tsx:129` e `perfil/page.tsx:206` (hardcoded) vs `planos/page.tsx:30` (`activePlanId`)

O estado do plano vive em `useState` dentro de `/planos`. O Perfil tem o texto **"Você ainda não é mensalista"** fixo no JSX, em dois lugares. Assinar um plano e ir ao Perfil mostra a contradição imediatamente.

Sintoma de uma ausência estrutural: **não há nenhum estado compartilhado entre rotas** além do `AuthContext`. Todo dado mutável é local à tela.

---

### AUD-19 · No filtro "Ano", a variação vs. período anterior é sempre "—"

**Onde:** `numeros/page.tsx:137-138` + `mock-data.ts:454`

```ts
export function periodFactor(period, offset) {
  const start = offset * PERIOD_MONTHS[period];
  for (let i = 0; i < months; i++) total += monthRevenueFactor(start + i);
}
export function monthRevenueFactor(offset) {
  return MONTH_REVENUE_FACTORS[Math.abs(Math.round(offset)) % 12];   // ← módulo 12
}
```

Para `period === "ano"` (12 meses), `periodFactor("ano", 0)` soma os índices 0–11 e `periodFactor("ano", 1)` soma os índices 12–23 → que, pelo módulo 12, **são os mesmos 0–11**. Os dois valores são idênticos, `diff === 0`, e o componente `Delta` cai no ramo `"— vs período anterior"` para todos os 5 KPIs.

Trimestre e semestre funcionam corretamente.

---

### AUD-20 · Contraste reprovado no WCAG AA no elemento mais usado da interface

**Onde:** `app/globals.css` + `components/ui/button.tsx:8`

Razões calculadas sobre os tokens reais:

| Combinação | Razão | Veredito (texto normal, AA = 4.5:1) |
|---|---|---|
| **`bg-gold` + `text-bg`** — botão primário, aba ativa, nav ativo, células do heatmap | **3.23:1** | ❌ **falha** |
| `text-success` sobre `bg` — valores positivos no DRE/Financeiro | **4.41:1** | ❌ falha por pouco |
| `border-border` sobre `bg` — contorno de inputs e cards | **1.42:1** | ❌ falha (WCAG 1.4.11 exige 3:1 para limites de componente) |
| `text-ivory` sobre `bg` | 18.37:1 | ✅ |
| `text-ivory-muted` sobre `bg` / `surface` | 5.93 / 5.45:1 | ✅ |
| `text-gold-light` sobre `bg` / `surface` | 5.57 / 5.11:1 | ✅ |
| `text-danger` sobre `bg` | 5.57:1 | ✅ |

O botão primário (`text-sm`, 14px — não se qualifica como "texto grande") é o controle mais repetido do produto. Escurecer `--color-gold` para ~#8f6828 resolveria o botão sem alterar a identidade; as bordas precisam de um token dedicado mais escuro.

Agravante: `text-[10px]` é usado em todos os rótulos de KPI (`financeiro`, `dre`, `projecao`, `numeros`, `despesas`).

---

### AUD-21 · `maximumScale: 1` bloqueia o zoom da página

**Onde:** `app/layout.tsx:45`

```ts
export const viewport: Viewport = { ..., maximumScale: 1, ... };
```

Impede o pinch-zoom em iOS/Android. Viola **WCAG 2.2 SC 1.4.4 (Resize Text)** — e combinado com AUD-20 (texto de 10px, contraste no limite), remove a única saída que um usuário com baixa visão teria.

---

### AUD-22 · O service worker tem dois riscos que só aparecem em produção

**Onde:** `web/public/sw.js`

**(a) `skipWaiting()` imediato + cache-first de assets com hash** (linhas 14 e 46)

```js
self.addEventListener("install", event => { ...; self.skipWaiting(); });
```

Uma aba aberta durante um deploy passa a ser controlada pelo SW novo enquanto ainda executa o JS do build antigo. Se essa aba pedir um chunk do build anterior que já não existe no servidor **e** não está no cache, a navegação quebra. A prática recomendada é ativar sob mensagem explícita do cliente (`SKIP_WAITING`), com aviso de "nova versão disponível".

**(b) Cache de resposta same-origin sem segmentação por usuário** (linhas 68-78)

```js
if (response.ok && request.url.startsWith(self.location.origin)) {
  caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
}
```

Hoje é inofensivo (nenhuma resposta contém dado de usuário). Quando as telas passarem a renderizar dados do Firestore no servidor, os payloads RSC — que são same-origin — passam a ser gravados num `CacheStorage` compartilhado pelo dispositivo, sem chave por conta. Dois usuários no mesmo navegador (celular emprestado no salão é cenário real) podem ver dados um do outro.

**(c) Menor:** `caches.match(OFFLINE_URL)` pode devolver `undefined` se o `cache.addAll` do install falhar — e `addAll` é atômico, um único 404 derruba todo o precache.

---

### AUD-23 · `nextChargeDate()` erra a virada de mês

**Onde:** `planos/page.tsx:21`

```ts
const d = new Date(); d.setMonth(d.getMonth() + 1);
```

Verificado: assinando em **31/01**, a "próxima cobrança" exibida é **03 de março** — fevereiro é pulado. Mesmo problema em 31/03, 31/05, 31/08, 31/10.

Aparece em dois lugares visíveis ao cliente: o card do plano ativo e o texto "Primeira cobrança hoje. A próxima cai em X" dentro do checkout.

---

### AUD-24 · MRR não bate com a lista de assinantes

**Onde:** `mock-data.ts:592` vs `mock-data.ts:596`

```ts
export const mrr = { billed: 894, contracted: 1043 };
// assinantes ATIVOS: sub_1 "Corte ilimitado" (R$149) + sub_2 "2 cortes + 1 barba" (R$119) = R$ 268
```

A tela Mensal mostra "MRR cobrável R$ 894 · 86% do contratado" logo acima da tabela que lista dois ativos somando R$ 268. Fator de 3,3×.

O mesmo R$ 894 aparece em `revenueBreakdown` como "Mensalistas", propagando a inconsistência para o DRE e para a tela Financeiro.

Relacionado: `commercialStats.avgTicket: 129` com legenda "mensalidade/ativo" — não corresponde nem à média dos planos ativos (R$ 134) nem a `mrr.billed / 2` (R$ 447).

---

### AUD-25 · O modelo de comissão implementado não é o do PRD

**Onde:** `mock-data.ts:216` e `mock-data.ts:404`

```ts
export const businessRates = { commissionRatePct: 15, taxRatePct: 6 };
commissions: Math.round(storeProfitThisMonth * 0.15)   // R$ 86
```

Três divergências:

1. **Modelo.** O PRD §10 define `%barbeiro + %barbearia = 100%` do lucro bruto (exemplo: 40/60), *validado pelo sistema*. O código usa uma taxa única de 15% sem contraparte.
2. **Base.** O comentário do próprio código diz *"Comissão do profissional sobre o lucro da venda (produtos **e serviços**)"* — mas o DRE só aplica comissão sobre o lucro da **loja**. Os R$ 10.200 de serviços avulsos não geram comissão nenhuma.
3. **Imposto.** `taxRatePct: 6` só é usado na prévia de precificação da Loja. **O DRE não tem linha de imposto** — o "Resultado do Mês" de R$ 8.045 ignora o Simples Nacional inteiro.

Sobre (3), o PRD §10 é explícito: *"Mesmo na operação solo (dono = barbeiro), o rateio é registrado: separa o 'salário do dono como barbeiro' do resultado da empresa — essencial para o DRE refletir a realidade."*

---

### AUD-26 · Três valores diferentes para o prazo de expiração do encaixe

| Onde | Valor |
|---|---|
| `painel/(dashboard)/page.tsx:241` | `<Pill tone="gold">expira em 22 min</Pill>` — **literal fixo**, não calculado |
| `agendar/page.tsx:245` | "Sem resposta em até **45 min**, o sistema libera opções..." |
| PRD §4 / épico 6 | "X minutos (configurável, ex.: 30–60 min)" / "expiração em 45 min" |

O dono vê "22 min" no painel; o cliente leu "45 min" ao solicitar. Nenhum dos dois é calculado a partir de nada.

---

### AUD-27 · Modal duplicado três vezes; a versão acessível é a menos usada

**Onde:** `loja/page.tsx:161`, `financeiro/despesas/page.tsx:210` vs `components/ui/modal.tsx`

O CHANGELOG registra a criação de um "componente de modal reutilizável, com fechar por `Esc`". Ele é usado em Reservas, Planos e Perfil. **Loja e Despesas mantiveram cópias locais** que não têm:

| Recurso | `ui/modal.tsx` | cópias em Loja/Despesas |
|---|---|---|
| Fecha com `Esc` | ✅ | ❌ |
| `role="dialog"` / `aria-modal` | ✅ | ❌ |
| `aria-label` no diálogo | ✅ | ❌ |

Nenhuma das três versões tem *focus trap*, foco inicial ou bloqueio de scroll do body — mas as cópias são estritamente piores. São justamente os dois modais de escrita de dado financeiro.

---

## 🟡 Médios

### AUD-28 · Slot "riscado" é código morto — todo horário ocupado vira encaixe
`agendar/page.tsx:180` trata o caso `!slot.available && !slot.isFitIn` (horário indisponível, riscado). `mockSlotsForDay` marca **todo** slot ocupado com `isFitIn: true` — verificado: em 10 dias, 30 slots ocupados, **zero** caem no ramo riscado. O cliente nunca vê um horário simplesmente indisponível; sempre vê "encaixe". Além disso, o mesmo dado é tratado de forma oposta em `reservas/page.tsx:347`, onde slots ocupados ficam `disabled`.

### AUD-29 · `KpiTile` e `signTone` duplicados em três arquivos
Cópias byte-a-byte em `financeiro/page.tsx:261`, `dre/page.tsx:433` e `projecao/page.tsx:134`. Qualquer ajuste de tom ou espaçamento precisa ser feito três vezes. Extrair para `components/ui/kpi-tile.tsx`.

### AUD-30 · Blocos de CTA duplicados em Agendar
`agendar/page.tsx:335-366` (barra fixa mobile) e `369-439` (card sticky desktop) repetem verbatim a lógica de `disabled` e o ternário de rótulo de 3 níveis. Divergem no primeiro ajuste.

### AUD-31 · Login sem cadastro, sem recuperação de senha e sem `<form>`
`login/page.tsx` — a aba "E-mail" só faz `signInWithEmailAndPassword`. **Não há como criar conta por e-mail** nem link "esqueci minha senha". Os campos não estão em um `<form>`, então `Enter` não submete. Os `<label>` não têm `htmlFor`/`id` (não associados ao input). Faltam `autoComplete="email"` / `"current-password"`.

### AUD-32 · `RecaptchaVerifier` criado sem limpeza e sem reset após falha
`login/page.tsx:45-51` instancia o verificador em `useEffect` sem `return () => recaptchaRef.current?.clear()`. O Firebase exige `clear()`/`reset()` antes de reusar um verificador consumido — após um `signInWithPhoneNumber` que falha, a segunda tentativa tende a falhar também. É instanciado mesmo quando o método selecionado é e-mail.

### AUD-33 · Erros de autenticação são engolidos
`login/page.tsx` usa `catch { setError("mensagem genérica") }` nos quatro handlers — sem `console.error`, sem telemetria, sem distinguir `auth/wrong-password` de `auth/too-many-requests` ou de falha de rede. Não há como diagnosticar um problema relatado por usuário.

### AUD-34 · Navegação de período ilimitada em Números
`numeros/page.tsx:200` — `setOffset(o => o - 1)` sem piso. É possível navegar até "Janeiro de 1524", e os dados repetem a cada 12 meses por causa do módulo. O DRE limita corretamente com `MAX_MONTH_OFFSET`; Números não. Comportamentos divergentes para a mesma ação.

### AUD-35 · Relação inventada entre no-show e receita
`numeros/page.tsx:148` — `noShowPct / monthlyAvg`. Dividir uma taxa de faltas pelo fator de receita do período faz o no-show cair automaticamente quando a receita sobe. Não há relação causal; é um artefato do mock que produz um número aparentemente informativo.

### AUD-36 · "Insights automáticos" não são automáticos
`numeros/page.tsx:353-360` — o card "Sexta e sábado à tarde são o horário nobre — 90%+ de ocupação" é texto fixo, não derivado de `hourlyHeatmap`. Permanece idêntico em qualquer período selecionado.

### AUD-37 · Código morto
Exports nunca importados: `availableMonths`, `previousMonthKpis`, `operationalStats`, `sixMonthFlow` (`mock-data.ts`), `commissionRatePct` (alias redundante de `businessRates.commissionRatePct`). Componente órfão: `components/coming-soon.tsx` (nenhum import em todo o `src`).
Nota: `sixMonthFlow` traz "Jul: despesa 3060", enquanto `dre.operatingExpenses` calcula **3499** — se for reativado, entra já inconsistente.

### AUD-38 · `<a href>` em navegação interna causa reload completo
`reservas/page.tsx:192` — `<a href="/agendar">` no estado "Reserva cancelada". Descarta o SPA, recarrega o bundle e perde o estado. Todo o resto do projeto usa `<Link>`.

### AUD-39 · Loja: 100% de lucro produz preço R$ 0,00 sem aviso
`loja/page.tsx:36` — `const price = profitPct < 100 ? cost / (1 - profitPct/100) : 0`. Digitar 100 no campo "Percentual de lucro" mostra "Preço de venda R$ 0,00" e "Lucro líquido −R$ X" na prévia, sem mensagem. Valores negativos também são aceitos. Além disso, o campo se chama "Percentual de lucro" mas a fórmula é margem **sobre o preço de venda**: quem digita 30 esperando 30% sobre o custo obtém markup de 42,9%.

### AUD-40 · Formulários falham em silêncio
`loja/page.tsx:50` (`if (!form.name || !form.cost) return`) e `despesas/page.tsx:76` (`if (!form.description || !value) return`). O botão fica habilitado, o clique não faz nada e nenhuma mensagem aparece. Em Despesas, `Number("abc")` → `NaN` (falsy) e `value === 0` também abortam, sem explicar por quê. Valores negativos, por outro lado, passam.

### AUD-41 · Despesas: sem ordenação, filtro ou totalizador na tabela
A lista sai na ordem do array (datas 05, 10, 12, 08, 15, 18, 08, 06, 01, 20 — visivelmente fora de ordem); novos lançamentos entram no topo. Não há ordenação por coluna, filtro por categoria/período nem linha de total — apesar dos KPIs no topo prometerem recorte "no mês atual". O campo de data no formulário tem default fixo `"2026-07-31"`.

### AUD-42 · Fluxo de Caixa não tem navegação de mês
`fluxo-caixa/page.tsx` renderiza `dailyCashHistory` (julho/2026 fixo) sem seletor de período e **sem exibir de que mês se trata** — o cabeçalho diz apenas "Histórico diário". DRE e Números têm navegação; esta tela, não. `bestDay` usa `reduce` sem valor inicial (lança `TypeError` em array vazio).

### AUD-43 · Mensal é somente leitura
`mensal/page.tsx` não permite criar, editar, suspender, reativar ou cancelar assinante, nem disparar cobrança. A "Régua de cobrança" é um contador visual de `dueStage` — não há transição de estado. O PRD §8 exige suspensão automática em D+5 e reativação na hora do pagamento.

### AUD-44 · Reservas suporta uma única reserva futura
`reservas/page.tsx:73` — `useState<Booking>(nextBooking)`, um objeto, não uma lista. A aba "Futuras" nunca mostra mais de um agendamento. Limitação estrutural que precisa mudar junto com a persistência.

### AUD-45 · Estatísticas do cliente contam o futuro como passado
`reservas/page.tsx:119,125` e `perfil/page.tsx:57-59` somam `nextBooking` em "atendimentos no total" e "investido na barbearia". Um agendamento futuro — possivelmente com pagamento "no salão", isto é, ainda não pago — é contado como atendimento realizado e dinheiro gasto. Os dois lugares ainda divergem entre si: Reservas reage ao cancelamento (`active ? 1 : 0`), Perfil sempre soma `+1`.

### AUD-46 · Sem headers de segurança
`next.config.ts` define apenas `Cache-Control` para `/sw.js`. Ausentes: `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options`/`frame-ancestors`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`. Para uma aplicação autenticada que abrirá popup de OAuth (Google) e receberá webhooks de pagamento, CSP e `frame-ancestors` são o mínimo.

---

## ⚪ Baixos

### AUD-47 · README é o boilerplate do `create-next-app`
`web/README.md` fala de Geist e deploy na Vercel. Não menciona Firebase, `.env.local`, o comando de deploy real, a existência do painel ou o aviso do `AGENTS.md`. É o primeiro arquivo que um dev novo abre.

### AUD-48 · `manifest.orientation: "portrait"` conflita com o layout desktop
`app/manifest.ts:11` trava a orientação do PWA instalado em retrato, embora o produto tenha um layout desktop/tablet completo com sidebar (`md:` em todas as telas). Um tablet instalado como app fica preso no layout mobile.

### AUD-49 · Três vulnerabilidades HIGH sem correção viável
`npm audit`: `postcss` (XSS via `</style>` não escapado; leitura arbitrária de arquivo via `sourceMappingURL`) e `sharp`/libvips (CVE-2026-33327/33328/35590/35591), ambas transitivas de `next@16.2.12`. O `fixAvailable` sugerido é **`next@9.3.3`** — downgrade de 7 majors, inaceitável.
*Avaliação de risco:* `postcss` roda **apenas em build** — o vetor exige CSS hostil entrando no pipeline, o que só acontece via dependência comprometida. `sharp` roda em build; **se** a integração de frameworks do Firebase Hosting (`hosting.source: "web"`) provisionar backend para otimização de imagem, também roda em produção — isso não foi verificado nesta auditoria e vale confirmar no console antes de descartar. Ação: `overrides` no `package.json` para versões corrigidas de `postcss`/`sharp`, ou aguardar patch do Next. **Não rodar `npm audit fix --force`.**

### AUD-50 · Múltiplos lockfiles fazem o Turbopack inferir a raiz errada
```
⚠ We detected multiple lockfiles and selected the directory of
  /Users/joaodamas/package-lock.json as the root directory.
```
Um `package-lock.json` no `$HOME` está vencendo o do projeto. Corrigir com `turbopack: { root: __dirname }` em `next.config.ts` (ou removendo o lockfile órfão do `$HOME`).

### AUD-51 · Zero testes, zero CI
Nenhum arquivo `*.test.*`/`*.spec.*`, nenhum framework instalado, `.github/` não existe. Toda a lógica financeira (política de reembolso, rateio de comissão, agregação por período, projeção de caixa) é validada apenas por inspeção visual.

### AUD-52 · `setTimeout` sem limpeza no Perfil
`perfil/page.tsx:63` — `setTimeout(..., 900)` sem `clearTimeout` no unmount. Navegar para outra rota dentro da janela de 900ms dispara `setState` em componente desmontado.

---

## Plano de correção sugerido

### Fase 0 — Destravar (1–2 dias)
| # | Ação |
|---|---|
| AUD-05 | `formatDateShortPtBR` + corrigir as duas tabelas — **1 hora, corrige produção** |
| AUD-01 | Validação de env com mensagem legível |
| AUD-02 | Criar `firestore.rules` (deny-all), `storage.rules`, `firestore.indexes.json` |
| AUD-03 | Criar `functions/src/index.ts` + `npm install` em `functions/` |
| AUD-11 | `safeDiv` nos três pontos |
| AUD-16, AUD-17 | Persistir `observations`; modal de confirmação na exclusão |
| AUD-50 | `turbopack.root` |

### Fase 1 — Verdade dos dados (3–5 dias)
| # | Ação |
|---|---|
| AUD-08, AUD-09, AUD-10, AUD-24 | Reconciliar o dataset: uma única receita mensal, `recurring` respeitado no DRE, MRR derivado dos assinantes |
| AUD-25 | Decidir o modelo de comissão (PRD ou atual) e aplicar no DRE, incluindo linha de imposto |
| AUD-07 | Banner de demonstração + textos condicionais enquanto não há persistência |
| AUD-14, AUD-18 | Nome real na home; estado de plano compartilhado |
| AUD-19, AUD-34, AUD-35, AUD-36 | Corrigir agregação anual, limitar navegação, remover a divisão inventada, derivar os insights |

### Fase 2 — Regras de negócio (1–2 semanas)
| # | Ação |
|---|---|
| AUD-12, AUD-13 | Janela e limite de reagendamento; taxa de cancelamento parametrizável alinhada ao PRD |
| AUD-15 | Motor de slots: antecedência mín./máx., jornada, dias fechados, soma de durações |
| AUD-26 | Expiração de encaixe calculada de uma constante única |
| AUD-06 | Reescrever os 14 templates + teste de validação das regras da Meta |

### Fase 3 — Fundação (contínuo)
| # | Ação |
|---|---|
| AUD-04 | Function de provisionamento de claims + Rules por coleção + documentação |
| AUD-20, AUD-21, AUD-27, AUD-31 | Acessibilidade: contraste, zoom, modal único com focus trap, formulários semânticos |
| AUD-22 | `SKIP_WAITING` sob demanda + segmentação de cache por conta antes de servir dado real |
| AUD-46 | Headers de segurança |
| AUD-51 | Vitest + testes das funções puras (`refundFor`, `periodFactor`, precificação) + CI no GitHub Actions |
| AUD-29, AUD-30, AUD-37 | Extrair `KpiTile`, unificar CTAs, remover código morto |

---

## Anexo — o que foi verificado por execução, não por leitura

| Verificação | Resultado |
|---|---|
| `npx tsc --noEmit` | ✅ 0 erros |
| `npm run lint` | ✅ 0 avisos |
| `npm run build` sem `.env.local` | ❌ falha no prerender (AUD-01) |
| `npm run build` com env fictício | ✅ 19 rotas, todas `○ Static` |
| Conteúdo do HTML prerenderizado de `/painel` | apenas o spinner do `AuthGuard` (15 KB, sem dados) |
| Soma de `dailyCashHistory` (julho) | R$ 6.210 em 27 dias (média R$ 230/dia) |
| Soma de `monthExpenses` | R$ 3.499 · recorrentes: R$ 2.419 |
| CMV / receita da loja / comissão | R$ 640 / R$ 950 / R$ 86 |
| `revenueBreakdown` vs `dre.grossRevenue` | R$ 12.480 = R$ 12.480 ✅ |
| MRR de assinantes ativos | R$ 268 (declarado: R$ 894) |
| `cashProjection` (30 dias de agosto) | resultado R$ 2.524 · mínimo −R$ 1.436 em 10/08 · 19 dias estimados |
| Regras da Meta nos 16 templates | 14 reprovados |
| Contraste WCAG dos 11 pares de tokens | 3 reprovados |
| `formatDatePtBR("2026-07-05").split(",")[0]` | `"domingo"` |
| `new Date("2026-01-31").setMonth(+1)` | `03 de março` |
| Ramo de slot indisponível em 10 dias | 30 ocupados, 0 alcançam o ramo |
| `npm audit` | 3 HIGH, todas transitivas de `next` |
| Busca por `setCustomUserClaims` | 0 ocorrências |
| Arquivos de teste / `.github/` | 0 / inexistente |
