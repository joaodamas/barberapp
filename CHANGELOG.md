# Changelog

Histórico de mudanças do app da O Siqueira Barbearia.
Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).

## [Não publicado]

### Plataforma multi-barbearia

O produto nasceu para uma barbearia e passou a ser preparado para muitas. A
barbearia original vira o tenant piloto, não o único cliente.

**Isolamento e acesso**
- Dados isolados por subcoleção sob `/barbershops/{id}` — uma regra no nível do
  pai protege tudo abaixo, e é impossível "esquecer o filtro" e vazar o
  financeiro de uma barbearia para outra, que é o risco permanente do modelo com
  coleções na raiz e campo `tenantId`.
- Vínculo pessoa↔barbearia no claim `barbershops: { id: papel }`. Ler claim
  dentro da regra é grátis; ler documento de vínculo custaria uma leitura
  cobrada por avaliação. O cliente final não tem claim — acessa o que é dele por
  `clientId`.
- **37 testes de regra contra o emulador** provam o isolamento nas 14
  subcoleções, os papéis dentro da casa, o que o dono NÃO pode (mudar plano,
  status, slug; criar ou excluir barbearia; sequestrar slug) e a imutabilidade
  do log de auditoria.
- Regras e 5 índices aplicados em produção. O banco Firestore não existia no
  projeto e foi criado em `southamerica-east1` — **a região de um banco não pode
  ser alterada depois**.

**Endereço e marca**
- Cada barbearia tem subdomínio próprio e vira um PWA instalável distinto, com
  nome e ícone dela na tela do celular — o essencial de um app white-label sem
  passar por loja de aplicativo.
- As 35 ocorrências da marca em 12 arquivos saíram para a configuração do
  tenant. Personaliza-se nome, logo, cor de destaque e parâmetros de política;
  fundo, cor de texto e semânticas continuam da plataforma, para o contraste
  medido não depender da cor que o lojista escolher.
- **Consequência:** ler o host tornou as 19 rotas dinâmicas. Mitigado com cache
  de borda por host — o render acontece uma vez por barbearia, não por visita.

**Cadastro e onboarding**
- Cadastro self-service com slug atômico, e-mail verificado obrigatório e limite
  de uma barbearia por conta. Trial de 7 dias com tudo liberado.
- Onboarding guiado de 4 passos, pedindo só o que impede a primeira reserva:
  identidade, serviços, horários e o link compartilhado. Despesas, planos e
  produtos são pedidos dentro da própria tela, quando o dono chegar lá.
- O passo dos horários tem prévia ao vivo da grade; o dos serviços vem com
  quatro linhas pré-preenchidas — tabela vazia gera abandono.
- A cor é uma paleta de seis validadas, não seletor livre: dourado escolhido a
  esmo derruba o contraste do botão primário.

### Persistência

- `mock-data.ts` foi apagado. Nenhuma tela lê dado fictício.
- O mock guardava resultado pronto — DRE, caixa diário, KPIs e projeção eram
  literais que precisavam bater entre si na mão e não batiam. Agora tudo desce
  de reservas e despesas por funções puras em `lib/analytics.ts`, com 39 testes.
- O motor de slots deixou de ter grade fixa: a jornada vem do tenant e a
  ocupação vem das reservas.
- Sete telas ganharam estado vazio que explica o que falta e oferece a ação.

### Fidelidade

- Saldo por transação, não por contagem. `atendimentos % 10` funcionava até o
  primeiro resgate — depois a conta voltava a subir sozinha — e não sobrevivia a
  estorno, que o PRD §9 exige.
- Crédito automático quando o atendimento é concluído, com id derivado da
  reserva: reprocessar o gatilho não credita duas vezes. Reserva desmarcada
  devolve o carimbo.
- Resgate em transação que lê o saldo e grava junto, para dois toques no botão
  não resgatarem duas vezes.

### WhatsApp

- Catálogo de 16 para **34 templates**, cobrindo todos os estados do sistema.
  `pending_payment` e `expired` existiam no código sem nenhuma mensagem: o
  cliente perdia o horário sem ser avisado.
- Campo `sender` separa duas conversas que não podem sair do mesmo número: as 31
  da barbearia saem da WABA dela; trial e cobrança do SaaS saem da da
  plataforma.
- `pagamento_antecipado_exigido` foi escrito sem tom de punição de propósito:
  mensagem acusatória gera bloqueio, bloqueio derruba a nota de qualidade do
  número, e nota baixa reduz o limite de envio de todas as barbearias.

### Corrigido — plataforma e persistência

- **Regras de segurança eram single-tenant.** `isOwner()` checava apenas
  `role == 'owner'`, global, sobre coleções na raiz — com duas barbearias, o
  dono da A leria as despesas da B. Corrigido antes de existir qualquer dado.
- **Cinco defeitos que só apareceram rodando no navegador**, nenhum detectável
  por typecheck, lint ou teste unitário:
  - CSP sem `unsafe-eval` em desenvolvimento e `allowedDevOrigins` ausente — a
    página carregava inteira e **nenhum botão respondia**, sem erro no console.
  - `upgrade-insecure-requests` forçando https em subdomínio local e derrubando
    todos os assets.
  - `Timestamp` do Firestore atravessando para Client Component, derrubando a
    rota com 500.
  - `RecaptchaVerifier` construído na montagem: qualquer falha dele matava o
    login inteiro em silêncio, inclusive a aba de e-mail que nem o usa.
  - `shortName` cortando no meio da palavra — é o texto sob o ícone no celular
    do cliente.
- **Cinco regressões introduzidas pelas próprias correções**, achadas em
  re-auditoria: o seletor de dias abrindo num domingo (reprodutível toda
  semana), o motor devolvendo horários em dia fechado, divisões sem guarda que
  sobreviveram à primeira varredura e órfãos criados pela limpeza.
- `slugFromHost` contava rótulos de domínio e quebrava em `.com.br`, que tem
  três no apex.

### Documentação

- `ESTRATEGIA-SAAS.md` — isolamento, subdomínio, o que é personalizável e o que
  não é.
- `ONBOARDING-SELF-SERVICE.md` — campos, textos de orientação e o problema
  honesto do trial de 7 dias mostrar a agenda e esconder o financeiro.
- `PLANOS-E-FUNCIONALIDADES.md` — inventário do que existe e o corte em três
  planos, por camada de dor e nunca por profissional.
- `WHATSAPP-ARQUITETURA.md` — de qual número sai a mensagem, Embedded Signup, a
  amarração por `bookingId`/`wamid`, e a verificação comercial como gargalo.
- `REVISAO-UIUX-2026-08-02.md`, `AUDITORIA-2026-08-02.md`, `ARQUITETURA.md`,
  `COMPARATIVO-MERCADO-2026-08.md`.

### Adicionado — auditoria de 02/08

**Auditoria e documentação**
- `docs/AUDITORIA-2026-08-02.md` — 47 achados priorizados com evidência e
  correção. `docs/ARQUITETURA.md` — referência técnica da plataforma.
  `docs/COMPARATIVO-MERCADO-2026-08.md` — posicionamento frente aos concorrentes.
- README do `web/` reescrito (era o boilerplate do `create-next-app`).

**Fundação que faltava**
- `firestore.rules`, `storage.rules` e `firestore.indexes.json` — o
  `firebase.json` referenciava os três e nenhum existia: `firebase deploy`
  falhava e nenhuma regra de segurança era versionada. As regras negam por
  padrão e abrem por coleção.
- `functions/src/index.ts` — o `package.json` apontava `main: lib/index.js` e
  o arquivo nunca era gerado. Inclui `setOwnerRole`, o provisionamento do claim
  `role: owner` que não existia em lugar nenhum do repositório.
- 60 testes (Vitest) sobre política de cancelamento, rateio de comissão, motor
  de slots, coerência do DRE, formatação e regras da Meta.
- CI no GitHub Actions: typecheck, lint, testes, conferência de coerência dos
  números e build, para `web` e `functions`.
- Headers de segurança (CSP, HSTS, X-Frame-Options, Referrer-Policy,
  Permissions-Policy) — antes só havia cache do `/sw.js`.
- Aviso de ambiente de demonstração, ligado por `NEXT_PUBLIC_DEMO_MODE`.

**Regras de negócio versionadas**
- `lib/business-rules.ts` — política de cancelamento, janela e limite de
  reagendamento, antecedências, rateio de comissão e imposto. Nenhum percentual
  escrito à mão em tela.
- `lib/slots.ts` — motor de horários com jornada, antecedência mínima e máxima,
  dias fechados e soma de durações.
- `lib/dre.ts` — cálculo do resultado do mês, fonte única para Financeiro e DRE.

### Corrigido — auditoria de 02/08

- **Duas telas financeiras exibiam o dia da semana no lugar da data.**
  `formatDatePtBR(...).split(",")[0]` devolve "domingo", não "05 de julho" — as
  colunas Data (Despesas) e Dia (Projeção) estavam sem data em produção.
- **O build falhava sem `.env.local`,** com `auth/invalid-api-key` e sem dizer o
  que fazer. Agora falha dizendo exatamente quais chaves faltam.
- **Julho tinha dois faturamentos na mesma tela:** R$ 12.480 no KPI e R$ 6.210
  no card de Fluxo de Caixa. Agora caixa do balcão + mensalistas = receita
  bruta, verificado por teste.
- **O DRE tratava toda despesa como fixa,** inclusive impulsionamento no
  Instagram e revisão de máquina — custo fixo 45% inflado e ponto de equilíbrio
  errado. Recorrente virou custo fixo; o resto, despesa operacional eventual.
- **O DRE não tinha linha de imposto** apesar de `taxRatePct` existir. O
  resultado ignorava o Simples inteiro.
- **Comissão usava taxa única de 15%** em vez do rateio %barbeiro + %barbearia
  = 100% do PRD, e só incidia sobre a loja.
- **MRR era um literal (R$ 894)** exibido acima de uma tabela que somava R$ 268.
  Agora deriva da lista de assinantes.
- **Ponto de equilíbrio era fixo no dia 14** e a etiqueta "no verde" aparecia
  mesmo com resultado negativo.
- **Reagendar era grátis, ilimitado e sem prazo** — dava para reagendar 10 min
  antes e cancelar depois com 100% de volta, anulando a política. Agora respeita
  janela de 6h e limite de 2 por reserva.
- **Taxa de cancelamento era 50%,** o dobro dos 20–30% do PRD. Passou a 25%,
  configurável.
- **A home saudava "João" fixo no código,** contradizendo o changelog anterior.
- **Perfil dizia "Você ainda não é mensalista"** mesmo com plano ativo em
  /planos — o estado do plano era local à tela.
- **"Meus dados" mostrava "Salvo!" sem salvar nada;** o campo Observações da
  despesa era preenchido e descartado no salvamento.
- **Excluir despesa não pedia confirmação** e não havia como desfazer.
- **Agendar ignorava hora atual, domingo e duração:** dava para marcar 09:00 às
  18h do mesmo dia, em dia fechado, e encaixar 60 min no último slot de 30.
- **`NaN%` em CSS e "R$ ∞" na tela** por divisão sem guarda, em três lugares.
- **Botão primário reprovava no WCAG AA** (3.23:1). Texto escuro sobre dourado
  dá 5.69:1, sem mexer na identidade. `maximumScale: 1` bloqueava o zoom.
- **14 dos 16 templates do WhatsApp violavam a regra de placeholders da Meta**
  documentada no próprio arquivo — seriam rejeitados na submissão. Corrigidos e
  validados no CI.
- **Service worker** ativava o build novo sob a aba antiga (`skipWaiting`
  imediato) e cacheava respostas same-origin sem separar por usuário. Agora a
  troca é pedida ao usuário e payloads RSC/API nunca vão para o cache.
- **`nextChargeDate()` pulava fevereiro:** assinar em 31/01 exibia 03 de março.
- **No filtro "Ano", a variação vs. período anterior era sempre "—"** — os dois
  períodos somavam o mesmo conjunto por causa do módulo 12.
- Modal duplicado em Loja e Despesas (sem `Esc` nem `aria-modal`) substituído
  pelo compartilhado, que ganhou focus trap e trava de scroll.
- Login sem cadastro por e-mail, sem recuperação de senha, sem `<form>` (Enter
  não submetia), sem labels associados e com `RecaptchaVerifier` que não era
  limpo após falha. Erros deixaram de ser engolidos por `catch {}`.

### Alterado

- `turbopack.root` fixado — um `package-lock.json` no `$HOME` estava vencendo o
  do projeto na inferência de workspace.
- Removidos exports mortos (`availableMonths`, `previousMonthKpis`,
  `operationalStats`, `sixMonthFlow`, `commissionRatePct`) e o componente órfão
  `ComingSoon`. `KpiTile`/`signTone`, duplicados em três telas, viraram um
  componente.
- Manifest deixou de travar a orientação em retrato — o produto tem layout
  desktop completo.
- Despesas ganhou ordenação por data e totalizador; Fluxo de Caixa passou a
  dizer de que mês são os números e a totalizar por meio de pagamento.

### Em andamento
- **Ambiente do WhatsApp Business Cloud API.** O catálogo de templates já está
  escrito; faltam o client da API, o webhook de recebimento e os gatilhos.
  Bloqueado nas credenciais da Meta (número, token permanente de system user,
  Phone Number ID, WABA ID), que só o dono da conta pode gerar. Os templates
  ainda precisam ser submetidos à Meta e aprovados antes do go-live — a
  aprovação leva dias, então convém submeter cedo.

### A confirmar
- Provider **Phone/SMS** no Firebase Authentication: enquanto não for
  habilitado, a aba "Celular" do login não funciona (e-mail/senha e Google
  funcionam normalmente).

---

### Em aberto

- **O nome da plataforma.** Trava o domínio raiz, os slugs reservados e a
  assinatura dos templates. Depois que barbearias externas instalarem o PWA,
  trocar o domínio quebra o app na mão dos clientes delas — decidir antes do
  primeiro cliente de fora.
- Envio de WhatsApp, gateway de pagamento, estorno via API e cobrança do próprio
  SaaS. Sem eles o produto não é vendável.
- Verificação comercial na Meta — sem ela, 250 destinatários únicos por 24h.

---

## [2026-07-31]

Primeira versão em produção, em <https://osiqueira.jpproject.com.br>.

### Adicionado

**Autenticação e permissões**
- Tela de login única em `/login`, com e-mail/senha, código por SMS e Google.
  O destino após entrar é decidido pela **permissão da conta**, não pela tela:
  quem tem o claim `role: owner` vai para o painel, o restante vai para o app
  do cliente.
- `AuthProvider` e `AuthGuard` protegendo as duas áreas. Sem conta, vai para o
  login; com conta mas sem permissão, vai para o app do cliente — evita o beco
  sem saída de mandar para o login alguém que já está logado.
- Atalho "Painel da barbearia", visível apenas para quem é dono, na sidebar do
  cliente e no perfil.
- Logout funcional na sidebar e no perfil (antes eram elementos decorativos).

**Infraestrutura**
- SDK do Firebase (projeto `axon-barber`) inicializado em `web/src/lib/firebase.ts`,
  lendo as chaves de `NEXT_PUBLIC_FIREBASE_*`. Nenhuma credencial no repositório.
- Configuração de hosting, functions e firestore centralizada na raiz.
- Deploy em Firebase Hosting servindo o domínio `osiqueira.jpproject.com.br`.

**WhatsApp**
- Catálogo dos 16 templates da régua do PRD em
  `functions/src/whatsapp/templates.ts`, cobrindo agendamento, régua
  operacional do barbeiro, cobrança de mensalista, avisos de agenda e
  reengajamento. Este arquivo é a fonte da verdade dos textos que vão para
  aprovação na Meta.

**Ações que antes não faziam nada**
- **Reservas:** reagendar com seletor de dia e horários livres; cancelar com o
  valor de devolução **calculado** pela política (100% acima de 24h, metade
  entre 24h e 6h, nada abaixo disso, nada quando o pagamento seria no salão).
- **Planos:** checkout com escolha de forma de cobrança, plano ativo no topo da
  tela e cancelamento.
- **Perfil:** as cinco opções do menu abrem conteúdo real — dados, plano,
  preferências de notificação, política e contato com a barbearia.
- **Despesas:** editar lançamento reaproveitando o modal de cadastro.
- **DRE:** navegação por mês.
- **Números:** o filtro de período passou a agregar de fato.

**Layout desktop**
- Reservas e Perfil ganharam segunda coluna (fidelidade, ajuda, resumo do
  cliente, plano) — antes o conteúdo ficava preso numa coluna estreita com o
  resto da tela vazio. O mobile não foi alterado.
- Componente de modal reutilizável, com fechar por `Esc`.

### Corrigido

- **Dono entrava como cliente.** O `AuthProvider` gravava usuário e permissões
  em dois `setState` separados. Como `loading` já era `false` desde a primeira
  carga, existia uma renderização com "logado, sem permissão ainda" — e o
  redirect, lendo `role` nesse instante, mandava o dono para o app do cliente.
  Usuário e claims passaram a viver num único objeto de estado, então chegam
  sempre juntos.
- **Navegação lenta, com tela branca ao trocar de aba.** Duas causas:
  1. O service worker buscava na rede antes de responder qualquer asset. A
     estratégia "rede primeiro" tinha sido aplicada de forma ampla demais para
     resolver um bundle preso em cache; como os arquivos de `/_next/static/`
     têm hash no nome, a mesma URL nunca muda de conteúdo, e esperar a rede por
     eles só adicionava uma ida ao servidor a cada navegação. Voltaram a ser
     cache-first.
  2. Firestore, Storage, Functions e Analytics eram inicializados junto com o
     Auth. Como o `AuthProvider` está no layout raiz, o SDK inteiro entrava em
     toda página, sem nada usar aquilo ainda. Passaram a ser importados sob
     demanda — o chunk de 558 KB do Firestore saiu do carregamento inicial.
- Erro de lint na tela de Projeção: um `useMemo` que o React Compiler não
  conseguia preservar.

### Alterado

- Rotas do painel agrupadas em `(dashboard)`, separando o layout logado do
  login. Nenhuma URL mudou.
- Na navegação por mês do DRE, **receita e custo variável acompanham o mês e o
  custo fixo não** — é o que faz o resultado variar de forma coerente, em vez
  de escalar tudo junto e manter a margem sempre idêntica.
- Na tela de Números, valores acumuláveis (faturamento, atendimentos) somam os
  meses do período e as taxas (ocupação, no-show) usam média mensal — sem isso,
  um trimestre exibiria 180% de ocupação. O ticket médio virou derivado
  (receita ÷ atendimentos), então não fica inconsistente.
- Perfil e sidebars passaram a exibir o usuário realmente logado, no lugar de
  nome e telefone fixos no código.

### Notas

- **Os dados ainda são fictícios.** Nada persiste: recarregar a página desfaz
  cancelamentos, assinaturas e despesas editadas. O Firestore está inicializado
  mas nenhuma tela o utiliza ainda.
- Depois de cada publicação, o service worker antigo continua instalado no
  navegador até a visita seguinte. Para ver a versão nova na hora: `Ctrl+Shift+R`
  ou uma janela anônima.
