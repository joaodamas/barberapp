# Deploy de produção

Publicação manual pela esteira do GitHub. A máquina local não participa.

> **Regra de engenharia:** o alvo do deploy nunca depende do projeto
> selecionado no ambiente de quem publica. Ver a trava em §4.

---

## 1. O que um deploy realmente altera

Inventário conferido contra `axon-barber` em 11/08/2026, não deduzido da
documentação do Firebase.

### `--only hosting`

O Hosting deste projeto é **framework-aware** (`firebase.json` → `"source":
"web"`), e o app tem `output: "standalone"` com rotas dinâmicas: a barbearia é
resolvida pelo subdomínio, então nada é pré-renderizado. Isso significa que
**publicar o site publica também uma Cloud Function**.

| Recurso | Detalhe verificado |
|---|---|
| Firebase Hosting | site `axon-barber`, canal `live` |
| Cloud Function v2 `ssraxonbarber` | `us-central1`, nodejs24 — a renderização no servidor |
| Cloud Run | serviço `ssraxonbarber` por trás da function |
| Cloud Build | constrói o contêiner |
| Artifact Registry | repositório `gcf-artifacts` em `us-central1` |
| Cloud Storage | `gcf-v2-sources-523105044821-us-central1` e o bucket de upload |
| IAM | `allUsers` como invoker do serviço Run (o site é público) |

### `--only functions:<nomes>`

17 functions em `southamerica-east1`, mais os mesmos serviços de build:
Cloud Build, Artifact Registry (`gcf-artifacts` de São Paulo), Cloud Storage
(`gcf-v2-sources-523105044821-southamerica-east1`), Cloud Run.

Dois pontos que só aparecem olhando o código:

- **Eventarc** — `creditLoyaltyOnCompletion`, `materializeFinancialsOnCompletion`
  e `notifyBookingCreated` são gatilhos de Firestore. Cada uma cria um trigger
  do Eventarc.
- **Secret Manager** — `notifyBookingCreated` e `whatsappWebhook` declaram
  `defineSecret`. O deploy lê os metadados de `WHATSAPP_TOKEN`,
  `WHATSAPP_VERIFY_TOKEN` e `WHATSAPP_APP_SECRET` e confere que a conta de
  runtime consegue acessá-los. **Não lê o valor.**

### `--only firestore:rules,storage`

Cria um ruleset novo e move dois releases: `cloud.firestore` e
`axon-barber.firebasestorage.app`.

### `--only firestore:indexes`

5 índices compostos hoje: `bookings` (×2), `expenses`, `loyalty_transactions`,
`subscriptions`.

---

## 2. Permissão por etapa

| Etapa | O que a API exige | Papel |
|---|---|---|
| Resolver o projeto | `firebase.projects.get` | `roles/firebase.viewer` |
| Atribuição de quota | `serviceusage.services.use` | `roles/serviceusage.serviceUsageConsumer` |
| Regras (Firestore + Storage) | `firebaserules.*` | `roles/firebaserules.admin` |
| Índices | `datastore.indexes.*` | `roles/datastore.indexAdmin` |
| Site e release | `firebasehosting.*` | `roles/firebasehosting.admin` |
| Subir o código-fonte | `storage.objects.create` | `roles/storage.objectAdmin` **nos buckets `gcf-v2-*`** |
| Construir o contêiner | `cloudbuild.builds.create` | `roles/cloudbuild.builds.editor` |
| Guardar a imagem | `artifactregistry.repositories.uploadArtifacts` | `roles/artifactregistry.writer` |
| Criar/atualizar function | `cloudfunctions.functions.*` | `roles/cloudfunctions.admin` |
| Serviço gen2 por trás | `run.services.*`, `run.services.setIamPolicy` | `roles/run.admin` |
| Rodar **como** a conta de runtime | `iam.serviceAccounts.actAs` | `roles/iam.serviceAccountUser` **só na conta de runtime** |
| Gatilhos de Firestore | `eventarc.triggers.*` | `roles/eventarc.developer` |
| Segredos do WhatsApp | `secretmanager.secrets.get`, `versions.list` | `roles/secretmanager.viewer` |

---

## 3. Onde o menor privilégio muda de verdade

Cinco decisões que separam "funciona" de "funciona sem abrir a porta".

**1. `actAs` no recurso, não no projeto.**
`roles/iam.serviceAccountUser` no projeto deixa a esteira agir como *qualquer*
conta de serviço — inclusive `firebase-adminsdk-fbsvc@`, que tem
`iam.serviceAccountTokenCreator`. Quem tem isso emite custom token para
qualquer uid, e entra como dono de qualquer barbearia. Amarrado só a
`523105044821-compute@`, a esteira publica e não impersona ninguém.

**2. Escrita só nos buckets de código.**
`roles/storage.objectAdmin` no projeto inclui
`axon-barber.firebasestorage.app` — os arquivos que os clientes enviaram. A
esteira não tem nada que fazer lá. Amarrado aos quatro buckets `gcf-v2-*`.

**3. `artifactregistry.writer`, não `admin`.**
Os repositórios `gcf-artifacts` já existem nas duas regiões. `writer` empurra
imagem; não apaga o repositório.

**4. Nunca reaproveitar `firebase-adminsdk-fbsvc@`.**
Ela já existe e já tem `cloudfunctions.admin` + `storage.admin` — daria para
usar amanhã. É exatamente a decisão errada: é a identidade de *runtime*
administrativo, e uma chave dela vazada num SaaS multi-tenant é acesso a todos
os inquilinos. Conta de deploy é conta de deploy.

**5. Nada de `serviceUsageAdmin`.**
Todas as APIs necessárias já estão habilitadas — conferido. A esteira nunca
precisa ligar uma API, e portanto não recebe permissão para ligar.

E o óbvio: nada de `roles/editor` nem `roles/owner`.

### Duas coisas que encontrei e não vou mexer

Não são do escopo do deploy, mas ficam registradas porque são reais.

- **`523105044821-compute@` tem `roles/editor` no projeto**, e é a conta de
  runtime das 19 functions. Uma falha de execução em qualquer função é Editor
  no projeto inteiro. É o padrão do Firebase, e corrigir exige conta de runtime
  dedicada e redeploy geral — mudança de infraestrutura, não de esteira.
- **`joaodamasit@gmail.com` é o único `owner`.** Não há segunda conta de
  emergência. Perder essa conta é perder o projeto.

### O passo de endurecimento seguinte

Chave JSON é credencial de vida longa: vazou, vale para sempre. **Workload
Identity Federation** troca isso por um token de minutos emitido para o
repositório. Só depois do primeiro deploy funcionar — uma variável de cada vez.

---

## 4. As quatro travas de alvo

1. `.firebaserc` fixa `axon-barber` como padrão.
2. Todo comando do workflow carrega `--project "$PROJETO"` explícito.
3. A conta de serviço pertence a `axon-barber` — credencial de outro projeto
   não alcança este.
4. **Antes da primeira escrita**, o workflow compara três origens
   independentes: o valor fixo do workflow, o `.firebaserc` do commit e o
   `project_id` de quem assina a credencial. Qualquer divergência derruba o
   job. Uma alteração futura no workflow que aponte para outro lugar morre
   aqui, não em produção.

E uma quinta, do lado do app: o build confere que
`NEXT_PUBLIC_FIREBASE_PROJECT_ID` é o mesmo projeto, senão o site sairia
apontando para outro backend.

---

## 5. Criar a conta de serviço

```bash
PROJETO=axon-barber
NUM=523105044821
SA=deploy-ci@$PROJETO.iam.gserviceaccount.com

gcloud iam service-accounts create deploy-ci \
  --display-name="Deploy pela esteira do GitHub" \
  --project=$PROJETO

# Papéis no projeto
for PAPEL in \
  roles/firebase.viewer \
  roles/serviceusage.serviceUsageConsumer \
  roles/firebaserules.admin \
  roles/datastore.indexAdmin \
  roles/firebasehosting.admin \
  roles/cloudfunctions.admin \
  roles/run.admin \
  roles/cloudbuild.builds.editor \
  roles/artifactregistry.writer \
  roles/eventarc.developer \
  roles/secretmanager.viewer
do
  gcloud projects add-iam-policy-binding $PROJETO \
    --member="serviceAccount:$SA" --role="$PAPEL" --condition=None
done

# actAs SÓ na conta de runtime — não no projeto
gcloud iam service-accounts add-iam-policy-binding \
  $NUM-compute@developer.gserviceaccount.com \
  --member="serviceAccount:$SA" \
  --role="roles/iam.serviceAccountUser" \
  --project=$PROJETO

# Escrita SÓ nos buckets de código — não no projeto
for B in \
  gcf-v2-sources-$NUM-southamerica-east1 \
  gcf-v2-sources-$NUM-us-central1 \
  gcf-v2-uploads-$NUM.southamerica-east1.cloudfunctions.appspot.com \
  gcf-v2-uploads-$NUM.us-central1.cloudfunctions.appspot.com
do
  gcloud storage buckets add-iam-policy-binding gs://$B \
    --member="serviceAccount:$SA" --role="roles/storage.objectAdmin"
done

# A chave
gcloud iam service-accounts keys create chave-deploy.json \
  --iam-account=$SA --project=$PROJETO
```

Depois de colar o conteúdo no GitHub, **apague `chave-deploy.json`**. Ela não
entra no repositório, não fica no Downloads, não vai para o Drive.

---

## 6. Configurar o GitHub

**Settings → Environments → New environment → `producao`**

| | |
|---|---|
| Required reviewers | sua conta — é o "manual approval" |
| Deployment branches | `main` apenas |

### Segredo (1)

| Nome | Valor |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | conteúdo **inteiro** de `chave-deploy.json` |

### Variáveis (7)

Configuração **pública** — vai inteira no bundle que qualquer visitante baixa.
Fica em *Variables*, não em *Secrets*, de propósito: chamar de segredo o que é
público ensina a equipe a tratar segredo de verdade com a mesma displicência.

| Nome | Valor |
|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | `AIzaSyD_PZYB2eU0bzfY0tK1uxivVCV72ANTcFU` |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `axon-barber.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `axon-barber` |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | `axon-barber.firebasestorage.app` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `523105044821` |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | `1:523105044821:web:51321ff7e3158c860347dc` |
| `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` | `G-46D0RSQBG9` |

---

## 7. Publicar

**Actions → Deploy (produção) → Run workflow**

Escopos: `tudo`, `somente hosting`, `somente regras e índices`,
`somente functions`. O primeiro deploy deve ser **`somente hosting`** — é o que
está travado, e reduz a superfície da primeira tentativa.

Ordem quando o escopo é `tudo`: índices → regras → functions → hosting. Índice
leva minutos para ficar pronto e regra precisa existir antes da tela que
depende dela; o Hosting é a chave que liga tudo para o cliente, e vai por
último.

### Sobre as functions

São publicadas **por nome**, e a lista sai dos exports compilados de
`functions/lib/index.js` — não de `--only functions` seco.

O motivo: `revisarAssinaturas` roda em produção **sem código-fonte no
repositório**. Um deploy por escopo aberto entende que ela foi apagada e tenta
removê-la. Com a lista por nome, function nova entra sozinha e nenhuma órfã é
tocada — o workflow apenas avisa que ela existe.

---

## 8. Checkpoint depois do primeiro deploy

"Deploy successful" não é evidência de nada. O que prova é o fluxo pelo domínio
publicado — o mesmo que hoje só funciona em `localhost`:

1. `/painel` abre
2. `/painel/configuracoes` abre e salva taxa
3. `/painel/equipe` abre
4. `/painel/financeiro/dre` abre
5. `/agendar` cria uma reserva
6. Concluir pelo modal novo, informando a forma de pagamento
7. `payments` materializado com a taxa congelada
8. Action Center some com o fechamento pendente
