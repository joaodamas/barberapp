# Protocolo de execução paralela — JP Barber

> **Velocidade não significa editar mais coisas simultaneamente. Velocidade
> significa reduzir bloqueios mantendo contratos estáveis.**

Definido pelo dono do produto em 17/08/2026. Vale para toda execução com mais
de um agente.

⚠️ **Recebi apenas as seções 15 a 18.** As seções 1–14 não chegaram na mensagem.
O que está abaixo é o que foi efetivamente transmitido, mais a divisão de
equipes e a análise de dependências. Se as seções faltantes existirem, elas têm
precedência sobre qualquer coisa que eu tenha inferido.

---

## A ordem de prioridade — nunca inverter

```
1. integridade dos fatos
2. integridade dos contratos
3. isolamento entre equipes
4. testes
5. integração
6. velocidade
```

---

## 15 · Conflito

Havendo conflito entre duas equipes, **não resolver automaticamente. PARE.**

```
CONFLITO DE OWNERSHIP

Arquivo:
Equipe A:
Equipe B:
Mudanças:
Qual contrato está em disputa:
Qual decisão é necessária:
```

O orquestrador decide.

## 16 · Stop-the-line

Pare imediatamente ao descobrir:

- contrato inconsistente
- dado financeiro sem fonte
- duplicidade potencial
- mudança de schema não coordenada
- alteração de arquivo de outra equipe
- teste que contradiz o contrato
- regra Firestore incompatível
- migração necessária
- comportamento histórico ambíguo

**Não "faça o melhor possível". Pare e reporte.**

## 17 · Orquestração

Divisão por **domínio**, não por arquivo aleatório. Cada equipe recebe:

```
OWNER:
OBJETIVO:
ARQUIVOS PERMITIDOS:
ARQUIVOS PROIBIDOS:
CONTRATOS QUE PODE CONSUMIR:
CONTRATOS QUE PODE PRODUZIR:
DEPENDÊNCIAS:
CRITÉRIO DE CONCLUSÃO:
```

Nenhuma equipe deve ter dois objetivos independentes na mesma branch.

## 18 · Princípio final

Quando duas equipes precisam do mesmo arquivo: **uma é owner, a outra consome o
contrato**. Se o contrato precisar mudar, o orquestrador coordena.

---

# Ownership — Rodada 3.2 / 3.3

## Bloqueio global

Estes arquivos são **proibidos para toda equipe de UI**, sem exceção:

```
web/src/lib/analytics.ts          (FIN-01 / FIN-02 durante a 3.2)
web/src/lib/fontes-financeiras.ts (FIN-01 / FIN-02)
web/src/lib/fluxo-de-caixa.ts     (FIN-01)
web/src/lib/domain.ts
web/src/lib/db/paths.ts
firestore.rules
functions/src/**
```

## As equipes

| Equipe | Missão | Ownership |
|---|---|---|
| **FIN-01** | Fluxo de Caixa 3.2 | domínio financeiro / cash flow |
| **FIN-02** | Auditoria e reconciliação | testes + mapa de fontes |
| **UX-01** | Navegação e arquitetura de informação | layout, navegação |
| **UX-02** | Telas financeiras | Financeiro · Números · Mensal |
| **UX-03** | Telas de operação | Hoje · Agenda · Loja · Clientes |
| **UX-04** | Design system | tokens, componentes, estados, microcopy |
| **QA-01** | Regressão | testes E2E / emulador |
| **ORCH** | Integração | não escreve código |

---

# ⛔ STOP-THE-LINE — conflitos na divisão proposta

Levantados **antes** de disparar as equipes, pela regra 16.

## Conflito 1 · UX-02 × FIN-01 — contrato em mudança AGORA

```
CONFLITO DE OWNERSHIP

Arquivo:      web/src/app/painel/(dashboard)/financeiro/fluxo-caixa/page.tsx
              web/src/lib/db/use-financeiro.ts
Equipe A:     FIN-01 — está substituindo `caixaDiario` neste momento
Equipe B:     UX-02 — redesenharia a tela que o consome
Mudanças:     `DiaDeCaixa {pix,cartao,dinheiro,total,appointments}`
              →  `DiaDoFluxo {entradas,saidas,saldo,acumulado}`
              a tela ganha SAÍDAS, que hoje não existem
Contrato em disputa:  o formato do fluxo diário
Decisão necessária:   UX-02 espera FIN-01, ou trabalha só nas telas
                      Números/Mensal, que não dependem do fluxo
```

**Minha recomendação:** UX-02 começa por **Números e Mensal**, e só entra em
Financeiro/Fluxo depois que FIN-01 fechar. Redesenhar uma tela cujo contrato
muda em seguida é retrabalho garantido — e pior, a tela sairia bonita mostrando
um número que está prestes a deixar de existir.

## Conflito 2 · UX-04 é upstream de UX-02 e UX-03

```
CONFLITO DE OWNERSHIP

Arquivo:      web/src/components/ui/**  (card, button, pill, modal, empty-state)
              web/src/app/globals.css   (tokens)
Equipe A:     UX-04 — dona dos componentes e tokens
Equipe B:     UX-02 e UX-03 — consomem em toda tela que tocarem
Mudanças:     mudar a assinatura ou o visual de `Card`/`Pill` altera
              simultaneamente as telas das duas outras equipes
Contrato em disputa:  a API dos componentes base
Decisão necessária:   UX-04 roda ANTES, ou UX-02/03 ficam proibidas de
                      alterar `components/ui/**`
```

**Minha recomendação:** UX-04 primeiro, sozinha, produzindo o contrato dos
componentes. UX-02 e UX-03 **consomem** e não editam `components/ui/**` — se
precisarem de um componente novo, pedem ao orquestrador.

## Conflito 3 · UX-01 × UX-02 × UX-03 — o layout é compartilhado

```
CONFLITO DE OWNERSHIP

Arquivo:      web/src/app/painel/(dashboard)/layout.tsx
              web/src/lib/nav-items.ts
Equipe A:     UX-01 — dona da navegação
Equipe B/C:   UX-02 e UX-03 — suas telas vivem dentro desse layout
Contrato em disputa:  onde cada tela mora e como é alcançada
Decisão necessária:   UX-01 é owner exclusiva dos dois arquivos
```

**Minha recomendação:** aceitável em paralelo, desde que UX-01 seja a **única**
a tocar `layout.tsx` e `nav-items.ts`. As demais editam só os `page.tsx` das
suas áreas.

---

# Ordem de execução que respeita as dependências

```
AGORA, em paralelo — sem interseção de arquivos
  FIN-01  fluxo de caixa            lib/fluxo-de-caixa.ts · analytics.ts
  UX-04   design system             components/ui/** · globals.css
  UX-01   navegação                 layout.tsx · nav-items.ts
  QA-01   regressão                 __tests__/** apenas

DEPOIS de UX-04
  UX-03   operação                  Hoje · Loja · Clientes (consome ui/**)

DEPOIS de FIN-01
  UX-02   financeiro                Financeiro · Fluxo (consome o contrato novo)
  FIN-02  reconciliação do fluxo    prova de exclusividade por origem
```

O que muda em relação à proposta original: **UX-02 sai da primeira leva** e
UX-04 vira pré-requisito de UX-03. As duas mudanças seguem a prioridade
declarada — integridade dos contratos acima de velocidade.

---

# 19 · Os três estados de uma mudança

> **Um agente nunca pode declarar uma funcionalidade "verificada" apenas porque
> o código compila ou os testes passam.**

| estado | o que significa | quem pode declarar |
|---|---|---|
| **IMPLEMENTADO** | o código existe | o próprio agente |
| **TESTADO** | testes automatizados passaram | o próprio agente |
| **VERIFICADO** | comportamento observado na interface real | só quem abriu a tela |

**Só o terceiro permite marcar uma experiência como pronta.**

A Rodada 3.2 ensinou isso da forma mais direta: 1268 testes verdes, typecheck,
lint e build limpos — e a tela encontrou quatro defeitos, dois deles de
produto, não de cálculo. O CMV é o caso exemplar: o total estava certo, e
**nenhum teste pegaria**, porque o defeito estava no filho que a interface
mostrava embaixo dele.

E a razão de fundo:

> O motor pode ser tecnicamente impecável. Se o dono da barbearia olhar para a
> tela e entender a coisa errada, o produto está errado.

## Regra prática

Ao reportar, use as três palavras com precisão. "Implementei e testei" é uma
frase honesta. "Está pronto" depois de rodar `vitest` não é.

Quando o ambiente impedir a verificação — viewport móvel indisponível, falha de
infraestrutura impossível de simular —, **declare como não verificado**. Nunca
apresente uma aproximação como se fosse evidência.

---

# 20 · Worktrees isolados

A primeira leva rodou com quatro equipes na MESMA árvore. Funcionou, mas o
isolamento era só disciplina no prompt, e a QA registrou que a baseline se moveu
três vezes sob os pés dela — recebeu um código que mudava enquanto ela media.

A partir da segunda leva, cada agente recebe seu próprio worktree git. O
orquestrador integra.

## ⚠️ Armadilha de provisionamento — verificar SEMPRE

Na primeira leva com worktrees, **quatro de quatro** nasceram em `659091a`
(`main`), não na branch ativa — cerca de 30 commits atrás. Nenhum dos documentos
obrigatórios existia lá, e no caso do FIN-02 **o defeito que ele ia auditar
ainda não tinha sido introduzido**.

Os quatro detectaram sozinhos e corrigiram com `merge --ff-only`, porque a base
era ancestral estrita. Mas o dano potencial era silencioso: um agente auditando
código que não é o que roda, e reportando com confiança.

**Todo brief de worktree deve começar com:**

```
Antes de qualquer coisa, confirme a base:
  git log --oneline -1
Se não for o HEAD de <branch ativa>, faça `git merge --ff-only <branch>`
e só então leia os documentos. Se não for fast-forward possível, PARE e reporte.
```

E o orquestrador confere `git worktree list` **antes** de disparar, não depois.
