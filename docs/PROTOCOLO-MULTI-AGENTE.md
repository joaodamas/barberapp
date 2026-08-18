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

---

# 21 · As dez regras de execução de um agent

Definidas pelo dono do produto em 18/08/2026. Valem para **toda** leva futura e
entram no brief de qualquer agent, sem exceção.

1. Trabalhar **exclusivamente** no seu worktree.
2. Não alterar arquivo do escopo de outro agent.
3. **Antes de implementar, auditar o estado atual da base e registrar o que
   encontrou.**
4. Não refazer trabalho já concluído.
5. Não alterar motor financeiro nem `analytics.ts`, salvo se o escopo exigir
   explicitamente.
6. Não alterar regra visual, token ou componente compartilhado sem declarar
   impacto e obter aprovação.
7. Achado fora do escopo se **registra**, não se corrige.
8. Decisão de julgamento se **propõe**, não se implementa.
9. Correção de comportamento verificável vem com teste.
10. Ao terminar: testes, typecheck, lint e build, com **evidência objetiva**.

E, depois dos quatro: integrar sem sobrescrever, rodar a suíte completa, fazer a
verificação transversal sobre a nova baseline — e **só então** abrir o QA-02.

## Por que a regra 3 é a que mais importa

A leva de 17–18/08 provou as duas metades disso ao mesmo tempo. Quatro de quatro
worktrees nasceram 30 commits atrás (§20) — e os quatro só perceberam porque
auditaram a base antes de escrever. Sem a regra 3, o FIN-02 teria auditado um
defeito que ainda não existia e reportado "está tudo certo" com confiança.

## E a regra 10 não é o fim da história

Três das quatro equipes daquela leva passaram na regra 10 e ainda assim
entregaram menos do que relataram: o D30 foi corrigido no painel e não no login,
o D31 ficou num stash fora da branch, e o `plural.ts` foi criado e ignorado por
dois lugares escritos depois dele. **Build verde prova que compila, não que
chegou onde precisava chegar.** É a §19 outra vez.

---

# 22 · A regra de ouro

> **Na dúvida entre "corrigir" e "registrar" — registrar.**
> **Não tomar decisão de produto em silêncio.**

Ela resolve o caso que as regras 7 e 8 não cobrem: quando o próprio agent não
sabe se o que encontrou é defeito ou é desenho.

O exemplo canônico é o "Caixa de hoje" mostrando `Cartão R$ 0,00` num dia com
R$ 130,29 no cartão. `caixaDoDia` recebe só reservas, e isso está **documentado
como desenho** num teste. Um agent que "corrigisse" teria alterado o significado
de um bloco financeiro por conta própria. Um agent que ignorasse teria deixado o
dono conferir a gaveta contra um número incompleto. O certo é o terceiro
caminho: registrar, com evidência, e devolver a decisão.

---

# 23 · Gate de identidade visual

O contrato está em `docs/UI-UX-GUIDELINES.md`. O que este parágrafo acrescenta é
**quando parar**:

> Qualquer mudança que altere significativamente a **personalidade visual** do
> produto é apresentada como **proposta**, antes de qualquer implementação.

Não se inventa identidade nova — evolui-se a existente. A diferenciação vem de
composição, hierarquia, proporção, tipografia, espaçamento e tratamento da
informação. **Não de efeito visual.**

Proibido, sem margem: neon, gradiente decorativo, glassmorphism, cor berrante,
dark mode, estética "startup genérica", cópia de concorrente.

---

# 24 · Mobile

**Nunca considerar mobile validado sem device emulation real ou aparelho.**

Quando o ambiente não permitir, registrar **NÃO VERIFICADO** — e registrar a
medição que prova a incapacidade, não a afirmação de que ela existe. O padrão:

```
resize_window(390, 844)   →  "Successfully resized window"
window.innerWidth         →  1920
matchMedia('(min-width: 768px)').matches  →  true
```

A ferramenta relatou sucesso e o viewport não mudou. É a diferença entre "não
consegui verificar" e "verifiquei e passou" — e é a §19 aplicada ao ambiente.

---

# 25 · A quinta coisa errada

> **Agents podem desenvolver em paralelo. Validação de produto, não.**

## O que aconteceu — duas vezes, na mesma rodada

Quatro equipes entregaram quatro peças, cada uma **correta isoladamente**:

```
FIN-03       o servidor não cria PaymentDoc para atendimento coberto      ✅
FIN-04       coluna "Sem forma informada" para fechar a soma do caixa     ✅
UX-06        a agenda mostra "Coberto pelo plano"                         ✅
DENSITY-01   `naoInformado` no motor (D31)                                ✅
```

Unidas, produziram uma **quinta coisa que ninguém escreveu**: a tela Hoje
exibindo `Recebido até agora R$ 50,00` de dinheiro que não entrou, a mesma
quantia em "Sem forma informada", e um alerta **crítico** pedindo *"Registrar
pagamento"* de um pagamento inexistente — justificado com *"a taxa da maquininha
entra como zero"* sobre uma transação que nunca passou por maquininha.

A causa é instrutiva: a coluna do D31 foi desenhada para *"concluí e esqueci de
informar o meio"*. O D2 criou um **segundo motivo** para o campo ser nulo —
*"a mensalidade já pagou"* — e a coluna passou a capturar as duas coisas, que
são opostas.

O segundo caso, menor e da mesma forma: o D2 trocou a fonte do recebido para
`payments` (correto), e a barra "Previsão × Recebido" continuou comparando os
dois (correta desde sempre). Juntos: **R$ 100 previsto contra R$ 244 recebido,
barra cheia, um dia 244% realizado.**

## Por que nenhuma revisão de código teria pego

**Nos dois casos, testes, typecheck, lint e build estavam verdes** — 731 e 739
testes. Cada equipe testou o seu lado, e cada lado estava certo.

E há um agravante que vale internalizar: **quanto mais correta cada peça, mais
difícil a colisão é de prever.** Ler os quatro diffs não revela o problema,
porque o problema não está em nenhum deles — está no encontro.

O que pegou os dois foi **abrir a tela com dado real no banco, depois de
integrar.**

## A regra

```
AGENTS
  ↓  implementam isoladamente, cada um no seu território
  ↓  cada um testa o que escreveu
INTEGRAÇÃO
  ↓  UM gate, onde se procura deliberadamente a quinta coisa errada
VERIFICAÇÃO DE EXPERIÊNCIA
  ↓  tela + banco, com dado real
PRÓXIMA ONDA
```

Isso **não** obriga a reduzir o paralelismo. Dois, três ou quatro agents
continuam valendo quando os territórios forem independentes. O que muda é que a
validação de produto deixa de ser paralela: ela é uma só, e é do orquestrador.

## E o significado de "fechado"

> **Nenhum agent pode declarar uma frente "fechada" apenas porque seus testes
> passaram.**
>
> "Fechado" exige **implementação + testes + integração + verificação de
> experiência** — esta última sempre que o território afetar uma jornada do
> produto.

É a §19 levada à sua conclusão. O agent alcança **IMPLEMENTADO** e **TESTADO**
sozinho; **VERIFICADO** é estado de integração, e nunca de território.

## Conflito de arquivo não é o risco principal

O protocolo até aqui protegia contra dois agents editando o mesmo arquivo (§15,
§18). Os dois casos acima **não tiveram nenhuma interseção de arquivo** — a
verificação de `comm -12` deu vazia nas duas ondas.

O risco que sobra é **semântico**: duas frentes mudando o significado do mesmo
conceito por caminhos diferentes. Território separado não protege disso. Só o
gate de integração protege.

---

# 26 · Toda mudança de fato financeiro define seu próprio rastro

> **Regra estabelecida por João em 18/08/2026, no fechamento das cinco decisões.**

> Toda decisão que altere um fato financeiro deve definir **também** como o fato
> será auditado e como sua alteração aparecerá no histórico.

Não é uma boa prática recomendada. É **parte da definição de pronto**: uma
decisão financeira sem resposta para "como isso fica registrado" está
**incompleta**, não apenas desacompanhada.

## O achado que produziu a regra

Ao instruir o R1, medi o que existe hoje:

```
audit_log — escritores atuais
  functions/src/provisioning.ts:193   barbershop.provisioned
  functions/src/signup.ts:214         (criação da barbearia)
  functions/src/subscription.ts:156   barbershop.plano_definido
```

Três escritores, e **os três são de cadastro**. Nenhum evento financeiro escreve
`audit_log`. A conclusão de um atendimento — que cria `PaymentDoc`, `CommissionDoc`
e movimenta caixa, DRE e comissão de uma vez — **não deixa rastro nenhum**.

O evento que materializa dinheiro é o único do produto sem histórico. Isso não
foi decidido; passou.

## Por que passou

Porque a pergunta nunca foi feita no momento certo. Cada frente financeira
respondeu *"o número está certo?"* — e todas respondiam bem, com teste. Nenhuma
respondeu *"e quando este número mudar, alguém vai conseguir saber por quê?"*.

É a mesma família da §25: não um erro dentro de uma frente, mas uma pergunta que
não pertencia a frente nenhuma.

## O que a regra obriga, na prática

Ao fechar qualquer decisão que crie, altere ou anule um fato financeiro:

1. **O que fica registrado** — de/para dos campos que mudaram, quem, quando.
2. **Onde** — `audit_log` é imutável (`allow write: if false`), então **quem
   escreve é o servidor**. Se a mudança nasce numa tela, ou ela vira callable, ou
   ela não é auditável. Não existe terceira saída.
3. **Como o dono enxerga** — um log que só a plataforma lê não responde à
   pergunta do dono. Se a alteração for visível ao dono, o histórico dela também
   precisa ser.

## O que a regra NÃO permite

Fechar uma decisão financeira com *"a auditoria fica para depois"*. "Depois" é
onde os três escritores de cadastro moram sozinhos há todo esse tempo.
