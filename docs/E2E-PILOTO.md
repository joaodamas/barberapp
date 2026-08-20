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

# 4 · Resultado da execução — 20/08

Executado com a bancada local, barbearia semeada, sessão de dono ativa.

## Roteiro do dono

| # | Passo | | O que se viu |
|---|---|---|---|
| 1 | Cadastra barbeiro | 🟢 | "Bruno Teste" salvo com `commissionPct: null`. A promessa do D1 — *"em branco usa o padrão da barbearia (40%)"* — é verdadeira |
| — | *(o mesmo passo)* | 🟡 | O documento nasce **vazio no clique**, antes do nome, e não há botão nem confirmação de salvamento. Clicar e desistir deixa um barbeiro sem nome |
| 2 | Cadastra serviço | 🟢 | "Pezinho · 15 min · R$ 20". E o produto **avisou sozinho** enquanto o preço estava zerado: *"1 serviço visível com preço zerado: o cliente consegue agendar sem pagar nada"* |
| 3 | Cadastra cliente | 🟢 | Não existe cadastro manual, **por desenho**: *"o cadastro nasce sozinho quando você marca um atendimento. Você não precisa cadastrar ninguém à mão"* |
| 4 | Cria plano | 🔴/🔵 | **`plans` é lido por todos e escrito por ninguém.** Barbearia nova nasce sem plano de mensalidade e não há caminho para criar. Bloqueia **se** mensalidade entrar no piloto — ver §5 |
| 5 | Agenda | 🟢 | "Pezinho" e "Bruno Teste" chegaram ao balcão. Capacidade subiu de 36 → 54 com o 3º barbeiro, como a tela de Equipe avisou que aconteceria |
| 6-7 | Conclui e recebe | 🟢 | **D1 provado no barbeiro novo**: campo em branco → `commissionPct: 40`, comissão R$ 8,00 sobre R$ 20,00 |
| — | **Jornada da barbearia** | 🔴→✅ | **Nenhuma tela escrevia `schedule`.** Corrigido nesta rodada — ver §6 |
| 8-11 | Caixa, comissão, fechamento, histórico | ⏸ | Não executados: o E2E parou no 🔴 da jornada, conforme a regra |

## Roteiro do cliente

| # | Passo | | O que se viu |
|---|---|---|---|
| 1-2 | Acessa e escolhe serviço | 🟢 | Passo 1 de 4, os 5 serviços com preço e duração, "Pezinho" incluído |
| 3 | Escolhe horário | 🟢 | **Dom e Seg aparecem como "fechado"** — a folga configurada no painel chegou aqui. Horários de 15 em 15, de 14:00 a 19:45 (fecha 20:00). E o N7 se confirma: *"os horários livres mudam conforme o profissional — por isso a lista aparece depois da escolha"* |
| 4-6 | Agenda, confirmação, acompanha | ⏸ | Não executados nesta rodada |

---

# 5 · A pergunta que decide o segundo 🔴

**A mensalidade faz parte do piloto do O Siqueira?**

É fato de negócio, não de código — só o dono responde.

- **Sim** → criar/configurar plano é 🔴 e precisa sair antes do piloto.
- **Não** → `plans` vira 🔵 e não se gasta tempo agora.

O motor de mensalista está inteiro (contratar, faturar, cobrir, cota, D2, D-3).
Falta só a porta de entrada do catálogo.

---

# 6 · O 🔴 da jornada — encontrado e fechado

**O sintoma:** toda barbearia ficava presa em seg–sáb, 09:00–19:00, almoço
12:00–14:00, horários de 30 em 30. Quem abre às 10h, fecha às 20h ou folga na
segunda **oferecia ao cliente horários que não atende**.

**A causa:** o modelo (`TenantSchedule`) existia desde a fundação, o onboarding
tinha o passo `"horarios"` e o componente `PassoHorarios` estava pronto — mas
nenhuma tela do painel escrevia `schedule`. Depois do onboarding, a jornada
virava imutável.

**A correção:** `/painel/horarios` reaproveita o componente do onboarding, com o
rótulo do botão parametrizado. Duplicar a tela criaria duas fontes para a mesma
regra — o defeito que este repositório mais corrigiu.

**Provado na tela**, mudando O Siqueira para ter–sáb, 10:00–20:00, slots de 15:

```
painel  → "5 dias por semana · 10:00–20:00 · 15 min · 36 horários por barbeiro"
painel  → 107 horários livres (era 53)
cliente → DOM 23 fechado · SEG 24 fechado
cliente → 14:00 14:15 14:30 14:45 … 19:45
```

Dois testes de convenção da casa pegaram erros meus no caminho, e os dois
estavam certos: `concordancia.test.ts` recusou o ternário `"dia" : "dias"`
(existe `contar()` em `lib/plural.ts`) e `navegacao.test.ts` exigiu a rota nova
na lista de telas — a guarda vale nas duas direções, tela órfã e link morto.

788 web · typecheck · lint.
