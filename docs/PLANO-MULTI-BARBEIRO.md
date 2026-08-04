# Multi-barbeiro — plano de construção

Estado hoje: **não existe barbeiro em lugar nenhum do sistema.** Procurei
`staffId`, `barberId` e `profissional` no modelo de dados, na geração de
horários e na criação de reserva — nada. A agenda inteira é uma cadeira só.

Este documento é o mapa de onde essa suposição está enterrada, o que muda, em
que ordem, e as quatro decisões que só o dono do produto pode tomar.

---

## 1. Por que agora, e não depois

**Cada reserva gravada aumenta o custo.** Hoje a O Siqueira tem zero reservas.
Adicionar `staffId` numa base vazia é escrever o campo; adicionar depois de seis
meses de operação é uma migração com retrovisor — decidir a qual barbeiro
pertence cada reserva histórica quando ninguém registrou isso.

**É o cliente que paga mais.** O InBarber cobra **por profissional**
(R$ 32,90 cada) justamente porque barbearia de 2 a 5 cadeiras é a norma. Uma
equipe de três tem mais dor de agenda, mais conflito de horário e comissão para
calcular — e é exatamente quem hoje não consegue usar o NoCorte.

**Metade da fundação já existe.** `commissionSplit` está nas políticas, a
coleção `commissions` já está declarada nas regras, e `members` já guarda papel
por pessoa. O que falta é o barbeiro existir na reserva.

---

## 2. Onde "uma cadeira" está cravado

| Lugar | O que assume hoje | O que quebra com 3 barbeiros |
|---|---|---|
| `functions/src/booking.ts` | Conflito é `date == X && time == Y` | Três barbeiros às 15h viram conflito. **Dois terços da agenda somem** |
| `lib/slots.ts` | `ocupados: string[]` — lista plana de horários | Um horário ocupado por um barbeiro some para todos |
| `analytics.ts` → `capacidadeDiaria` | Slots de UMA jornada | Capacidade e taxa de ocupação ficam 3× erradas |
| Tela Hoje | `horariosLivres = totalSlots − agendados` | Mostra lotado com 2 cadeiras vazias |
| `analytics.ts` → DRE | Comissão é um % global sobre o lucro | Não dá para pagar barbeiro A 40% e barbeiro B 50% |
| `notify.ts` | `nova_reserva` vai para `ownerWhatsapp` | O dono recebe o dia inteiro; o barbeiro certo não recebe nada |
| Encaixe | Aprovado pelo número da barbearia | Encaixe é da cadeira de alguém, não da loja |

Nenhum desses é difícil isolado. O risco é fazer metade: agenda por barbeiro com
capacidade global dá número errado em tela que o dono usa para decidir.

---

## 3. A decisão de modelagem que define o resto

**Barbeiro é RECURSO, não usuário.**

A tentação é usar `members` (que já existe, `uid → papel`) como registro de
barbeiro. Não serve: `members` é quem tem **login**. Existe barbeiro que não
quer aplicativo, não tem e-mail, e mesmo assim ocupa uma cadeira e precisa
aparecer na agenda.

Se o barbeiro só existir quando tiver conta, o dono não consegue cadastrar
metade da equipe — e desiste do produto na primeira tentativa.

Então: coleção nova `barbershops/{id}/staff/{staffId}`, com `uid` **opcional**.
Quem tem login ganha o vínculo; quem não tem, existe do mesmo jeito.

```
staff/{staffId}
  name          "Rômulo"
  active        true
  uid           "abc123" | null      ← login, opcional
  serviceIds    ["corte", "barba"]   ← nem todo mundo faz tudo
  commissionPct 40                   ← por pessoa, não global
  schedule      { ... } | null       ← null = herda a da barbearia
  color         "#8c5f1e"            ← para distinguir na agenda
  order         1
```

`schedule` por barbeiro não é luxo: folga na segunda, entrada às 10h e sábado
até as 14h são o normal de uma equipe. `null` herdando a jornada da loja mantém
o caso simples simples.

---

## 4. Fases

### Fase 1 — O barbeiro existe

- Coleção `staff` + regras (dono escreve, equipe lê) + testes de isolamento
- `staffId` na reserva, obrigatório
- **Migração**: toda barbearia existente ganha um barbeiro criado a partir do
  dono, e as reservas atuais recebem o `staffId` dele. Com base vazia isso é um
  script de dez linhas; é o motivo de fazer agora
- Tela de cadastro da equipe no painel

**Entregável:** o modelo aguenta N barbeiros, mesmo que nenhuma tela use ainda.

### Fase 2 — A agenda respeita a cadeira

- `slotsForDate` passa a receber ocupação **por barbeiro**
- Conflito no `createBooking` e no `rescheduleBooking` filtra por `staffId`
- `capacidadeDiaria` × barbeiros ativos, respeitando a jornada de cada um
- Encaixe passa a ser da cadeira

**Entregável:** três barbeiros atendem às 15h sem conflito, e a ocupação bate.

**Cuidado:** é aqui que mora o bug caro. A transação de conflito precisa
continuar sendo transação — só que agora por `(date, time, staffId)`.

### Fase 3 — O cliente escolhe

- Passo de escolha no agendamento, com "sem preferência"
- "Sem preferência" distribui entre os livres — e a regra de distribuição é
  decisão de negócio (ver §5)
- Só aparecem os barbeiros que fazem o serviço escolhido

### Fase 4 — O dinheiro por pessoa

- Comissão por barbeiro, por reserva, gravada no fechamento
- DRE deixa de usar % global
- Ranking por barbeiro em Números: atendimentos, ticket, faturamento
- Fechamento mensal por barbeiro — é o extrato que o barbeiro cobra do dono

### Fase 5 — O painel de uma equipe

- Tela Hoje com filtro por barbeiro e agenda em colunas
- Cada barbeiro com login vê a própria agenda; o financeiro da loja continua só
  do dono
- `nova_reserva` no WhatsApp vai para o barbeiro certo

---

## 5. Decisões tomadas

**1. O cliente SEMPRE escolhe o barbeiro.** Não existe "sem preferência".

Fideliza ao profissional, que é o que barbearia é de fato: o cliente vai no
*seu* barbeiro. E elimina a decisão mais chata do conjunto — a regra de
distribuição automática, que ninguém acerta de primeira e que o dono percebe
errada só no fim do mês.

Duas consequências que vêm junto, e as duas precisam ser construídas:

- **Barbearia com um barbeiro só não pode ver essa tela.** Obrigar o Rômulo a
  escolher "Rômulo" é atrito puro. Quando houver um único barbeiro ativo, o
  passo é pulado e o `staffId` é preenchido sozinho. É o caso mais comum da
  base hoje, então não é exceção — é o caminho principal.
- **Barbeiro popular lota e o novo fica vazio.** Sem distribuição automática,
  isso é consequência assumida, não bug. A tela precisa mostrar o horário livre
  dos outros com destaque ("Rômulo só tem vaga quinta; Léo tem hoje às 16h"),
  senão o cliente desiste em vez de trocar.

**2. Comissão é percentual POR BARBEIRO.** `commissionPct` em cada `staff`, com
o valor da plataforma (40%) como padrão de quem não configurar. O DRE deixa de
aplicar um número global e passa a somar comissão reserva a reserva — o que
também corrige um problema que já existe hoje: o cálculo atual aplica o
percentual sobre o lucro da loja inteira, não sobre o que cada um produziu.

**3. O barbeiro vê a própria agenda e o próprio ganho.** Login opcional
(`staff.uid`). Vê os horários dele e quanto tem a receber; não vê despesa, DRE
nem faturamento da loja.

As regras já separam isso — `commissions` permite leitura de `isStaffOf`,
`expenses` exige `isOwnerOf`. Falta a restrição por PESSOA: hoje um barbeiro
com papel `staff` leria a comissão de todos os colegas. Precisa virar "só as
minhas", e isso é regra nova com teste próprio.

## 6. O que NÃO entra

- **Agenda por cadeira física** (duas cadeiras, um barbeiro) — complexidade sem
  demanda observada
- **Barbeiro em mais de uma barbearia** — o claim já suportaria, mas ninguém
  pediu
- **Escala/rodízio automático** — folga fixa por barbeiro resolve 90% dos casos

---

## 7. Ordem recomendada

Fases 1 e 2 juntas, porque separadas entregam um modelo que nenhuma tela usa.
Fase 3 logo em seguida — sem ela, o cliente não escolhe e o produto continua
parecendo de barbeiro solo. Fases 4 e 5 podem esperar o primeiro cliente com
equipe de verdade, que é quem vai dizer o que importa.
