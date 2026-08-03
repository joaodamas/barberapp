# O Siqueira — o que falta para entrar em uso real

Estado em 03/08/2026. Este documento tem duas partes: o que **precisa vir do
dono** (bloco 1, pronto para encaminhar) e o que **é nossa parte** (bloco 3),
para ninguém ficar esperando pelo outro.

---

## Bloco 0 — O retrato de hoje, sem maquiagem

O que já está em produção em `osiqueira.jpproject.com.br`:

| Coleção | Documentos | Situação |
|---|---|---|
| `services` | 9 | **Vieram do briefing, nunca foram confirmados por ele** |
| `bookings` | 0 | Vazio — nenhuma reserva real ainda |
| `clients` | 0 | Vazio |
| `expenses` | 0 | Vazio → **a tela de DRE mostra lucro sem custo nenhum** |
| `products` | 0 | Vazio |
| `plans` | 0 | Vazio |
| `staff` | 0 | Vazio |

E a ficha da barbearia tem dado inventado por mim para o app subir:

| Campo | Está gravado | Problema |
|---|---|---|
| Endereço | `Rua das Tesouras, 120 — Centro` | Inventado. O cliente vê isso na tela de início. |
| WhatsApp | `5511999999999` | Inventado. O botão "Falar no WhatsApp" leva a lugar nenhum. |
| Instagram | `@osiqueirabarbearia` | Precisa confirmar se existe |
| Fundação | `2012` | Precisa confirmar |
| Horário | Seg–Sáb, 09:00–19:00, almoço 12:00–14:00, slots de 30min | Chute plausível — **é isto que gera os horários que o cliente pode escolher** |

**Nada disso quebra o app.** Mas é o que o cliente lê na primeira tela, e é
o que decide quais horários aparecem para reservar. Enquanto for chute, o
teste testa o chute.

---

## Bloco 1 — Perguntas para o dono

> Copiar daqui para baixo e mandar. Está escrito para ele, não para nós.

### 1. A barbearia

- Nome exato como deve aparecer para o cliente (hoje está "O Siqueira Barbearia")
- Endereço completo, com número e bairro — é o que o cliente vê e usa para chegar
- Instagram (se tiver)
- Ano em que abriu (aparece como "desde ...")

### 2. O WhatsApp

Preciso de **dois** números, e eles são diferentes:

- **(a) O número que o cliente vê no botão "Falar no WhatsApp".** Pode ser o
  atual, o que ele já usa. Nada muda para ele.
- **(b) Um número NOVO, só para os avisos automáticos** (confirmação de
  horário, lembrete do dia anterior, aviso de encaixe).

  ⚠️ **Um número que entra na API oficial do WhatsApp não pode mais ser usado
  no aplicativo WhatsApp Business no celular.** Ele vira exclusivo do sistema.
  Por isso o (b) precisa ser um chip novo — se usarmos o número principal dele,
  ele perde o WhatsApp de trabalho no telefone. Um chip pré-pago resolve.

  Este item **não bloqueia o teste**: dá para começar sem os avisos automáticos.
  Mas quanto antes o chip existir, antes eu consigo cadastrar na Meta, que
  demora alguns dias para aprovar.

### 3. Os serviços (o mais importante)

Hoje estão cadastrados estes 9. **Preciso que ele olhe um por um e corrija**,
porque preço e duração errados estragam duas coisas ao mesmo tempo: o cliente
paga o valor errado e a agenda encaixa gente demais ou de menos no dia.

| # | Serviço | Duração hoje | Preço hoje |
|---|---|---|---|
| 1 | Pezinho | 15 min | R$ 15 |
| 2 | Sobrancelha | 20 min | R$ 15 |
| 3 | Barba | 30 min | R$ 35 |
| 4 | Corte infantil | 30 min | R$ 50 |
| 5 | Corte + sobrancelha | 30 min | R$ 70 |
| 6 | Corte + barba | 60 min | R$ 90 |
| 7 | Corte + barba + sobrancelha | 60 min | R$ 100 |
| 8 | Luzes | 60 min | a partir de R$ 80 |
| 9 | Alinhamento dos fios | 90 min | a partir de R$ 100 |

Para cada um: **está certo? o preço é esse? demora mesmo esse tempo?** E:
**falta algum serviço que ele faz?** / **tem algum aí que ele não faz mais?**

> 🚩 **Reparei numa falta e ela é grave: não existe "Corte" sozinho.**
>
> Tem corte + barba, corte + sobrancelha, corte infantil — mas o cliente que
> quer só cortar o cabelo **não tem o que escolher**. Ou desiste, ou marca
> "corte + barba" e paga R$ 90 por um serviço de R$ 60.
>
> É provavelmente o item mais vendido da barbearia e ele está fora do
> cardápio. Precisa do preço e da duração do corte simples antes de qualquer
> outra coisa. Vale a pena perguntar também se falta mais algum — se este
> passou, outro pode ter passado.

Sobre a duração: é o tempo de cadeira ocupada, do "senta" ao "pode levantar".
Se ele leva 40 minutos e a gente cadastra 30, a agenda vai marcar o cliente
seguinte em cima e ele vai atrasar o dia inteiro.

### 4. Os horários

- Que dias abre? (hoje: segunda a sábado)
- Que horas abre e fecha? Muda em algum dia? (sábado costuma ser diferente)
- Para o almoço/intervalo, para que horas? (hoje: 12h às 14h)
- De quanto em quanto tempo quer oferecer horário ao cliente — 30 em 30 minutos,
  ou de hora em hora?
- Feriados e folgas já marcadas dos próximos meses

### 5. As regras dele

- Com quanta antecedência mínima aceita uma reserva? (hoje: 1 hora antes)
- Até quantos dias pra frente o cliente pode marcar? (hoje: 60 dias)
- Cliente pode cancelar até quando sem problema?
- Trabalha sozinho ou tem outros barbeiros? Se tem: **nome e o que cada um faz**
  (a agenda hoje está montada para uma cadeira só)

### 6. O dinheiro — só para o DRE fazer sentido

A tela de resultado hoje mostra faturamento sem nenhum custo, ou seja, mostra
lucro que não existe. Para ela virar informação de verdade:

- Quanto paga de **aluguel** por mês?
- Média de **luz, água, internet**
- Quanto tira de **pró-labore** (o que ele tira pra si por mês)
- Outras contas fixas: contador, software, seguro, alarme
- Quanto gasta por mês em **produtos de consumo** (lâmina, pó, toalha, creme)
- Se tem outros barbeiros: **é comissão ou salário?** Se comissão, quantos %?
  (o sistema está com 40% barbeiro / 60% casa — precisa confirmar)

### 7. Se ele já faz (senão, pular)

- **Mensalidade / plano fixo:** tem? Quanto custa e o que dá direito?
- **Produtos para vender** (pomada, óleo, shampoo): quais, quanto paga e por
  quanto vende?
- **Fidelidade:** já dá "o décimo corte é grátis" ou parecido? Como funciona hoje?

### 8. A marca

- **Logo em arquivo** — o melhor que ele tiver. PNG com fundo transparente ou,
  melhor ainda, o arquivo original do designer (`.ai`, `.svg`, `.pdf`).
  Foto de fachada ou print de rede social também serve como referência: eu
  redesenho.
- Se tiver, as **cores** que ele considera as da barbearia
- **Fotos do salão** — 3 ou 4, do celular mesmo, com a luz do dia

### 9. Para criar a conta dele

- **E-mail** que ele usa e consulta (é o login, e é onde chega a confirmação)
- **Celular**

---

## Bloco 2 — O que eu faço com cada resposta

Para você saber o que trava o quê:

| Resposta | Destrava |
|---|---|
| Endereço, Instagram, ano | A tela de início parar de mentir |
| WhatsApp (a) | O botão "Falar no WhatsApp" funcionar |
| WhatsApp (b) — chip novo | Cadastro na Meta → avisos automáticos |
| Serviços conferidos | O cliente reservar o serviço certo pelo preço certo |
| Horários | Os horários oferecidos serem os horários reais |
| Regras | Cancelamento e antecedência pararem de ser o padrão da plataforma |
| Despesas | A tela de DRE deixar de mostrar lucro falso |
| Comissão | O rateio por barbeiro fechar |
| Planos / produtos / fidelidade | As telas correspondentes saírem do zero |
| Logo e fotos | A cara dele no lugar da minha marca genérica |
| E-mail | A conta de dono existir com o acesso dele |

**O mínimo para abrir para o primeiro cliente real** são os itens **1, 3, 4 e 9**.
O resto melhora o produto, mas não impede o primeiro agendamento.

---

## Bloco 3 — O que é nossa parte, e o que ainda não existe

Honesto, porque isso muda como você apresenta o teste para ele.

### Funciona e foi verificado em produção hoje (03/08)

- O cliente escolhe serviço, dia e horário e a reserva **grava mesmo** —
  isso quebrou até ontem: a tela dizia "Reserva confirmada!" e não salvava nada
- Dois clientes no mesmo horário: o segundo é recusado
- Preço vem do catálogo, não do celular do cliente (tentei enviar `valor: 0` e
  o servidor devolveu R$ 90)
- Dia fechado é recusado
- O painel do dono abre, com isolamento entre barbearias testado

### Não existe ainda

| O quê | Consequência prática no teste |
|---|---|
| **Envio de WhatsApp** | Ninguém é avisado de nada. Nem o dono da reserva nova, nem o cliente do lembrete. **Ele precisa manter o painel aberto para ver os agendamentos.** É a maior limitação do teste. |
| **Pagamento antecipado (Pix/cartão)** | Botões desabilitados. Só "pagar no salão". Não quebra nada — a barbearia já funciona assim. |
| **Cobrança da plataforma** | Ele não paga nada agora. É teste. |
| **Nota fiscal** | Não emite. |

### Minha recomendação de como propor a ele

Não vender como "sistema pronto, larga a agenda de papel". Vender como:

> "Montei um sistema de agendamento pra você. Seus clientes marcam pelo
> link, você vê tudo no celular. Quero que você use por 2 semanas junto
> com o que já faz hoje, e me diga o que atrapalha."

Em paralelo, não em substituição — porque sem o WhatsApp automático, uma
reserva que ele não olhar é um cliente esperando na porta. Com o painel aberto
no celular, e ele sabendo que precisa olhar, o risco é zero e o retorno dele é
real.

Quando o envio de WhatsApp entrar, aí sim ele pode largar o caderno.
