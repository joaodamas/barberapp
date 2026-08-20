import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { valoresDoPagamento } from "./payments";
import { competenciaDe, decidirCobertura, type Cobertura } from "./mensalistas";
import {
  estornoDaComissaoDeServico,
  idDaComissaoDeCicloNovo,
  idDoEstornoDaComissaoDeServico,
} from "./comissoes";

/**
 * Materialização do evento financeiro do atendimento.
 *
 * O sistema já derivava tudo de `bookings`: receita, comissão e caixa eram
 * recalculados a cada leitura. Isso é correto para indicadores — e errado para
 * histórico, porque a derivação lê o cadastro ATUAL.
 *
 * O sintoma: o barbeiro renegocia de 40% para 50% em setembro e o DRE de agosto
 * passa a mostrar 50%. Fechamento financeiro não pode mudar retroativamente —
 * quebra o acerto com o profissional e a conversa com o contador.
 *
 * Aqui o atendimento concluído vira dois documentos imutáveis: a comissão e o
 * pagamento, com percentual e taxa CONGELADOS no momento da conclusão.
 *
 * MOMENTO DO RECONHECIMENTO: `completed`. Numa barbearia o intervalo entre
 * atender e receber é de minutos, então o produto adota um marco só — o
 * atendimento concluído — em vez de separar regime de caixa e de competência.
 * Consequência conhecida: cliente que paga adiantado e não comparece não gera
 * pagamento aqui; isso entra junto com o evento de no-show.
 *
 * GUARDAR A BASE, NÃO SÓ O RESULTADO: `commissionAmount` sozinho diz quanto foi
 * pago e não como se chegou lá. Com `commissionPct` e `commissionBase` o
 * histórico fica auditável, e a regra pode mudar no futuro sem tornar o passado
 * indecifrável.
 */

export type PaymentMethod = "pix" | "cash" | "debit" | "credit";

/**
 * ONDE o pagamento aconteceu.
 *
 * Vai para o documento de pagamento junto com o método: `payments` é o registro
 * histórico, e precisa responder sobre o evento sem depender de um join com a
 * reserva — que pode ser editada, arquivada ou apagada.
 *
 * Hoje só existe um valor, e é justamente por isso que o campo entra agora: com
 * `online` no futuro, um histórico sem origem não conseguiria separar o que
 * entrou pela maquininha do que entrou pelo app.
 */
export type PaymentOrigin = "in_person" | "online";

/** Taxa por método, como o dono cadastra em Configurações. */
export type PaymentFees = {
  dinheiro: number;
  pix: number;
  debito: number;
  credito: number;
};

export const SEM_TAXA: PaymentFees = { dinheiro: 0, pix: 0, debito: 0, credito: 0 };

/**
 * O padrão da casa para a comissão do barbeiro, em % — D1.
 *
 * ⚠️ PAR OBRIGATÓRIO com `commissionSplit.barberPct` em
 * `web/src/lib/business-rules.ts`. Os dois lados descrevem a MESMA regra e
 * precisam do mesmo número; `functions/` não importa de `web/`, então a
 * duplicação é estrutural e cada lado tem teste que a fixa.
 *
 * Por que a constante entra agora: o web já caía neste 40 quando a barbearia
 * não tinha `policies` (via `PLATFORM_DEFAULT_POLICIES`), e o servidor caía em
 * ZERO. Duas leituras da mesma regra, discordando — e quem paga a diferença é
 * o barbeiro. Dois atendimentos de R$ 50,00 concluídos pela interface em 18/08
 * gravaram `commissionPct: 0` enquanto a tela de Equipe, no mesmo minuto,
 * prometia "o padrão da barbearia (40%)".
 */
export const PADRAO_COMISSAO_BARBEIRO = 40;

/**
 * O percentual padrão desta barbearia, com AUSENTE separado de ZERO.
 *
 * A distinção é o defeito inteiro. O código anterior fazia
 * `Number(policies.commissionSplit?.barberPct) || 0`, e o `||` funde três casos
 * diferentes num só resultado:
 *
 * ```
 * campo ausente      → NaN → 0    ERRADO: é barbearia sem `policies`, e a
 *                                 tela dela promete o padrão da casa
 * campo = 0          → 0   → 0    certo: 0% é escolha legítima do dono
 * campo = 40         → 40  → 40   certo
 * ```
 *
 * `business-rules.ts` já declarava a mesma regra do outro lado — *"`??` e não
 * `||`: 0% de comissão é escolha legítima, não campo vazio"*. O servidor não a
 * seguia.
 *
 * Valor fora de 0–100 cai no padrão em vez de ser usado: um `barberPct` de 150
 * gravado por engano pagaria mais do que o atendimento custou, e o fato nasce
 * CONGELADO — o erro viraria histórico imutável.
 */
export function padraoDaCasa(policies?: {
  commissionSplit?: { barberPct?: unknown };
}): number {
  const bruto = policies?.commissionSplit?.barberPct;
  if (bruto === undefined || bruto === null || bruto === "") return PADRAO_COMISSAO_BARBEIRO;
  const n = Number(bruto);
  if (!Number.isFinite(n) || n < 0 || n > 100) return PADRAO_COMISSAO_BARBEIRO;
  return n;
}

/**
 * As políticas com que uma barbearia NOVA nasce — D1.
 *
 * Gravadas explicitamente na criação, pela mesma razão que `features` já era:
 * *"quando o campo falta, o leitor do servidor precisa adivinhar"*. A ironia do
 * defeito era que `features` foi corrigido e `policies` ficou, três linhas
 * abaixo, no mesmo `tx.set`.
 *
 * **Só `commissionSplit` entra, e a omissão do resto é deliberada.** O
 * levantamento de 18/08 mediu campo a campo: `paymentFees` (zero dos dois
 * lados, e zero é a decisão declarada — *"até o dono preencher, o sistema não
 * inventa custo"*), `openWeekdays`, `booking.*` e `reschedule.*` têm fallback
 * no servidor que coincide com o padrão do web. Copiá-los para cá criaria uma
 * SEGUNDA fonte para regras que o servidor sequer lê, e a próxima divergência
 * nasceria dessa cópia. `commissionSplit.barberPct` era o único que divergia.
 */
export function politicasIniciais() {
  return {
    commissionSplit: {
      barberPct: PADRAO_COMISSAO_BARBEIRO,
      shopPct: 100 - PADRAO_COMISSAO_BARBEIRO,
    },
  };
}

/**
 * O percentual que vale para ESTE profissional — a fonte única do D1.
 *
 * A ordem é a mesma que a tela de Equipe promete: *"Em branco usa o padrão da
 * barbearia"*. O percentual individual vence quando existe, inclusive quando é
 * zero; ausente cai no padrão da casa.
 *
 * Existe como função, e não como expressão repetida, porque a regra estava
 * escrita DUAS vezes — aqui e em `inventory.ts`, para a comissão de produto — e
 * as duas cópias tinham o mesmo defeito. Serviço e produto passam a ler daqui,
 * que é o que o D1 pede: uma fonte só.
 */
export function percentualDaComissao(params: {
  /** `StaffDoc.commissionPct`. Nulo/ausente = "usa o padrão da casa". */
  doProfissional?: unknown;
  padrao: number;
}): number {
  const bruto = params.doProfissional;
  if (bruto === undefined || bruto === null || bruto === "") return params.padrao;
  const n = Number(bruto);
  if (!Number.isFinite(n) || n < 0 || n > 100) return params.padrao;
  return n;
}

/**
 * Taxa exata do instrumento usado.
 *
 * Antes o vocabulário era `pix | cartao | local`, e `cartao` não distinguia
 * débito de crédito: a função precisava supor crédito por precaução, cobrando
 * 3,49% de quem pagou 1,99% no débito. Com o método informado no fechamento, a
 * suposição sai e a taxa é a que a maquininha de fato cobrou.
 */
export function taxaDoMetodo(metodo: PaymentMethod, fees: PaymentFees): number {
  if (metodo === "pix") return Number(fees.pix) || 0;
  if (metodo === "debit") return Number(fees.debito) || 0;
  if (metodo === "credit") return Number(fees.credito) || 0;
  return Number(fees.dinheiro) || 0;
}

/** Arredonda para centavo — evita 0.30000000000000004 no documento. */
export function centavos(valor: number) {
  return Math.round(valor * 100) / 100;
}

/**
 * Decide os valores do evento financeiro — separada do gatilho de propósito.
 *
 * Dentro do trigger, esta lógica só seria verificável com emulador. Aqui ela é
 * função pura: recebe o retrato do momento e devolve o que será congelado.
 *
 * O invariante que ela sustenta: o resultado depende SÓ dos argumentos. Nada
 * aqui relê cadastro, então o documento gravado é reprodutível a partir dos
 * próprios campos — que é o que torna o histórico auditável.
 */
export function calcularEventoFinanceiro(params: {
  valor: number;
  /**
   * Nulo quando o atendimento foi concluído sem informar como o cliente pagou.
   * A interface sempre pergunta, então é caminho de exceção — escrita direta no
   * banco, importação, correção manual.
   */
  metodo: PaymentMethod | null;
  /** Onde o pagamento aconteceu. Reserva antiga, sem o campo, é do balcão. */
  origem?: PaymentOrigin | null;
  /** Percentual do barbeiro. `null`/`undefined` cai no padrão da casa. */
  commissionPctDoBarbeiro?: number | null;
  padraoPct: number;
  fees: PaymentFees;
}) {
  const valor = Number(params.valor) || 0;
  const commissionPct = percentualDaComissao({
    doProfissional: params.commissionPctDoBarbeiro,
    padrao: params.padraoPct,
  });

  /* A conta da TAXA mora em `payments.ts` desde G1.6, e não aqui.
   *
   * Ela passou a ser feita em três lugares — serviço, venda de produto e
   * mensalidade — e três cópias da mesma fórmula é o padrão que esta auditoria
   * mais encontrou: a correção aplicada num caminho só. Delegar mantém uma
   * fonte e deixa os testes desta função continuarem valendo como estão.
   *
   * Sem método, a taxa é DESCONHECIDA, não zero. Materializa assim mesmo, com
   * `paymentMethod: null` explícito: o bruto aconteceu e precisa existir no
   * histórico, e o nulo separa "não teve taxa" de "não sabemos a taxa". */
  const payment = valoresDoPagamento({ bruto: valor, metodo: params.metodo, fees: params.fees });

  return {
    commission: {
      commissionPct,
      commissionBase: valor,
      commissionAmount: centavos((valor * commissionPct) / 100),
    },
    payment: {
      paymentOrigin: params.origem ?? "in_person",
      ...payment,
    },
  };
}

/**
 * Estados para os quais uma conclusão pode ser DESFEITA.
 *
 * A reversão existe para o erro de operação: o dono conclui a reserva errada e
 * precisa voltar atrás, ou descobre que o cliente na verdade faltou. Nesses
 * casos o atendimento não aconteceu, e a comissão e o pagamento precisam sumir.
 *
 * `cancelled_by_client`, `cancelled_by_shop` e `expired` ficam de FORA de
 * propósito — ver `decidirEfeito`.
 */
const VOLTA_A_SER_OPERACIONAL = [
  "pending_payment",
  "confirmed",
  "confirmed_by_client",
  "no_show",
];

export type EfeitoFinanceiro = "materializar" | "reverter" | "nada";

/**
 * O que a mudança de status faz com o fato financeiro.
 *
 * Separada do gatilho porque é a regra que decide se dinheiro registrado
 * continua existindo — e dentro do `onDocumentUpdated` ela só se exercia com
 * emulador.
 *
 * A distinção que a função existe para fazer: **desfazer uma conclusão não é a
 * mesma coisa que cancelar um atendimento que aconteceu.**
 *
 * - Voltar para um estado operacional (`confirmed`, `no_show`…) é correção: o
 *   atendimento não ocorreu, e o fato financeiro tem de sumir junto.
 * - Ir de `completed` para `cancelled_*` é outra coisa: alguém está dizendo que
 *   um atendimento JÁ REALIZADO foi desmarcado, o que é uma contradição. O
 *   dinheiro entrou na gaveta, a comissão foi combinada com o barbeiro, e
 *   apagar os dois faz a receita sumir do DRE, do fluxo e do acerto — em
 *   silêncio, sem tela onde reencontrá-la.
 *
 * Era por esse buraco que o `cancelBooking` sem guarda de status destruía
 * receita consolidada. A guarda foi posta lá; esta é a segunda camada, porque
 * a coleção `bookings` também aceita escrita direta do dono pelas regras.
 *
 * Devolver dinheiro de atendimento realizado é **estorno**, e estorno é evento
 * novo (`refunds`), nunca a remoção do evento anterior. Histórico financeiro se
 * corrige somando, não apagando.
 */
export function decidirEfeito(
  statusAntes: string | undefined,
  statusDepois: string | undefined
): EfeitoFinanceiro {
  if (statusAntes !== "completed" && statusDepois === "completed") return "materializar";
  if (statusAntes === "completed" && statusDepois !== "completed") {
    return VOLTA_A_SER_OPERACIONAL.includes(String(statusDepois)) ? "reverter" : "nada";
  }
  return "nada";
}

/**
 * O que a reserva guarda sobre o próprio ciclo financeiro — P1-7.
 *
 * Existe porque a reversão APAGA o pagamento, e a reconclusão precisa saber o
 * que havia antes para não reconstruir o fato a partir do cadastro de hoje.
 * A comissão não precisa disto — ela deixou de ser apagada —, mas o congelado
 * fica aqui mesmo assim: é o que permite a reconclusão gravar a linha nova sem
 * ter de adivinhar qual documento era o vigente.
 */
export type CicloFinanceiro = {
  /** Id do evento que desfez a conclusão. Presença = a reserva já foi revertida. */
  revertidoEm: string;
  /** CONGELADOS da comissão vigente no momento da reversão. */
  comissao: {
    commissionPct: number;
    commissionBase: number;
    staffId: string;
    uid: string | null;
    staffName: string | null;
  } | null;
  /** CONGELADO do pagamento apagado — o bruto é o do FATO, não o da reserva hoje. */
  pagamento: { grossAmount: number } | null;
  /**
   * Qual documento de comissão está valendo agora.
   *
   * A primeira conclusão grava `comissao_{bookingId}`; cada reconclusão grava um
   * id próprio. Sem guardar qual é o vigente, a SEGUNDA reversão negaria a linha
   * original — que a primeira já negou — e o barbeiro ficaria devendo dinheiro
   * que recebeu uma vez só.
   */
  comissaoVigenteId?: string | null;
};

/**
 * O documento de comissão que está valendo para esta reserva.
 *
 * Sem ciclo anterior é o id clássico, derivado da reserva. Depois de uma
 * reconclusão é o id daquele ciclo — e é por isso que ele é guardado.
 */
function comissaoVigenteRef(
  db: FirebaseFirestore.Firestore,
  barbershopId: string,
  bookingId: string,
  reserva: FirebaseFirestore.DocumentData
) {
  const ciclo = reserva.cicloFinanceiro as CicloFinanceiro | undefined;
  const id = ciclo?.comissaoVigenteId || `comissao_${bookingId}`;
  return db.doc(`barbershops/${barbershopId}/commissions/${id}`);
}

/**
 * A chave do ciclo, derivada do id do evento.
 *
 * O gatilho reprocessa: `event.id` é estável entre as tentativas da MESMA
 * entrega e distinto entre eventos diferentes. É o que faz a linha de estorno
 * ser idempotente **por construção** — a doutrina que o handler já declara para
 * os ids derivados da reserva. Uma chave de relógio ou aleatória gravaria duas
 * linhas negativas num retry e cortaria o acerto do barbeiro pela metade, que é
 * um defeito pior do que o corrigido aqui.
 */
export function chaveDoCiclo(eventId: string | undefined): string {
  const limpa = String(eventId ?? "").replace(/[^A-Za-z0-9_-]/g, "");
  return limpa || "sem-evento";
}

/**
 * Descobre, no momento da conclusão, se o atendimento está coberto — D2.
 *
 * O RETRATO é lido aqui e a DECISÃO é de `decidirCobertura`, que é pura. Esta
 * função só busca os dois dados que ela não tem como inventar: a assinatura
 * ativa do cliente e quantos cortes ela já cobriu na competência.
 *
 * Por que a contagem exclui a própria reserva: o gatilho reprocessa em retry, e
 * na segunda passada a reserva atual já estaria marcada — ela consumiria a
 * própria cota e o quarto corte de um plano de quatro viraria "cota esgotada".
 *
 * As duas consultas filtram em MEMÓRIA o que exigiria índice composto. É a
 * mesma decisão de `gravarComTravaDeHorario`, e pela mesma razão: índice
 * faltando derruba o caminho em produção, e a quantidade por cliente é pequena
 * por natureza.
 */
async function resolverCobertura(params: {
  db: FirebaseFirestore.Firestore;
  barbershopId: string;
  bookingId: string;
  clientId: string;
  date: string;
  valor: number;
  /** O que o dono informou ao concluir — D-3. `null` é o caminho de cobertura. */
  metodoInformado: string | null;
}): Promise<Cobertura> {
  const { db, barbershopId, clientId } = params;
  if (!clientId) return { tipo: "avulso", motivo: "sem_plano", valorCoberto: 0 };

  const shopRef = db.doc(`barbershops/${barbershopId}`);

  /* Mesma consulta que `criarMensalista` usa para barrar a segunda assinatura
   * — e é ela que garante que existe no máximo uma ativa por cliente. */
  const assinaturas = await shopRef
    .collection("subscriptions")
    .where("clientId", "==", clientId)
    .where("status", "==", "ativo")
    .limit(1)
    .get();

  const snap = assinaturas.docs[0];
  if (!snap) return { tipo: "avulso", motivo: "sem_plano", valorCoberto: 0 };

  /* O `id` depois do espalhamento: quem manda é o id do documento, não um campo
   * `id` que alguém tenha gravado dentro dele. A cobertura é casada por esse
   * valor na contagem da cota, e um id de dentro do corpo desalinharia as duas
   * pontas em silêncio. */
  const assinatura = { ...(snap.data() as Record<string, unknown>), id: snap.id } as Parameters<
    typeof decidirCobertura
  >[0]["assinatura"];

  const competencia = competenciaDe(params.date);
  const doCliente = await shopRef.collection("bookings").where("clientId", "==", clientId).get();

  const jaCobertosNaCompetencia = doCliente.docs.filter((d) => {
    if (d.id === params.bookingId) return false;
    const cobertura = d.get("cobertura") as Cobertura | undefined;
    return (
      cobertura?.tipo === "plano" &&
      cobertura.subscriptionId === snap.id &&
      cobertura.competencia === competencia
    );
  }).length;

  return decidirCobertura({
    valor: params.valor,
    data: params.date,
    assinatura,
    jaCobertosNaCompetencia,
    metodoInformado: params.metodoInformado,
  });
}

export const materializeFinancialsOnCompletion = onDocumentUpdated(
  "barbershops/{barbershopId}/bookings/{bookingId}",
  async (event) => {
    const antes = event.data?.before.data();
    const depois = event.data?.after.data();
    if (!antes || !depois) return;

    const { barbershopId, bookingId } = event.params;
    const db = getFirestore();

    /* Ids derivados da reserva: o Firestore reprocessa o gatilho em caso de
     * retry, e `set` no mesmo id sobrescreve em vez de duplicar. Idempotência
     * por construção, não por checagem — que teria corrida entre a leitura e a
     * escrita. */
    const comissaoRef = db.doc(
      `barbershops/${barbershopId}/commissions/comissao_${bookingId}`
    );
    const pagamentoRef = db.doc(
      `barbershops/${barbershopId}/payments/pagamento_${bookingId}`
    );
    const reservaRef = db.doc(`barbershops/${barbershopId}/bookings/${bookingId}`);

    const efeito = decidirEfeito(antes.status, depois.status);

    if (efeito === "reverter") {
      /* Conclusão desfeita: o fato financeiro sai do acerto, mas NÃO some do
       * histórico — P1-7, D-2 fechada em 20/08.
       *
       * O que havia aqui era `comissaoRef.delete()` + `pagamentoRef.delete()`.
       * O gate mediu o preço disso: o par delete+create recriava a comissão
       * lendo `staff.commissionPct` de hoje, e R$ 20,00 viraram R$ 30,00 num
       * atendimento que já tinha acontecido. E como o id do pagamento é
       * derivado, nada duplicava, nada sobrava e nenhuma tela podia notar.
       *
       * Agora a comissão volta somando uma linha negativa — a mesma regra que
       * `refunds.ts:495` já aplicava à venda de produto, com a mesma
       * justificativa, e que o atendimento nunca teve. */
      const chave = chaveDoCiclo(event.id);

      const [comissaoSnap, pagamentoSnap] = await Promise.all([
        comissaoVigenteRef(db, barbershopId, bookingId, depois).get(),
        pagamentoRef.get(),
      ]);

      const congelado: CicloFinanceiro = {
        revertidoEm: chave,
        comissao: comissaoSnap.exists
          ? {
              commissionPct: Number(comissaoSnap.get("commissionPct")) || 0,
              commissionBase: Number(comissaoSnap.get("commissionBase")) || 0,
              staffId: String(comissaoSnap.get("staffId") ?? ""),
              uid: (comissaoSnap.get("uid") ?? null) as string | null,
              staffName: (comissaoSnap.get("staffName") ?? null) as string | null,
            }
          : null,
        /* O BRUTO do fato, não o `value` da reserva. Sem isto a reconclusão lê
         * `depois.value` de agora: editar o preço do serviço entre as duas
         * conclusões faria o "mesmo" pagamento renascer com outro bruto, e nada
         * registraria a troca. */
        pagamento: pagamentoSnap.exists
          ? { grossAmount: Number(pagamentoSnap.get("grossAmount")) || 0 }
          : null,
      };

      await Promise.all([
        /* A linha negativa. Id derivado da reserva E do evento: um retry da
         * mesma entrega sobrescreve em vez de somar duas vezes. */
        comissaoSnap.exists && congelado.comissao?.staffId
          ? db
              .doc(
                `barbershops/${barbershopId}/commissions/` +
                  idDoEstornoDaComissaoDeServico(bookingId, chave)
              )
              .set({
                ...estornoDaComissaoDeServico({
                  bookingId,
                  chave,
                  staffId: congelado.comissao.staffId,
                  uid: congelado.comissao.uid,
                  staffName: congelado.comissao.staffName,
                  date: String(depois.date ?? ""),
                  commissionPct: congelado.comissao.commissionPct,
                  commissionBase: congelado.comissao.commissionBase,
                  commissionAmount: Number(comissaoSnap.get("commissionAmount")) || 0,
                }),
                createdAt: FieldValue.serverTimestamp(),
              })
          : Promise.resolve(),

        /* O PAGAMENTO continua sendo apagado — D-2, segunda pergunta.
         *
         * Receita realizada de um atendimento que o dono acabou de dizer que
         * não aconteceu não pode ficar de pé no caixa e no DRE. Mas o fato é
         * preservado antes, para a reconclusão não o reinventar. */
        pagamentoRef.delete().catch(() => undefined),

        /* A cobertura sai junto — D2. Ela consumiu uma vaga da cota do mês, e
         * desfazer a conclusão precisa devolver essa vaga: senão o cliente de
         * um plano de quatro cortes perde um deles para um atendimento que o
         * dono já disse que não aconteceu. */
        /* `paymentMethod` sai junto com a cobertura.
         *
         * A perna de reversão apagava `cobertura` e deixava o método para trás:
         * a reserva ficava "Não compareceu" exibindo "Crédito" na coluna
         * Pagamento, sem pagamento nenhum no banco. Divergência
         * booking × payment criada pelo produto — exatamente a que a decisão B
         * do R1 declara impossível —, e permanente se ninguém concluir de novo.
         *
         * `null` e não `delete`: é o estado com que a reserva nasce
         * (`booking.ts`), e a tela já sabe lê-lo como "a pagar no salão". */
        reservaRef
          .set(
            {
              cobertura: FieldValue.delete(),
              paymentMethod: null,
              cicloFinanceiro: congelado,
            },
            { merge: true }
          )
          .catch(() => undefined),
      ]);
      return;
    }

    if (efeito === "nada") {
      /* Sair de `completed` para um estado de cancelamento é contradição, e o
       * fato financeiro FICA. O aviso existe porque nenhum caminho do produto
       * deveria produzir isso: se aparecer no log, é escrita direta no banco ou
       * uma tela nova sem guarda. */
      if (antes.status === "completed" && depois.status !== "completed") {
        console.warn(
          `[financeiro] ${bookingId}: "${antes.status}" → "${depois.status}" ` +
            `não reverte o fato financeiro. O atendimento aconteceu; devolver ` +
            `valor de atendimento realizado é estorno, não cancelamento.`
        );
      }
      return;
    }

    /* Esta reserva já teve conclusão desfeita? — P1-7.
     *
     * A presença do ciclo separa duas operações que hoje compartilham botão,
     * modal e escrita: concluir um atendimento NOVO, e reconcluir um que já
     * produziu fato financeiro antes. A segunda não pode reconstruir o passado
     * a partir do cadastro de agora. */
    const ciclo = depois.cicloFinanceiro as CicloFinanceiro | undefined;
    const reconclusao = Boolean(ciclo?.revertidoEm);

    /* O bruto do FATO. `depois.value` é o preço da reserva HOJE, e ele pode ter
     * sido editado entre as duas conclusões. */
    const valor = reconclusao && ciclo?.pagamento
      ? ciclo.pagamento.grossAmount
      : Number(depois.value) || 0;
    const metodo = (depois.paymentMethod ?? null) as PaymentMethod | null;
    const staffId = String(depois.staffId ?? "");
    const date = String(depois.date ?? "");

    /* Lidos AGORA e congelados: é este o ponto do arquivo inteiro. Depois desta
     * escrita, nada relê `staff` nem `policies` para reconstruir estes valores. */
    const [shopSnap, staffSnap] = await Promise.all([
      db.doc(`barbershops/${barbershopId}`).get(),
      staffId
        ? db.doc(`barbershops/${barbershopId}/staff/${staffId}`).get()
        : Promise.resolve(null),
    ]);

    const policies = (shopSnap.get("policies") ?? {}) as {
      commissionSplit?: { barberPct?: number };
      paymentFees?: Partial<PaymentFees>;
    };

    const fees: PaymentFees = { ...SEM_TAXA, ...(policies.paymentFees ?? {}) };
    const padraoPct = padraoDaCasa(policies);

    /* O PERCENTUAL DO BARBEIRO — o coração do P1-7.
     *
     * Numa reconclusão ele sai do documento congelado, nunca do cadastro. Quem
     * renegociou de 40% para 60% entre as duas conclusões não pode ver o acerto
     * de um atendimento passado subir sozinho; e o barbeiro que renegociou para
     * MENOS não pode perder o que já tinha ganhado. É a mesma razão que
     * `comissoes.ts:164` já dava para o estorno de venda — *"congelado do
     * documento original, nunca relido do cadastro"* —, aplicada à porta que
     * faltava.
     *
     * `padraoPct` continua sendo o de hoje de propósito: ele só é consultado
     * quando o barbeiro não tem percentual próprio, e nesse caminho o valor
     * congelado já vem resolvido em `commissionPct`. */
    const pctCongelado = reconclusao ? ciclo?.comissao?.commissionPct ?? null : null;

    const { commission, payment } = calcularEventoFinanceiro({
      valor,
      metodo,
      origem: (depois.paymentOrigin ?? null) as PaymentOrigin | null,
      // Gravado como `null` no cadastro inicial, não ausente.
      commissionPctDoBarbeiro: pctCongelado ?? staffSnap?.get("commissionPct") ?? null,
      padraoPct,
      fees,
    });

    /* A cobertura já decidida MANDA — D2.
     *
     * Reprocessamento não redecide: a cobertura é congelada como o percentual e
     * a taxa. Redecidir a cada retry faria o mesmo atendimento sair coberto
     * numa passada e cobrado na outra, conforme o estado da assinatura no
     * instante do retry. */
    const cobertura =
      (depois.cobertura as Cobertura | undefined) ??
      (await resolverCobertura({
        db,
        barbershopId,
        bookingId,
        clientId: String(depois.clientId ?? ""),
        date,
        valor,
        /* D-3 · o que o dono informou entra na decisão. Método preenchido é
         * afirmação de que houve dinheiro, e ela vence a cobertura do plano. */
        metodoInformado: metodo,
      }));

    const coberto = cobertura.tipo === "plano";

    /* Onde a comissão deste ciclo é gravada.
     *
     * A primeira conclusão usa o id derivado da reserva, como sempre. A
     * reconclusão **não pode** reusá-lo: a linha original já foi negada pelo
     * estorno, e sobrescrevê-la deixaria o saldo do barbeiro em zero sobre um
     * atendimento que aconteceu. Id novo por ciclo, derivado do evento — logo,
     * idempotente no retry. */
    const chaveDesteCiclo = chaveDoCiclo(event.id);
    const comissaoDoCicloRef = reconclusao
      ? db.doc(
          `barbershops/${barbershopId}/commissions/` +
            idDaComissaoDeCicloNovo(bookingId, chaveDesteCiclo)
        )
      : comissaoRef;

    await Promise.all([
      /* O fato do atendimento passa a dizer como foi liquidado.
       *
       * Vai para a RESERVA, e não só para o pagamento, porque no caso coberto
       * não existe pagamento — e um fato que só se descreve pela ausência de
       * outro documento não é descrição nenhuma. */
      reservaRef.set(
        {
          cobertura,
          /* Qual linha passa a valer, para a PRÓXIMA reversão negar a certa. */
          ...(reconclusao
            ? { cicloFinanceiro: { ...ciclo, comissaoVigenteId: comissaoDoCicloRef.id } }
            : {}),
        },
        { merge: true }
      ),
      comissaoDoCicloRef.set({
        bookingId,
        staffId,
        /* O barbeiro lê a própria comissão pela regra `resource.data.uid ==
         * request.auth.uid`. Sem vínculo de conta fica nulo, e só o dono vê. */
        uid: staffSnap?.get("uid") ?? null,
        staffName: depois.staffName ?? null,
        date,
        origin: "servico",
        /* O acerto do barbeiro precisa saber que este corte não trouxe dinheiro
         * novo — D2. Sem a marca, "comissão de agosto" e "receita de serviço de
         * agosto" ficam sem como se explicar uma à outra no mês de um cliente
         * Ilimitado.
         *
         * ⚠️ DECISÃO PENDENTE, e o produto está pagando comissão CHEIA sobre
         * atendimento coberto. Preservar o fato é o comportamento reversível —
         * o corte aconteceu e o barbeiro trabalhou —, mas dez cortes de R$ 50,00
         * num plano de R$ 149,00 geram R$ 200,00 de comissão sobre R$ 149,00
         * recebidos. Zerar em silêncio seria pior: recriaria, por outra porta,
         * exatamente o F1 que este mesmo commit corrige — a tela prometendo 40%
         * e o fato nascendo zero. Com a marca gravada, qualquer das três
         * políticas (cheia, zero, ou rateio da mensalidade) é aplicável depois
         * sem perder informação. */
        cobertoPeloPlano: coberto,
        ...commission,
        createdAt: FieldValue.serverTimestamp(),
      }),
      /* COBERTO PELO PLANO NÃO GERA PAGAMENTO — D2, e é o coração do achado.
       *
       * A mensalidade já é a receita do plano, e ela tem lastro próprio:
       * `pagamento_fatura_{invoiceId}`, materializado quando a fatura é
       * quitada. Criar um pagamento aqui também somaria o mesmo dinheiro duas
       * vezes — foi assim que o DRE de 18/08 exibiu `Serviços avulsos
       * R$ 100,00` e `Mensalidades recebidas R$ 149,00` do mesmo cliente no
       * mesmo dia.
       *
       * O `delete` cobre a reconclusão: um atendimento concluído como avulso e
       * depois reconhecido como coberto tem de perder o pagamento que já
       * existe. Deixá-lo seria receita fantasma sem tela onde reencontrá-la. */
      coberto
        ? pagamentoRef.delete().catch(() => undefined)
        : pagamentoRef.set({
            /* G1.6 declarou `PaymentDoc.origin` e deu o campo às três origens —
             * menos a esta, que já existia e passou despercebida. O serviço, que
             * é a maior fonte de receita, nascia sem dizer de onde veio.
             *
             * Achado ao ler o documento gravado durante a verificação do
             * estorno: `origin: undefined` num pagamento recém-materializado.
             * Nenhum teste apontava para lá, porque nenhum ainda precisava
             * separar receita por origem — e a Rodada 3.2 precisa. */
            origin: "servico" as const,
            bookingId,
            clientId: depois.clientId ?? null,
            date,
            ...payment,
            createdAt: FieldValue.serverTimestamp(),
          }),
    ]);
  }
);
