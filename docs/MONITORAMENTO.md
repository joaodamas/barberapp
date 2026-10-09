# Monitoramento e alertas por e-mail

Quando algo quebra, chega um **e-mail**. Sem serviço de terceiro: tudo é o
Cloud Monitoring do próprio Google, no mesmo projeto que o Firebase.

```
navegador ──POST /api/erro──▶ servidor do site ──stdout JSON (severity ERROR)──▶ Cloud Logging
functions (console.error / logger.error) ───────────────────────────────────────▶ Cloud Logging
                                                                                     │
                                          política de alerta baseada em log ◀────────┘
                                                      │
                                          canal de e-mail ──▶ sua caixa de entrada

uptime check ──GET /api/health (a cada 5 min, várias regiões)──▶ política "site fora do ar" ──▶ e-mail
```

## O que é monitorado

| Política (nome no Cloud Monitoring) | Dispara quando | Fonte |
|---|---|---|
| **Topete · erro nas functions** | log com `severity>=ERROR` em Cloud Run/Functions (functions, rotinas agendadas e o servidor do site), **menos** os dois casos abaixo, para não chegar e-mail em dobro | `console.error` / `logger.error` / 5xx |
| **Topete · erro no site** | log com `jsonPayload.origem="front"` | `POST /api/erro` |
| **Topete · alerta da plataforma** | log com `jsonPayload.alertaDaPlataforma=true` | rotinas que também gravam em `alertas_da_plataforma` (hoje: conferência noturna do financeiro) |
| **Topete · site fora do ar** | a verificação `GET /api/health` falha em **2 ou mais regiões** | uptime check de 5 em 5 min |

As três primeiras são **alertas baseados em log**: no máximo um e-mail a cada
10 minutos por política (`notificationRateLimit`) e fecham sozinhas depois de 1
dia sem novo erro (`autoClose`). Cada política traz, na própria notificação, um
texto em português dizendo o que olhar.

### O que `/api/health` prova

`GET /api/health` responde 200 só se **os dois** estiverem de pé:

- `checks.firestore` — o servidor do site lê o banco (leitura pública de `slugs`);
- `checks.functions` — o callable `healthcheck` responde (HTTPS do protocolo
  callable, `POST https://southamerica-east1-<projeto>.cloudfunctions.net/healthcheck`
  com `{"data":{}}`, limite de 6 s). O callable é anônimo e só devolve
  `{ok, region}`.

Qualquer falha vira HTTP 503 com `error` dizendo qual parte. O JP Projects Hub
lê o mesmo contrato.

### Erros do navegador (`/api/erro`)

- `app/error.tsx` e `app/global-error.tsx` (a tela "Esta tela não abriu") e os
  ouvintes `window.onerror` / `unhandledrejection` (componente `RelatorDeErros`
  no layout raiz) mandam o erro.
- Vai: tipo, mensagem, `digest`, **só o caminho** da rota (sem query), user agent.
  O tenant (slug da barbearia) o servidor tira do host. **Nunca** nome, telefone
  ou e-mail: a mensagem passa por um filtro que troca e-mail e sequências de
  dígitos por `[e-mail]` / `[número]`.
- Contenção: até 5 envios por aba, mensagem igual não repete; o servidor recusa
  Origin que não seja `*.jpproject.com.br`, `*.topete.com.br` ou os sites
  `cortehub-dev.web.app` / `axon-barber.web.app` (403), corpo acima de 4 KB (413)
  e trunca cada campo. Não é autenticação: qualquer um forja o header fora de um
  navegador; o limite de tamanho e o truncamento é que seguram o abuso.

## Como aplicar

Precisa do `gcloud` autenticado numa conta com `roles/monitoring.editor` (e
`serviceusage.services.enable` para a primeira vez) no projeto. Pode ser o
Cloud Shell do projeto. O script é idempotente: rodar de novo reaproveita o
canal e a verificação e atualiza as políticas.

**Produção (`axon-barber`):**

```bash
scripts/monitoramento/aplicar.sh --project axon-barber \
  --email <seu-email> --dominio osiqueira.jpproject.com.br
```

**DEV (`crucial-baton-440119-r8`):**

```bash
scripts/monitoramento/aplicar.sh --project crucial-baton-440119-r8 \
  --email <seu-email> --dominio cortehub-dev.web.app
```

Antes de aplicar de verdade, `--dry-run` mostra o que faria sem alterar nada.

Depois, **confirme o e-mail**: o Google pode mandar uma mensagem de verificação
para o canal novo (Monitoring → Alerting → Edit notification channels).

O script não está ligado a nenhuma esteira: aplica-se na mão, uma vez por
projeto, e de novo só quando um arquivo `politica-*.json` mudar.

> A parte de código (coletor `/api/erro`, `/api/health` com functions) só passa
> a existir no projeto depois do deploy. Aplicar o script antes não quebra nada:
> o alerta "site fora do ar" só dispara com a nova resposta se o site já estiver
> publicado; a verificação em si funciona com o `/api/health` atual.

## Como testar

1. **Erro do site (seguro):** no navegador, em qualquer página do site publicado,
   abra o console e rode
   `window.dispatchEvent(new ErrorEvent("error", { error: new Error("TESTE de alerta — pode ignorar") }))`.
   O relator manda para `/api/erro`. Em até alguns minutos chega "Topete · erro
   no site". Mensagem igual não se repete na mesma aba: recarregue para testar de novo.
2. **Direto no endpoint:** o `curl` abaixo tem de ser feito com a Origin do
   site (sem ela a rota responde 403, de propósito):
   ```bash
   curl -i -X POST https://osiqueira.jpproject.com.br/api/erro \
     -H "Origin: https://osiqueira.jpproject.com.br" -H "Content-Type: application/json" \
     -d '{"tipo":"teste","mensagem":"TESTE de alerta — pode ignorar","rota":"/painel"}'
   ```
   Esperado: `204`. Com `Origin: https://exemplo.com`: `403`.
3. **Ver o log sem esperar o e-mail:** Logs Explorer →
   `jsonPayload.origem="front"`.
4. **Site fora do ar:** não derrube o site para testar. Veja Monitoring →
   Uptime checks: a verificação deve estar verde (✔) nas regiões. Para ver a
   política disparar, edite temporariamente a verificação para o caminho
   `/api/nao-existe` (404) e volte depois.
5. **Alerta da plataforma / functions:** não há como provocar sem tocar em dado
   real. Confira que a política existe (Monitoring → Alerting) e o filtro no
   Logs Explorer: `jsonPayload.alertaDaPlataforma=true`.

## Como silenciar

- **Por um tempo (manutenção, deploy grande):** Monitoring → Alerting → Snooze →
  Create snooze, escolhendo as políticas "Topete · …" e a duração.
- **Uma política só:** abrir a política e desligá-la (toggle), ou
  `gcloud alpha monitoring policies update <nome> --no-enabled`.
  Atenção: o próximo `aplicar.sh` religa (o arquivo diz `enabled: true`).
- **Menos e-mails:** aumentar `notificationRateLimit.period` no JSON (máximo 1 h).
- **Um erro conhecido que enche a caixa:** acrescentar
  `AND NOT jsonPayload.message:"trecho"` (ou o equivalente no `textPayload`) ao
  filtro da política em `scripts/monitoramento/politica-*.json` e rodar o script.

## Telegram da plataforma

`functions/.env.axon-barber` (lido por cima de `functions/.env` no deploy de
`axon-barber`) mantém `PLATAFORMA_TELEGRAM_CHAT_ID=desligado`. O e-mail é o canal
principal. Quando o dono passar o id do chat, troque o valor ali e publique as
functions.

## Fumaça logada (opcional)

`scripts/fumaca/fumaca.mjs` tem um passo que entra pelo `/login` e confere que
`/painel` abre a tela **Hoje** sem nenhum "Não foi possível carregar…" — pega
regra de segurança ou índice quebrado, que o agendar anônimo não vê. Só roda se
existirem os segredos `FUMACA_EMAIL` e `FUMACA_SENHA`; sem eles, imprime um
aviso e pula (não falha).

Para criar a conta de teste:

1. Crie uma barbearia **só para a fumaça** (ex.: slug `fumaca`), isolada das
   reais, com o fluxo normal de cadastro. Não use conta de barbearia de
   cliente: a fumaça roda em produção.
2. Dê à conta o menor papel que abre `/painel`, e nenhum dado verdadeiro na
   barbearia. O passo **só lê**: não clica em nada que grave.
3. Entre uma vez na mão e troque a senha inicial (o passo não passa por
   `/trocar-senha`).
4. No GitHub → Settings → Environments, crie `FUMACA_EMAIL` e `FUMACA_SENHA`
   primeiro no ambiente `dev`. **Produção: deixe sem os segredos por ora.** A
   fumaça de produção abre o domínio da barbearia do piloto (`SITE_FUMACA`), e a
   conta de teste mora em outra barbearia: ela não entraria no `/painel` dali.
   Só ligue em produção depois de decidir um endereço para a barbearia de teste
   (e de apontar o `SITE_FUMACA` para ele). Sem os segredos, o passo pula com
   aviso.

## Custo

Tudo isto roda dentro do Google Cloud do projeto; não há assinatura de terceiro.
O que pode gerar cobrança, **a conferir** na página de preços do Google Cloud
Observability (<https://cloud.google.com/stackdriver/pricing>) antes de contar
como zero:

- **Logs:** a ingestão tem cota mensal gratuita por projeto; o volume aqui é
  pequeno (só ERROR a mais, no máximo 5 por aba vindos do navegador).
- **Alertas baseados em log:** sem cobrança própria além do log; conferir se a
  política de preços vigente cobra por condição de alerta.
- **Uptime check:** a cota gratuita de execuções por mês é de ordem muito
  superior ao uso (1 verificação de 5 em 5 min × as regiões ≈ dezenas de milhares
  de execuções/mês); conferir o valor atual.
- **E-mail:** o canal por e-mail não é cobrado.
