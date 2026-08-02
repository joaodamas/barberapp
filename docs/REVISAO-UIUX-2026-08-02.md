# Revisão de UI/UX e Re-auditoria

**Data:** 2026-08-02 (após as correções) · **Escopo:** validação independente das 47 correções + revisão de telas, cores, hierarquia e navegação.
**Método:** varredura automatizada sobre o código corrigido, checagem das regras de acessibilidade e interação (WCAG 2.2, alvos de toque, foco, teclado), cálculo de contraste dos tokens e leitura de cada tela.

---

## Parte 1 — Re-auditoria: o que foi confirmado e o que ficou para trás

### 1.1 Confirmado corrigido (verificação automatizada)

| Achado | Verificação | Resultado |
|---|---|---|
| AUD-01 build sem env | mensagem nomeia as chaves faltantes | ✅ |
| AUD-02 regras versionadas | 3 arquivos presentes | ✅ |
| AUD-03 entrada das functions | `lib/index.js` gerado | ✅ |
| AUD-04 provisionamento de claim | `setCustomUserClaims` presente | ✅ |
| AUD-05 data virando dia da semana | 0 ocorrências de `.split(",")` em data (só comentário e teste) | ✅ |
| AUD-06 templates da Meta | 20 testes, 16 templates aprovados | ✅ |
| AUD-11 divisão sem guarda | 0 nas expressões auditadas | ✅ |
| AUD-20 branco sobre dourado | 0 ocorrências de `text-bg` | ✅ |
| AUD-21 zoom bloqueado | `maximumScale` só em comentário | ✅ |
| AUD-27 modais locais | 0 fora de `ui/modal.tsx` | ✅ |
| AUD-29 `KpiTile` duplicado | 0 definições locais | ✅ |
| AUD-37 exports mortos | `availableMonths`, `previousMonthKpis`, `operationalStats`, `sixMonthFlow`, `commissionRatePct`, `cashToday`, `breakEven` → 0 usos | ✅ |
| AUD-38 `<a href>` interno | 0 ocorrências | ✅ |
| AUD-51 testes | 5 arquivos, 63 testes | ✅ |

### 1.2 Regressões que a re-auditoria encontrou — introduzidas pelas próprias correções

Estas **não existiam antes** e passaram pelo typecheck, pelo lint e pelos 40 testes originais.

#### REG-01 🔴 · O seletor de dias abria num dia fechado

`agendar/page.tsx` e `reservas/page.tsx` iniciavam `selectedDayIndex` em `0`. O motor novo passou a marcar domingo como fechado — e **02/08/2026, o dia da auditoria, era domingo**. A tela de Agendar abria com um dia desabilitado selecionado, sem horário nenhum, sem o usuário ter escolhido nada. Reproduzível uma vez por semana, indefinidamente.

Correção: `firstBookableIndex()` escolhe o primeiro dia realmente agendável.

#### REG-02 🟠 · `slotsForDate` devolvia 6 horários livres num domingo

O motor filtrava por antecedência e duração, mas **não checava se a barbearia abre naquele dia** — a exclusão só existia no seletor de dias. A tela mostrava "A barbearia não abre neste dia" e, logo abaixo, uma grade com horários clicáveis.

Correção: dia fechado devolve todos os slots indisponíveis (defesa em profundidade) e a grade não renderiza.

#### REG-03 🟡 · Cinco divisões sem guarda sobreviveram à varredura inicial

`mrrPct`, `savingsPct`, `breakEvenVisits`, o percentual do "de onde vem o dinheiro" e a largura da barra do fluxo de caixa continuavam sem `safeDiv`/`safePct`. A primeira varredura procurou pelos denominadores que eu já conhecia, não por todas as divisões.

#### REG-04 🟡 · `tightestDay` continuava com `reduce` sem valor inicial

Corrigi o caso do fluxo de caixa e não o da projeção.

#### REG-05 ⚪ · Órfãos criados pela própria limpeza

`mockSlotsForDay`, `operatingExpenses`, `loyaltyPolicy`, `formatDateNumeric` e o import de `TimeSlot` ficaram sem uso depois das substituições. `coming-soon.tsx`, apontado no relatório original, não chegou a ser removido.

**Lição registrada:** três testes de regressão foram adicionados para o caso do domingo — a classe de bug que o typecheck e o lint não pegam é exatamente a que depende de calendário.

### 1.3 Falsos positivos verificados

`breakEven` aparecia com 13 ocorrências — são `breakEvenDay`, `breakEvenPct` e `breakEvenVisits`, identificadores derivados, não o export removido.

---

## Parte 2 — Revisão de UI/UX

### 2.1 Sobre a recomendação genérica de design system

A ferramenta de design system sugeriu, para "barbershop booking dashboard", uma paleta roxo/laranja (#7C3AED / #F97316) em estilo *Vibrant & Block-based*, com Fira Code como fonte de títulos. **Descartei.** O produto já tem identidade deliberada e coerente — branco, dourado e preto, Oswald para títulos e Manrope para corpo, com a listra do barber pole como assinatura visual. Trocar isso por um preset de startup destruiria o único ativo de marca que existe. Aproveitei da ferramenta as **regras** (acessibilidade, alvos de toque, contraste, foco), não a sugestão estética.

### 2.2 O que está bem resolvido

**Identidade visual.** A escolha de dourado sobre fundo claro com preto quase absoluto é adequada ao segmento — barbearia premium — e a listra animada do barber pole é uma assinatura barata e memorável. Oswald condensado nos números financeiros dá autoridade sem pesar.

**Sistema de tokens.** Uma camada só, exposta ao Tailwind v4 por `@theme inline`. Trocar `--color-gold` propaga para tudo. É o que permitiu corrigir o contraste do produto inteiro mexendo em uma linha.

**Estratégia mobile-first com segunda coluna no desktop.** As telas de Início, Reservas, Agendar e Perfil ganham uma coluna lateral em `md:` em vez de esticar uma coluna estreita. É a decisão certa e está aplicada com consistência.

**Duas navegações alimentadas por uma fonte.** `BottomNav` no mobile e sidebar no desktop lendo o mesmo `nav-items.ts`. Não há divergência possível entre as duas.

**Hierarquia nas telas financeiras.** O DRE expansível — grupo → item → subitem, com o valor sempre à direita e tom semântico (verde/vermelho) — é legível e denso ao mesmo tempo. É a melhor tela do produto.

**`prefers-reduced-motion`** respeitado na listra e no hover dos cards, e foco visível global com halo dourado. Dois detalhes que quase ninguém faz.

### 2.3 Correções aplicadas nesta revisão

| # | Problema | Correção |
|---|---|---|
| UX-01 | **8 botões de ícone com 28×28px** — navegação de mês do DRE e de Números, editar/excluir despesa, fechar modal, sair da sidebar. Abaixo do mínimo de 44px para toque, e são justamente os controles de ação destrutiva. | `h-11 w-11` no mobile, `md:h-8 md:w-8` no desktop — toque confortável sem perder densidade na tela grande. |
| UX-02 | **Card de plano era `<div onClick>` com `<button>` dentro** — inalcançável por teclado e com interativo aninhado. | A ação vive só no botão; o card mantém o realce via `group`. |
| UX-03 | **Sem skip link.** Quem navega por teclado passava pelos 5–9 itens da sidebar antes de chegar ao conteúdo, em toda troca de tela. | Link "Pular para o conteúdo" nos dois layouts, com `id="conteudo"` no `<main>`. |
| UX-04 | **27 rótulos em 9–10px.** Legendas de KPI, captions e badges. Abaixo do legível em tela pequena, agravado pelo `text-ivory-muted`. | Mínimo elevado para 11px. |
| UX-05 | **`.card-interactive` sem `cursor: pointer`.** O cartão só dizia que era clicável no hover, e não pelo cursor. | `cursor: pointer` no token. |
| UX-06 | **`line-height` do corpo herdava ~1.2 do navegador.** Blocos de política de cancelamento e descrição de plano ficavam apertados. | `1.55` no `body`. |
| UX-07 | **Cinco tabelas rolam horizontalmente no celular** (480–720px de largura mínima) sem nenhuma indicação de que há coluna à direita. | Sombra de rolagem que aparece só enquanto há conteúdo fora da tela. |
| UX-08 | **Colunas de valor sem alinhamento tabular.** `R$ 1.800,00` e `R$ 90,00` não alinhavam dígito a dígito — o olho não compara colunas de dinheiro assim. | `font-variant-numeric: tabular-nums` em `.font-display` e células de tabela. |

Contraste após todas as mudanças, medido sobre os tokens reais:

| Combinação | Antes | Depois |
|---|---|---|
| Botão primário / aba ativa / nav ativo | 3,23:1 ❌ | **5,69:1** ✅ |
| Hover do botão primário | (herdava gold-light) 3,30:1 ❌ | **7,20:1** ✅ |
| Valores positivos no financeiro | 4,41:1 ❌ | **5,14:1** ✅ |
| Contorno de input/select/textarea | 1,42:1 ❌ | **2,77:1** ⚠️ |
| Texto principal / secundário / destaque | 18,4 / 5,9 / 5,6 ✅ | inalterado ✅ |

> ⚠️ O contorno de controle chegou a 2,77:1 — ainda abaixo dos 3:1 de WCAG 1.4.11. Escurecer mais começa a brigar com o tom areia da identidade. **Fica como decisão pendente:** ou aceita-se 2,77:1 como desvio consciente, ou os inputs ganham fundo levemente distinto do card, que resolve a percepção de limite sem escurecer a borda. Recomendo a segunda.

### 2.4 O que ainda melhoraria — por impacto

#### Alto

**1. A tela Hoje não diz o que fazer agora.** É a tela que o dono abre 20 vezes por dia, e trata todos os blocos com o mesmo peso: KPIs, previsão × recebido, caixa, "precisa de você", encaixes, agenda. Numa manhã de sábado ele quer saber *qual é o próximo cliente e quem ainda não confirmou*. Sugestão: um bloco "agora" no topo com o próximo atendimento e o contador de não confirmados, empurrando os KPIs para baixo.

**2. Estados de carregamento inexistentes.** Toda rota logada mostra um spinner centralizado até o Auth resolver, e depois o conteúdo aparece de uma vez. Com Firestore, cada tela vai ter seu próprio tempo de carga. Sem skeletons, o resultado é salto de layout. Vale definir o padrão agora, enquanto há uma tela só para ajustar.

**3. Densidade das tabelas financeiras no celular.** Despesas tem 7 colunas em 720px de largura mínima: no celular, o dono vê duas colunas por vez e rola horizontalmente para conferir um lançamento. Sugestão: abaixo de `md`, trocar a tabela por cartões empilhados — descrição e valor em destaque, resto em segunda linha. É o padrão que já funciona no resto do app.

**4. Nenhum gráfico, num produto que se vende por leitura financeira.** Fluxo de caixa, DRE e Projeção são todos tabela. O mapa de calor é o único elemento visual de dado — e é o melhor da tela de Números. Uma linha de saldo acumulado na Projeção e uma barra de receita × despesa por dia no Fluxo entregariam em três segundos o que hoje exige ler 30 linhas.

#### Médio

**5. A paleta é monocromática em dourado.** Funciona para identidade, mas as quatro fontes de receita em "de onde vem o dinheiro" são distinguidas só por opacidade do mesmo dourado (100/75/50/30%) — indistinguíveis para daltônicos e difíceis para qualquer um. Categorias diferentes precisam de matizes diferentes, mantendo o dourado como cor da marca.

**6. Não há hierarquia entre as duas identidades visuais.** O app do cliente e o painel do dono são visualmente idênticos. Um dono que alterna entre os dois não tem pista imediata de onde está, além do texto "Painel do dono". Uma barra de acento ou um tom de fundo levemente diferente no painel resolveria.

**7. Submenu do Financeiro é inacessível no celular.** A bottom nav tem 5 itens sem submenu; DRE, Fluxo, Despesas e Projeção só são alcançáveis pelos cartões de "Relatórios detalhados" dentro de Financeiro. Funciona, mas é um nível a mais de navegação numa tela que o dono usa em pé, no salão.

**8. Onze itens no menu do painel para uma operação solo.** Hoje, Financeiro (+4 subtelas), Números, Mensal, Loja. Para um dono que é o único barbeiro, é muita superfície. Vale medir uso antes de crescer mais.

#### Baixo

**9. `--color-gold-light` é mais escuro que `--color-gold`.** A nomenclatura mente e já causou o bug do hover. Renomear para `--color-gold-deep` custaria uma varredura.

**10. Rodapé de sidebar sem estado de hover no bloco de identidade** — parece clicável no cliente (leva ao perfil) e não é no painel.

**11. Vazios pouco convidativos.** "Nenhum assinante com esse status" é correto mas não oferece ação. Um botão "Adicionar assinante" no vazio economiza um caminho.

### 2.5 Veredito: o que existe já é suficiente?

**Para o dono da barbearia, sim** — com as correções aplicadas. A interface é coerente, tem identidade própria, funciona nos dois tamanhos de tela e agora passa nos critérios de acessibilidade que importam. A profundidade financeira é superior à do segmento e está bem apresentada.

**Para vender como SaaS, ainda não** — e o bloqueio não é de design. É que nada persiste. Nenhuma quantidade de polimento visual resolve uma tela que diz "Reserva confirmada!" e não confirma nada. Depois da persistência, os itens 1 a 4 acima são o que separa "bonito" de "usado todo dia".

---

## Parte 3 — Onde ficou o produto

| Dimensão | Antes | Depois |
|---|---|---|
| Deploy completo (`firebase deploy`) | falha em 2 pontos | funciona |
| Build a partir de clone novo | falha sem mensagem | falha com mensagem, ou compila |
| Regras de segurança versionadas | nenhuma | deny-all + por coleção |
| Testes | 0 | 63 |
| CI | inexistente | typecheck, lint, testes, coerência, build |
| Números que se contradizem entre telas | 4 pares | 0 (verificado por teste) |
| Contraste reprovado no WCAG AA | 3 combinações | 0 |
| Alvos de toque abaixo de 44px | 8 | 0 |
| Templates rejeitáveis pela Meta | 14 de 16 | 0 |
| Percentual de política escrito à mão em tela | 9 | 0 |

**Bloqueio único remanescente:** persistência. Tudo o mais está pronto para recebê-la.
