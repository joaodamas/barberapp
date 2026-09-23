# LGPD — direitos do titular e o fim de uma conta

Desenho escrito **antes** do código que fecha o P0-4 e o P0-5 da rodada de
23/09 (`QA-E2E-2026-09-23.md` §2; detalhes em
`qa-e2e-2026-09-23/seguranca-lgpd.md`, P1-4 e P1-5).

Escrito em 23/09/2026. Decisão do dono: **"documento + código agora"**. O
`DRY_RUN` do expurgo **continua ligado** — este documento diz o que ele passa a
fazer; desligá-lo segue exigindo ler o log com uma conta real encerrada.

---

## 0. Por que isto existe

A Política e os Termos prometem quatro coisas que o produto não fazia:

| Promessa | Onde | O que havia |
|---|---|---|
| O cliente pede cópia, correção, portabilidade e exclusão **à barbearia**, e "nós damos o suporte técnico" | Termos §7, Política §7 | `clients` é `write: false` e nenhuma function edita, apaga ou exporta um cliente |
| Encerrada a conta, **30 dias** para exportar, depois exclusão | Termos §8, Política §6 | `encerrarConta` não era chamado por nenhuma tela |
| Registros fiscais ficam "pelo prazo que a lei exigir" | Política §6 | o expurgo fazia `recursiveDelete` em `payments` e `audit_log` junto com o resto |
| Exclusão de verdade | Política §6 | o expurgo apagava a árvore **primeiro**; qualquer falha depois deixava slug e telefones órfãos para sempre, e não tocava em Auth, claims, Storage nem `platform_users` |

É a lente de confiança (`HANDOFF.md` §3.1) aplicada ao texto jurídico: o
documento afirmava algo que não acontecia. Com uma diferença que agrava — aqui
quem é enganado é um terceiro que nunca contratou nada.

---

## 1. Papéis — quem é controlador de quê

A Política apresenta o CorteHub só como operador. **Isso é verdade para parte
dos dados, e falso para outra parte.** O desenho abaixo separa as duas, porque
é a separação que decide quem dispara cada direito.

| Dado | Onde mora | Controlador | Operador |
|---|---|---|---|
| Cadastro do cliente na barbearia (nome, WhatsApp) | `barbershops/{id}/clients/{clientId}` | **a barbearia** | CorteHub |
| Histórico: reservas, pagamentos, fidelidade, mensalidade | `barbershops/{id}/{bookings, payments, loyalty_transactions, subscriptions, …}` | **a barbearia** | CorteHub |
| Mensagens de WhatsApp da barbearia | `barbershops/{id}/whatsapp_messages`, índices na raiz | **a barbearia** | CorteHub |
| **Conta global do cliente final** (nome, WhatsApp, e-mail de login) | `users/{uid}` + conta do Firebase Auth | **CorteHub, de fato** | Google |
| Conta do dono e da equipe (e-mail, senha provisória) | Auth, `platform_users/{uid}`, `members/{uid}` | **CorteHub** | Google |
| Dados do estabelecimento e do contrato | `barbershops/{id}`, `private/` | **CorteHub** (com a barbearia) | Google |

**Por que o CorteHub é controlador de fato de `users/{uid}`.** Nenhuma
barbearia decidiu criar esse documento. Ele existe porque o *produto* decidiu
que o cliente não digita o telefone duas vezes quando corta em duas casas
(`web/src/lib/db/perfil.ts`). Quem define finalidade e meio é o controlador
(art. 5º, VI), e aqui é a plataforma. Consequência prática: a exclusão dessa
conta não pode depender de uma barbearia — e é por isso que o cliente final
tem um botão próprio (§3.3), em vez de "peça à barbearia".

> ⚖️ A Política §1 continua dizendo só "operador" para o cliente final. Ajustar
> a redação de papel é trabalho de revisão jurídica, não deste documento — fica
> registrado aqui como divergência conhecida entre o que o texto diz e o que o
> desenho reconhece.

---

## 2. Os direitos (art. 18) e quem os dispara

| Direito | Quem pede | Quem executa no produto | Caminho |
|---|---|---|---|
| **Confirmação e acesso** | cliente, à barbearia | o **dono** | Clientes → ficha → **Exportar dados** (`exportarDadosDoCliente`) |
| **Portabilidade** | idem | idem | o mesmo arquivo: JSON legível por máquina, com todos os campos |
| **Correção** | cliente | o próprio cliente, em Perfil → Meus dados (`users/{uid}`); a cópia em `clients/{uid}` só é regravada na próxima reserva naquela barbearia | já existia; não há edição pelo dono — fora do escopo, ver §5 |
| **Anonimização / eliminação** do que a barbearia guarda | cliente, à barbearia | o **dono** | Clientes → ficha → **Anonimizar** (`anonimizarCliente`) |
| **Eliminação da conta global** | cliente final | o **próprio cliente** | Perfil → **Excluir minha conta** (`excluirMinhaConta`) |
| **Encerrar a conta da barbearia** | dono | o **dono** | Configurações → **Encerrar conta** (`encerrarConta`) |

### Por que o dono executa, e não o CorteHub

Para os dados da barbearia, o CorteHub é operador: age **por instrução** do
controlador. Um pedido que chegue a nós é encaminhado (Política §7). A
ferramenta existe para a barbearia cumprir no prazo — é o "suporte técnico" que
os Termos §7 prometem.

### Por que as funções do dono exigem `owner`, e não `staff`

Exportar entrega o histórico inteiro de uma pessoa; anonimizar é irreversível.
São atos do controlador, e na barbearia quem responde pelo controlador é o
dono. O barbeiro não tem por que baixar o histórico de um cliente.

---

## 3. O que cada operação faz

### 3.1 Exportar — `exportarDadosDoCliente({ barbershopId, clientId })`

Devolve **um JSON** com tudo o que a barbearia guarda sobre aquela pessoa:

- o cadastro (`clients/{clientId}`) e os **cadastros de balcão fundidos nele**
  (`mergedInto == clientId`) — é a mesma pessoa, e o histórico antigo dela
  mora no id antigo (`clients.ts`, "A fusão");
- reservas, pagamentos, estornos, fidelidade, mensalidades e faturas de todos
  esses ids.

Datas saem em ISO 8601. O servidor não grava o arquivo em lugar nenhum: ele
volta na resposta e a tela oferece o download. Guardar uma cópia seria criar um
segundo lugar com o dado, que depois precisaria ser apagado também.

A exportação **entra no `audit_log`** (`titular.exportado`), só com o id e as
contagens. Entregar o histórico de alguém é ato que precisa deixar rastro.

Funciona também com a conta **encerrada**: é exatamente para isso que a janela
de 30 dias existe.

### 3.2 Anonimizar — `anonimizarCliente({ barbershopId, clientId })`

**Anonimiza, não apaga.** Apagar a reserva ou o pagamento destruiria o
financeiro da barbearia — o DRE de março deixaria de fechar — e o fato
econômico é o que a lei manda guardar. O que sai é **quem**; fica **o quê,
quando e quanto**.

| Onde | O que muda | O que fica |
|---|---|---|
| `clients/{id}` (e os fundidos) | `name` → **"Cliente anonimizado"**, `whatsapp` → `""`, `email` removido, `active: false`, `anonimizadoEm`, `anonimizadoPor` | `uid`, `origin`, `createdAt` |
| `bookings` do cliente | `clientName` → marcador, `clientWhatsapp` → `""` | data, serviço, valor, status, forma de pagamento, `clientId` |
| `subscriptions` do cliente | `clientName` e `name` → marcador | plano, preço, datas, status |
| `client_occurrences` do cliente | nome e telefone, se houver | o resto |
| `whatsapp_messages` com o telefone | `to`/`de` → `""`, `texto` → `null` | que houve mensagem, quando, qual template |
| `whatsapp_conversations/{telefone}` desta barbearia | **apagado** (o telefone é o id do documento) | — |
| `payments`, `refunds`, `commissions`, `loyalty_transactions`, `subscription_invoices` | **nada** — não carregam nome nem telefone, só `clientId` (conferido por grep em 23/09) | tudo |
| `audit_log` | **nada** — não carrega dado do cliente final (conferido) | tudo, mais uma linha `titular.anonimizado` com id e contagens |

**O `clientId` fica.** Ele é uma chave opaca: sem o cadastro, não diz quem é.
É o que mantém pagamento, comissão e fidelidade ligados à mesma linha do
tempo. Tecnicamente é pseudonimização, e o limite está declarado: quem tiver o
uid e acesso à conta do Auth ainda reidentifica — por isso a exclusão da conta
(§3.3) apaga o Auth.

**Ordem.** O cadastro é o **último** a ser marcado. Se algo falhar no meio, o
cadastro continua sem o selo `anonimizadoEm`, e chamar de novo refaz tudo.
Mesma regra do expurgo (§4).

**Idempotente.** Chamar duas vezes não quebra nada e não duplica o registro:
sem resíduo identificável, a resposta diz `jaEstava: true` e nada é gravado.

**Quando recusa:**

- **reserva em aberto de hoje em diante** — o barbeiro esperaria alguém que o
  sistema não sabe mais quem é, e não teria como avisar. Cancele antes;
- **mensalidade ativa** — a cobrança continuaria rodando em nome de ninguém.
  Cancele o plano antes.

Não é burocracia: anonimizar com esses dois vivos produziria exatamente o
falso positivo que a lente procura — a agenda afirmando um compromisso com
alguém que não existe mais.

**Se a pessoa voltar.** Cliente com conta que agenda de novo tem o cadastro
regravado pela reserva (`resolverCliente`), com o selo de anonimização
removido. É um tratamento novo, com base nova — não reversão.

### 3.3 Excluir minha conta — `excluirMinhaConta()`

O cliente final, logado, pelo app.

1. **Recusa quem é dono ou equipe** de alguma barbearia, ou operador da
   plataforma. Apagar essa conta deixaria uma barbearia sem dono. O caminho
   dele é encerrar a conta da barbearia (ou ser removido pelo dono).
2. **Exige login recente** (10 minutos). Apagar é irreversível, e um token
   vazado vale uma hora — é o mesmo furo do P2-1 (`changeInitialPassword`), e
   não vamos repeti-lo numa função que destrói a conta.
3. Localiza **todos** os cadastros dessa pessoa em **todas** as barbearias —
   `collectionGroup("clients")` por `uid` e por `mergedInto`. Essas duas
   consultas exigem índice de campo com escopo de grupo, declarado em
   `firestore.indexes.json`; sem ele funcionam no emulador e **falham em
   produção**.
4. Confere as recusas de §3.2 em todas as barbearias **antes** de mudar
   qualquer coisa. Tudo ou nada na verificação.
5. Anonimiza cada cadastro com a **mesma** rotina de §3.2. Duas rotinas para o
   mesmo fato divergiriam.
6. Apaga `users/{uid}` (com subcoleções) e `platform_users/{uid}`.
7. Apaga a conta do Auth — **por último**, porque enquanto ela existir o
   cliente ainda consegue repetir o pedido se algo no meio falhar.

Os valores fiscais ficam em cada barbearia, anonimizados. **A barbearia não é
consultada** — o dado global é do CorteHub, e o dado dela é anonimizado, não
apagado, então o financeiro dela continua fechando.

### 3.4 Encerrar a conta da barbearia — `encerrarConta` / `reabrirConta`

- `encerrarConta` guarda o **status de antes** (`statusAntesDeEncerrar`) e a
  data. Chamar de novo numa conta já encerrada **não reinicia o relógio**.
- `reabrirConta` restaura o status de antes. Antes gravava sempre `suspenso`:
  a barbearia `ativa` e pagante que encerrasse e se arrependesse voltava
  bloqueada. Conta encerrada antes deste campo existir volta como `suspenso`
  — na ausência do dado, o mínimo (`HANDOFF.md` §5.3), e o suporte ajusta.
- Reabrir é recusado depois que o expurgo começou.
- A tela explica a janela de 30 dias **antes** do clique e mostra a data do
  expurgo **depois** que o servidor confirmou — nunca antes
  (`soAvisaSeGravou`).

### O dono não reescreve a janela

`encerradaEmMs`, `encerradaEm`, `encerradaPor`, `encerramentoMotivo`,
`statusAntesDeEncerrar`, `expurgo`, `suspendedAt` e `suspendedReason` entram na
lista de campos que o dono **não** escreve no documento da barbearia. Hoje ele
gravava `encerradaEmMs: 1` e o expurgo rodava na madrugada seguinte, pulando os
30 dias que existem justamente para o clique errado e a briga de sócios; ou
gravava uma string e a conta nunca era expurgada.

---

## 4. O expurgo, na ordem certa

`expurgarContasEncerradas`, diário, 04:00. **Continua em `DRY_RUN`.**

### O que fica retido, e por quê: arquivo fiscal

A Política §6 promete reter os registros fiscais "pelo prazo que a lei exigir,
mesmo após a exclusão do restante". A decisão foi **cumprir o que está escrito**
em vez de reescrever a Política para "a retenção é por exportação":

- Reescrever texto jurídico está fora do escopo desta mudança, e a exportação
  depende do dono se lembrar de exportar — o que não é garantia de nada.
- Reter do jeito certo custa pouco: uma cópia **sem identificação** num lugar
  que ninguém lê.

**Onde:** `arquivo_fiscal/{barbershopId}/{colecao}/{docId}`, na raiz. Nenhuma
regra abre isso — cai no fallback global `if false`. Só o Admin SDK alcança.

**O que entra:** `payments`, `refunds`, `commissions`, `cash_entries`,
`expenses`, `subscription_invoices`, `audit_log` e `private` (o contrato da
barbearia com a plataforma). Mais um documento-resumo em
`arquivo_fiscal/{barbershopId}` com nome, slug, datas de encerramento e expurgo
e `reterAte`.

**Como entra:** valores, datas, formas de pagamento e ids opacos ficam; **nome,
telefone e e-mail saem**, em qualquer profundidade do documento
(`clientName`, `staffName`, `ownerEmail`, …). O arquivo prova que o dinheiro
existiu, não quem era a pessoa.

**Por quanto tempo:** `ANOS_DE_RETENCAO_FISCAL = 5`, o prazo decadencial do
CTN (arts. 173 e 174). ⚖️ **A confirmar em revisão jurídica** — é o número
comum, não uma opinião legal. Vencido `reterAte`, a mesma rotina diária apaga o
arquivo, sob o mesmo `DRY_RUN`.

### A ordem

A regra: **a árvore da barbearia é o último alvo**, porque é o documento dela
que faz a próxima execução reencontrar a conta (`status == "encerrada"`).
Enquanto ele existir, qualquer falha é repetida no dia seguinte.

| # | Passo | Por que nesta posição |
|---|---|---|
| 1 | marca `expurgo.iniciadoEm` no documento da barbearia | bloqueia `reabrirConta` de ressuscitar uma conta pela metade |
| 2 | **arquiva** os registros fiscais, sem identificação | antes de qualquer exclusão; `set` com o mesmo id, então repetir não duplica |
| 3 | índices de WhatsApp na raiz: `whatsapp_sent`, `whatsapp_conversations` (telefone no id), `whatsapp_numbers` | dado pessoal **fora** da árvore |
| 4 | Storage: tudo sob `barbershops/{id}/` | idem |
| 5 | contas do dono e da equipe (lidas de `members/`) — ver abaixo | precisa ler `members`, que mora na árvore |
| 6 | `slugs/{slug}` | libera o subdomínio |
| 7 | **árvore da barbearia**, `recursiveDelete` | por último |

Cada barbearia roda dentro do próprio `try/catch`: uma falha é registrada no
log e a rotina segue para a próxima. Antes, a primeira exceção abortava todas.

### As contas do dono e da equipe

Para cada `members/{uid}`:

1. retira `barbershops[{id}]` do claim e revoga os refresh tokens — **sempre**;
2. **apaga a conta do Auth**, `users/{uid}` e `platform_users/{uid}` **só se**
   a conta não tiver mais vínculo com barbearia nenhuma, não for operador da
   plataforma e não for cliente de outra barbearia (`clients` por `uid`). Um
   barbeiro que trabalha em duas casas, ou um dono que corta em outra, perde
   só o vínculo com a que fechou.

### O que o expurgo NÃO apaga

- **`users/{uid}` dos clientes da barbearia.** É a conta global, do CorteHub, e
  a pessoa pode ser cliente de outras casas. O que era da barbearia fechada
  (`clients/{uid}`, reservas) vai com a árvore. Quem quiser apagar a conta usa
  §3.3.
- **Logs do Cloud Logging.** Registrados como pendência (P3-1 da auditoria:
  telefone em log do webhook). Não há como apagar entrada de log por conteúdo;
  a correção é não logar o telefone.

### O alvo morto

`{ tipo: "grupo", colecao: "memberships" }` sai. Nada escreve nessa coleção, e
o alvo varria o collection group da plataforma inteira para apagar zero
documentos. O teste que afirmava "remove o vínculo da equipe, que vive debaixo
de cada usuário" **codificava o defeito** (`HANDOFF.md` §3.1, padrão 2): o
vínculo vive no claim e em `members/`, e agora é disso que o teste fala.

---

## 5. O que fica de fora, dito

- **Exportação da barbearia inteira.** Os Termos §8 prometem que o dono pode
  "extrair" o conteúdo e tem 30 dias para exportar. A exportação construída
  aqui é **por cliente** — cumpre o direito do titular, não a portabilidade do
  negócio. Continua 🔴 no inventário até existir.
- **Edição do cadastro pelo dono** (corrigir um nome errado). O titular corrige
  o próprio perfil; o dono não tem tela. Fora do escopo.
- **Prova em produção.** Tudo aqui é 🟡: roda no emulador, ninguém exerceu no
  domínio publicado.
