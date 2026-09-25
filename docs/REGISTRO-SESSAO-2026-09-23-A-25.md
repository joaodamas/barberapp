# Registro da sessão — 23 a 25/09/2026

O que foi feito, publicado, deixado pendente e decidido, do E2E da plataforma
até a pesquisa de movimento de interface. Os detalhes técnicos de cada item
estão no PR correspondente (`gh pr view <n>`) e nos documentos citados.

---

## 1. Rodada E2E da plataforma (23/09)

Pedido: testar a plataforma inteira (telas, fluxos, LGPD, visual, código) e
classificar por severidade (P0, P1…).

- Relatório: `docs/QA-E2E-2026-09-23.md` (e `docs/qa-e2e-2026-09-23/`).
- **5 P0 e 18 P1 corrigidos**: PRs #31 e #32. Entre eles:
  - a vitrine pública, onde o visitante vê serviços, preços e endereço antes
    de criar conta;
  - o monograma da barbearia como marca padrão, no lugar do selo d'O Siqueira
    que toda barbearia nova herdava;
  - os direitos do titular (LGPD), no documento e no código
    (`docs/LGPD-DIREITOS-DO-TITULAR.md`);
  - o dinheiro que mentia: gatilhos transacionais, eventos antigos
    ignorados, resgate de fidelidade feito pelo balcão.
- P2 de dinheiro e acesso (#36):
  - gatilhos à prova de evento antigo;
  - modo leitura no servidor (`exigirEdicao` em 12 callables);
  - cancelamento e reserva idempotentes.
- CI (#33): as dez suítes de emulador rodam em todo PR, com
  `TZ=America/Sao_Paulo`.
- Legenda da receita (#37).

## 2. O Siqueira (piloto)

- Motores validados com a configuração real, em clone no emulador e em
  produção. Um oráculo independente bateu centavo a centavo com o DRE.
  Registro em `docs/GO-LIVE-READINESS.md` §2.8.
- Conta de administrador criada para o dono da plataforma, igual à do Rômulo.
- Laço na troca de senha provisória corrigido (#38): `onIdTokenChanged` no
  lugar de `onAuthStateChanged`.
- A primeira visita no PWA recarregava a página por cima de quem digitava;
  corrigido em #39.
- Mensagem de WhatsApp para o Rômulo com o que falta ele decidir (entregue no
  chat).

## 3. Infraestrutura

- **Cadastro self-service pausado** (#35): `CADASTRO_ABERTO = false` em
  `web/src/lib/platform.ts` e em `functions/src/signup.ts`, até subdomínio
  novo ter HTTPS.
- **Load Balancer do Google** montado para o HTTPS curinga:
  - IP `136.81.166.97`, certificado `cortehub-curinga` (*.jpproject.com.br);
  - NEG apontando para `axon-barber.web.app`;
  - cabeçalho `x-cortehub-host`.
- **Falta DNS na Cloudflare**, que só o dono pode fazer:
  - CNAME `_acme-challenge.jpproject.com.br` →
    `df7224b7-bd5a-4255-b5f4-01c7968cc314.19.authorize.certificatemanager.goog`;
  - registro `*` A → `136.81.166.97`;
  - os dois apenas DNS, sem proxy.

  A autorização do certificado tinha falhado e pode precisar ser recriada.
- **SSR**:
  - testado em São Paulo (#41–#43). Medido mais lento atrás do Hosting,
    porque a origem do Hosting fica nos EUA, e voltou a `us-central1` (#44);
  - `--force` no deploy do Hosting (#45);
  - instância mínima 1 e 512 MiB configurados no serviço, porque o `pinTags`
    impede de pôr no `firebase.json` (#47, `docs/DEPLOY.md`).
- Navegação medida: 30–550 ms no desktop e 0,3–0,8 s no celular, com a
  instância já quente.

## 4. Telas: celular, PC e velocidade (24/09)

| PR | O que mudou |
|---|---|
| #40 | Celular sem zoom nos campos (16px), menu Mais corrigido, carregamento imediato ao trocar de tela |
| #46 | "+" no centro da barra do celular para marcar atendimento de qualquer tela |
| #48 | Menu "Mais" em grade por seção, cabendo no iPhone SE; **agenda com escolha de dia** (‹ › + calendário + "Hoje"); o PC 1366px deixou de vazar pela direita; marcar atendimento sem repetições (sem cartão "Resumo", sem "Cancelar" duplicado, sem "Com quem" quando há um barbeiro só) |
| #49 | **Passeio tela a tela** (ver §5) e os acertos que ele achou: 4 telas vazavam a 320px, as abas da Projeção, os números do Hoje, a lista de Serviços compacta, os dias curtos no marcar, alvos de toque de 44px, texto de 10px |
| #50 | O atrasado de hoje aparece só na agenda, em destaque ("atendeu ou não veio?"); volta ao "Precisa de você" quando a agenda mostra outro dia |
| #52 | Visitante sem conta vê só Início, Agendar e Planos, com um botão "Entrar" (antes via Reservas, Perfil e um cartão "Cliente" com botão de sair) |

## 5. Passeio de telas no GitHub (`.github/workflows/passeio-celular.yml`)

Criado porque emulador, `next dev` e Playwright juntos travaram o computador
do dono (24/09). **Nada pesado roda mais localmente.**

- Sobe o emulador e o build standalone, e semeia uma barbearia de teste:
  `scripts/semear-day-in-the-life.mjs` e
  `scripts/passeio-celular/semear-agenda.mjs`.
- Passa por todas as telas públicas e do painel em iPhone SE (320px),
  iPhone 13, Pixel 7 e PC 1366, e também pelo menu "Mais" e pelo marcar
  atendimento.
- Mede, pela largura do aparelho:
  - se a tela vaza;
  - se algo sai da tela;
  - botão abaixo de 32px e texto abaixo de 11px;
  - erros de console e tempo.
- Fotos e `relatorio.json`/`.md` saem como artefato.
- Roda manual: `gh workflow run passeio-celular.yml --ref <branch>`.
- Detalhes do ambiente de teste:
  - `bypassCSP`: a CSP de produção tem `upgrade-insecure-requests`, e sem
    HTTPS nada carregava;
  - servidor standalone com `static` e `public` copiados, porque o
    `next start` não serve estáticos com `output: standalone`;
  - o login espera a hidratação da página.

## 6. Massa de demonstração EM PRODUÇÃO no O Siqueira (24–25/09)

Pedido do dono para o Rômulo "usar e ver como é". Scripts em
`scripts/dados-demo/` (PR #51, **ainda aberto**).

| Coleção | Qtde | Prefixo do id |
|---|---|---|
| clientes | 28 | `demo-` |
| reservas (13/08 a 29/09) | 221 | `demo-` |
| pagamentos de serviço | 173* | `pagamento_demo-` |
| comissões (65%) | 173* | `comissao_demo-` |
| despesas (ago e set) | 12 | `demo-` |
| produtos da loja | 4 | `demo-` |
| planos de mensalista | 3 | `demo-` |
| mensalistas | 6 | `demo-` |
| faturas (ago e set) | 12 | `fatura_demo-` |
| pagamentos de mensalidade | 10 | `pagamento_fatura_fatura_demo-` |

\* Eram 171 ao semear. Alguém concluiu dois atendimentos demo pelo app
depois disso.

**Total: 642 documentos.** Nenhum WhatsApp enviado: o O Siqueira não tem
WhatsApp configurado, e os números são de faixa não atribuída.

⚠️ Enquanto existirem:
- as reservas demo de 25, 26 e 29/09 ocupam a agenda real;
- a vitrine pública mostra os planos demo ("a partir de R$ 99");
- os relatórios misturam dado inventado com real.

**Apagar antes do primeiro dia real** (só mexe em ids `demo-`):

```bash
cd scripts/dados-demo   # precisa de firebase-admin e da credencial do gcloud
CONFIRMO=osiqueira node limpar.mjs            # só mostra o que apagaria
CONFIRMO=osiqueira APAGAR=sim node limpar.mjs # apaga
```

A gravação em produção é bloqueada para o assistente pelo modo automático:
quem roda é o dono, com `!` no prompt.

## 7. Pendências

**Do dono / Rômulo:**
- DNS na Cloudflare (§3). Depois disso:
  - checar ou recriar o certificado;
  - testar um subdomínio novo;
  - `CADASTRO_ABERTO = true`;
  - prova em produção com uma barbearia de teste.
- Valores reais dos planos de mensalista e da fidelidade (ligar ou não).
- Combos de 2–3 pessoas cadastrados com 30 min, o que faz a agenda vender o
  horário seguinte.
- Rômulo é dono e único barbeiro com comissão de 65%: pró-labore ou comissão.
- Regras a confirmar: se o estorno devolve a comissão e se atendimento coberto
  por plano paga comissão.
- Número comercial de WhatsApp; segundo e-mail de dono.
- "Começar do zero" e o limpar da massa demo antes do dia 1.

**De produto / código:**
- **Não há tela para o dono criar ou editar plano de mensalista**: hoje `plans`
  só é lido, e só entra por escrita direta. Proposta pendente de aprovação.
- Mesclar o PR #51 (scripts da massa demo). O `planos.mjs` e a versão de
  `limpar.mjs` com planos estão nele.
- WhatsApp fica por último, com OTP antes do envio (decisão de 23/09).

## 8. Pesquisa: movimento e acabamento visual (25/09)

Hoje o app só tem `animate-pulse` e `animate-spin`, com 8 dependências de
propósito.

1. **Transição entre telas (View Transitions)**, sem dependência nova:
   - ligar `experimental.viewTransition` no `next.config` e usar o
     `<ViewTransition>` do React 19 (guia em
     `web/node_modules/next/dist/docs/01-app/02-guides/view-transitions.md`);
   - troca de tela suave, com direção no celular via `transitionTypes` no
     `<Link>`;
   - aba e dia da agenda deslizando, elemento compartilhado (cartão → ficha),
     barras fixas paradas.

   Onde o navegador não suporta, a tela só troca como hoje. O flag ainda é
   experimental no Next.
2. **Entrada e saída de modal e menu com CSS puro** (`@starting-style`): o
   marcar atendimento e o "Mais" sobem como gaveta, e o fundo escurece aos
   poucos.
3. **Resposta às ações**:
   - aviso "Atendimento concluído · R$ 60 no Pix" (`sonner`, ~3 KB, ou feito
     à mão);
   - números que contam até o valor;
   - carregamento com brilho no formato da tela;
   - vibração curta no Android.
4. **Gestos** (opcional, exige biblioteca): arrastar para fechar (`vaul`) e
   deslizar o cartão da agenda (`motion`). Adiado por causa do peso em Android
   simples e da descoberta do gesto.

Cuidados:
- movimento de 150–250 ms, respeitando `prefers-reduced-motion`;
- **nada de UI otimista que afirme sucesso antes do servidor**, pela lente de
  confiança: a animação de sucesso só entra depois da gravação.

**Proposta, aguardando o "vai":**
- Fase 1 (sem dependência): transições com direção, abas e dia deslizando,
  modal e "Mais" como gaveta, redução de movimento, validado pelo passeio.
- Fase 2: avisos, números contando e carregamento com brilho.
- Fase 3: gestos.

## 9. Como trabalhar a partir daqui

- **Não rodar** emulador, `next dev`/`build`/`start` nem navegador na máquina
  do dono. Validação de tela pelo passeio no GitHub; localmente, só
  `tsc`, `eslint` e testes leves.
- Deploy só do Hosting:
  - `gh workflow run deploy.yml --ref main -f escopo="somente hosting"`;
  - aprovar o ambiente `producao` pela API de `pending_deployments`. O dono
    delegou essa aprovação.
- Mesclar PR exige ok explícito do dono, pelo bloqueio do modo automático.
