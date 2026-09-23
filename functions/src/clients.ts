import { FieldValue, type Firestore, type Transaction } from "firebase-admin/firestore";

/**
 * O cliente da barbearia — `barbershops/{id}/clients/{clientId}`.
 *
 * ## Por que existe
 *
 * O cliente era derivado de `bookings`: nome e WhatsApp copiados dentro de cada
 * reserva, sem nada que ligasse duas visitas da mesma pessoa. Quem chega pelo
 * balcão — que é a maior parte de uma barbearia real — não tinha onde nascer.
 *
 * ## A decisão de identidade, e por que ela é conservadora
 *
 * O id do documento **é o uid quando o cliente tem conta**, e um id gerado
 * quando não tem:
 *
 * ```
 * com conta   clients/{uid}          uid: "abc"   origin: "app"
 * sem conta   clients/{gerado}       uid: null    origin: "balcao"
 * ```
 *
 * Isso não é elegância: é a única forma de acrescentar a entidade sem redefinir
 * o significado de `bookings.clientId`, que hoje é o **uid** em nove pontos do
 * sistema — dois deles regras do Firestore
 * (`resource.data.clientId == request.auth.uid`), dois deles guardas de
 * `rescheduleBooking` e `cancelBooking`, e dois deles testes que falham se o
 * contrato mudar.
 *
 * Com `clients/{uid}`, referência e identidade coincidem para quem tem conta, e
 * a regra continua valendo **sem alteração e sem migração**.
 *
 * ### A consequência, declarada
 *
 * A reserva de balcão tem `clientId` que **nenhum `request.auth.uid` iguala**.
 * Ela é lida por quem toca a barbearia (`isStaffOf`) e por mais ninguém — o que
 * é correto, e é também um limite: se o cliente de balcão criar conta depois,
 * ele **não vê o histórico anterior** no app até que haja fusão. Está registrado
 * aqui de propósito, para não virar surpresa.
 *
 * ## O que este módulo NÃO é
 *
 * Não é CRM. Não há score, segmentação, histórico calculado nem preferência
 * declarada. O blueprint chama esses de **derivados, nunca gravados** — visitas,
 * ticket médio, risco de perda saem de `bookings`, e continuam saindo.
 */

export type OrigemDoCliente = "app" | "balcao" | "importacao";

export type ClientDoc = {
  /** Conta no app. **Nulo para quem chega no balcão** — é o caso normal. */
  uid: string | null;
  name: string;
  /** Só dígitos, com DDD. Chave de deduplicação da barbearia. */
  whatsapp: string;
  origin: OrigemDoCliente;
  active: boolean;
  /**
   * Para onde este cadastro foi fundido, quando a mesma pessoa apareceu depois
   * com conta no app. Nulo no caso normal.
   */
  mergedInto?: string | null;
  /** Indício, não decisão: cadastro de balcão com o mesmo WhatsApp. */
  mesmoNumeroQue?: string;
};

/** Só dígitos. "(11) 98888-7777" e "11988887777" são a mesma pessoa. */
export function normalizarWhatsapp(bruto: unknown): string {
  return String(bruto ?? "").replace(/\D/g, "");
}

/**
 * O WhatsApp serve como chave?
 *
 * Sem ele não há deduplicação possível, e dois atendimentos da mesma pessoa
 * viram dois cadastros. Um número curto demais é digitação incompleta, não um
 * cliente — e gravá-lo criaria uma chave que colide com a próxima digitação
 * incompleta de outra pessoa.
 *
 * Dez dígitos é fixo com DDD; onze é celular com o 9.
 */
export function whatsappServeComoChave(whatsapp: string): boolean {
  return /^\d{10,13}$/.test(whatsapp);
}

/**
 * Nome exibível, sem inventar identidade.
 *
 * "Cliente" é o que o `createBooking` já usava como último recurso. Ele é
 * honesto: diz que a pessoa existe e que o nome não foi informado — o que é
 * diferente de gravar uma string vazia, que a tela renderiza como um buraco.
 */
export function nomeDoCliente(bruto: unknown): string {
  const limpo = String(bruto ?? "").trim().replace(/\s+/g, " ");
  return limpo || "Cliente";
}

/**
 * Localiza o cadastro ativo de um WhatsApp nesta barbearia.
 *
 * Roda DENTRO da transação de quem chama: procurar fora dela deixaria duas
 * criações simultâneas do mesmo número passarem pela mesma checagem e gravarem
 * dois cadastros — que é justamente o que a invariante proíbe.
 */
export async function acharClientePorWhatsapp(params: {
  tx: Transaction;
  db: Firestore;
  barbershopId: string;
  whatsapp: string;
  /**
   * Só cadastros de balcão (`uid: null`). É o que o BALCÃO usa: o número de
   * uma conta de app foi digitado pela própria pessoa, sem verificação, e
   * reusar esse cadastro entregaria ao dono da conta a reserva de quem ligou
   * — com nome, horário e o poder de cancelar (rodada E2E de 23/09).
   */
  soDeBalcao?: boolean;
}): Promise<{ id: string; dados: ClientDoc } | null> {
  if (!whatsappServeComoChave(params.whatsapp)) return null;

  const encontrados = await params.tx.get(
    params.db
      .collection(`barbershops/${params.barbershopId}/clients`)
      .where("whatsapp", "==", params.whatsapp)
      .limit(5)
  );

  /* `active !== false` e não `active === true`: cadastro anterior ao campo não
   * o tem, e tratá-lo como inativo criaria um segundo cadastro para alguém que
   * já existe — o oposto do que esta função serve para evitar. */
  const vivo = encontrados.docs.find(
    (d) => d.data().active !== false && (!params.soDeBalcao || !d.data().uid)
  );
  return vivo ? { id: vivo.id, dados: vivo.data() as ClientDoc } : null;
}

/**
 * Resolve o cliente da reserva, em DUAS FASES.
 *
 * ## Por que duas, e não uma função que faz tudo
 *
 * Uma transação do Firestore exige **todas as leituras antes de qualquer
 * escrita**. Uma `garantirCliente` que lesse e gravasse de uma vez teria que ser
 * chamada antes das outras leituras da transação de reserva — a contagem de
 * ativas e a checagem de conflito de horário — e a primeira delas explodiria em
 * runtime, depois de o código já ter passado por typecheck e testes puros.
 *
 * Então: `resolverCliente` **só lê** e devolve o id junto com a escrita
 * pendente; quem chama executa `gravar` no fim, ao lado do `tx.set` da reserva.
 *
 * O id já é conhecido na fase de leitura porque nada nele depende de escrever:
 * com conta ele é o uid, sem conta ele é o id do cadastro achado, e sem cadastro
 * é um id novo — que o Firestore gera no cliente, sem ida ao servidor.
 *
 * ## Os três caminhos
 *
 * | Quem | Id | O que acontece |
 * |---|---|---|
 * | tem conta | `uid` | cria ou atualiza `clients/{uid}` |
 * | balcão, número conhecido | o que já existe | **reusa**, não duplica |
 * | balcão, número novo | gerado | cria com `uid: null` |
 *
 * ## Sem fusão por telefone
 *
 * Até 23/09, quem aparecia com conta e o mesmo WhatsApp de um cliente de
 * balcão absorvia o cadastro dele (`active: false`, `mergedInto`). Como o
 * número não é verificado, isso era sequestro de identidade. Agora os dois
 * cadastros convivem; o de conta ganha `mesmoNumeroQue` como indício, e o
 * balcão só reusa cadastro de balcão. `mergedInto` antigo continua sendo
 * lido (histórico e LGPD).
 */
export async function resolverCliente(params: {
  tx: Transaction;
  db: Firestore;
  barbershopId: string;
  uid: string | null;
  name: unknown;
  whatsapp: unknown;
  origin: OrigemDoCliente;
}): Promise<{ id: string; gravar: (tx: Transaction) => void }> {
  const clientes = params.db.collection(`barbershops/${params.barbershopId}/clients`);
  const whatsapp = normalizarWhatsapp(params.whatsapp);
  const name = nomeDoCliente(params.name);

  /* ---- FASE DE LEITURA ---- */
  const existente = await acharClientePorWhatsapp({
    tx: params.tx,
    db: params.db,
    barbershopId: params.barbershopId,
    whatsapp,
    soDeBalcao: !params.uid,
  });

  /* Com conta o id é o uid, e é isso que mantém as regras do Firestore válidas
   * sem alteração: `resource.data.clientId == request.auth.uid` continua
   * verdadeiro porque referência e identidade coincidem. */
  if (params.uid) {
    const jaEraEu = existente?.id === params.uid;
    /* SEM fusão automática. Ela acontecia pelo WhatsApp que a pessoa digitou,
     * sem verificação nenhuma: qualquer conta que informasse o número de um
     * cliente de balcão absorvia o cadastro dele — e, com ele, as próximas
     * reservas do balcão, os carimbos e a leitura dos pagamentos. Quando era
     * a pessoa certa, a fusão ainda deixava o plano de mensalista e os
     * carimbos presos no cadastro antigo (rodada E2E de 23/09).
     *
     * O número em comum fica registrado como INDÍCIO para o dono conferir,
     * nunca como decisão. */
    const mesmoNumeroQue =
      existente && !jaEraEu && !existente.dados.uid ? existente.id : null;

    return {
      id: params.uid,
      gravar: (tx) => {
        tx.set(
          clientes.doc(params.uid as string),
          {
            uid: params.uid,
            name,
            /* Só grava WhatsApp que sirva de chave. Um número pela metade
             * sobrescreveria o bom que já estava lá. */
            ...(whatsappServeComoChave(whatsapp) ? { whatsapp } : {}),
            origin: params.origin,
            active: true,
            ...(mesmoNumeroQue ? { mesmoNumeroQue } : {}),
            /* Quem foi anonimizado a pedido e volta a agendar com a conta é um
             * tratamento NOVO: o selo sai junto com a volta do nome, senão o
             * cadastro afirmaria "anonimizado" com o nome escrito ao lado. Ver
             * `docs/LGPD-DIREITOS-DO-TITULAR.md` §3.2. */
            anonimizadoEm: FieldValue.delete(),
            anonimizadoPor: FieldValue.delete(),
            updatedAt: FieldValue.serverTimestamp(),
            /* `createdAt` só na criação. Reescrevê-lo a cada reserva
             * transformaria "cliente desde" em "última visita". */
            ...(jaEraEu ? {} : { createdAt: FieldValue.serverTimestamp() }),
          },
          { merge: true }
        );
      },
    };
  }

  /* ---- Balcão: reusa quem já existe pelo número ---- */
  if (existente) {
    return {
      id: existente.id,
      gravar: (tx) => {
        tx.update(clientes.doc(existente.id), {
          /* O nome pode ter sido "Cliente" na primeira vez. Atualiza quando
           * vier um de verdade, e nunca troca um nome bom por um genérico. */
          ...(name === "Cliente" ? {} : { name }),
          active: true,
          updatedAt: FieldValue.serverTimestamp(),
        });
      },
    };
  }

  /* `.doc()` sem argumento gera o id localmente — não é ida ao servidor, e por
   * isso pode acontecer na fase de leitura sem violar a regra da transação. */
  const novo = clientes.doc();
  return {
    id: novo.id,
    gravar: (tx) => {
      tx.set(novo, {
        uid: null,
        name,
        whatsapp,
        origin: params.origin,
        active: true,
        mergedInto: null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    },
  };
}
