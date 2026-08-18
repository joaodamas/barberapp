# R1 — decisões encontradas durante a implementação

> 18/08/2026 · agent do R1, worktree `agent-ad2e698cf9e7ba976`, base `f0aee1e`.
> **Nada aqui foi decidido por mim como preferência de produto.** Cada item diz
> o que o briefing cobre, o que ele não cobre, o que ficou implementado e por
> qual regra derivei — para que o dono confirme ou reverta.

O briefing cobriu o R1 quase inteiro. Os cinco itens abaixo são as bordas onde
tive de agir sem uma frase explícita, e **todos são reversíveis num commit**.

---

## 1 · A porta NÃO aparece no atendimento coberto pelo plano

**O briefing diz:** *"ação 'Corrigir pagamento' na linha do atendimento
concluído"* (item 12), e *"coberto pelo plano → recusa, com mensagem"*
(`AUDITORIA §4.2`).

**O que ele não diz:** se o botão deve aparecer e recusar, ou não aparecer.

**Implementado:** o botão não aparece quando `liquidacao.coberto` é verdadeiro.
O servidor **recusa de qualquer jeito** (`sem_pagamento`), e há teste dos dois
lados — a interface não é a guarda.

**Por quê:** é a mesma exclusão que o card crítico já faz
(`action-center.ts:117`, filtro `!cobertoPeloPlano`), e a §27 recusa que a
interface ofereça o que o sistema vai negar. Um botão que só existe para dar
erro ensina o dono a desconfiar do botão.

**Se o dono preferir o contrário:** basta remover `&& !liquidacao.coberto` da
linha da tabela. A recusa do servidor continua valendo.

---

## 2 · `executarIntencao` sobre um `completed` ROTEIA para a correção

**O briefing diz:** *"`executarIntencao` PARA de reabrir o modal de conclusão
sobre `completed`"* (item 13) e *"o card aponta para a mesma porta"* (item 12).

**O que ele não diz:** o que fazer se uma intenção `fecharAtendimento` chegar
sobre um `completed` depois da mudança — abrir a correção, ou não fazer nada.

**Implementado:** o card passou a declarar `corrigirPagamento`, então na prática
nenhum avaliador emite `fecharAtendimento` sobre concluído (há teste). A guarda
`if (alvo.status === "completed") return setACorrigir(alvo)` ficou mesmo assim,
como segunda camada.

**Por quê:** "não fazer nada" é um clique que não responde — o defeito que o
próprio arquivo já documenta em outro ponto (*"faria o clique não fazer nada —
silenciosamente"*). E um avaliador novo, escrito depois, não deve conseguir
reabrir `completed` por engano: é a superfície que o "Veio depois" usa.

---

## 3 · Duas correções DIFERENTES geram dois eventos de auditoria

**O briefing diz:** *"corrigir duas vezes → um pagamento, **um** `audit_log`"*
(item 11) e cenário 9, *"um único evento de correção"*.

**A ambiguidade:** isso é sobre o **retry** (mesma chave) ou sobre o **histórico**
(o atendimento só pode ser corrigido uma vez na vida)?

**Implementado como retry.** Mesma chave de idempotência → devolve a correção
anterior com `repetida: true`, **um** pagamento e **um** `audit_log`. Uma
correção genuinamente nova (Pix → dinheiro e depois dinheiro → crédito) grava um
segundo evento, e o pagamento continua sendo um só.

**Por quê:** é o precedente literal de `refunds.ts:362-373`, e a leitura oposta
tornaria o segundo erro do dono incorrigível — o R1 existe justamente porque
erro de digitação acontece. Registrar apagando o evento anterior contrariaria
*"histórico financeiro se corrige somando, não apagando"*.

**Se o dono quiser uma correção por atendimento:** é uma linha na régua de
recusa, não um redesenho.

---

## 4 · Correção só sobre reserva em `completed`

**O briefing diz:** *"atendimento concluído"*, em todo lugar.

**O que ele não diz:** o que fazer se a reserva tiver saído de `completed`
depois de o pagamento existir (o caso `no_show` do "Veio depois", em que o
trigger apaga o pagamento — mas a corrida existe).

**Implementado:** recusa (`nao_concluido`), com mensagem.

**Por quê:** derivado. Corrigir o pagamento de um atendimento que o dono acabou
de dizer que não aconteceu gravaria um fato que a próxima escrita do trigger
apagaria.

---

## 5 · A janela lê `payments.date`, não `bookings.date`

**O briefing diz:** *"mês corrente pelo `date` (R1.2)"* — sem dizer de qual
documento.

**Implementado:** `payments.date`. Os dois são o mesmo valor hoje
(`financial-events.ts` copia `depois.date` para o pagamento), e `payments` é o
fato econômico, que é a fonte que o item 2 do contrato elege.

---

# Achados que NÃO são decisão — vão registrados, não corrigidos

| # | Achado | Onde |
|---|---|---|
| **A** | **O Admin SDK aceita `undefined` em silêncio.** A primeira versão do teste de atomicidade tentou falhar o `audit_log` passando `by: undefined` e a correção passou inteira — o campo é simplesmente omitido. Não é defeito do R1 (a callable sempre passa o `uid`), mas qualquer teste desta base que conte com `undefined` para forçar erro está provando menos do que diz. O teste foi refeito com array aninhado, que o Firestore recusa de verdade | `correcao-transacao.test.ts` · T1 |
| **B** | O teste `action-center.test.ts` *"a ação acontece na própria tela"* **afirmava a intenção que produzia o vazamento** — verde, sobre uma operação errada. Atualizado com a justificativa no corpo do teste | `web/src/lib/__tests__/action-center.test.ts:99` |
| **C** | O cenário 6 **não é verificável nesta bancada**: `emulators:exec --only firestore` não roda triggers, então `no_show → completed` não rematerializa nada aqui. O que ficou provado é o invariante do qual o R1 depende (`decidirEfeito("completed","completed") === "nada"`) e que a rematerialização **continua** sendo `set` sem merge — os dois com teste nomeado. A ponta a ponta é da integração | `correcao-de-pagamento.test.ts` |
| **D** | `functions/` **não tem script de lint.** Só `build`, `typecheck` e os de teste. Não inventei um | `functions/package.json` |

---

# O que continua aberto, e não foi tocado

Fora do meu território, registrado sem correção — §21 regra 7:

1. **`financial-events.ts:513` grava o pagamento com `set` sem merge** e relê
   policies e staff de hoje. Uma correção do R1 pode ser apagada por
   `no_show → completed`, e a comissão volta a ser recalculada do cadastro
   atual (P1-7). Arquivo bloqueado; o R1 **depende** disso e testa a dependência.
2. **O caso 2 não é detectado por nenhuma tela.** O R1 dá a porta; não dá o
   alarme. Continua bloqueando o piloto junto com o R1, como o briefing registra.
3. **Nenhuma tela lê `audit_log`.** O histórico passa a existir a partir de
   agora; a visualização é frente própria (§26 item 3, parcialmente descumprido
   por decisão consciente).
4. **O card "taxas não configuradas" pode acender sozinho** ao corrigir
   Pix → Crédito com as taxas zeradas (`action-center.ts:301`). É comportamento
   correto dos dois lados; a verificação de que ele **se lê** como correto é da
   tela.
