# Entrada de clientes e cobrança da plataforma

Como uma barbearia entra, testa, paga, deixa de pagar e sai — e o que muda
quando ela não está no Brasil.

---

## 1. O achado que define a ordem do trabalho

**Hoje nada no produto obedece ao plano nem ao trial.**

`features`, `trial`, `isTrialExpired`, `trialDaysLeft` e `shouldWarnAboutTrial`
existem no código e **nenhum é consultado por tela alguma**. A verificação foi
feita procurando as referências: elas só aparecem na própria definição.

Consequências práticas:

- Barbearia no plano **Agenda (R$ 97)** enxerga DRE, projeção e fechamento —
  que são o que justifica o plano **Gestão (R$ 297)**.
- Teste de 7 dias **vencido continua funcionando**, para sempre.

Integrar o Mercado Pago antes disso permite cobrar, mas **não pagar não muda
nada** — a cobrança fica voluntária. Por isso a ordem correta é: primeiro o que
o não-pagamento faz, depois o que o pagamento recebe.

---

## 2. Onde o Mercado Pago não chega

O Mercado Pago opera em **Brasil, Argentina, México, Chile, Colômbia, Peru e
Uruguai**. Não opera na Europa.

Ou seja: ele não cobra o barbeiro brasileiro que trabalha na Irlanda — que é
justamente o primeiro caso internacional identificado. Não é limitação de
configuração; é ausência de operação.

Então a integração precisa nascer com **o provedor atrás de uma interface**,
escolhido pelo país da barbearia. O custo de fazer isso agora é uma camada fina;
o custo de fazer depois é reescrever a cobrança com clientes pagantes em
produção.

| Região | Provedor | Meios | Moeda |
|---|---|---|---|
| Brasil e América Latina | **Mercado Pago** | Pix, cartão, boleto | BRL e locais |
| Europa, Reino Unido, resto | **Stripe** (quando houver demanda) | Cartão, SEPA | EUR, GBP |

O que a interface precisa expor, e só isso:

```
criarAssinatura(barbearia, plano)   → URL de checkout
cancelarAssinatura(barbearia)       → confirmação
lerEvento(payload, assinatura)      → { assinaturaId, estado, pagoAte }
```

Tudo que for específico de provedor — nome de campo, formato de webhook,
sequência de estados — fica dentro da implementação. O resto do sistema conhece
apenas os estados do §4.

---

## 3. O funil, ponta a ponta

```
    landing (nocorte.com.br)
        ↓  "Testar 7 dias"
    cria conta
        ↓
    escolhe o endereço  →  osiqueira.nocorte.com.br
        ↓
    onboarding guiado (4 passos)
        1 barbearia · 2 serviços · 3 horários · 4 compartilhar o link
        ↓
    TRIAL — 7 dias, tudo liberado, sem cartão
        ↓
   ┌────┴─────────────────────────────┐
   │                                  │
escolhe plano                    não escolhe
   ↓                                  ↓
checkout (MP ou Stripe)          modo LEITURA
   ↓                                  ↓
ATIVA  ←── pagamento aprovado ──  volta a qualquer momento
   ↓
falha na cobrança
   ↓
INADIMPLENTE (régua de avisos)
   ↓  sem regularizar
SUSPENSA → modo leitura
   ↓  90 dias
exclusão dos dados (LGPD)
```

**Sem cartão no trial**, de propósito. Pedir cartão antes de o barbeiro ver o
próprio número transforma o teste em compromisso — e a proposta da página é
justamente "veja o seu número em sete dias".

### O que acontece no fim do trial

O trial **não apaga nada e não bloqueia o cliente final.** A barbearia entra em
modo leitura: o dono vê o que já existe, os clientes continuam agendando pelo
link, e nada some.

Isso é decisão de produto, não indulgência. Barbearia que perde a agenda no meio
de um sábado não volta para negociar — cria caso. E a agenda funcionando é a
memória de que o produto era útil.

| | No trial | Modo leitura | Ativa |
|---|---|---|---|
| Cliente agenda pelo link | ✅ | ✅ | ✅ |
| Dono vê a agenda | ✅ | ✅ | ✅ |
| Lançar despesa, editar catálogo | ✅ | ❌ | ✅ |
| DRE, projeção, fechamento | ✅ | ❌ | conforme o plano |
| WhatsApp automático | ✅ | ❌ | conforme o plano |

---

## 4. Estados da barbearia

Um campo só, em `barbershops/{id}.status`, e o resto é derivado:

| Estado | Significa | Quem escreve |
|---|---|---|
| `trial` | Dentro dos 7 dias | Cadastro |
| `ativa` | Assinatura em dia | Webhook do provedor |
| `inadimplente` | Cobrança falhou, dentro da régua | Webhook |
| `suspensa` | Régua esgotada, ou trial vencido sem plano | Rotina diária |
| `cancelada` | Pedido pelo dono; vale até o fim do ciclo pago | Cloud Function |

**Só o servidor escreve `status`.** As regras já impedem o dono de alterá-lo — é
a mesma razão pela qual ele não grava `plan` nem `slug`.

O contrato vive em `barbershops/{id}/private/billing`, que as regras já fecham
para leitura apenas do dono e escrita apenas da plataforma:

```
private/billing
  provider          "mercadopago" | "stripe"
  externalId        id da assinatura no provedor
  plan              "agenda" | "crescimento" | "gestao"
  currency          "BRL" | "EUR"
  paidUntil         data
  lastEventAt       data
  dunningStage      0..3
```

`paidUntil` e não "está pago": data responde "até quando", que é o que a régua e
o modo leitura precisam saber. Booleano exigiria consultar o provedor para
descobrir o que já se sabe.

---

## 5. Régua de inadimplência

Cartão recusado quase nunca é falta de dinheiro — é limite ou validade. A régua
assume isso.

| Momento | O que acontece |
|---|---|
| D+0 | Nova tentativa automática do provedor |
| D+1 | Aviso: `cobranca_falhou` (template já escrito) |
| D+3 | Segunda tentativa e segundo aviso |
| D+5 | Aviso final |
| D+7 | Suspensa → modo leitura |
| D+97 | Exclusão dos dados, avisada com antecedência |

Os três templates da plataforma para o dono já existem em `templates.ts`:
`trial_terminando`, `trial_encerrado` e `cobranca_falhou`. Eles saem da **WABA da
plataforma**, nunca do número da barbearia — é você falando com ela, não ela
falando com o cliente dela.

---

## 6. O que o país determina

O cadastro passa a perguntar **onde a barbearia fica**. Uma resposta define seis
coisas, e nenhuma delas deve ser perguntada de novo:

| Campo | Brasil | Irlanda |
|---|---|---|
| `locale.timeZone` | `America/Sao_Paulo` | `Europe/Dublin` |
| `locale.currency` | `BRL` | `EUR` |
| `locale.locale` | `pt-BR` | `en-IE` ou `pt-BR` |
| Provedor de cobrança | Mercado Pago | Stripe |
| Preço | R$ 97 / 197 / 297 | a definir — conversão direta não serve |
| Imposto no DRE | Simples Nacional | VAT |

**Fuso e moeda já estão prontos** e por barbearia. Idioma das telas não — são 18
telas com texto cravado, e para o barbeiro brasileiro no exterior isso não é
bloqueio.

> **Preço internacional não é conversão.** R$ 197 dá cerca de € 32, que é preço
> de app amador na Irlanda e comunica exatamente isso. Precificação por mercado é
> decisão comercial, não câmbio.

---

## 7. Ordem de construção

**1. Gating — antes de qualquer cobrança.**
`features` e `trial` passam a valer: modo leitura ao vencer, telas do plano
superior bloqueadas com convite para subir. É o que faz pagar significar algo.

**2. Rotina diária de estado.**
Uma função agendada que move `trial` vencido para `suspensa` e avança a régua.
Sem ela, o estado só muda quando o provedor manda evento — e trial não gera
evento nenhum.

**3. A interface de provedor + Mercado Pago.**
Checkout de assinatura (Preapproval), webhook assinado, e os estados do §4.

**4. Stripe**, quando existir a primeira barbearia fora da América Latina.

---

## 8. O que eu preciso de você

| | |
|---|---|
| **Conta Mercado Pago da NoCorte** | Access token de produção e chave pública. Não me mande por conversa — mesmo caminho do token da Meta |
| **CNPJ da NoCorte** | O Mercado Pago exige conta empresarial para assinatura recorrente, e a política de privacidade precisa nomear o controlador |
| **Decisão de preço internacional** | Ou adiamos, e a primeira barbearia fora do Brasil entra com preço combinado na mão |

Sem os dois primeiros, construo tudo até a borda: modelo, gating, régua e a
interface com o Mercado Pago implementado — faltando apenas as credenciais para
ligar.
