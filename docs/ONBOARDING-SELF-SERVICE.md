# Onboarding self-service — especificação

**Data:** 2026-08-02 · **Piloto:** O Siqueira Barbearia · **Trial:** 7 dias, tudo liberado, sem cartão

---

## 1. O princípio que organiza tudo

A pergunta que define o onboarding não é *"o que precisamos cadastrar?"* — é **"qual o menor conjunto de informações que faz a primeira reserva acontecer?"**

Barbearia não compra software para preencher formulário. Compra para parar de perder horário. Se o cara precisa lançar o aluguel antes de conseguir receber um agendamento, ele fecha a aba.

Daí a separação que estrutura o documento inteiro:

| | O que é | Quando é pedido |
|---|---|---|
| **Bloqueante** | Sem isso não existe agendamento | No onboarding, antes de liberar o app |
| **Progressivo** | Sem isso uma tela específica fica vazia | Dentro da própria tela, quando ele chegar lá |

São **4 passos bloqueantes**. Todo o resto é progressivo.

---

## 2. O que cada tela precisa para mostrar dado

Mapa derivado do código atual — é o que determina o que pedir e quando.

| Tela | Precisa de | Classificação |
|---|---|---|
| **Agendar** (cliente) | serviços, jornada | 🔴 bloqueante |
| **Início** (cliente) | identidade, contato | 🔴 bloqueante |
| **Hoje** (painel) | jornada (capacidade), reservas | 🔴 bloqueante |
| Reservas (cliente) | reservas do cliente | ⚪ vem sozinho |
| Perfil (cliente) | conta do cliente, fidelidade | ⚪ vem sozinho |
| Números | reservas acumuladas | ⚪ vem sozinho (precisa de histórico) |
| **Despesas** | lançamentos | 🟡 progressivo |
| **DRE** | receita + despesas + taxas + comissão + imposto | 🟡 progressivo |
| **Fluxo de caixa** | lançamentos de caixa | 🟡 progressivo |
| **Projeção** | reservas futuras + assinantes + despesas recorrentes | 🟡 progressivo |
| **Mensal** | planos + assinantes | 🟡 progressivo |
| **Loja** | produtos | 🟡 progressivo |

**Leitura importante:** o financeiro — que é o diferencial de venda — é todo progressivo. Ele só fica bonito depois de duas semanas de uso. Isso tem uma consequência séria para o trial de 7 dias, tratada na seção 6.

---

## 3. O fluxo

```
Landing ──▶ Criar conta ──▶ Escolher endereço ──▶ Onboarding (4 passos) ──▶ App liberado
                │                  │                         │                    │
          e-mail/Google      slug permanente         guiado, salva a cada    trial 7 dias
                                                     passo, dá pra sair       tudo liberado
                                                                                   │
                                                                          Dia 5: aviso
                                                                          Dia 7: escolher plano
```

### 3.1 Criar conta

Firebase Auth (e-mail/senha ou Google), como já existe em `/login`. O usuário é criado **antes** da barbearia — a barbearia é criada para o `uid` autenticado.

Não pedir dados da barbearia aqui. Uma tela de cadastro com oito campos converte pior que duas telas com quatro. Nome e telefone vêm no passo 1 do onboarding, onde há contexto.

### 3.2 Escolher o endereço (slug)

Tela própria, e **a mais importante do fluxo**, porque é a única decisão irreversível.

- Campo único, com prefixo visível: `[ osiqueira ].seudominio.com.br`
- Sugestão automática a partir do nome digitado depois — ou, se ainda não houver nome, entrada livre
- Validação ao vivo: 3–30 caracteres, minúsculas, números e hífen, sem hífen nas pontas, sem acento
- Checagem de disponibilidade com debounce, e **reserva atômica na confirmação** (dois cadastros simultâneos no mesmo slug: um ganha, o outro recebe erro e sugestão)
- 9 subdomínios reservados: `www`, `app`, `admin`, `api`, `status`, `docs`, `suporte`, `blog`, `mail`

> **Aviso obrigatório na tela, não em letra miúda:**
> *"Este endereço não muda depois. Seus clientes vão salvar o app com ele na tela do celular."*
>
> Isso não é formalidade jurídica. Quando o cliente da barbearia instala o PWA, o ícone aponta para aquela origem — trocar o subdomínio depois quebra o app na mão dos clientes dele.

---

## 4. Os 4 passos bloqueantes

Regras gerais do wizard:

- **Salva a cada passo.** Fechar o navegador e voltar retoma de onde parou.
- **Progresso visível**: "Passo 2 de 4".
- **Voltar sempre disponível.**
- Cada passo tem **uma linha de porquê** no topo — não "preencha os campos", mas o que aquilo destrava.
- Nenhum passo pode ser pulado, mas todos aceitam o mínimo (um serviço só, horário padrão).

---

### Passo 1 — Sua barbearia

> *Isso é o que seus clientes veem quando abrem o link.*

| Campo | Tipo | Obrigatório | Orientação exibida |
|---|---|---|---|
| Nome | texto | ✅ | "Como sua barbearia é conhecida. Aparece no topo do app e nas mensagens de WhatsApp." |
| Endereço | texto | ✅ | "Rua, número e bairro. O cliente toca e abre no mapa." |
| WhatsApp | telefone | ✅ | "Com DDD. É por aqui que você vai aprovar encaixes e receber avisos." |
| Instagram | texto | — | "Opcional. Aparece no rodapé do app do cliente." |
| Logo | upload | — | "PNG ou SVG quadrado. Sem logo, usamos a inicial do nome." |
| Cor de destaque | seletor | — | "A cor dos botões e destaques. O resto do visual é fixo, para o texto continuar legível." |

**Notas de implementação**
- WhatsApp é validado e normalizado para `55DDNNNNNNNNN` — é o formato que `wa.me` exige, e digitar com máscara é o que o dono faz naturalmente.
- A cor tem **paleta sugerida**, não seletor livre. Um dourado escolhido a esmo derruba o contraste do botão primário abaixo de 4,5:1 — o problema que a auditoria acabou de corrigir. Só cores validadas entram na paleta.
- Sem logo, cair na inicial é melhor que bloquear: 70% não têm arquivo à mão no momento do cadastro.

---

### Passo 2 — Seus serviços

> *Sem isso o cliente não tem o que agendar. Comece com os 3 ou 4 mais pedidos — dá pra completar depois.*

Tabela editável, com **linhas pré-preenchidas** do cardápio típico de barbearia, que o dono ajusta ou apaga:

| Serviço | Duração | Preço |
|---|---|---|
| Corte | 30 min | R$ — |
| Barba | 30 min | R$ — |
| Corte + barba | 60 min | R$ — |
| Sobrancelha | 20 min | R$ — |

| Campo | Orientação exibida |
|---|---|
| Nome | "Como você chama no dia a dia. 'Corte + barba' funciona melhor que 'Combo Premium'." |
| Duração | "Quanto tempo você realmente leva, incluindo a conversa. A agenda usa isso para não marcar dois clientes em cima." |
| Preço | "Se o preço varia, coloque o mínimo e marque 'a partir de'." |

**Mínimo para avançar:** 1 serviço com nome, duração e preço.

**Por que pré-preencher:** partir de uma tabela vazia com "Adicionar serviço" gera abandono. Partir de quatro linhas com preço em branco vira uma tarefa de 90 segundos.

---

### Passo 3 — Seus horários

> *É a partir daqui que a agenda monta os horários que o cliente pode escolher.*

| Campo | Padrão | Orientação exibida |
|---|---|---|
| Dias de funcionamento | seg–sáb | "Toque para desmarcar os dias em que você não abre." |
| Abre / fecha | 09:00 / 19:00 | "O horário normal. Exceções e folgas você bloqueia depois, na agenda." |
| Intervalo | 12:00–14:00 | "Almoço ou pausa. A agenda não oferece horário nesse intervalo." |
| Intervalo entre atendimentos | 30 min | "De quanto em quanto tempo você quer que os horários apareçam." |

**Prévia ao vivo, ao lado:** a grade de horários que o cliente vai ver, atualizando a cada mudança. É o que transforma configuração em compreensão — ele *vê* que fechar às 19h com slot de 30 min gera 16 horários.

**Notas**
- Isso alimenta `WORKDAY_TIMES` e `openWeekdays`, hoje constantes em `lib/slots.ts`. Precisam virar campos do tenant.
- A soma de duração dos serviços já é respeitada pelo motor de slots — um combo de 60 min não é oferecido no último horário do dia.

---

### Passo 4 — Compartilhe seu link

> *Pronto. Agora é só mandar para seus clientes.*

**Este passo não é decoração — é a métrica de ativação.** Quem não compartilha não recebe agendamento, não vê valor e cancela no dia 7. É o passo que decide o trial.

Entregar tudo pronto para copiar e colar:

| Formato | Uso | Detalhe |
|---|---|---|
| **QR code** | balcão, espelho, vitrine | botão de baixar em PNG, tamanho de impressão |
| **Link curto** | bio do Instagram | com botão "copiar" |
| **Mensagem de WhatsApp** | lista de transmissão | texto pronto, editável, botão "abrir WhatsApp" |
| **Story pronto** | Instagram | imagem 1080×1920 com logo, nome e QR |

Mensagem sugerida:

> *"Agora você pode agendar seu horário na {nome} direto pelo link, sem precisar me chamar: {link}. Dá pra ver os horários livres e escolher o que der certo pra você. 💈"*

**Métrica a instrumentar:** compartilhou / não compartilhou, e por qual canal. É o indicador mais preditivo de conversão que esse produto vai ter.

---

## 5. O que é progressivo — e como cada tela pede

Depois do onboarding o app está liberado. As telas que dependem de dado que ele ainda não tem **não mostram tabela vazia** — mostram o que falta e o botão que resolve.

| Tela | Estado vazio | Ação |
|---|---|---|
| **Despesas** | "Lance suas despesas do mês para ver seu resultado real. Comece pelo aluguel e pelas contas fixas — leva 2 minutos." | `Nova despesa` |
| **DRE** | "Seu DRE aparece assim que houver receita e despesas lançadas. Faltam: despesas fixas." | `Lançar despesas` |
| **Fluxo de caixa** | "Cada atendimento concluído entra aqui automaticamente. Marque o primeiro como concluído na tela Hoje." | `Ir para Hoje` |
| **Projeção** | "A projeção usa suas reservas futuras e despesas recorrentes. Faltam: despesas recorrentes." | `Lançar despesas` |
| **Mensal** | "Crie seu plano de mensalista e comece a ter receita previsível. Barbearias com clube faturam mais e faltam menos." | `Criar plano` |
| **Loja** | "Cadastre os produtos que você revende. O sistema calcula preço, comissão e imposto." | `Adicionar produto` |
| **Números** | "Seus indicadores aparecem depois dos primeiros atendimentos concluídos." | — |

**Configurações que ficam fora do onboarding**, em Ajustes, com padrão sensato já aplicado:

| Configuração | Padrão | Onde |
|---|---|---|
| Política de cancelamento (24h/6h, taxa 25%) | aplicado | Ajustes → Políticas |
| Reagendamento (6h, 2 por reserva) | aplicado | Ajustes → Políticas |
| Antecedência mínima (1h) e máxima (60 dias) | aplicado | Ajustes → Agenda |
| Rateio de comissão (40/60) | aplicado | Ajustes → Financeiro |
| Imposto (6%) | aplicado | Ajustes → Financeiro |
| Taxas do gateway | vazio | Ajustes → Financeiro |
| Fidelidade (10 carimbos) | aplicado | Ajustes → Fidelidade |

Todos já existem em `lib/business-rules.ts` e viram campos do tenant. **Nenhum deles entra no onboarding** — pedir a alíquota do Simples antes da primeira reserva é o caminho mais curto para o abandono.

---

## 6. Trial de 7 dias

### Mecânica

- Começa na criação da barbearia. `trial.startedAt` e `trial.endsAt` no documento.
- **Tudo liberado.** Sem escolha de plano, sem cartão.
- Contagem visível no painel a partir do dia 4: *"Faltam 3 dias de teste."*
- Dia 7: app entra em modo leitura, com tela de escolha de plano. **Nada é apagado.**

### O problema honesto do prazo de 7 dias

O diferencial de venda é o financeiro — DRE, ponto de equilíbrio, projeção. E o financeiro **só fica bom com histórico**. Em 7 dias, uma barbearia solo faz talvez 30 atendimentos: o DRE existe, mas não impressiona como impressionaria com um mês.

Três formas de resolver, em ordem de preferência:

1. **Importar o histórico no onboarding (recomendado).** Um passo opcional no fim: "Quanto você faturou no mês passado? Quais suas despesas fixas?" Três campos alimentam um DRE do mês anterior **de verdade**, no dia 1. É o que faz o cara ver o próprio negócio na primeira sessão, e é barato de construir.
2. **Estender o trial para quem lança despesas.** "Lançou suas despesas fixas? Ganhou mais 7 dias." Amarra a extensão ao comportamento que prediz conversão.
3. **Aceitar e compensar no dia 7** com uma tela de "veja como fica em 30 dias", projetando a partir do que ele já tem.

**Recomendo a 1.** Sem ela, o trial de 7 dias mostra a agenda — que é commodity — e não mostra o financeiro, que é o motivo de pagar mais que o concorrente.

### Depois do trial

Escolha do plano com o `useFeature()` que já existe no código e ainda não é consumido por nenhuma tela:

| Recurso | Entrada | Completo |
|---|---|---|
| Agenda, encaixe, pagamento flexível | ✅ | ✅ |
| WhatsApp | ✅ | ✅ |
| Fidelidade | ✅ | ✅ |
| Mensalistas | 🔒 | ✅ |
| Loja e estoque | 🔒 | ✅ |
| DRE, projeção, fechamento | 🔒 | ✅ |

🔒 = **tela visível, com cadeado e prévia dos números reais dele**, não escondida. Esconder faz o cliente não saber que existe; mostrar bloqueado com o próprio dado é o que converte.

---

## 7. O que o modelo de dados ganha

```ts
/barbershops/{id}
  // já existe
  slug, status, plan, brand{}, contact{}, features{}

  // novo
  trial: { startedAt, endsAt }
  onboarding: { step, completedSteps[], completedAt, sharedLink }
  schedule: {
    weekdays: number[]          // 0=domingo
    opensAt: "09:00"
    closesAt: "19:00"
    breaks: [{ from: "12:00", to: "14:00" }]
    slotMinutes: 30
  }
  policies: {                   // hoje constantes em business-rules.ts
    cancellation{}, reschedule{}, booking{}, loyalty{},
    commissionSplit{}, taxRatePct, gatewayFees[]
  }
  history?: {                   // do passo opcional de importação
    previousMonthRevenue, previousMonthAppointments
  }
```

`status` ganha o valor `trial`, que já está previsto no tipo `Tenant`.

---

## 8. O que precisa ser construído

| # | Item | Observação |
|---|---|---|
| 1 | `signUpBarbershop` (callable) | Cria a barbearia para o `uid` autenticado. Diferente de `provisionBarbershop`, que exige `platformAdmin`. Slug atômico, trial de 7 dias, catálogo semente. **Exige e-mail verificado e rate limit** — self-service é superfície de squatting de subdomínio. |
| 2 | `checkSlugAvailability` (callable) | Consulta com debounce, sem expor a coleção. |
| 3 | Rota `/comecar` | Fora dos grupos `(cliente)` e `(dashboard)` — não tem sidebar nem guard de dono. |
| 4 | Wizard de 4 passos | Salva a cada passo em `onboarding.completedSteps`. |
| 5 | Guard de onboarding | Dono com onboarding incompleto → `/comecar`. |
| 6 | `schedule` no tenant | `WORKDAY_TIMES` e `openWeekdays` saem de `lib/slots.ts` e viram campo. |
| 7 | Prévia de horários ao vivo | Passo 3. Reaproveita `slotsForDate`. |
| 8 | Gerador de QR + story | Passo 4. Canvas no cliente, sem dependência externa. |
| 9 | Estados vazios contextuais | Seção 5, sete telas. |
| 10 | Banner de trial | Dia 4 em diante. |
| 11 | `useFeature` com cadeado e prévia | Só depois do trial. |
| 12 | Tela de Ajustes | Onde as políticas viram editáveis. |
| 13 | Passo opcional de histórico | Seção 6, item 1 — o que salva o trial de 7 dias. |
| 14 | Cobrança | Maior peça. Define o gateway. |
| 15 | Landing | **Por último.** A landing vende o que existe. |

**Ordem sugerida:** 1–5 destravam o fluxo inteiro e são testáveis com o piloto. 6–8 completam os passos. 9–10 seguram o trial. 13 é o que faz 7 dias funcionarem. 11, 12, 14 e 15 vêm depois da validação.

---

## 9. O piloto: O Siqueira

O tenant de referência já existe e está configurado. **Não use isso como teste** — validar onboarding com uma barbearia já configurada não valida nada.

O teste que vale:

1. Criar um tenant **novo e vazio** (`osiqueira-teste`), do zero.
2. Sentar do lado do dono e pedir para ele fazer sozinho, sem ajuda.
3. **Não explicar nada.** Anotar cada vez que ele parar, reler ou perguntar.
4. Cronometrar até o passo 4.

**O que medir:**

| Sinal | O que significa |
|---|---|
| Tempo total até compartilhar o link | A meta é abaixo de 10 minutos |
| Onde ele parou para reler | Orientação mal escrita — esse texto precisa mudar |
| O que ele perguntou em voz alta | O campo não se explica sozinho |
| Se ele hesitou no slug | O aviso de irreversibilidade não está claro o bastante |
| Se ele preencheu duração de serviço "no chute" | A agenda vai marcar em cima; a orientação falhou |
| Se ele compartilhou o link sem ser mandado | O passo 4 está funcionando |

**O sinal mais importante não é ele conseguir terminar.** É onde ele hesita. Barbearia com pressa não pede ajuda — abandona. Cada hesitação observada no piloto é um abandono evitado nos próximos.

E ele tem uma vantagem que nenhum outro cliente vai ter: conhece o produto e quer que dê certo. **Se ele travar em algum passo, o cliente frio trava com certeza.**

---

## 10. Verificação contra o emulador (2026-08-02)

Fluxo exercitado de ponta a ponta com Auth + Firestore + Functions no emulador,
e navegado no browser em dois subdomínios reais (`osiqueira.lvh.me`,
`barbeariadoze.lvh.me`).

| Verificação | Resultado |
|---|---|
| Cadastro bloqueado sem e-mail verificado | ✅ |
| Slug curto / reservado / ocupado recusados com motivo | ✅ |
| Barbearia criada com trial de 7 dias | ✅ |
| Segunda barbearia na mesma conta bloqueada | ✅ |
| Claim `barbershops[id]=owner` concedido | ✅ |
| Quatro passos do onboarding registrados | ✅ |
| Duas barbearias, dois subdomínios, marcas e manifests distintos | ✅ |
| Login pela UI → redireciona para `/painel` | ✅ |
| 17 rotas sem erro de servidor | ✅ |
| Despesas: estado vazio, escrita e KPI atualizando em tempo real | ✅ |
| 34 testes de regra + 34 de function + 54 do web | ✅ |

**Quatro defeitos encontrados só por rodar**, todos corrigidos:

1. `onboarding.completedAt` era `Timestamp` do Firestore e derrubava a rota com
   500 ao atravessar para Client Component.
2. `upgrade-insecure-requests` na CSP forçava https em subdomínio local e
   derrubava todos os assets.
3. Faltava `unsafe-eval` em desenvolvimento — o React precisa dele, e sem isso a
   hidratação quebrava.
4. Faltava `allowedDevOrigins` — a página carregava e **nenhum botão
   respondia**, sem erro no console.

Os itens 2 a 4 têm a mesma assinatura: a tela aparece inteira e nada funciona.
Nenhum deles apareceria em typecheck, lint ou teste unitário.

Também corrigido: `shortName` cortava no meio da palavra ("O Siqueira Bar",
"Barbearia do Z") — e é o texto que fica sob o ícone no celular do cliente.

---

## 11. Referências

- [`ESTRATEGIA-SAAS.md`](./ESTRATEGIA-SAAS.md) — isolamento, subdomínio, planos e preço
- [`COMPARATIVO-MERCADO-2026-08.md`](./COMPARATIVO-MERCADO-2026-08.md) — posicionamento
- [`ARQUITETURA.md`](./ARQUITETURA.md) — referência técnica
- `functions/src/provisioning.ts` — provisionamento assistido, base do self-service
- `web/src/lib/business-rules.ts` — as políticas que viram campos do tenant
