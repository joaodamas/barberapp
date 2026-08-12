# Handoff — o que saber antes de mexer

Para quem chega ao projeto sem ter acompanhado as sessões anteriores: humano
novo, sessão nova de IA, ou consultoria externa.

Não descreve funcionalidade — para isso existem `BLUEPRINT-PRODUTO.md` (o que o
produto é) e `DOCUMENTACAO-TECNICA-FUNCIONAL.md` (o que existe hoje). Aqui ficam
o contexto, as decisões que já foram tomadas com o porquê, e as coisas que
custam caro quando alguém as refaz sem saber.

**Última revisão: 12/08/2026.**

---

## 1. O produto em cinco linhas

**CorteHub** é uma plataforma de gestão para barbearias: agenda pelo link,
painel do dono, financeiro que fecha, e comunicação com o cliente.

Nasceu resolvendo a dor de **uma** barbearia — **O Siqueira**, que hoje é o
tenant **piloto**, não o dono do produto. Boa parte da documentação antiga
confunde os dois, e é a origem de o produto já ter sido chamado por nomes que
não são o dele.

O produto não se chama, e nunca se chamou, "AXON Barber".

---

## 2. Onde o projeto está

| | |
|---|---|
| Publicado | sim, desde 12/08, pela esteira do GitHub Actions |
| Clientes reais | **nenhum** — nem o piloto está operando |
| Barbearias em produção | uma, `osiqueira.jpproject.com.br`, sem uso real |
| Cobrança | não existe checkout; a contratação é humana, por WhatsApp |
| Bloqueadores de go-live | 7, listados em `GO-LIVE-READINESS.md` |

**Não há dado de cliente final em risco hoje.** É a janela em que consertar
coisa estrutural ainda é barato — e a razão de a lista de bloqueadores priorizar
segurança e LGPD sobre funcionalidade.

---

## 3. A regra que organiza tudo: o padrão de evidência

Esta é a decisão mais importante do projeto, e a que mais se perde quando alguém
novo chega.

> **Teste verde não promove nada para "validado".**
> Suíte verde diz que o código faz o que o autor imaginou. Produção diz que o
> produto faz o que o dono precisa.

Quatro estados, e toda linha ✅ **nomeia a evidência que a sustenta**:

- ✅ **validado** — comprovado em produção, com a evidência escrita
- 🟡 **em validação** — o código existe e passa nos testes; ninguém provou no
  domínio publicado
- 🔴 **bloqueador** — impede entregar a uma barbearia real
- ⚪ **pós-piloto** — pode esperar, e a espera é decisão consciente

Isso não é zelo. É consequência de fatos:

- **Todo defeito grave de agosto passou por uma suíte verde.**
- Um teste chamado "comissão sai do lucro da loja" passava porque **afirmava o
  comportamento errado**.
- O aviso "Nova versão disponível" existia desde a fundação, bem feito, com
  tratamento até para múltiplos deploys com a aba aberta — e **nunca teve como
  aparecer**, porque o `sw.js` era byte-idêntico entre builds. Código correto
  que nunca executa é indistinguível de código ausente, e nenhum teste unitário
  pega isso.
- Publicar revelou **três** defeitos que nenhuma suíte pegaria, porque os três
  só existem depois que alguém publica.

E uma distinção mantida de propósito: **"não existe" é diferente de "está
quebrado".** Funcionalidade ausente é escopo; funcionalidade que mente é
defeito.

---

## 4. Decisões já tomadas — não reabrir sem motivo novo

### Irreversíveis na prática

| Decisão | Por quê |
|---|---|
| **Firestore** como banco | multi-tenant com regras por documento; trocar agora reescreveria o produto |
| **Isolamento por barbearia** em `/barbershops/{id}` | 66 testes de regras cobrem o vazamento entre tenants |
| **Subdomínio** resolve o tenant | `osiqueira.jpproject.com.br`; muda roteamento, cookie e claim |
| **O nome é CorteHub** | já passou por NoCorte, descartado. **O domínio ainda não foi comprado** |

### De produto

- **Três planos** — Agenda R$ 97, Crescimento R$ 197, Gestão R$ 297. Matriz e
  raciocínio de preço em `COBRANCA-E-ENTRADA.md`. Existiu uma linha de dois
  planos (`entrada`/`completo`) entre 11 e 12/08; documento gravado nesse
  intervalo é **traduzido**, não rebaixado.
- **Modo leitura, não corte seco.** Trial vencido ou conta suspensa: o dono
  continua vendo tudo, o cliente continua agendando pelo link, e o que trava é
  editar. Barbearia que perde a agenda no meio de um sábado não volta para
  negociar — cria caso. Houve um corte seco no ar por um dia; foi removido.
- **O app do cliente nunca cai por inadimplência do dono.** Quem marcou corte
  na sexta não tem culpa da mensalidade, e derrubar a agenda pública transforma
  uma cobrança em prejuízo para terceiros.
- **WhatsApp entra já no plano de entrada.** É o add-on que o concorrente cobra
  à parte, e o argumento de venda mais direto contra ele.

### De engenharia

- **Dinheiro é congelado no fato, não derivado do cadastro.** Ao concluir um
  atendimento, comissão e taxa da maquininha viram documento. Mudar o percentual
  de um barbeiro hoje **não pode** reescrever o que ele ganhou em março. Onde
  houver derivação, é fallback para o histórico anterior ao trigger — nunca a
  fonte preferida.
- **Deploy só pela esteira.** Deploy de máquina local já sobrescreveu regras de
  produção com versões mais antigas e removeu as regras de 6 coleções por 28
  minutos. O repositório estava 30 commits atrás da produção sem ninguém saber.
- **Uma normalização só** do documento da barbearia (`tenant-shape.ts`), usada
  pelo servidor e pelo painel. Duas implementações do mesmo merge divergem, e o
  preço é uma política sumir num caminho de leitura e não no outro.
- **A decisão de acesso mora num lugar só** (`acessoDaBarbearia`). As telas leem
  o resultado por `useAcesso`; nenhuma tela decide sozinha o que o plano libera.

---

## 5. 🚫 O que não fazer

Cada item aqui custou dinheiro, tempo ou um defeito em produção.

1. **Não promova nada para ✅ por causa de teste verde.** Ver seção 3. Se não
   aconteceu no domínio publicado, é 🟡.
2. **Não derive valor financeiro do cadastro atual** quando existir documento
   congelado. O congelado vence, sempre.
3. **Não escreva fallback generoso.** `FEATURES_POR_PLANO[plan] ?? ALL_FEATURES`
   parecia defensivo e entregava o catálogo inteiro de graça a quem tivesse um
   typo no plano. Ausência e valor desconhecido resolvem para o **mínimo**, e a
   normalização acontece na entrada, uma vez.
4. **Não faça deploy de máquina local.** Ver seção 4.
5. **Não trate a documentação como fonte de verdade acima do código.** Vários
   documentos deste repositório descrevem intenções, e um inventário que erra
   nas duas direções — pendente o que está pronto, pronto o que nunca foi
   provado — faz decidir com base em ficção. `GO-LIVE-READINESS.md` existe
   exatamente por causa disso.
6. **Não renomeie o produto.** Já custou duas rodadas.
7. **Não invente funcionalidade fora do `BLUEPRINT-PRODUTO.md`.** O que está em
   ⚪ pós-piloto está lá por decisão, não por esquecimento.
8. **Não construa em paralelo sem mesclar.** Em agosto duas linhas de trabalho
   corrigiram **o mesmo defeito do DRE** de forma independente, sem saber uma da
   outra, com desenhos incompatíveis de plano e de meio de pagamento. Reconciliar
   custou mais que qualquer uma das duas implementações.
9. **Não peça ao dono para preencher taxa que a plataforma pode inventar.** Taxa
   é contrato de cada barbearia com a maquininha dela: o padrão é **zero**,
   porque chutar uma média faria o DRE debitar dinheiro que talvez não seja
   cobrado. Zero é honesto; a tela sinaliza que o dado falta.

---

## 6. Decisões ainda abertas

| Decisão | De quem é | O que trava |
|---|---|---|
| **Escopo do piloto — em especial o WhatsApp** | produto | 34 templates prontos, zero envio. A confirmação de horário é o que faz o cliente aparecer; sem envio real, o produto vira uma agenda bonita. Depende de chip novo e verificação comercial na Meta, que por sua vez depende da política de privacidade |
| **E-mail da segunda conta owner** | dono | O projeto tem **um único** owner e **um único** admin de faturamento, na mesma conta pessoal, e não está sob organização nenhuma. É o único item da lista **sem caminho de recuperação**. Criar conta e mexer em senha não é trabalho de ferramenta |
| **Cloud Identity e projeto sob organização** | dono | dívida estrutural registrada; não bloqueia o piloto, bloqueia crescer |
| **Comprar o domínio do CorteHub** | dono | o nome está decidido, o domínio não é nosso |

---

## 7. Como o trabalho anda aqui

- **Documento antes de código** nas mudanças estruturais. `BLUEPRINT-PRODUTO.md`
  e `ACTION-CENTER-CONTRATO.md` foram escritos sem uma linha de código junto.
- **Commits explicam o porquê, não o quê.** O diff já diz o que mudou; a
  mensagem diz que defeito existia e que decisão foi tomada.
- **Achado vira linha no `GO-LIVE-READINESS.md`**, com o estado certo. Achado
  que só vira comentário no chat some.
- **Regra de leitura da pasta `web/`:** este Next.js tem mudanças de API em
  relação ao conhecido. Ler `node_modules/next/dist/docs/` antes de escrever
  código que toque em API do framework.

---

## 8. Estado do Git

O trabalho de 12/08 **existe só localmente**: a `main` remota não o enxerga, e o
domínio publicado menos ainda. Antes de concluir qualquer coisa sobre o que está
no ar, conferir:

```
git log --oneline origin/main..HEAD
git status
```

Quem chega e lê só os documentos conclui que o produto está mais adiantado do
que o que está publicado. É a mesma armadilha da seção 5, item 5.
