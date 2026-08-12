# Prontidão para o primeiro uso real

Lista única do que falta para entregar o produto a uma barbearia de verdade.

Existe por causa de um problema concreto: o changelog passou a listar como
pendente coisa que já estava feita, e como feita coisa que nunca foi provada.
Um inventário que erra nas duas direções é pior que nenhum — ele faz decidir
com base em ficção.

**Última revisão: 12/08/2026.**

---

## 1. O padrão de evidência

| Estado | Significado |
|---|---|
| ✅ **Validado** | comprovado **em produção**, com a evidência nomeada aqui |
| 🟡 **Em validação** | o código existe e passa nos testes; ninguém provou no domínio publicado |
| 🔴 **Bloqueador** | impede entregar a uma barbearia real |
| ⚪ **Pós-piloto** | pode esperar, e a espera é decisão consciente |

Duas regras que dão sentido ao resto:

1. **Teste verde não promove para ✅.** Suíte verde diz que o código faz o que o
   autor imaginou; produção diz que o produto faz o que o dono precisa. Todo
   defeito grave desta semana passou por uma suíte verde.
2. **Toda linha ✅ nomeia a evidência.** Sem isso, em duas semanas ninguém
   distingue o que foi verificado do que alguém achou que estava certo.

E uma distinção que este documento mantém de propósito: **"não existe" é
diferente de "está quebrado".** Funcionalidade ausente é escopo; funcionalidade
que mente é defeito.

---

## 2. 🔴 Bloqueadores

Ordenados por quanto machucam se descobertos depois que houver cliente real.

### 2.1 LGPD, política de privacidade e termos

**Não existe nenhuma rota, e nenhuma menção no código.** É a única pendência
com exposição legal: a plataforma guarda nome, telefone e histórico de
atendimento de **clientes de terceiros** — pessoas que nunca contrataram nada e
não têm a quem reclamar.

Também trava a publicação do app na Meta, que exige a política.

### 2.2 SEC-001 — a conta de runtime é Editor do projeto

Confirmado em 12/08 pela política de IAM em produção:

```
523105044821-compute@developer.gserviceaccount.com → roles/editor
```

As 19 Cloud Functions executam com essa identidade. Uma falha de execução em
**qualquer** função alcança o projeto inteiro. É também o teto de privilégio da
esteira de deploy, que precisa agir como ela.

Hoje o risco é teórico porque não há usuário hostil. Depois do piloto ele deixa
de ser teórico, e a correção exige conta dedicada e redeploy das 19 functions —
mais caro com barbearia em operação.

### 2.3 App Check ausente

**Zero referências no código.** As regras do Firestore protegem o *dado*, não o
*consumo*: qualquer pessoa chama as Cloud Functions de fora do app. Sem isso, a
conta do Firebase é do tamanho da paciência de quem quiser abusar dela.

### 2.4 SEC-002 — tudo pendurado numa conta pessoal

Levantado na política de IAM em 12/08:

| | |
|---|---|
| Owner do projeto | `joaodamasit@gmail.com` — **sozinho** |
| Organização | **nenhuma** — `parent` vazio, projeto avulso |
| Conta de faturamento | `01C2A9-A133E8-156B61` |
| Admin do faturamento | `joaodamasit@gmail.com` — **sozinho** |

Projeto e faturamento são pregos separados, e estão ambos na mesma conta
pessoal. Perder aquele Gmail derruba os dois de uma vez.

**A ausência de organização é o que torna isso irrecuperável.** Num projeto
avulso não existe admin acima dele: não há a quem recorrer, nem processo de
recuperação institucional. É o único item desta lista sem caminho de volta — e
por isso vai à frente do SEC-002 ser mais barato que o SEC-001 ser mais grave.

**Decidido em 12/08:** resolver agora pelo nível 1, e registrar o nível 2.

1. **Segunda conta owner** — conta Google separada, com 2FA e recuperação
   própria que não dependa da principal (duas chaves na mesma gaveta não são
   duas chaves). Recebe `roles/owner` no projeto **e** `roles/billing.admin` na
   conta de faturamento. Minutos de trabalho.
2. **Cloud Identity em `jpproject.com.br` e projeto sob organização** — o que
   de fato cria caminho de recuperação e destrava políticas de organização.
   Mexe em DNS e no vínculo do projeto; não se faz no meio da preparação do
   piloto. Fica como dívida estrutural, abaixo.

> ⏳ **Aguardando:** o e-mail da segunda conta. Criar conta e mexer em senha é
> do dono, não da ferramenta. Com o endereço em mãos são dois comandos, e a
> confirmação é reler a política.

### 2.4.1 Sem organização — dívida estrutural (🟡, não bloqueador do piloto)

Reduzir o risco com uma segunda conta **não** cria recuperação institucional.
Continua valendo que o projeto de um produto vendido a terceiros vive fora de
qualquer organização. Não bloqueia o primeiro piloto; bloqueia crescer.

### 2.5 O dono não consegue cancelar um atendimento

**Descoberto ao montar este inventário.** `cancelBooking` e `rescheduleBooking`
existem e funcionam, mas são chamados **só pelo app do cliente**
(`/reservas`). No painel, a única escrita de cancelamento é a recusa de encaixe.

Na operação real o cliente liga, manda mensagem ou simplesmente avisa no balcão
— e o dono não tem caminho. O horário fica preso como confirmado, entra na
previsão do dia e vira alerta de atraso.

### 2.6 O build depende da Google estar de pé

`layout.tsx` importa **Fraunces e Manrope** de `next/font/google`, e isso
**baixa as fontes em tempo de build**. Em 11/08 o `fonts.gstatic.com` devolveu
404 e derrubou um deploy real; a reexecução passou.

> Eram Oswald e Manrope quando este item foi escrito. A troca por Fraunces veio
> no merge de 12/08 e não muda nada aqui: a dependência é do `next/font/google`,
> não de qual fonte.

Não bloqueia a operação — bloqueia **publicar**. Com barbearia em uso, a
correção urgente de um bug fica refém de um serviço de terceiro. Auto-hospedar
as duas fontes resolve, e de quebra tira o IP de cada visitante do caminho da
Google, o que conversa com o item 2.1.

### 2.7 O ciclo operacional de falta não foi provado

Implementado e publicado, nunca exercido no domínio:

```
confirmed → horário passa → +tolerância → atraso no Action Center
         → "Não veio" → no_show → NENHUM payment/commission
         → "Veio depois" → fechamento → financeiro materializado
```

Exige uma reserva com horário vencido, e portanto horário comercial. É o único
bloqueador que depende do relógio, não de trabalho.

---

## 3. 🟡 Em validação

Código existe, testes passam, produção não viu.

| Item | O que falta provar |
|---|---|
| Action Center — as 5 regras no ar | só o estado **vazio** foi observado em produção; nenhuma regra foi vista disparando |
| Cancelamento pelo cliente | `/reservas` chama a função; ninguém cancelou de verdade |
| Remarcação | idem, mais a política de 2 remarcações |
| Encaixe aprovado/recusado | a tela existe desde antes; nunca verificada no domínio |
| Trial vencido cai em **modo leitura** | o corte seco saiu em 12/08: o dono passa a ver tudo sem editar, e o cliente segue agendando. Nunca houve tenant vencido para exercer |
| Planos bloqueiam de verdade | três níveis com matriz em `COBRANCA-E-ENTRADA.md`; em produção só existe barbearia em trial, que libera tudo |
| `revisarAssinaturas` move trial vencido para suspenso | roda 06:00, e está em **`DRY_RUN = true`**: hoje só registra o que faria. Ninguém leu o log dela ainda |
| Isolamento entre barbearias | 66 testes verdes no CI; em produção só existe **uma** barbearia |
| Rotação do cache do PWA | a primeira publicação criou `barbearia-<sha>`; provar exige a **próxima** — não vale deploy artificial |
| Botão "Atualizar" do PWA | **observado sem funcionar** em 11/08: nem o clique nem um `SKIP_WAITING` direto trocaram o worker. O caminho "fechar e reabrir" funciona |
| `ChunkLoadError` | apareceu 4× e some quando forçado; sem causa raiz. Reavaliar junto com a rotação do cache |
| Encaixe expira | `fitInExpirationMinutes` (45) existe e **nada expira nada** — pendência acumula para sempre. Defeito conhecido, não bloqueador |

---

## 4. ✅ Validado em produção

Cada linha com a evidência que a sustenta.

| Item | Evidência |
|---|---|
| Comissão congelada no atendimento | mudar de 40% → 50% não alterou os R$ 20 já registrados |
| Taxa de maquininha congelada | mudar 1,99/3,49 → 2,99/4,99 não alterou pagamentos anteriores |
| `payments` e `commissions` materializados | documentos gravados na conclusão, id derivado do `bookingId` |
| Rollback financeiro | desfazer a conclusão apaga os dois documentos |
| `paymentOrigin` separado de `paymentMethod` | onde o pagamento aconteceu ≠ como o dinheiro entrou |
| DRE lendo o materializado | fechamento do mês para de se reescrever |
| Resolução de tenant por subdomínio | `osiqueira.jpproject.com.br` → "O Siqueira Barbearia" |
| Deploy pela esteira | run `31556131536`, `release complete`, credencial exercida |
| Configurações grava e reflete na hora | tolerância 5 → 10 → 5, com selo "Salvo" e sem recarregar |
| Merge de política parcial | o documento real em produção tem `policies.booking` com **um** campo; sem o merge, a agenda aceitaria horário já passado |
| PWA troca de versão ao fechar e reabrir | `barbearia-v4` e `barbearia-dev` purgados; sobrou `barbearia-5a3bef6cc3d5` |

> ⚠️ **As três primeiras linhas foram provadas contra o código de 11/08, e o
> merge de 12/08 reescreveu o cálculo da comissão** — juntou a versão da `main`
> com o detalhe por barbeiro da branch e passou a recalcular o percentual
> exibido a partir do que foi somado. A regra provada continua valendo por
> desenho e por teste, mas a evidência nomeada aqui é anterior ao código atual.
> Pela regra 1 deste documento, teste verde não promove: **re-exercer os três
> após a próxima publicação.**

---

## 5. ⚪ Pós-piloto

Não existem, e a ausência é decisão — não defeito.

**Produto**
- Ficha de cliente / CRM — sem ela não há reativação, aniversário nem régua de faltas
- Pagamento online (Pix/cartão pelo app) — pedido nº 1 nas avaliações do concorrente
- Gateway e estorno real — hoje `refundedAmount` é gravado; dinheiro nenhum volta
- Cobrança da plataforma — não há checkout, cartão salvo nem régua de inadimplência
- Mensalista de verdade — `subscriptions` é flag de plano; não cobra nada
- Nota fiscal

**Comunicação**
- WhatsApp operacional — 34 templates prontos, zero envio; depende de chip novo e verificação comercial na Meta
- Provider Phone/SMS no Firebase Auth — a aba "Celular" do login não funciona

**Action Center**
- Situações 4.6 a 4.9 (ocioso, ritmo, alta demanda, cliente fora do intervalo)
- `type` + `reference` no `ActionItem` (dívida registrada no contrato)
- `rescheduleCount` — a política de 2 remarcações é burlável com F5

**Operação e DX**
- Observabilidade — ninguém é avisado se uma function começar a falhar
- Varredura do que ficou para trás — reserva de ontem em aberto some do painel
- Tradução das telas (18 em pt-BR cravado)
- `npm run test:rules` no Windows

---

## 6. A decisão de produto que ainda não foi tomada

Este documento **não** decide o escopo do piloto — isso é decisão de produto.
A pergunta, formulada:

> A barbearia piloto consegue operar um mês inteiro sem o que está em ⚪?

Recomendação, para servir de ponto de partida:

**Sim, com uma exceção.** O piloto é uma barbearia que já opera hoje com agenda,
caderno e maquininha própria. Pagamento online, nota fiscal e mensalista são
melhorias sobre um fluxo que já existe fora do sistema — dá para viver sem.

A exceção é o **WhatsApp**: a confirmação de horário é o que faz o cliente
aparecer. Sem envio real, o dono continua avisando à mão, e o produto vira uma
agenda bonita. Não bloqueia tecnicamente; muda o que o piloto consegue provar.

---

## 7. O que este inventário corrigiu

Registrado porque é a razão de o documento existir.

| Afirmação anterior | O que se verificou |
|---|---|
| "Comissão por barbeiro no DRE está pendente" | **feito** — `analytics.ts` usa `commissionPct` por profissional, com a política global só como fallback |
| "O trial conta os dias e nada bloqueia quando vence" | **errado** — `PainelDashboardLayout` corta o acesso com `AcessoExpirado`. A verificação anterior apontou para arquivos inexistentes e leu o vazio como ausência |
| "O deploy nunca foi executado" | executado, **falhou** num bug da própria esteira, corrigido, e hoje funciona |
| "O cache do service worker estava mal desenhado" | o cache estava correto — **nunca girava**, porque `sw.js` era byte-idêntico entre builds e nenhum deploy disparava `updatefound` |

A quarta linha é a mais instrutiva: o aviso "Nova versão disponível" existia no
código desde a fundação, bem feito, com tratamento até para múltiplos deploys
com a aba aberta — e nunca teve como aparecer. **Código correto que nunca
executa é indistinguível de código ausente**, e nenhum teste unitário pega isso.
