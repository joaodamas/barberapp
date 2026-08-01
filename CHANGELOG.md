# Changelog

Histórico de mudanças do app da O Siqueira Barbearia.
Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/).

## [Não publicado]

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
