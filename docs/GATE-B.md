# Gate B — folha de decisão

> **Podemos colocar isto na mão de uma barbearia que paga?**

Esta é a decisão, e ela não é técnica: olha **produto, operação, financeiro e
segurança**, não a suíte de testes. Os testes são insumo, não resposta.

**Estado: aguardando a evidência operacional.** As três dimensões técnicas estão
respondidas; a quarta — operação — continua sem resposta, e nenhuma suíte a
responde por ela.

> **Atualização de 17/08.** O congelamento foi levantado: `aadf76f` passou a ser
> **marco de comparação, não portão de desenvolvimento**, e a Fase 3 abriu. A
> **Rodada 1** fechou os dez itens de promessa falsa e número enganoso —
> inclusive **D14** e **P1-11**, que esta folha registra como abertos abaixo.
> Relatório em `RODADA-1.md`; backlog em `BACKLOG-FASE-3.md`.
>
> As tabelas da §2 e a §4 ficam como estavam **de propósito**: são o retrato do
> estado congelado, e é contra ele que a Rodada 1 se compara. O que mudou está
> anotado linha a linha.

---

## 1. O ponto congelado

**Commit `59c851f`**, branch `hardening/p0-2026-08-17`, 6 commits à frente de
`origin/main`, working tree limpo.

Verificação executada no momento do congelamento:

| | |
|---|---|
| `web` — typecheck · lint · testes | ✅ **268** |
| `web` — build de produção | ✅ compilado |
| `functions` — typecheck · testes | ✅ **212** |
| `functions` — concorrência (emulador) | ✅ **13** |
| `functions` — isolamento multi-tenant (emulador) | ✅ **76** |
| `functions` — regras Firestore + Storage (emulador) | ✅ **66** |
| | **635 verificações** |

> **Correção de 17/08, na Rodada 1.** Esta tabela registrava **82** para as
> regras e **651** no total. Os dois arquivos não mudaram desde o congelamento e
> declaram **66** testes (52 Firestore + 14 Storage) — que é o que roda, medido
> duas vezes. O total correto da baseline é **635**.
>
> A origem foi encontrada: o resumo de `ISOLAMENTO-MULTI-TENANT.md` lia `66`
> como "regras do Firestore" e somava Storage **outra vez** embaixo, como `16`
> em vez de `14`. Os `+16` desceram para cá como `82`, e o mesmo engano inflava
> as "182 verificações" de isolamento, que são **166**. Corrigido nos dois docs.
>
> Vale a regra 2 na direção inversa: **nenhum PASS sem evidência que o
> reproduza.** Um número inflado a favor da própria auditoria é o pior tipo de
> erro que ela pode cometer.
>
> *Nota operacional:* `npm run test:rules` usa aspas simples e falha no
> PowerShell — as suítes rodam, mas o script precisa das aspas duplas que
> `test:concorrencia` e `test:isolamento` já usam.

```bash
cd web       && npm run check && npm run build
cd functions && npm run typecheck && npm run test:tudo
```

---

## 2. As quatro dimensões

### 2.1 🟢 Segurança

| Frente | Estado |
|---|---|
| Isolamento entre barbearias | 🟢 **166 verificações, nenhuma violação passou** |
| Autorização das Cloud Functions | 🟢 as 21 classificadas e verificadas |
| Storage | 🟢 14 verificações |
| Regras do Firestore | 🟢 negar por padrão, com fallback duplo |
| **SEC-001** · runtime das functions com `roles/editor` | 🔴 **aberto** |
| **SEC-002** · owner e billing únicos, fora de organização | 🔴 **aberto** |
| **App Check** | 🔴 **ausente** |
| Observabilidade e backup | 🔴 **ausentes** |
| D15/D16 · enumeração de barbearias e slugs | 🟡 exposição comercial |

> O isolamento **entre clientes** está provado. O que continua aberto é a
> segurança **da plataforma**, e os três 🔴 são anteriores a esta auditoria —
> estão em `GO-LIVE-READINESS.md` §2 e dependem de decisão do dono, não de
> código.

### 2.2 🟢 Financeiro

| Frente | Estado |
|---|---|
| Congelamento do fato (comissão e taxa) | 🟢 provado, inclusive contra reversão indevida |
| Reconciliação contra ledger independente | 🟢 os R$ 348 indevidos ficaram fora |
| Invariantes entre as 6 visões | 🟢 I1, I2, I3, I5, I6, I7 valem |
| **I4** · filhos do DRE somam o cabeçalho | ❌ **D6** → ✅ fechado na Rodada 1 |
| **D3** · CMV = compras, não custo do vendido | ⏸ **modelo — decisão pendente** |
| **D8/D11** · resultado × caixa não se separam | ⏸ **modelo — decisão pendente** |
| D1, D2, D4, D5, D7, D9, D10 | 🟠 P1/P2, quantificados — **D2, D9, D10 fechados na Rodada 1** |

> A diferença entre o ledger e o sistema é **R$ 34,75 em R$ 680 — 5,1%** — e é
> explicável item a item. Ela **não escala linearmente**: D3 cresce com a
> reposição de estoque.

### 2.3 🟠 Produto

| Frente | Estado |
|---|---|
| Os 6 P0 do Gate A | 🟢 fechados com teste |
| Promessas falsas eliminadas | 🟢 checkout, encaixe, política, preço, notificações |
| **D14** · WhatsApp promete estorno e pagamento online | 🔴 release blocker → ✅ **fechado na Rodada 1** (15 templates, 30 ocorrências) |
| **D13** · o dono não consegue criar reserva | 🟠 **gap — decisão pendente** |
| Venda de produto | 🟠 sem caminho na interface |
| Cadastro de mensalista | 🟠 sem caminho na interface |
| WhatsApp operacional | ⚪ pós-piloto (verificação na Meta) |

### 2.4 ⏳ Operação

**A única evidência que falta.** Nada aqui pode ser respondido por teste
automatizado — metade do que se mede é se a pessoa **entende** a tela.

Roteiro em `DAY-IN-THE-LIFE.md`, Parte B.

---

## 3. A pergunta que o Day in the Life precisa responder

Não é *"as telas funcionam?"*. É:

> Uma pessoa que nunca viu este produto consegue operar um dia inteiro de
> barbearia, entender o que aconteceu, e **confiar no resultado para tocar o
> negócio**?

Três respostas por etapa, e a terceira é a que decide:

1. sabia o que fazer?
2. sabia o que tinha acontecido?
3. **confiaria nesse resultado para operar?**

*"Funcionou, mas eu conferiria por fora"* é um **não**.

---

## 4. O que já sabemos que o teste vai encontrar

Registrado antes para que a **reação** seja medida, não a descoberta:

| Etapa | O que está lá | Já classificado |
|---|---|---|
| 02 · agendamento | não há caminho para o dono agendar | **D13** |
| 05 · produto | não há tela de venda | gap conhecido |
| 09 · fechamento | não há número que responda "quanto sobrou no caixa" | **D8/D11** |
| painel | a legenda do caixa ensina regra que não existe | **P1-11** |

**O que interessa é a frase espontânea de quem esbarrar.** *"Como assim não
dá?"* e *"nem esperava que tivesse isso"* significam severidades muito
diferentes para a mesma ausência — e é essa diferença que decide se D13 sobe a
release blocker.

Para D13 especificamente, registrar:

1. **onde procurou primeiro** — o lugar errado revela o modelo mental esperado;
2. **o que esperava encontrar**;
3. **a frase exata ao perceber que não existe**.

> O blueprint prevê `origin: "balcao"` e `uid: null` — o cliente que não usa o
> app — e **não descreve o caminho pelo qual a reserva dele nasce**. Se um
> usuário real chegar ao mesmo bloqueio, teremos evidência operacional
> independente de que há uma lacuna entre o modelo de negócio especificado e a
> operação possível.

---

## 5. Como retomar depois do teste

```
resultado humano
      ↓
classificar cada etapa   (PASS / FRICÇÃO / BLOCKED / WRONG / FALSE PROMISE)
      ↓
decidir D13              (a frase espontânea define a severidade)
      ↓
tratar D14               (release blocker já confirmado)
      ↓
── GATE B ──
      ↓
só então: D3 / D8 / D11
```

**A ordem importa.** D3/D8/D11 mudam o modelo financeiro, e mexer neles antes de
a operação estar validada significaria revalidar tudo depois.

---

## 6. Regras que esta auditoria produziu

Valem para as próximas rodadas.

> **1 · Teste verde não promove nada para validado.**
> Suíte verde diz que o código faz o que o autor imaginou; produção diz que o
> produto faz o que o dono precisa. *(anterior a esta auditoria)*

> **2 · Nenhum FAIL sem evidência que reproduza o comportamento do produto.**
> Sinal de infraestrutura — timestamp, contador, métrica — indica onde procurar.
> Não substitui ver o produto fazendo a coisa errada. *(§8 da auditoria)*

> **3 · A expectativa se escreve antes da execução.**
> Ledger calculado à mão, sobre premissas de negócio validadas. Escrever depois
> de rodar testa o sistema contra a própria regra que ele implementa.

> **4 · Divergência não é sinônimo de erro.**
> Granularidade, competência, conceito, nomenclatura ou erro. Só o último exige
> corrigir cálculo — classificar antes impede de "consertar" uma diferença que
> deveria existir.

> **5 · Não transformar expectativa nossa em requisito não especificado.**
> Simétrica à regra 2. Para gap de produto, a especificação é a fonte de verdade
> da intenção.

> **6 · Cada superfície é avaliada pelo mecanismo que deveria protegê-la.**
> O webhook não tem `request.auth` e não deveria ter: a guarda dele é assinatura
> HMAC. Procurar um padrão único de segurança produz falso positivo.

---

*Congelado em 17/08/2026, commit `59c851f`. Próxima alteração de código só
depois do Day in the Life.*
