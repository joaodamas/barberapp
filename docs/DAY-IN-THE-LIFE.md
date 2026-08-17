# Day in the Life — roteiro de validação operacional

Evidência 3 de 3. A matemática (`LEDGER-DE-VALIDACAO.md`) e a apresentação
(`MATRIZ-FATO-VISAO.md`) estão fechadas; falta saber se **uma pessoa consegue
operar isto**.

Este documento tem três partes, e elas são separadas de propósito:

| Parte | Para quem |
|---|---|
| **A · Preparação** | quem monta o ambiente — pode ser quem construiu |
| **B · Roteiro** | **quem executa — não pode ter participado da construção** |
| **C · Registro** | a folha que o executor preenche |

> **A regra que torna o teste válido:** quem construiu o produto não consegue
> desconhecê-lo. Se o executor for do time de desenvolvimento, o resultado mede
> a memória dele, não a clareza do produto.

---

# Parte A · Preparação do ambiente

*Para quem monta. O executor não lê esta parte.*

## A.1 Por que emulador, e nunca produção

O roteiro cria reservas, cancela, marca falta e lança despesa. Rodar contra
`axon-barber` sujaria a base do piloto com dados de teste — e alguns são
irreversíveis pela interface.

O script de seed **recusa rodar** sem as variáveis de emulador.

## A.2 Subir

```bash
# 1 · emuladores (deixe rodando numa janela)
cd barber
npx firebase emulators:start --only auth,firestore --project day-in-the-life

# 2 · ambiente isolado do web (apaga ao fim do teste)
cat > web/.env.development.local << 'EOF'
NEXT_PUBLIC_FIREBASE_API_KEY=fake-api-key-emulador
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=localhost
NEXT_PUBLIC_FIREBASE_PROJECT_ID=day-in-the-life
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=day-in-the-life.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=000000000000
NEXT_PUBLIC_FIREBASE_APP_ID=1:000000000000:web:emulador
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=G-EMULADOR
NEXT_PUBLIC_USE_EMULATOR=true
NEXT_PUBLIC_ROOT_DOMAIN=lvh.me
NEXT_PUBLIC_PLATFORM_WHATSAPP=5511999990000
NEXT_PUBLIC_DEMO_MODE=false
EOF

# 3 · semear (roda de dentro de functions/, que tem o firebase-admin)
cp scripts/semear-day-in-the-life.mjs functions/
cd functions
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
  node semear-day-in-the-life.mjs
rm semear-day-in-the-life.mjs

# 4 · app
cd ../web && npm run dev
```

`lvh.me` resolve para `127.0.0.1` e permite o subdomínio da barbearia em
localhost — sem ele, o app cai no tenant padrão da plataforma e não há barbearia
nenhuma para operar.

## A.3 O que o seed cria

| | |
|---|---|
| Barbearia | O Siqueira Barbearia, plano Gestão, ativa |
| Jornada | seg–sáb, 09:00–19:00, almoço 12:00–13:00, slots de 30 min |
| Equipe | **Rafael** (comissão padrão da casa) · **Léo** (50%) |
| Serviços | Corte 50 · Barba 35 · Corte + barba 90 (60 min) · Sobrancelha 15 |
| Produtos | Pomada (custo 18, venda 45) · Shampoo (custo 22, venda 55) |
| Planos | Ilimitado R$ 149 · 2 cortes R$ 99 |
| Taxas | débito 1,99% · crédito 3,49% · pix e dinheiro 0% |
| **Reservas** | **nenhuma** — criá-las é o que o teste observa |

## A.4 Acesso do executor

```
endereço : http://osiqueira.lvh.me:3000
dono     : dono@osiqueira.teste  /  dono12345
cliente  : cliente@teste.com     /  cliente12345
```

## A.5 O que quem prepara NÃO pode fazer

- ❌ mostrar onde clicar;
- ❌ explicar a arquitetura, o modelo de dados ou os nomes internos;
- ❌ dizer "isso não existe, pula" — deixe a pessoa procurar e desistir sozinha;
- ❌ sugerir contornar por outro caminho.

Responder **"não sei, faça como você faria"** é sempre a resposta certa.

## A.6 Ao terminar

```bash
rm web/.env.development.local     # o .env.local do dono fica intacto
# encerre os emuladores e o dev server
```

---

# Parte B · Roteiro

*Para quem executa. **Não leia a Parte A.***

## Como funciona

Você é **dono de uma barbearia**. Contratou um sistema para gerir a operação e
hoje é seu primeiro dia usando.

Você vai receber nove situações do dia. Para cada uma, **faça o que você faria
na sua barbearia**. Use o sistema como achar que deve.

Três regras:

1. **Não peça ajuda.** Se travar, anote que travou. Travar é um resultado
   válido — e provavelmente o mais útil.
2. **Não procure atalho por fora.** Se a resposta for "dá para fazer mexendo no
   banco de dados", não vale: estamos testando o produto que o cliente compra.
3. **Anote o que você esperava** que acontecesse, mesmo quando funcionar.

Não existe resposta errada. **Quem está sendo avaliado é o sistema.**

## Endereço e acesso

```
http://osiqueira.lvh.me:3000
dono@osiqueira.teste  /  dono12345
```

---

### 01 · 08:00 — Abrir o dia

> Você chegou na barbearia e abriu o sistema.
>
> **Olhe a tela e diga, com suas palavras, o que você entende que precisa fazer
> hoje.**

Antes de clicar em qualquer coisa, anote o que a tela está te dizendo.

---

### 02 · 09:00 — Um cliente ligou

> O telefone toca. É o Marcos, cliente antigo.
>
> *"Consegue me marcar amanhã às 15h? Corte e barba."*
>
> **Faça a reserva.**

---

### 03 · 10:00 — O cliente chegou

> O Carlos chegou para o horário dele. Foi atendido pelo Rafael.
>
> **Registre que o atendimento aconteceu.**

---

### 04 · 10:30 — O cliente pagou

> O Carlos pagou R$ 50 no Pix.
>
> **Registre o pagamento.**

*(Se você já fez isso na etapa anterior, anote que foi junto.)*

---

### 05 · 11:00 — Venda no balcão

> O Carlos gostou da pomada e levou uma. R$ 45, pagou em dinheiro.
>
> **Registre a venda.**

---

### 06 · 12:00 — Cancelamento

> O Marcos manda mensagem: não vai poder vir amanhã.
>
> **Cancele a reserva dele.**

---

### 07 · 13:00 — Ninguém apareceu

> O Diego tinha horário marcado hoje mais cedo e não apareceu, nem avisou.
>
> **Registre isso.**

Depois de registrar, **olhe a tela e diga se algum número mudou** — e se mudou
do jeito que você esperava.

---

### 08 · 15:00 — Conta paga

> Você pagou a conta de luz da barbearia: R$ 350.
>
> **Registre a despesa.**

---

### 09 · 18:00 — Fechar o dia

> A barbearia fechou. Sem perguntar para ninguém, **responda usando só o
> sistema**:

| | Resposta | Onde você achou |
|---|---|---|
| Quanto a barbearia faturou hoje? | | |
| Quanto você recebeu de fato? | | |
| Quanto gastou? | | |
| Quanto sobrou no caixa? | | |
| Quanto você deve aos barbeiros? | | |
| O que ainda vai receber? | | |
| Ficou alguma coisa pendente? | | |
| O que aconteceu com quem faltou? | | |
| O que aconteceu com o cancelamento? | | |

Se não conseguir responder alguma, **escreva "não achei"**. É a informação mais
valiosa desta folha.

---

# Parte C · Folha de registro

Preencha **uma por etapa**, logo depois de executá-la — não no fim.

## Resultado

| | Quando usar |
|---|---|
| 🟢 **PASS** | consegui fazer, e entendi o que aconteceu |
| 🟡 **FRICÇÃO** | consegui, mas tive que procurar, adivinhar ou tentar mais de uma vez |
| 🟠 **BLOCKED** | **procurei e não achei caminho** no sistema |
| 🔴 **WRONG** | consegui fazer, mas o resultado ficou errado ou me induziu ao erro |
| ⚫ **FALSE PROMISE** | a tela dizia que algo aconteceria, e não aconteceu |

## As três perguntas

Para cada etapa, responda **sim ou não**:

1. **Eu sabia o que fazer?**
2. **Eu sabia o que tinha acontecido depois de fazer?**
3. **Eu confiaria nesse resultado para tocar meu negócio?**

A terceira é a mais importante. "Funcionou, mas eu conferiria por fora" é um
**não**.

## Modelo

```
ETAPA 0_ · ___________________________________

Resultado:  🟢  🟡  🟠  🔴  ⚫

1. Sabia o que fazer?              ( ) sim  ( ) não
2. Sabia o que tinha acontecido?   ( ) sim  ( ) não
3. Confiaria para operar?          ( ) sim  ( ) não

Onde eu fui procurar primeiro:
_______________________________________________

O que eu esperava que acontecesse:
_______________________________________________

O que de fato aconteceu:
_______________________________________________

Quanto tempo levou:  ____ min      Tentativas: ____
```

## Duas coisas que valem mais que o resto

**Onde você foi procurar primeiro.** Se procurou no lugar errado, o problema é
do sistema — não seu. Anote mesmo assim.

**A frase exata que você pensou ao travar.** *"Como assim não dá?"* e *"Ah, nem
esperava que tivesse isso"* significam coisas muito diferentes sobre a mesma
funcionalidade ausente. A primeira é grave; a segunda, nem tanto.

---

## Nota de método, para quem consolidar depois

O executor **não deve saber** o que já foi encontrado em rodadas anteriores. Há
lacunas conhecidas no roteiro, e elas estão ali de propósito — não para serem
redescobertas, mas para medir a **reação** de quem esbarra nelas.

Nenhum resultado desta folha vira correção antes de ser classificado. A ordem é
sempre a mesma: **executar → classificar → decidir**.
