# Fila de execução — fechamento da auditoria

> 18/08/2026 · `hardening/p0-2026-08-17` em `0709cef`
> **Nenhuma alteração de código. Nenhum commit. Nenhum agent aberto.**

Cinco auditorias produziram cinco esquemas de numeração (`A1–A23`, `F1–F10`,
`P1–P11`, `D1–D4`, `C.1–C.7`, `B1–B4`), com sobreposição entre eles. Este
documento os colapsa em **uma fila única, sem duplicidade, com território
declarado** — para que nenhuma onda de execução pise na outra.

---

# 1 · RESUMO EXECUTIVO

**O JP Barber tem o motor de um produto sério e a voz de um produto próprio. O
que falta é confiança — e confiança aqui tem um significado exato: o produto
ainda afirma números que não são o fato.**

O que a execução das dez escritas pela interface provou, e nenhuma auditoria de
leitura teria provado:

- **O motor de produto e estoque está fechado.** Custo médio ponderado,
  congelamento na venda, devolução revertendo no mesmo custo, estoque batendo,
  comissão reduzida pela devolução, CMV com filhos que somam o cabeçalho. Tudo
  verificado por execução, não por teste.
- **A aritmética do dinheiro fecha sem ajuste.** 48,25 + 50 + 130,29 + 149 =
  R$ 377,54. Imposto 6% × 339 = R$ 20,34.
- **E três coisas graves só apareceram porque as escritas foram feitas:** a
  comissão gravada a 0% enquanto a tela promete 40%; o mensalista sendo cobrado
  de novo porque não existe representação para "coberto pelo plano"; e o DRE
  negando por escrito uma funcionalidade que ele mesmo está usando.

**O gargalo não é código nem design.** São quatro decisões de modelo de negócio,
e ~35 itens de execução que não dependem de decisão nenhuma.

**Maturidade honesta:** motor financeiro ~90%, experiência ~70%, identidade ~55%
(voz pronta, composição genérica), mobile **sem medição**.

---

# 2 · TOP 10 BLOQUEADORES PARA 90%

Ordenados por dano ao dono, não por esforço.

| # | Bloqueador | Evidência | Trava |
|---|---|---|---|
| **1** | **Comissão gravada a 0% enquanto três telas prometem 40%** | 2 atendimentos concluídos → `commissionPct: "0"`. Equipe diz *"Em branco usa o padrão da barbearia (40%)"*. `provisioning.ts` não grava `policies` | **D1** |
| **2** | **Sem representação para atendimento coberto pelo plano** | Mensalista Ilimitado (R$ 149 pagos) → *"Como o cliente pagou? R$ 50,00"*, sem opção de cobertura | **D2** |
| **3** | **Total exibido quando a fonte falhou** | DRE: `+R$ 30,39` sob falha × `−R$ 769,61` real. R$ 800,00 de diferença | **D3** |
| **4** | **Uma grandeza, três valores, um nome** | Ticket médio R$ 47,50 · R$ 50,00 · R$ 188,77. Caixa de hoje × Fluxo com os mesmos rótulos | **D4** |
| **5** | **DRE nega a cobrança de mensalidade que ele mesmo exibe** | *"o sistema ainda não cobra mensalidade"* três linhas acima de `Mensalidades recebidas R$ 149,00` | — |
| **6** | **Login exibe "CorteHub" quando o tenant não resolve** | Mesma URL: Firestore no ar → "O Siqueira"; fora → "CorteHub", numa tela que pede senha | — |
| **7** | **Falha de permissão e falha de conexão são a mesma mensagem** | A própria copy: *"Pode ser a conexão **ou** uma permissão que mudou"* | — |
| **8** | **Três padrões de confirmação para dez escritas** | Modal · faixa · nada. "Registrar pagamento" move R$ 149 e não diz nada | ⚪ |
| **9** | **Mobile sem uma única medição** | `resize_window` → sucesso; `innerWidth` → 1920 | ⏳ ambiente |
| **10** | **D31 fora da branch** | `stash@{0}`: `analytics.ts` +28, `densidade.test.ts` +59 | **B1** |

---

# 3 · DECISÕES QUE PRECISAM DO JOÃO

## As quatro que desbloqueiam

**D1 · Qual é o padrão de comissão da casa, e em que tela o dono o define?**
Hoje `commissionSplit` é lido por três telas e escrito por nenhuma. O front
preenche com o default da plataforma (40%); o servidor lê do documento e cai em
0%. Toda barbearia real nasce sem o campo.

**D2 · Como o produto representa um atendimento coberto pelo plano?**

| | Desenho | Consequência |
|---|---|---|
| a | Reserva nasce com valor zero e marca de cobertura | Receita só na mensalidade. **Comissão do barbeiro vai a zero** — exige regra própria de rateio |
| b | Valor cheio + dedução assinada "coberto pelo plano" | Preserva a base de comissão; reaproveita o mecanismo que CMV e devolução já provaram na tela |
| c | Mensalidade vira adiantamento; receita reconhecida por atendimento | Mais correto contabilmente, mais caro, muda o significado de `receitaDeMensalidade` |

**Recomendo (b).**

**D3 · Total com fonte falha: suprimir ou marcar?**
**Recomendo suprimir.** Um número apagado faz o dono perguntar; um número errado
faz o dono decidir.

**D4 · "Receita" e "caixa": uma definição, ou nomes distintos?**
**Recomendo nomes distintos** — "ticket de serviço" × "ticket com produto";
"caixa do dia (serviços)" × "caixa do dia (tudo)". O motor já tem
`avgTicketComProduto`.

## Decisões que não bloqueiam os 90%, mas ficam registradas

**D5** identidade visual — direção (§6) · **D6** padrão único de confirmação ·
**D7** ficha do cliente existe como tela? · **D8** vitrine pública ·
**D9** tela que cadastra plano · **D10** falta confirmada sai da previsão? ·
**D11** tabela de taxas da plataforma no Financeiro · **D12** enumeração de
e-mail no login · **B1** autorizar o `stash@{0}`.

---

# 4 · ITENS IMPLEMENTÁVEIS SEM DECISÃO

**35 itens.** Nenhum toca modelo financeiro. Todos contrariam contrato já
escrito — precisam de execução, não de aprovação.

## Território **T-A** · Fatos financeiros que a tela apresenta errado

| # | Item | Arquivo |
|---|---|---|
| Q1 | Unificar a leitura de `commissionSplit` — front e servidor discordam *(a metade óbvia de D1; o **valor** é decisão)* | `lib/tenant.ts:308` · `functions/src/financial-events.ts` |
| Q2 | Reescrever o bloco "Receita contratada" — ele nega o que o DRE exibe | `financeiro/dre/page.tsx` |
| Q3 | Simulador: incluir imposto no cenário e usar `centavos()` no lugar de `Math.round` | `dre/page.tsx:103` |
| Q4 | `isZero` deixar de engolir diferenças reais de até R$ 0,49 | `dre/page.tsx:681` |
| Q5 | Ocupação: nunca exibir `0%` havendo atendimento | `analytics.ts` |

## Território **T-B** · Infraestrutura e estados de falha

| # | Item |
|---|---|
| Q6 | Estender `resolverTenant()` ao `(cliente)/layout.tsx` e ao login — hoje só o painel usa |
| Q7 | Separar **falha de permissão** de **falha transitória** na leitura de coleção. A copy atual funde as duas numa frase |
| Q8 | `AuthGuard`: **usuário sem vínculo** é redirecionado em silêncio para `/` — dizer o que aconteceu |
| Q9 | Queda de sessão: spinner → login, sem mensagem |
| Q10 | Página 404 — preta, em inglês, sem marca, sem saída |

## Território **T-C** · Afirmações sem fato

| # | Item |
|---|---|
| Q11 | *"A taxa de falta caiu de 0% para 0%"* |
| Q12 | *"costuma voltar a cada 0d"* com uma única visita, + pílula "Em dia" |
| Q13 | *"A confirmação por WhatsApp continua sendo o maior fator de redução"* — frase fixa |
| Q14 | *"maior brecha"* escolhida por desempate entre 107 células em 0% |
| Q15 | Vazio de Mensalistas afirmando que os planos precisam ser cadastrados |
| Q16 | *"1 confirmada — o resto ainda é cobrança"* com zero em aberto |
| Q17 | *"+0 novos · −0 cancelamentos"* |
| Q18 | `D+5` para fatura de 13 dias |

## Território **T-D** · Escrita e formatação

| # | Item |
|---|---|
| Q19 | Formatador de percentual em `format.ts` — hoje `27.7%`, `0.99%`, `77.7%` |
| Q20 | `"1 de 3 devolvida"` → usar `contarDeTotal()` (`estornos.ts:133`) |
| Q21 | `"1 un. já voltaram"` → usar `plural()` (`desfazer-venda.tsx:186`) |
| Q22 | `"3× Shampoo vendida"` — concordância de gênero com nome de produto |

## Território **T-E** · Contradição visual

| # | Item |
|---|---|
| Q23 | Barra **verde cheia** sob *"Ponto de equilíbrio não atingido"* + pílula "no vermelho" |
| Q24 | Atalho *"histórico diário **completo** · R$ 180,29"* levando a *"−R$ 664,71"* |
| Q25 | Faixa de sucesso anterior permanecendo após a ação seguinte |
| Q26 | Despesa gravando `Pix` por default silencioso |

## Sem território — dependem de D3 ou D4

`Q27` suprimir totais com fonte falha no DRE · `Q28` idem em Despesas ·
`Q29` ticket médio no Fluxo · `Q30` "Caixa de hoje" · `Q31` coluna RECEITA da
Projeção · `Q32` `expenses` com id derivado (D24) · `Q33` aplicar o `stash@{0}`
· `Q34` `no_show` na previsão do dia (D10) · `Q35` ficha do cliente (D7).

---

# 5 · ITENS DE UX / CONSISTÊNCIA

Não são defeitos objetivos. Entram na **Onda 2**, depois das decisões.

| | O quê | Classificação |
|---|---|---|
| U1 | **Padrão único de confirmação** — hoje modal, faixa e nada | ⚪ D6, depois execução |
| U2 | **Estado de carregando** é spinner; o contrato §7 pede esqueleto | ÓBVIO pelo contrato |
| U3 | **Grade de KPIs abre sete telas iguais** — operação e análise indistinguíveis | JULGAMENTO |
| U4 | **Mapa de calor 6×18** para uma barbearia pequena | JULGAMENTO |
| U5 | **Quatro KPIs do bloco Comercial** duplicam Mensalistas | JULGAMENTO — melhor candidata a fusão |
| U6 | **`MARGEM −550%`** como KPI de topo | JULGAMENTO — trocar por algo com ação |
| U7 | **Projeção parte de saldo zero** e chama de "SALDO ACUMULADO" | JULGAMENTO |

**Avaliadas e descartadas como candidatas:** régua de cobrança (funciona — estava
vazia por falta de dado) e os dois blocos da Loja (respondem perguntas
diferentes, verificado em uso). **As duas suspeitas eram artefato de auditar um
cenário zerado.**

---

# 6 · IDENTIDADE VISUAL — ESTADO ATUAL E GAP

## Conformidade com as proibições: ✅ integral

Nenhum neon, gradiente decorativo, glassmorphism, dark mode, estética "cyber" ou
cópia de Stripe / Linear / Vercel / Notion / Monday / HubSpot foi encontrado em
nenhuma tela auditada. **O contrato visual está sendo respeitado.**

## O que já é próprio — e é o ativo mais valioso do produto

A assinatura do JP Barber **existe e mora na escrita**. Capturado na interface:

> *"Sem WhatsApp, este cliente não é reconhecido na próxima visita."*
> *"Sem indicar quem vendeu, a venda não gera comissão."*
> *"A taxa da maquininha é registrada com o valor de hoje e não muda depois."*
> *"A venda original continua no histórico — o estorno é um registro novo, não um
> apagamento."*
> *"Custo médio: R$ 18,00 → R$ 24,00 — a média entre o que já estava na
> prateleira e esta compra."*
> *"Marcar falta é sempre uma decisão sua. O sistema nunca fecha o dia decidindo
> sozinho quem faltou."*

Junto dela: as árvores de detalhamento com dedução assinada, os blocos que
declaram o que **não** estão mostrando, e a paleta quente com número em
`font-display`.

## O gap — cinco pontos, sem proposta

| | Onde | O que acontece | É identidade? |
|---|---|---|---|
| I1 | Confirmação de ação | Três tratamentos para dez escritas | **Não** — estado funcional, §7 resolve |
| I2 | Abertura de tela | Sete telas com a mesma grade de KPIs | **Sim** |
| I3 | Tabelas | Zebra padrão, sem ritmo próprio — o oposto das árvores do DRE, que têm | **Sim** |
| I4 | 404 | Preto, em inglês, sem marca | **Sim** |
| I5 | `AuthGuard` | Spinner genérico — a primeira coisa que o dono vê | **Não** — §7 resolve |

**O diagnóstico em uma frase:** *tape o logo e leia o texto — reconhece-se; tape
o texto e olhe o layout — não.*

**Nenhuma proposta visual foi elaborada, e nenhuma será sem sua definição.** O
que falta não é uma paleta nova: é a composição alcançar o nível que a escrita já
tem. I1 e I5 podem ser resolvidos com o design system existente, sem decisão sua.

---

# 7 · VALIDAÇÕES AINDA NÃO COMPROVADAS

Ausência de evidência. Nada aqui passou.

## ⏳ Bloqueado por ambiente

**Mobile inteiro.** `resize_window(390,844)` → *"Successfully resized"*;
`window.innerWidth` → **1920**; `matchMedia('(min-width: 768px)')` → **true**.
Falta validar: `bottom-nav` · `shortLabel` · **alvo de toque ≥ 44px** ·
**navegação em até dois toques** · `safe-top` · tabelas de Fluxo e Despesas em
360px · o modal "Marcar atendimento" (4 seções + grade de horários) · teclado
numérico nos campos de valor · KPIs empilhados.

**Contraste AA na tela renderizada** — só existe teste de token.
**`prefers-reduced-motion`, foco visível, ordem de tabulação.**
**Estado de carregando** — o emulador responde rápido demais.

## ⏳ Falta execução

**Área do cliente com sessão de cliente:** `/`, `/agendar`, `/reservas`,
`/planos`, `/perfil`. **Cinco escritas:** desfazer conclusão · devolver
mensalidade · remarcar · cancelar · alterar taxa. **Telas com volume real** —
tudo foi visto com poucos registros.

## Os seis estados de infraestrutura — auditados agora

| Estado | Camada | Situação |
|---|---|---|
| tenant inexistente | `resolverTenant` → `inexistente` | ✅ existe e é distinguido |
| falha transitória de infra | `resolverTenant` → `indisponivel` | ✅ existe · ⚠️ **ligado só no painel** |
| domínio raiz sem barbearia | `resolverTenant` → `sem-barbearia` | ✅ |
| tenant encerrado | `acessoDaBarbearia` → `motivo: "cancelada"` | ✅ camada diferente, correto |
| usuário sem vínculo | `AuthGuard` → `replace("/")` | ⚠️ existe, **sem mensagem** |
| falha de permissão × leitura | — | ❌ **não distinguidos** |

O último tem prova na própria copy: *"Pode ser a conexão **ou** uma permissão que
mudou"*. A frase é honesta — e é a admissão de que o produto não sabe qual das
duas foi.

**A arquitetura de INFRA-01 está certa** e cobre quatro dos seis. O que falta é
propagação (Q6) e a distinção na camada de coleção (Q7).

---

# 8 · ORDEM RECOMENDADA DOS PRÓXIMOS AGENTS

Territórios desenhados para **não haver dois agents no mesmo arquivo**.

## Onda 1 — confiança · **2 agents**

```
FIN-03   Comissão e mensalista          bloqueado por D1 e D2
         functions/src/financial-events.ts · functions/src/provisioning.ts
         web/src/lib/tenant.ts · functions/src/mensalistas.ts
         entrega: Q1 + o desenho aprovado de D2

INFRA-02 Estados de falha               não bloqueado
         web/src/lib/tenant-server.ts · (cliente)/layout.tsx · login
         components/auth-guard.tsx · components/ui/erro-ao-carregar.tsx
         app/not-found.tsx
         entrega: Q6 · Q7 · Q8 · Q9 · Q10
```

**Por que só dois:** FIN-03 e INFRA-02 não compartilham um único arquivo. Um
terceiro agent nesta onda encostaria em `dre/page.tsx`, que depende de D3.

## Onda 1.5 — depois de D3 e D4 · **1 agent**

```
FIN-04   Grandezas e totais sob falha
         web/src/lib/analytics.ts · fontes-financeiras.ts
         dre/page.tsx · fluxo-caixa/page.tsx · despesas/page.tsx
         projecao/page.tsx · painel/page.tsx
         entrega: Q27–Q31 · Q2 · Q3 · Q4 · Q5
```

⚠️ **Sozinho.** É o único que toca `analytics.ts`, e toca seis telas ao mesmo
tempo. Paralelizar aqui recria o conflito que o §18 do protocolo existe para
evitar.

## Onda 2 — UX transversal · **2 agents**

```
UX-06    Afirmações e escrita           Q11–Q22
         numeros/page.tsx · mensal/page.tsx · lib/estornos.ts
         components/desfazer-venda.tsx · lib/format.ts

UX-07    Estados e confirmação          U1 · U2 · Q23 · Q25 · Q26
         components/ui/** · financeiro/page.tsx
         bloqueado por D6
```

Interseção: **nenhuma**. UX-06 é texto em telas; UX-07 é `components/ui/**`.

## Onda 3 — identidade · **só depois da sua direção**

```
UX-08    I2 · I3 · I4 — abertura de tela, tabelas, 404
         PROPOSTA primeiro. Implementação só com seu aceite.
```

## Onda 4 — QA final · **1 agent + 1 sessão sua**

```
QA-02    fluxo completo · desktop · estados de erro
         escrita → leitura → financeiro → reversão
         audita, não corrige

MOBILE   aparelho real ou runner com device emulation
         não é agent — é ambiente
```

## Só então: UX-AUDIT-FINAL

Nesse momento ele deixa de auditar obra em andamento e responde a pergunta que
importa: **"o JP Barber, de ponta a ponta, entrega a experiência que
definimos?"**

---

## O caminho crítico, em uma linha

```
D1·D2 → FIN-03 ┐
                ├→ D3·D4 → FIN-04 → UX-06 ─┬→ D5 → UX-08 → QA-02 → UX-AUDIT-FINAL
      INFRA-02 ┘                  UX-07 ─┘         ↑
                                                  mobile real (paralelo, independente)
```

**Nunca mais de dois agents simultâneos.** A leva de quatro funcionou, mas a QA
registrou que a baseline se moveu três vezes sob os pés dela — e três das quatro
equipes entregaram menos do que relataram. O ganho de paralelismo, deste ponto em
diante, é menor que o custo de fragmentação.
