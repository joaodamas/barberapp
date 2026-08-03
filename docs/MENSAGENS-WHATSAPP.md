# As 34 mensagens de WhatsApp — o que cada uma faz e por quê

Fonte da verdade do texto: `functions/src/whatsapp/templates.ts`. Se divergir,
o código está certo e este documento está velho.

Aqui está tudo escrito para ser lido por gente. Para submeter na Meta, o corpo
com `{{1}}`, `{{2}}` é literalmente o que vai no formulário.

---

## Antes: as três regras da Meta que explicam o formato

**1. Nunca se começa uma conversa com texto livre.** Se a barbearia fala
primeiro, tem que ser um *template* aprovado com antecedência. Só depois que o
cliente responde é que abre uma janela de 24h onde dá para escrever qualquer
coisa. É por isso que existem 34 modelos em vez de um sistema que "manda a
mensagem certa na hora".

**2. Categoria muda o preço e a exigência.** `UTILITY` é transacional — algo
que o cliente pediu ou contratou: reserva, cobrança, mudança de agenda. Sai
mais barato e não precisa de autorização prévia. `MARKETING` é você chamando
alguém que não pediu nada: reativação, aniversário, comunicado. Custa mais,
exige opt-in e é o que derruba a nota do número se for mal usado.

**3. Placeholder não pode abrir nem fechar a mensagem, nem ficar colado em
outro.** Todos os textos abaixo já respeitam isso — não mexa na posição das
variáveis sem checar, porque a reprovação vem sem explicar o motivo.

### Quantas são

| Para quem | Sai do número | Quantas | Categoria |
|---|---|---|---|
| Cliente da barbearia | Da barbearia | 26 | 22 UTILITY · 4 MARKETING |
| Barbeiro / dono | Da barbearia | 5 | UTILITY |
| Dono da barbearia | **Da plataforma** | 3 | UTILITY |

> **Por que os últimos 3 saem de outro número:** cobrança da plataforma e aviso
> de trial são *você* falando com o barbeiro, não a barbearia falando com o
> cliente dela. Se saírem do número da barbearia, o dono recebe uma cobrança sua
> pelo WhatsApp do próprio negócio — e, pior, sua régua comercial passa a contar
> nos limites e na nota de qualidade do número dele.

---

# CLIENTE

As 26 que o cliente final recebe. Todas saem do WhatsApp da barbearia.

## Régua de agendamento — o coração da coisa

### 1. `confirmacao_reserva` · UTILITY
**Dispara:** assim que a reserva é criada.
**Por que existe:** é o comprovante. Sem ele o cliente fica com a dúvida de "será
que marcou mesmo?" e liga na barbearia — que é exatamente o telefonema que o
produto existe para eliminar.

> Olá **{{1}}**! Sua reserva na **{{2}}** está confirmada.
>
> Serviço: **{{3}}**
> Quando: **{{4}}** às **{{5}}**
> Valor: **{{6}}** (**{{7}}**)
> Endereço: **{{8}}**
>
> Cancelamento até 24h antes tem 100% de devolução. Entre 24h e 6h, aplicamos a taxa de cancelamento. Te esperamos!

`primeiroNome · nomeBarbearia · servicos · data · hora · valor · formaPagamento · endereco`

### 2. `lembrete_confirmacao` · UTILITY · **com botões**
**Dispara:** no dia, cerca de 3h antes.
**Por que existe:** é a mensagem mais importante das 34. É a única defesa contra
o no-show — o cliente que esquece e não aparece, deixando a cadeira parada num
horário que já estava vendido. Os dois botões transformam o lembrete em resposta:
quem não vem avisa com um toque, e o horário volta pra agenda a tempo.

> Oi **{{1}}**, tudo certo para hoje?
>
> Seu horário na **{{2}}** é às **{{3}}** (**{{4}}**).
>
> Confirma que você vem? É só tocar em um dos botões abaixo.

`primeiroNome · nomeBarbearia · hora · servicos`
Botões: **Confirmo ✅** · **Preciso cancelar ❌**

### 3. `cancelamento_reserva` · UTILITY
**Dispara:** cancelamento confirmado, por qualquer um dos lados.
**Por que existe:** cancelamento sem confirmação escrita vira discussão sobre
dinheiro. O texto diz na hora o que acontece com o valor.

> Olá **{{1}}**, sua reserva de **{{2}}** às **{{3}}** foi cancelada.
>
> Sobre o valor: **{{4}}**
>
> Quando quiser remarcar, é só abrir o app em **{{5}}** — te esperamos!

`primeiroNome · data · hora · detalheReembolso · linkApp`

### 4. `reagendamento_confirmado` · UTILITY
**Dispara:** cliente remarcou pelo app, dentro do prazo permitido.
**Por que existe:** remarcar sem confirmação é a receita para duas pessoas
acharem que têm o mesmo horário.

> Pronto, **{{1}}**! Seu horário mudou de **{{2}}** para **{{3}}** às **{{4}}**.
>
> Serviço: **{{5}}**
> Endereço: **{{6}}**
>
> Te esperamos no novo horário.

`primeiroNome · quandoAntes · data · hora · servicos · endereco`

### 5. `agenda_alterada` · UTILITY · **com botão**
**Dispara:** o dono bloqueou o dia (folga, feriado, imprevisto) ou mexeu numa
reserva. Vai para **todos** os clientes afetados de uma vez.
**Por que existe:** é a mensagem que o barbeiro hoje manda na mão, um por um,
quando precisa fechar. Essa é a dor que ele reconhece na hora.

> Oi **{{1}}**, precisamos avisar sobre o seu horário de **{{2}}** às **{{3}}**.
>
> Motivo: **{{4}}**
>
> Escolha um novo horário em um toque pelo link **{{5}}**.

`primeiroNome · data · hora · motivo · linkReagendamento`
Botão: **Escolher novo horário**

### 6. `pos_atendimento` · UTILITY
**Dispara:** atendimento marcado como concluído no painel.
**Por que existe:** faz dois trabalhos numa mensagem — pede avaliação e mostra
quantos carimbos faltam para o prêmio. O segundo é o que traz o cara de volta.

> Valeu pela visita, **{{1}}**! 💈
>
> Você agora tem **{{2}}** de **{{3}}** carimbos — faltam **{{4}}** para **{{5}}**.
>
> Se puder avaliar o atendimento em **{{6}}**, ajuda muito. Até a próxima!

`primeiroNome · carimbos · meta · faltam · recompensa · linkAvaliacao`

## Encaixe

### 7. `encaixe_alternativas` · UTILITY
**Dispara:** o barbeiro recusou o encaixe, ou deixou passar 45 minutos sem
responder.
**Por que existe:** um "não" seco perde o cliente. Um "não, mas tenho estes
aqui" recupera boa parte deles.

> Oi **{{1}}**, não consegui encaixar o horário das **{{2}}**. 😕
>
> Mas tenho estes horários livres para **{{3}}**:
> **{{4}}**
>
> Garanta o seu em um toque no link **{{5}}** — leva menos de um minuto.

`primeiroNome · horaSolicitada · servicos · horariosLivres · linkApp`

## Pagamento e falta

### 8. `reserva_aguardando_pagamento` · UTILITY
**Dispara:** reserva criada com pagamento antecipado, enquanto o horário está
segurado.
**Por que existe:** o horário fica fora da agenda durante o prazo. Se o cliente
não souber que existe prazo, perde o horário e culpa a barbearia.

> Oi **{{1}}**, separei seu horário de **{{2}}** às **{{3}}** (**{{4}}**).
>
> Para confirmar, finalize o pagamento de **{{5}}** em até **{{6}}** minutos — depois disso o horário volta para a agenda. É só abrir **{{7}}** e concluir.

`primeiroNome · data · hora · servicos · valor · minutos · linkPagamento`

### 9. `reserva_expirada` · UTILITY
**Dispara:** o prazo acima venceu sem pagamento.

> Oi **{{1}}**, o prazo para confirmar o horário de **{{2}}** às **{{3}}** terminou e ele voltou para a agenda.
>
> Se ainda quiser, dá para escolher outro horário em **{{4}}** — leva menos de um minuto.

`primeiroNome · data · hora · linkApp`

### 10. `reembolso_processado` · UTILITY
**Dispara:** estorno efetivado.
**Por que existe:** o prazo é o que gera a cobrança de volta. Pix cai quase na
hora, cartão depende da bandeira — dizer isso na hora evita a pergunta "cadê meu
dinheiro?" três dias depois.

> Oi **{{1}}**, o valor de **{{2}}** referente à reserva de **{{3}}** foi devolvido.
>
> Forma: **{{4}}**
> Prazo estimado: **{{5}}**
>
> Qualquer coisa é só responder por aqui.

`primeiroNome · valor · data · formaDevolucao · prazo`

### 11. `ocorrencia_registrada` · UTILITY
**Dispara:** atendimento marcado como falta (no-show).
**Por que existe:** registra a falta sem brigar. O tom é deliberado — a mensagem
diz que o horário ficou parado, não que o cliente é um problema.

> Oi **{{1}}**, notamos que você não conseguiu vir no horário de **{{2}}** às **{{3}}**.
>
> Sem problema — acontece. Só avisando que o horário ficou reservado e não pôde ser usado por outra pessoa.
>
> Quando quiser remarcar, é só abrir **{{4}}** e escolher o que der certo pra você.

`primeiroNome · data · hora · linkApp`

### 12. `pagamento_antecipado_exigido` · UTILITY
**Dispara:** o cliente passou do limite de faltas.
**Por que existe:** é a mensagem mais delicada do conjunto. Ela comunica uma
restrição, e mensagem acusatória faz o cliente bloquear o número — bloqueio
derruba a nota de qualidade, e nota baixa reduz quantas mensagens a barbearia
pode mandar por dia. O texto foi escrito para explicar sem punir.

> Oi **{{1}}**, tudo bem? Um aviso rápido sobre suas próximas reservas na **{{2}}**.
>
> Como alguns horários recentes acabaram não sendo usados, as próximas reservas passam a ser confirmadas com pagamento antecipado — assim o horário fica garantido pra você.
>
> Nada muda no atendimento, e você continua podendo cancelar dentro do prazo com devolução. Detalhes da política em **{{3}}** — qualquer dúvida, é só responder.

`primeiroNome · nomeBarbearia · linkPolitica`

## Fidelidade

### 13. `fidelidade_recompensa_liberada` · UTILITY
**Dispara:** os carimbos bateram a meta.
**Por que existe:** é o melhor gatilho de retorno que existe no produto — a
pessoa tem algo grátis esperando por ela.

> Boa, **{{1}}**! Você completou **{{2}}** carimbos na **{{3}}**.
>
> Seu prêmio está liberado: **{{4}}**
>
> É só resgatar pelo app em **{{5}}** e usar no próximo atendimento.

`primeiroNome · carimbos · nomeBarbearia · recompensa · linkApp`

### 14. `fidelidade_resgatada` · UTILITY

> Resgate confirmado, **{{1}}**! Seu prêmio **{{2}}** está válido para usar na **{{3}}**.
>
> Sua contagem recomeça do zero a partir do próximo atendimento. Agende quando quiser em **{{4}}** — vai ser um prazer.

`primeiroNome · recompensa · nomeBarbearia · linkApp`

## Mensalista — cobrança

Quatro mensagens escalonadas. A régua é de propósito: cobrar uma vez só no dia
do vencimento é como não cobrar.

### 15. `mensalidade_aviso` · UTILITY
**Dispara:** 5, 3 e 1 dia antes de vencer.

> Oi **{{1}}**! Sua mensalidade do plano **{{2}}** (**{{3}}**) vence em **{{4}}**.
>
> Pode pagar pelo link **{{5}}** — leva menos de um minuto.

`primeiroNome · nomePlano · valor · vencimento · linkPagamento`

### 16. `mensalidade_hoje` · UTILITY
**Dispara:** no dia do vencimento. O campo `instrucao` muda conforme a forma de
pagamento — quem tem cobrança automática não precisa fazer nada, e a mensagem
precisa dizer isso, senão vira aflição à toa.

> Oi **{{1}}**, hoje é o vencimento da sua mensalidade do plano **{{2}}**: **{{3}}**.
>
> Como funciona: **{{4}}**
>
> Qualquer dúvida, é só responder por aqui.

`primeiroNome · nomePlano · valor · instrucao`

### 17. `mensalidade_atraso` · UTILITY
**Dispara:** 1 e 3 dias depois do vencimento.

> Oi **{{1}}**, sua mensalidade do plano **{{2}}** (**{{3}}**) venceu em **{{4}}** e ainda consta em aberto.
>
> Regularize pelo link **{{5}}** para manter seus benefícios ativos.

`primeiroNome · nomePlano · valor · vencimento · linkPagamento`

### 18. `mensalidade_suspensao` · UTILITY
**Dispara:** 5 dias depois — último aviso antes de suspender.

> Oi **{{1}}**, este é o último aviso sobre a mensalidade do plano **{{2}}** (**{{3}}**), vencida em **{{4}}**.
>
> Se não for regularizada, seu plano será suspenso e os benefícios ficam pausados até o pagamento. Você resolve agora pelo link **{{5}}**.

`primeiroNome · nomePlano · valor · vencimento · linkPagamento`

### 19. `mensalidade_paga` · UTILITY

> Recebemos, **{{1}}**! Sua mensalidade do plano **{{2}}** (**{{3}}**) foi paga.
>
> Próxima cobrança: **{{4}}**
>
> Seus benefícios seguem ativos. Bom corte!

`primeiroNome · nomePlano · valor · proximaCobranca`

## Mensalista — vida do plano

### 20. `plano_ativado` · UTILITY
**Por que existe:** o momento em que o cliente virou recorrente. Repetir o que
ele comprou reduz a chance de cancelar por não lembrar o que tinha direito.

> Bem-vindo ao clube, **{{1}}**! Seu plano **{{2}}** está ativo na **{{3}}**.
>
> O que inclui: **{{4}}**
> Valor: **{{5}}**/mês · próxima cobrança em **{{6}}**
>
> Já pode agendar usando o plano em **{{7}}** — bom corte!

`primeiroNome · nomePlano · nomeBarbearia · beneficios · valor · proximaCobranca · linkApp`

### 21. `plano_suspenso` · UTILITY
**Por que existe:** suspender sem avisar que ele *ainda pode agendar pagando
avulso* é perder o cliente inteiro em vez de só a mensalidade.

> Oi **{{1}}**, seu plano **{{2}}** ficou suspenso porque a mensalidade de **{{3}}** segue em aberto.
>
> Você continua podendo agendar normalmente, pagando por atendimento. Assim que regularizar em **{{4}}**, os benefícios voltam na hora.

`primeiroNome · nomePlano · vencimento · linkPagamento`

### 22. `plano_reativado` · UTILITY

> Tudo certo, **{{1}}**! Seu plano **{{2}}** voltou a ficar ativo na **{{3}}**.
>
> Próxima cobrança: **{{4}}**
>
> Pode agendar usando o plano normalmente em **{{5}}** — bom corte!

`primeiroNome · nomePlano · nomeBarbearia · proximaCobranca · linkApp`

### 23. `plano_cancelado` · UTILITY
**Por que existe:** deixa claro que o plano vale até o fim do ciclo já pago. É a
diferença entre um cancelamento tranquilo e uma reclamação.

> Oi **{{1}}**, seu plano **{{2}}** foi cancelado, como você pediu.
>
> Ele continua valendo até **{{3}}** — até lá seus benefícios seguem normais. Depois disso, os atendimentos voltam a ser cobrados no avulso.
>
> Se mudar de ideia, é só reativar em **{{4}}** quando quiser.

`primeiroNome · nomePlano · fimDoCiclo · linkPlanos`

## As de MARKETING — cuidado redobrado

Estas três exigem opt-in e custam mais. São também as que podem derrubar a nota
do número se forem disparadas sem critério.

### 24. `comunicado_geral` · **MARKETING**
**Dispara:** ação manual do dono ("Enviar aviso aos clientes").
**Cuidado:** é o botão mais perigoso do painel. Precisa de limite anti-spam do
nosso lado, não só da boa vontade de quem clica.

> 💈 **{{1}}**
>
> Detalhes: **{{2}}**
>
> Para aproveitar: **{{3}}** — qualquer dúvida, é só responder por aqui.

`titulo · mensagem · chamadaParaAcao`

### 25. `reativacao_cliente` · **MARKETING**
**Dispara:** cliente sem aparecer há 45 dias.
**Por que existe:** é a única mensagem que traz de volta dinheiro que já estava
perdido. O detalhe do "horário de costume" é o que faz parecer que a barbearia
lembra dele — e é o que diferencia de spam.

> E aí **{{1}}**, sumiu! 💈
>
> Faz **{{2}}** dias desde seu último corte na **{{3}}**. Que tal dar aquela renovada?
>
> Seu horário de costume (**{{4}}**) costuma estar livre. Agende pelo link **{{5}}** e a gente te espera.

`primeiroNome · diasSemVir · nomeBarbearia · horarioCostume · linkApp`

### 26. `aniversario` · **MARKETING**
**Dispara:** no aniversário.
**Cuidado:** só mande se houver mimo de verdade. Parabéns sem nada junto é
propaganda com chapéu de festa, e o cliente sente.

> Parabéns, **{{1}}**! 🎉
>
> A **{{2}}** te dá **{{3}}** no seu próximo atendimento deste mês. É nosso presente.
>
> Agende quando quiser pelo link **{{4}}** — vai ser um prazer.

`primeiroNome · nomeBarbearia · mimo · linkApp`

---

# BARBEIRO / DONO

As 5 que o Rômulo recebe no WhatsApp dele. Saem do mesmo número da barbearia.

### 27. `nova_reserva` · UTILITY
**Dispara:** reserva confirmada pelo app.
**Por que existe:** **é a mensagem que hoje falta e trava o teste real.** Sem
ela, o barbeiro precisa manter o painel aberto para descobrir que alguém marcou.
Uma reserva que ele não vê é um cliente esperando na porta.

> 📅 Nova reserva confirmada
>
> Cliente: **{{1}}**
> Serviço: **{{2}}**
> Quando: **{{3}}** às **{{4}}**
> Valor: **{{5}}** (**{{6}}**)
>
> Já está na sua agenda — nada a fazer.

`nomeCliente · servicos · data · hora · valor · formaPagamento`

### 28. `encaixe_solicitacao` · UTILITY · **com botões**
**Dispara:** cliente pediu encaixe num horário ocupado. Expira em 45 min.
**Por que existe:** o encaixe é decisão do barbeiro, e ele está com a tesoura na
mão. Dois botões no WhatsApp resolvem sem ele largar o cliente da cadeira.

> 🔔 Pedido de encaixe
>
> Cliente: **{{1}}**
> Serviço: **{{2}}**
> Quando: **{{3}}** às **{{4}}**
> Valor: **{{5}}** (**{{6}}**)
>
> Responda em até 45 minutos — depois disso o pedido expira e o cliente recebe horários alternativos automaticamente.

`nomeCliente · servicos · data · hora · valor · formaPagamento`
Botões: **Aprovar ✅** · **Recusar ❌**

### 29. `resumo_do_dia` · UTILITY
**Dispara:** todo dia às 7h (ajustável).
**Por que existe:** é o hábito. Uma mensagem por manhã com o dia inteiro faz o
barbeiro abrir o app — e o "sem confirmação: 2" é o que o leva a agir antes de
perder o horário.

> ☀️ Bom dia! Sua agenda de hoje (**{{1}}**):
>
> Atendimentos: **{{2}}**
> Confirmados: **{{3}}** · Sem confirmação: **{{4}}**
> Previsão de caixa: **{{5}}**
> Horários ainda livres: **{{6}}**
>
> Detalhes no painel **{{7}}** — bom trabalho!

`data · totalAtendimentos · confirmados · naoConfirmados · previsaoCaixa · horariosLivres · linkPainel`

### 30. `alerta_operacional` · UTILITY
**Dispara:** cancelamento em cima da hora, mensalista que regularizou, estoque
no fim.
**Por que existe:** um formato genérico para o que não cabe num template
próprio. Evita criar dez modelos e ter que submeter cada um à Meta.

> ⚠️ Atenção: **{{1}}**
>
> O que aconteceu: **{{2}}**
>
> Confira os detalhes no painel **{{3}}** quando puder.

`titulo · detalhe · linkPainel`

### 31. `fechamento_mensal` · UTILITY
**Dispara:** primeiro dia útil do mês.
**Por que existe:** é o momento em que o barbeiro vê que o produto não é só
agenda. Resultado e margem no WhatsApp, sem ele precisar procurar.

> 📊 Fechamento de **{{1}}**
>
> Faturamento: **{{2}}**
> Custos: **{{3}}**
> Resultado: **{{4}}** (**{{5}}** de margem)
> Atendimentos: **{{6}}**
>
> O detalhamento e o DRE completo estão em **{{7}}** — bom mês!

`mesReferencia · faturamento · custos · resultado · margem · atendimentos · linkPainel`

---

# PLATAFORMA → DONO DA BARBEARIA

As 3 que **você** manda para o barbeiro, do **seu** número — nunca do dele.

### 32. `trial_terminando` · UTILITY
**Dispara:** faltando 3 dias para acabar o teste.
**Por que existe:** o número de atendimentos registrados no período é o
argumento. "Você já usou 12 vezes" convence mais que qualquer texto de venda.

> Oi **{{1}}**, faltam **{{2}}** dias do seu teste na **{{3}}**.
>
> Nesse período você já registrou **{{4}}** atendimento(s). Para continuar com tudo funcionando, escolha um plano em **{{5}}** — leva dois minutos e seus dados continuam onde estão.

`primeiroNome · diasRestantes · nomePlataforma · atendimentos · linkPlanos`

### 33. `trial_encerrado` · UTILITY
**Por que existe:** "nada foi apagado" é a frase inteira. O medo de perder a
agenda é o que trava a decisão.

> Oi **{{1}}**, seu teste terminou hoje.
>
> Nada foi apagado: sua agenda, seus clientes e seu financeiro continuam salvos. Escolhendo um plano em **{{2}}**, tudo volta a funcionar na hora.
>
> Se quiser conversar antes de decidir, é só responder por aqui.

`primeiroNome · linkPlanos`

### 34. `cobranca_falhou` · UTILITY
**Por que existe:** cartão recusado quase nunca é falta de dinheiro — é limite
ou validade. Dizer isso evita o constrangimento e recupera a assinatura.

> Oi **{{1}}**, a cobrança do seu plano **{{2}}** (**{{3}}**) não passou.
>
> Costuma ser limite ou cartão vencido. Atualizando os dados em **{{4}}**, a gente tenta de novo automaticamente e nada é interrompido.

`primeiroNome · nomePlano · valor · linkCobranca`

---

## O que ainda não existe

Os 34 textos estão escritos, revisados e com exemplo pronto para submissão. O
que **não** existe é tudo que faz eles saírem:

| Peça | Estado |
|---|---|
| Textos e catálogo | ✅ prontos em `templates.ts` |
| Aprovação na Meta | ❌ nenhum submetido |
| Número conectado (chip novo) | ❌ não existe |
| Cliente HTTP da Cloud API | ❌ não escrito |
| Webhook dos botões | ❌ não escrito — sem ele, "Confirmo ✅" não faz nada |
| Gatilhos (reserva criada, 7h da manhã, D-5…) | ❌ não escritos |
| Registro de envio e nota de qualidade | ❌ não escrito |

Em ordem de valor para o teste do O Siqueira, as três primeiras a fazer
funcionar são **`nova_reserva`** (senão ele não fica sabendo que marcaram),
**`confirmacao_reserva`** (senão o cliente não tem comprovante) e
**`lembrete_confirmacao`** (que é o que segura o no-show). As outras 31 podem
esperar sem prejuízo nenhum.

## Ao submeter na Meta

- O nome do template é o identificador e **não pode mudar depois**. Use
  exatamente o `name` de cada bloco acima.
- Idioma: `pt_BR` em todos.
- Cada um precisa de exemplo preenchido — estão em `example` no
  `templates.ts`, já plausíveis. Exemplo com "teste" ou "xxx" é reprovado.
- Aprovação costuma sair em minutos, mas pode levar até 24h. Reprovação não
  explica o motivo, então submeta poucos por vez no começo.
- Os botões de `lembrete_confirmacao` e `encaixe_solicitacao` são
  **quick reply**, não link.
