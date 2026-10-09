import { FieldValue, getFirestore, type Firestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { exigirEdicao, vinculosDe } from "./acesso";
import { nomeDoCliente, type ClientDoc } from "./clients";

/**
 * Vincular o cadastro de BALCÃO à CONTA da mesma pessoa (02/10).
 *
 * Pedido do dono: o cliente que o barbeiro cadastrou na mão, quando cria a
 * conta, tem de encontrar o próprio histórico — e não pode virar dois
 * clientes.
 *
 * ## Por que não pelo número digitado
 *
 * Até 23/09 a fusão acontecia pelo WhatsApp que a pessoa DIGITAVA na reserva.
 * Ninguém verifica esse número: qualquer conta que informasse o número de um
 * cliente de balcão levava as reservas, os carimbos e os pagamentos dele
 * (`clients.ts`, "Sem fusão por telefone"). Aqui só há duas provas aceitas:
 *
 * | via    | a prova                                                        |
 * |--------|----------------------------------------------------------------|
 * | `sms`  | a conta entrou por SMS: `token.phone_number` foi verificado pelo Firebase |
 * | `dono` | o dono (ou equipe com edição) conferiu os dois cadastros e confirmou |
 *
 * Conta de e-mail ou Google com o mesmo número continua só com o indício
 * (`mesmoNumeroQue`), esperando o dono.
 *
 * ## O que vai junto
 *
 * Tudo o que guarda `clientId` (lista em `COLECOES_DO_CLIENTE`). A fusão
 * antiga marcava o cadastro velho e deixava o plano de mensalista e os
 * carimbos presos nele — o cliente "perdia" o plano ao criar a conta.
 *
 * ## Ordem, e por que ela aguenta queda no meio
 *
 * 1. move os documentos, em lotes (pode passar de 500 — fora de transação);
 * 2. numa transação, confere de novo e marca o de balcão como `mergedInto`.
 *
 * Se cair entre 1 e 2, rodar de novo acha o que faltou (a consulta é por
 * `clientId == de`) e termina. Rodar depois de terminado não faz nada.
 */

/** Toda coleção da barbearia que guarda `clientId`. Achadas por `git grep clientId functions/src`. */
export const COLECOES_DO_CLIENTE = [
  "bookings",
  "subscriptions",
  "subscription_invoices",
  "loyalty_transactions",
  "client_occurrences",
  "payments",
  "refunds",
  "inventory_movements",
  "conflitos_horario_fixo",
] as const;

const TAMANHO_DO_LOTE = 400;

/**
 * O telefone em dígitos NACIONAIS (DDD + número), sem o 55.
 *
 * `token.phone_number` chega em E.164 ("+5511988887777"); o cadastro guarda
 * "11988887777". Nulo quando não é um telefone brasileiro completo.
 */
export function digitosNacionais(bruto: unknown): string | null {
  let d = String(bruto ?? "").replace(/\D/g, "");
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  return /^\d{10,11}$/.test(d) ? d : null;
}

/**
 * Os dois são o mesmo telefone?
 *
 * Igual nos dígitos nacionais, ou o mesmo CELULAR com e sem o nono dígito —
 * cadastro antigo guardou "1188887777" para quem hoje é "11988887777". Só
 * celular: número de 8 dígitos começando por 2 a 5 é fixo, e "1133334444" não
 * é a mesma linha que "11933334444".
 */
export function mesmoTelefone(a: unknown, b: unknown): boolean {
  const x = digitosNacionais(a);
  const y = digitosNacionais(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [curto, longo] = x.length < y.length ? [x, y] : [y, x];
  if (curto.length !== 10 || longo.length !== 11) return false;
  const ddd = curto.slice(0, 2);
  const local = curto.slice(2);
  return /^[6-9]/.test(local) && longo === `${ddd}9${local}`;
}

/** As formas em que o telefone pode estar gravado em `clients.whatsapp`. */
export function formasDoTelefone(bruto: unknown): string[] {
  const d = digitosNacionais(bruto);
  if (!d) return [];
  const formas = new Set([d]);
  if (d.length === 11 && d[2] === "9" && /^[6-9]/.test(d.slice(3))) formas.add(d.slice(0, 2) + d.slice(3));
  if (d.length === 10 && /^[6-9]/.test(d.slice(2))) formas.add(`${d.slice(0, 2)}9${d.slice(2)}`);
  for (const f of [...formas]) formas.add(`55${f}`);
  return [...formas];
}

type Cadastro = Pick<ClientDoc, "uid" | "name" | "whatsapp" | "active" | "mergedInto">;

export type DecisaoDoVinculo =
  | { vincular: true }
  | { vincular: false; jaVinculado: boolean; motivo: string };

/**
 * Pode vincular `de` (balcão) em `para` (conta)?
 *
 * Nunca: de balcão que já tem conta (seriam duas pessoas), de balcão já
 * fundido em OUTRO, ou destino sem conta.
 */
export function decidirVinculo(params: {
  deId: string;
  de: Cadastro | null;
  paraId: string;
  para: Cadastro | null;
}): DecisaoDoVinculo {
  const { deId, de, paraId, para } = params;
  if (!de) return { vincular: false, jaVinculado: false, motivo: "Cadastro de balcão não encontrado." };
  if (deId === paraId) return { vincular: false, jaVinculado: false, motivo: "É o mesmo cadastro." };
  if (de.mergedInto === paraId) return { vincular: false, jaVinculado: true, motivo: "Já vinculado." };
  if (de.mergedInto) return { vincular: false, jaVinculado: false, motivo: "Esse cadastro já foi vinculado a outra conta." };
  if (de.uid) return { vincular: false, jaVinculado: false, motivo: "Esse cadastro já é de uma conta." };
  if (para && para.uid !== paraId) {
    return { vincular: false, jaVinculado: false, motivo: "O destino não é uma conta do app." };
  }
  return { vincular: true };
}

export type ResultadoDoVinculo = {
  vinculado: boolean;
  jaVinculado: boolean;
  movidos: Record<string, number>;
  motivo?: string;
};

/**
 * O núcleo, usado pelas duas portas. Recebe `db` para rodar no emulador.
 *
 * `paraUid` é o uid da conta e o id do cadastro dela (`clients/{uid}`). Se o
 * cadastro da conta ainda não existe (entrou por SMS e nunca marcou), ele
 * nasce aqui com o nome e o telefone do balcão — "já puxar os dados".
 */
export async function vincularCadastros(params: {
  db: Firestore;
  barbershopId: string;
  deId: string;
  paraUid: string;
  via: "sms" | "dono";
  por: string;
  /** Telefone provado (via sms): vira o WhatsApp do cadastro da conta. */
  telefoneProvado?: string | null;
}): Promise<ResultadoDoVinculo> {
  const { db, barbershopId, deId, paraUid, via, por } = params;
  const shopRef = db.doc(`barbershops/${barbershopId}`);
  const deRef = shopRef.collection("clients").doc(deId);
  const paraRef = shopRef.collection("clients").doc(paraUid);

  const [deSnap, paraSnap] = await Promise.all([deRef.get(), paraRef.get()]);
  const de = deSnap.exists ? (deSnap.data() as Cadastro) : null;
  const para = paraSnap.exists ? (paraSnap.data() as Cadastro) : null;
  const decisao = decidirVinculo({ deId, de, paraId: paraUid, para });
  if (!decisao.vincular) {
    return { vinculado: false, jaVinculado: decisao.jaVinculado, movidos: {}, motivo: decisao.motivo };
  }

  /* ---- 1. Move, em lotes ---- */
  const movidos: Record<string, number> = {};
  for (const colecao of COLECOES_DO_CLIENTE) {
    const snap = await shopRef.collection(colecao).where("clientId", "==", deId).get();
    movidos[colecao] = snap.size;
    for (let i = 0; i < snap.docs.length; i += TAMANHO_DO_LOTE) {
      const lote = db.batch();
      for (const d of snap.docs.slice(i, i + TAMANHO_DO_LOTE)) {
        lote.update(d.ref, { clientId: paraUid, vinculadoDe: deId });
      }
      await lote.commit();
    }
  }

  /* ---- 2. Marca, conferindo de novo ---- */
  await db.runTransaction(async (tx) => {
    const [deAgora, paraAgora] = await Promise.all([tx.get(deRef), tx.get(paraRef)]);
    const nova = decidirVinculo({
      deId,
      de: deAgora.exists ? (deAgora.data() as Cadastro) : null,
      paraId: paraUid,
      para: paraAgora.exists ? (paraAgora.data() as Cadastro) : null,
    });
    if (!nova.vincular) return;

    const deDados = deAgora.data() as Cadastro;
    const paraDados = paraAgora.exists ? (paraAgora.data() as Cadastro & { mesmoNumeroQue?: string }) : null;
    const nomeDaConta = nomeDoCliente(paraDados?.name);
    const nomeDoBalcao = nomeDoCliente(deDados.name);
    const whatsapp = params.telefoneProvado ?? paraDados?.whatsapp ?? deDados.whatsapp ?? "";

    tx.update(deRef, {
      active: false,
      mergedInto: paraUid,
      vinculadoEm: FieldValue.serverTimestamp(),
      vinculadoPor: por,
      via,
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(
      paraRef,
      {
        uid: paraUid,
        /* O nome de quem atende há meses é melhor que "Cliente". */
        name: nomeDaConta === "Cliente" ? nomeDoBalcao : nomeDaConta,
        whatsapp,
        active: true,
        /* A conta passa a ser A pessoa daquele número: o balcão pode reusá-la
         * (`acharClientePorWhatsapp`). Trocar o WhatsApp depois desliga isto.
         *
         * SÓ com prova (09/10). Pelo caminho do dono, o número é o que a
         * própria conta digitou numa reserva — o dono confirma que é a mesma
         * PESSOA, não que a conta controla a linha. Marcar confirmado ali
         * fazia o balcão passar a entregar reservas de quem liga a quem
         * apenas digitou o número. O dono ganha marca própria
         * (`vinculadoPeloDono`): o balcão reaproveita a conta pelo número, sem
         * que isso valha como telefone provado. */
        ...(via === "sms" ? { telefoneConfirmado: true } : { vinculadoPeloDono: true }),
        ...(paraDados ? {} : { origin: "app", createdAt: FieldValue.serverTimestamp() }),
        ...(paraDados?.mesmoNumeroQue === deId ? { mesmoNumeroQue: FieldValue.delete() } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });

  return { vinculado: true, jaVinculado: false, movidos };
}

/**
 * Porta do DONO: Clientes → "Mesmo número de … — Vincular".
 *
 * Exige o mesmo telefone nos dois cadastros: o dono confirma que é a mesma
 * pessoa, mas não escolhe duas pessoas quaisquer para juntar.
 */
export const vincularCadastroDeBalcao = onCall<{
  barbershopId: string;
  deClientId: string;
  paraClientId: string;
}>(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Entre na sua conta.");
  const barbershopId = String(request.data?.barbershopId ?? "");
  const deId = String(request.data?.deClientId ?? "").trim();
  const paraId = String(request.data?.paraClientId ?? "").trim();
  if (!barbershopId || !deId || !paraId) {
    throw new HttpsError("invalid-argument", "Informe os dois cadastros.");
  }
  const papel = vinculosDe(request)?.[barbershopId];
  /* Juntar dois cadastros move o histórico, a fidelidade e as faturas de um
   * para o outro — é a porta do DONO, como diz o nome (08/10). */
  if (papel !== "owner") {
    throw new HttpsError("permission-denied", "Só o dono da barbearia vincula cadastros.");
  }
  await exigirEdicao(barbershopId);

  const db = getFirestore();
  const clientes = db.collection(`barbershops/${barbershopId}/clients`);
  const [de, para] = await Promise.all([clientes.doc(deId).get(), clientes.doc(paraId).get()]);
  if (!de.exists || !para.exists) throw new HttpsError("not-found", "Cadastro não encontrado.");
  if (!mesmoTelefone(de.get("whatsapp"), para.get("whatsapp"))) {
    throw new HttpsError("failed-precondition", "Os dois cadastros não têm o mesmo telefone.");
  }

  const r = await vincularCadastros({ db, barbershopId, deId, paraUid: paraId, via: "dono", por: uid });
  if (!r.vinculado && !r.jaVinculado) throw new HttpsError("failed-precondition", r.motivo ?? "Não foi possível vincular.");
  return r;
});

/**
 * Porta da CONTA: chamada pelo app quando quem entrou tem telefone verificado
 * por SMS. Acha os cadastros de balcão daquele número nesta barbearia e traz
 * tudo para a conta. Sem telefone verificado no token, não faz nada.
 */
export const vincularMinhaContaPeloTelefone = onCall<{ barbershopId: string }>(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Entre na sua conta.");
  const barbershopId = String(request.data?.barbershopId ?? "");
  if (!barbershopId) throw new HttpsError("invalid-argument", "Barbearia não informada.");

  /* `phone_number` só existe no token depois que o Firebase confirmou o
   * código por SMS. É a prova — o resto da conta (nome, e-mail) não é. */
  const telefone = digitosNacionais(request.auth?.token.phone_number);
  if (!telefone) return { vinculados: 0 };

  const db = getFirestore();
  const shopRef = db.doc(`barbershops/${barbershopId}`);
  if (!(await shopRef.get()).exists) throw new HttpsError("not-found", "Barbearia não encontrada.");

  const achados = await shopRef.collection("clients").where("whatsapp", "in", formasDoTelefone(telefone)).get();
  const doBalcao = achados.docs.filter(
    (d) => !d.get("uid") && !d.get("mergedInto") && mesmoTelefone(d.get("whatsapp"), telefone)
  );

  let vinculados = 0;
  for (const d of doBalcao) {
    const r = await vincularCadastros({
      db,
      barbershopId,
      deId: d.id,
      paraUid: uid,
      via: "sms",
      por: uid,
      telefoneProvado: telefone,
    });
    if (r.vinculado) vinculados++;
  }
  return { vinculados };
});
