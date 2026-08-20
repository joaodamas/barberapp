# E2E do piloto — o dono e o cliente

> **20/08/2026** · roteiro de validação de OPERAÇÃO, não de motor.
>
> A pergunta deixou de ser *"o número está certo?"* — isso o Gate P0, o P1-7 e o
> D-3 já responderam, com 1288 testes e execução contra trigger real. A pergunta
> aqui é **"um dono de barbearia consegue usar isto todo dia?"**.
>
> Critério de §3.5: **produto operacional + financeiro confiável + sem bugs
> críticos conhecidos**. Só bloqueia o piloto o que impede o uso real.

---

# 1 · Como classificar o que aparecer

| | Significado |
|---|---|
| 🔴 | **impede o uso** — o dono não consegue completar a tarefa, ou o número está errado |
| 🟡 | atrapalha, mas tem caminho — vai para o backlog de V1.1 |
| 🔵 | falta de recurso, não defeito — registra e segue |

A tentação a evitar é transformar cada 🟡 em portão novo. Foi o que quase
aconteceu com o caso 2.

---

# 2 · Roteiro do DONO

Ambiente: bancada local com emuladores, barbearia semeada do zero.

| # | Passo | O que observar |
|---|---|---|
| 1 | **Cadastra barbeiro** | consegue definir comissão? o campo em branco explica que usa o padrão da casa? |
| 2 | **Cadastra serviço** | preço, duração, e o serviço aparece no balcão em seguida |
| 3 | **Cadastra cliente** | busca por nome e WhatsApp; cliente novo pelo balcão |
| 4 | **Cria plano** | 🔵 **esperado tropeçar** — a auditoria registrou que **nenhuma tela escreve `plans`**. O seed traz dois; criar um terceiro pode não ter caminho |
| 5 | **Agenda** | balcão e agenda do dia; horários livres corretos |
| 6 | **Conclui atendimento** | o modal pergunta como pagou; mensalista mostra "Concluir sem cobrar" |
| 7 | **Recebe pagamento** | caixa do dia muda de coluna; recebido ≠ previsto |
| 8 | **Vê caixa** | Pix / Cartão / Dinheiro, e "Sem forma informada" quando for o caso |
| 9 | **Vê comissão** | o valor bate com o percentual do barbeiro, e não muda se o cadastro mudar |
| 10 | **Fecha o dia** | 🔵 **esperado tropeçar** — **fechamento de dia não existe** no produto. O R1 registrou que nem o de mês existe. Observar o que o dono faz no lugar |
| 11 | **Consulta histórico** | consegue reencontrar um atendimento de ontem? corrigir um pagamento de ontem? (o 🟡 do alcance da porta do R1 mora aqui) |

## O que este roteiro cobre e o gate não cobriu

O Gate P0 entrou pelo meio: criou reserva e concluiu. **Nunca testou a barbearia
nascendo** — cadastro de barbeiro, serviço e plano pela tela. É onde um dono real
começa, e é a parte menos exercitada do produto.

---

# 3 · Roteiro do CLIENTE

| # | Passo | O que observar |
|---|---|---|
| 1 | **Acessa** | a vitrine pública identifica a barbearia certa (multi-tenant) |
| 2 | **Escolhe serviço** | preços e durações corretos |
| 3 | **Escolhe horário** | só horários realmente livres; §27 — não afirmar "não há horário" antes de perguntar (N7) |
| 4 | **Agenda** | precisa criar conta? o fluxo é claro? |
| 5 | **Recebe confirmação** | 🔵 **esperado tropeçar** — WhatsApp nunca enviou: faltam credenciais e verificação comercial. Observar o que o cliente vê na ausência |
| 6 | **Acompanha agendamentos** | a reserva aparece; o método de pagamento exibido está correto (é onde o caso 2 fica visível ao cliente) |

---

# 4 · Resultado da execução

_Preenchido durante a execução de 20/08._

## Roteiro do dono

_(a preencher)_

## Roteiro do cliente

_(a preencher)_

## Classificação final

_(a preencher)_
