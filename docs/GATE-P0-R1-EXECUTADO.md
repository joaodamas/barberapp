# Gate P0 do R1 — executado

> **20/08/2026** · `hardening/p0-2026-08-17` em `3f460e2` · bancada local com
> **auth + firestore + functions**, projeto `day-in-the-life`.
>
> Esta é a **primeira execução real de `materializeFinancialsOnCompletion` na
> história deste repositório.** Os 12 scripts de emulador
> (`functions/package.json:15-25`) usam `--only firestore` e nenhum sobe
> `functions` — todo o comportamento das duas pernas do dano existia apenas como
> leitura estática até aqui.

---

# 1 · Veredito

| | |
|---|---|
| **R1** | ✅ **FECHA.** Os 9 passos do roteiro e os 9 cenários da matriz executados; o invariante de que ele depende segurou em runtime |
| **Piloto** | 🔴 **segue bloqueado** — por defeitos que o R1 não criou e não podia consertar |

O passo decisivo foi o **8**: com o cadastro do barbeiro alterado para 50%, uma
escrita em `bookings` que não fosse `status` **não moveu documento nenhum**. A
comissão continuou 40→60 congelada e o `createdAt` do pagamento não mudou.
`decidirEfeito("completed","completed") === "nada"` deixou de ser asserção de
função pura e passou a ser fato observado.

---

# 2 · A bancada

| | |
|---|---|
| Emuladores | auth `:9099` · firestore `:8080` · **functions `:5001`** · UI `:4000` |
| Trigger | `functions[southamerica-east1-materializeFinancialsOnCompletion]: firestore function initialized` |
| Taxas do seed | `dinheiro 0 · pix 0 · débito 1,99 · crédito 3,49` |
| Comissão | `policies.commissionSplit: null` → `padraoDaCasa()` = **40%** |
| Barbeiro | `staff/b-rafael`, `commissionPct: null` |
| Serviço | `services/corte`, R$ 50,00 |

## Dois defeitos encontrados ao montar a bancada

1. **O seed não roda como documentado.** `node scripts/semear-day-in-the-life.mjs`
   falha com `ERR_MODULE_NOT_FOUND: firebase-admin` — o pacote só existe em
   `functions/node_modules`, e o resolver ESM não sobe até lá a partir de
   `scripts/`. Contornado copiando o script para `functions/`. **Todo roteiro de
   bancada deste repo começa por aqui**, e a correção é uma linha.
2. **`export PATH="$JAVA_HOME/bin:$PATH"` quebra em silêncio no Git Bash** com
   caminho estilo Windows: o `C:` é o separador de `PATH`. Com JDK 21 instalado,
   o Firebase recusava com *"Java version before 21"*. Só o caminho POSIX
   (`/c/Program Files/...`) funciona. Irmão do tropeço já registrado
   (`VAR=x npm run dev` não propaga).
3. **O seed cria a conta de Auth do cliente mas não o documento em `clients`** —
   a busca "Carlos" não acha ninguém, e o roteiro assume que acha.

---

# 3 · Os 9 passos do roteiro

Reserva-âncora `vNKCg3RleXopTAWlbD9s` — Corte R$ 50,00 com `b-rafael`.

| # | Passo | Medido | |
|---|---|---|---|
| **1** | Concluir · Pix | `pix / 0 / 0 / 50` · comissão **40% · base 50 · R$ 20** · `cobertura {avulso, sem_plano}` · `createdAt 13:13:58.900Z` · `audit_log` 0 | ✅ |
| **2** | Corrigir Pix → Crédito | `credit / 3,49 / 1,75 / 48,25` · **`createdAt` IDÊNTICO** · `grossAmount` 50 · **1** `audit_log` com `de`/`para` exatos · comissão intocada | ✅ |
| **3** | `staff/b-rafael` → 60% | preparação do P1-7 | — |
| **4** | `completed → no_show` | pagamento **DELETADO** · comissão **DELETADA** · `cobertura` **APAGADA** · fidelidade deletada · `audit_log` **intacto** · **`paymentMethod` continua `"credit"`** | ✅ defeito confirmado |
| **5** | "Veio depois" · Dinheiro | pagamento **RECRIADO, mesmo id** · `cash / 0 / 0 / 50` — **R$ 1,75 evaporou** · `createdAt` **NOVO** (`13:17:40.537Z`) · comissão **60% · R$ 30** · log diz `credit/1,75` sobre doc que diz `cash/0` | ✅ dano confirmado |
| **6** | Cobertura virando | pagamento **NÃO EXISTE** — R$ 50,00 de receita realizada somem · `cobertura {plano, Ilimitado, valorCoberto 50}` · comissão `cobertoPeloPlano: true`, **R$ 25** · **2 `audit_log` apontando para `paymentId` inexistente** | ✅ pior consequência confirmada |
| **7** | Ordem inversa | correção **sobrevive** (`credit / 1,75 / 48,25`) · comissão **30% · R$ 15** | ✅ |
| **8** | **O invariante** | staff em **50%**, editado `clientName`: comissão continua **60%**, `createdAt` intocado, taxa intocada | ✅ **o R1 fecha** |
| **9** | Idempotência | segundo `audit_log` (`de: cash → para: credit`), **um** pagamento; retry com a mesma chave devolve sem gravar | ✅ |

---

# 4 · Os 9 cenários da matriz do briefing

| # | Cenário | Esperado | Resultado |
|---|---|---|---|
| 1 | Coberto de verdade | sem `PaymentDoc` | ✅ passo 6 |
| 2 | Plano não cobre | `PaymentDoc` sem método + correção disponível | ✅ **reproduzido** — ver §5 |
| 3 | Corrige método | um único `PaymentDoc` | ✅ |
| 4 | Corrige para o mesmo método | nenhum efeito | ✅ `FAILED_PRECONDITION` — *"Esse já é o meio de pagamento registrado"*. A tela sequer oferece o método atual |
| 5 | `booking` e `payment` iguais | iguais | ✅ sempre |
| 6 | "Veio depois" | **não** recalcula histórico | ❌ **REFUTADO — recalcula** (passo 5) |
| 7 | Atualiza taxa | reflete uma única vez | ✅ ver §6 |
| 8 | Usuário sem permissão | não consegue | ✅ `HTTP 403 · PERMISSION_DENIED` |
| 9 | Auditoria | um evento por correção | ✅ 1 por correção nova, 0 no retry |

**O cenário 6 é o único que falha — e falha contra a expectativa do briefing, não
contra o R1.** O briefing esperava que a reabertura preservasse o histórico. Ela
não preserva, e nunca preservou: o R1 apenas tornou o dano visível.

---

# 5 · O gatilho de origem, reproduzido inteiro

Cliente `Tiago Cota` com o plano **"2 cortes"** (que não tem `servicesIncluded`,
logo nunca cobre). O dono clica **"Concluir sem cobrar"**:

```
cobertura = {tipo: "avulso", motivo: "plano_nao_cobre", valorCoberto: 0}
payments/pagamento_U8hI…  →  EXISTE, paymentMethod: null
```

E a interface responde inteira, do jeito certo:

- **Card crítico:** *"Tiago Cota foi atendido e o pagamento não foi registrado —
  sem a forma de pagamento, a taxa da maquininha entra como zero e o lucro do mês
  fica maior do que é"*, com ação **"Registrar pagamento"**.
- **A linha diz a causa:** *"Não informado · Fora do plano: o plano não inclui
  atendimento"*.
- **O caixa ganha uma quarta coluna:** *"Sem forma informada · R$ 50,00"*, com a
  legenda *"Entrou no total, mas não dá para conferir contra a gaveta enquanto
  não souber como foi pago"*.
- **O card leva ao MESMO modal** da porta do R1 — porta única, como o briefing
  exigia (item 12).

Vale registrar que **o modal de conclusão já avisava**: *"Mensalista · 2 cortes —
**Sem atendimento incluso**"*. O aviso está lá, e "Concluir sem cobrar" continua
sendo a ação destacada ao lado dele.

---

# 6 · Taxa: congelada no antigo, vigente no novo

Com a taxa de crédito alterada de `3,49%` para `5%` **entre** as duas correções:

| Atendimento | Corrigido | `feePct` | `feeAmount` | Líquido |
|---|---|---|---|---|
| Pedro Controle | **antes** | `3,49` | `1,75` | `48,25` |
| Tiago Cota | **depois** | `5` | `2,50` | `47,50` |

Dois pagamentos de crédito de R$ 50,00 no mesmo dia com taxas diferentes — e é o
comportamento **correto**, declarado na tela pelo próprio modal: *"A taxa aplicada
é a que está cadastrada hoje, e não a de quando o atendimento foi concluído.
Ajuste em Configurações antes, se ela mudou."* Nenhum valor foi contado duas
vezes.

---

# 7 · Verificação de tela

| O que o briefing pedia | Observado |
|---|---|
| Caixa muda de coluna **sem mudar o total** | Pix R$ 50,00 → Cartão R$ 50,00, total R$ 50,00. Lê-se como correto |
| Card crítico some pelo motivo certo | Some quando o pagamento ganha método |
| Card "taxas não configuradas" pode acender | Não acendeu — as taxas existem no seed |
| A confirmação diz que a taxa é a de hoje | Diz, no corpo do modal |

**Financeiro, ao fim:** receita realizada R$ 50,00 − custo R$ 44,75 = **R$ 5,25**
(comissões 15 + 25, taxa 1,75, imposto 3,00). Fecha na casa do centavo. E a
legenda da receita diz *"R$ 149,00 da mensalidade contratada não entram aqui"* —
**o D18 não acontece nesta tela.**

---

# 8 · O que o gate deixa provado, e que era só suspeita

1. **A erosão é invisível por construção.** Depois do passo 5, a tela mostra
   "Dinheiro R$ 50,00, Concluído" e **nada mais**. Nenhum sinal de que houve
   correção apagada, taxa evaporada ou comissão reescrita.
2. **O P1-7 é retroativo e silencioso.** O acerto com o barbeiro passou de R$ 20
   para R$ 30 num atendimento que já tinha acontecido, porque o cadastro mudou
   entre as duas conclusões.
3. **A perda de receita do passo 6 não deixa rastro nenhum.** R$ 50,00 realizados
   viraram "Coberto pelo plano" e a linha se lê como perfeitamente normal.
4. **Conferir `booking` × `payment` não detecta o dano.** Nos dois casos os dois
   documentos **concordam** — em torno do valor errado.

---

# 9 · O que continua aberto

| # | Item | Trava |
|---|---|---|
| 1 | **P1-7** — comissão recalculada do cadastro de hoje | piloto |
| 2 | **Cobertura re-decidida apaga receita realizada** | piloto |
| 3 | **`paymentMethod` órfão no `no_show`** — correção de uma linha em `financial-events.ts:392-394` | 🟡 |
| 4 | **`grossAmount` recriado de `booking.value`**, não do congelado | 🟡 |
| 5 | **Caso 2** — meio de pagamento errado, indetectável | piloto |
| 6 | **D18** — mensalista contado duas vezes | piloto |
| 7 | Nenhuma tela lê `audit_log` | §26 item 3 |
| 8 | A porta do R1 só alcança **hoje**, enquanto o servidor concede o **mês** | 🟡 |

---

# 10 · Decisões que o gate reforça, sem resolver

- **D-1** — a conclusão de um `no_show` que já foi `completed` é a mesma operação
  que a conclusão de um atendimento novo? Hoje é: mesmo botão, mesmo modal, mesma
  escrita. **O modal não avisa que existe um fato financeiro anterior.**
- **D-2** — ao rematerializar, a comissão renasce do cadastro de hoje ou do
  documento anterior? É a decisão que fecha o P1-7.
- **D-3** — reverter conclusão deve ser permitido sobre atendimento já corrigido
  ou estornado?
