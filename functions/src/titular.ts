import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getAuth, type Auth } from "firebase-admin/auth";
import {
  FieldValue,
  getFirestore,
  type DocumentReference,
  type DocumentSnapshot,
  type Firestore,
  type QueryDocumentSnapshot,
} from "firebase-admin/firestore";
import { hojeNoFuso, localeDoDocumento } from "./locale";
import {
  motivosParaRecusar,
  paraJson,
  patchDaMensagem,
  patchDeIdentificacao,
  variantesDoTelefone,
} from "./anonimizacao";

/**
 * Os direitos do titular (LGPD, art. 18) — exportar, anonimizar, excluir a
 * conta.
 *
 * Existe porque Termos §7 e Política §7 prometiam "suporte técnico" para
 * cópia, portabilidade e exclusão, e `clients` era `write: false` sem function
 * nenhuma que o editasse, exportasse ou apagasse. O cliente final não tinha a
 * quem recorrer dentro do produto — P0-4 da rodada de 23/09.
 *
 * O desenho, com papéis, o que fica e o que sai, e por quê, está em
 * `docs/LGPD-DIREITOS-DO-TITULAR.md`. As regras puras (o que conta como dado
 * identificador) estão em `anonimizacao.ts`, com teste próprio.
 *
 * O núcleo de cada operação recebe `db` (e `auth`) por parâmetro: é o que
 * permite exercê-lo contra o emulador sem passar pelo `onCall`.
 */

/** O `in` do Firestore aceita até 30 valores por consulta. */
const MAX_IN = 30;

/** Lote de escrita, abaixo do teto de 500 do Firestore. */
const TAMANHO_DO_LOTE = 400;

/** Janela de "login recente" para apagar a conta — ver `excluirMinhaConta`. */
export const LOGIN_RECENTE_SEGUNDOS = 10 * 60;

function emPedacos<T>(itens: T[], tamanho = MAX_IN): T[][] {
  const pedacos: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) pedacos.push(itens.slice(i, i + tamanho));
  return pedacos;
}

/** `where(campo, "in", valores)` sem estourar o limite de 30. */
async function buscarPorValores(
  colecao: FirebaseFirestore.CollectionReference,
  campo: string,
  valores: string[]
): Promise<QueryDocumentSnapshot[]> {
  const unicos = [...new Set(valores.filter(Boolean))];
  if (!unicos.length) return [];
  const partes = await Promise.all(
    emPedacos(unicos).map((p) => colecao.where(campo, "in", p).get())
  );
  const vistos = new Map<string, QueryDocumentSnapshot>();
  for (const parte of partes) for (const d of parte.docs) vistos.set(d.ref.path, d);
  return [...vistos.values()];
}

/* ================================================================== */
/* Levantamento — tudo o que a barbearia guarda sobre uma pessoa       */
/* ================================================================== */

type Levantamento = {
  shopRef: DocumentReference;
  shopNome: string;
  hoje: string;
  cadastro: DocumentSnapshot;
  /** Cadastros de balcão fundidos neste (`mergedInto == clientId`). */
  fundidos: QueryDocumentSnapshot[];
  /** O cadastro e os fundidos: a mesma pessoa, em ids diferentes. */
  ids: string[];
  reservas: QueryDocumentSnapshot[];
  assinaturas: QueryDocumentSnapshot[];
};

/**
 * Lê o cadastro, os fundidos nele, as reservas e as mensalidades.
 *
 * Os fundidos entram porque o histórico de balcão de quem depois criou conta
 * fica no id ANTIGO (`clients.ts`, "A fusão"). Exportar ou anonimizar só o id
 * novo deixaria as visitas de antes — com nome e telefone — para trás.
 */
async function levantar(
  db: Firestore,
  barbershopId: string,
  clientId: string
): Promise<Levantamento> {
  const shopRef = db.doc(`barbershops/${barbershopId}`);
  const [shopSnap, cadastro, fundidosSnap] = await Promise.all([
    shopRef.get(),
    shopRef.collection("clients").doc(clientId).get(),
    shopRef.collection("clients").where("mergedInto", "==", clientId).get(),
  ]);
  if (!shopSnap.exists) throw new HttpsError("not-found", "Barbearia não encontrada.");
  if (!cadastro.exists) throw new HttpsError("not-found", "Esse cliente não está cadastrado.");

  const fundidos = fundidosSnap.docs.filter((d) => d.id !== clientId);
  const ids = [clientId, ...fundidos.map((d) => d.id)];

  const [reservas, assinaturas] = await Promise.all([
    buscarPorValores(shopRef.collection("bookings"), "clientId", ids),
    buscarPorValores(shopRef.collection("subscriptions"), "clientId", ids),
  ]);

  return {
    shopRef,
    shopNome: String(shopSnap.get("brand.name") ?? barbershopId),
    hoje: hojeNoFuso(localeDoDocumento(shopSnap.data()).timeZone),
    cadastro,
    fundidos,
    ids,
    reservas,
    assinaturas,
  };
}

function recusasDe(l: Levantamento): string[] {
  return motivosParaRecusar({
    reservas: l.reservas.map((d) => d.data()),
    assinaturas: l.assinaturas.map((d) => d.data()),
    hoje: l.hoje,
  });
}

/* ================================================================== */
/* Exportar                                                            */
/* ================================================================== */

/**
 * Tira o que é da barbearia e não do cliente.
 *
 * A reserva carrega `cicloFinanceiro` (percentual e valor da comissão do
 * barbeiro) e o pagamento carrega taxa e líquido da maquininha. É o salário de
 * outra pessoa e o contrato da barbearia com a adquirente — não é dado pessoal
 * de quem cortou o cabelo, e entregá-lo ao titular seria vazar o negócio.
 */
function semDadoInterno(dados: Record<string, unknown>): Record<string, unknown> {
  const limpo: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(dados)) {
    if (k === "cicloFinanceiro" || /^(fee|net|commission)/i.test(k)) continue;
    limpo[k] = v;
  }
  return limpo;
}

function comoLinha(d: DocumentSnapshot): Record<string, unknown> & { id: string } {
  return { ...(paraJson(semDadoInterno(d.data() ?? {})) as Record<string, unknown>), id: d.id };
}

export async function exportarDoCliente(params: {
  db: Firestore;
  barbershopId: string;
  clientId: string;
  autorUid: string;
}) {
  const l = await levantar(params.db, params.barbershopId, params.clientId);
  const { shopRef, ids } = l;

  const [pagamentos, estornos, fidelidade, faturas] = await Promise.all([
    buscarPorValores(shopRef.collection("payments"), "clientId", ids),
    buscarPorValores(shopRef.collection("refunds"), "clientId", ids),
    buscarPorValores(shopRef.collection("loyalty_transactions"), "clientId", ids),
    buscarPorValores(shopRef.collection("subscription_invoices"), "clientId", ids),
  ]);

  const exportacao = {
    geradoEm: new Date().toISOString(),
    barbearia: { id: params.barbershopId, nome: l.shopNome },
    clientId: params.clientId,
    cadastro: comoLinha(l.cadastro),
    cadastrosFundidos: l.fundidos.map(comoLinha),
    reservas: l.reservas.map(comoLinha),
    pagamentos: pagamentos.map(comoLinha),
    estornos: estornos.map(comoLinha),
    fidelidade: fidelidade.map(comoLinha),
    mensalidades: l.assinaturas.map(comoLinha),
    faturas: faturas.map(comoLinha),
  };

  /* Entregar o histórico de alguém é ato que deixa rastro. Só id e contagens:
   * o log não pode virar uma segunda cópia do que foi exportado. */
  await shopRef.collection("audit_log").add({
    action: "titular.exportado",
    by: params.autorUid,
    at: FieldValue.serverTimestamp(),
    detail: {
      clientId: params.clientId,
      cadastros: ids.length,
      reservas: exportacao.reservas.length,
      pagamentos: exportacao.pagamentos.length,
      estornos: exportacao.estornos.length,
      fidelidade: exportacao.fidelidade.length,
      mensalidades: exportacao.mensalidades.length,
      faturas: exportacao.faturas.length,
    },
  });

  return exportacao;
}

/* ================================================================== */
/* Anonimizar                                                          */
/* ================================================================== */

export type ResultadoDaAnonimizacao = {
  /** Nada a fazer: o cadastro já estava anonimizado e sem resíduo. */
  jaEstava: boolean;
  cadastros: number;
  reservas: number;
  mensalidades: number;
  ocorrencias: number;
  mensagens: number;
  conversas: number;
};

/**
 * Anonimiza uma pessoa numa barbearia.
 *
 * ## A ordem, e por que o cadastro é o último
 *
 * São documentos em várias coleções; não cabe numa transação. O que dá para
 * garantir é que o SELO (`anonimizadoEm` no cadastro) e a linha do
 * `audit_log` só sejam gravados depois de todo o resto ter passado. Se algo
 * falhar no meio, o cadastro continua sem selo e chamar de novo refaz o que
 * faltou — é a mesma regra do expurgo, que apaga a árvore por último.
 *
 * ## Idempotente sem flag
 *
 * Cada patch só contém o que ainda identifica alguém (`patchDeIdentificacao`).
 * Sem resíduo e com selo, a resposta é `jaEstava` e nada é gravado.
 */
export async function anonimizarNaBarbearia(params: {
  db: Firestore;
  barbershopId: string;
  clientId: string;
  autor: { uid: string; papel: "dono" | "titular" };
  /** Telefones que a barbearia não conhece mas o titular tinha (o de `users/{uid}`). */
  telefonesExtras?: string[];
}): Promise<ResultadoDaAnonimizacao> {
  const { db, barbershopId, clientId } = params;
  const l = await levantar(db, barbershopId, clientId);

  const recusas = recusasDe(l);
  if (recusas.length) {
    throw new HttpsError(
      "failed-precondition",
      `Ainda não dá para anonimizar em ${l.shopNome}: ${recusas.join("; ")}.`
    );
  }

  const { shopRef, ids } = l;
  const cadastros = [l.cadastro, ...l.fundidos];

  /* Todas as formas do telefone desta pessoa: do cadastro, das reservas e o
   * que veio de fora. O WhatsApp grava com 55; o cadastro, sem. */
  const telefones = new Set<string>();
  for (const bruto of [
    ...cadastros.map((d) => d.get("whatsapp")),
    ...l.reservas.map((d) => d.get("clientWhatsapp")),
    ...(params.telefonesExtras ?? []),
  ]) {
    for (const v of variantesDoTelefone(bruto)) telefones.add(v);
  }
  const listaDeTelefones = [...telefones];

  const [ocorrencias, enviadas, recebidas, conversas] = await Promise.all([
    buscarPorValores(shopRef.collection("client_occurrences"), "clientId", ids),
    buscarPorValores(shopRef.collection("whatsapp_messages"), "to", listaDeTelefones),
    buscarPorValores(shopRef.collection("whatsapp_messages"), "de", listaDeTelefones),
    Promise.all(listaDeTelefones.map((t) => db.doc(`whatsapp_conversations/${t}`).get())),
  ]);

  /* ---- 1. O que fica, sem quem ---- */
  const escritas: Array<{ ref: DocumentReference; patch: Record<string, unknown> }> = [];
  const contar = { reservas: 0, mensalidades: 0, ocorrencias: 0, mensagens: 0 };

  for (const d of l.reservas) {
    const patch = patchDeIdentificacao(d.data());
    if (patch) {
      escritas.push({ ref: d.ref, patch });
      contar.reservas++;
    }
  }
  for (const d of l.assinaturas) {
    const patch = patchDeIdentificacao(d.data());
    if (patch) {
      escritas.push({ ref: d.ref, patch });
      contar.mensalidades++;
    }
  }
  for (const d of ocorrencias) {
    const patch = patchDeIdentificacao(d.data());
    if (patch) {
      escritas.push({ ref: d.ref, patch });
      contar.ocorrencias++;
    }
  }
  const mensagens = new Map<string, QueryDocumentSnapshot>();
  for (const d of [...enviadas, ...recebidas]) mensagens.set(d.ref.path, d);
  for (const d of mensagens.values()) {
    const patch = patchDaMensagem(d.data());
    if (patch) {
      escritas.push({ ref: d.ref, patch });
      contar.mensagens++;
    }
  }

  /* O índice de conversa tem o TELEFONE como id: não há o que anonimizar, só
   * apagar. E só o desta barbearia — o de outra casa é dado de outro
   * controlador, que não pediu nada. */
  const conversasDaCasa = conversas.filter(
    (c) => c.exists && c.get("barbershopId") === barbershopId
  );

  const cadastrosComResiduo = cadastros.filter(
    (d) => patchDeIdentificacao(d.data() ?? {}) !== null || !d.get("anonimizadoEm")
  );

  const nadaAFazer =
    escritas.length === 0 && conversasDaCasa.length === 0 && cadastrosComResiduo.length === 0;
  if (nadaAFazer) {
    return {
      jaEstava: true,
      cadastros: 0,
      reservas: 0,
      mensalidades: 0,
      ocorrencias: 0,
      mensagens: 0,
      conversas: 0,
    };
  }

  for (const pedaco of emPedacos(escritas, TAMANHO_DO_LOTE)) {
    const batch = db.batch();
    for (const e of pedaco) batch.update(e.ref, e.patch);
    await batch.commit();
  }
  if (conversasDaCasa.length) {
    const batch = db.batch();
    for (const c of conversasDaCasa) batch.delete(c.ref);
    await batch.commit();
  }

  /* ---- 2. O selo e o rastro, juntos e por último ---- */
  const resultado: ResultadoDaAnonimizacao = {
    jaEstava: false,
    cadastros: cadastrosComResiduo.length,
    ...contar,
    conversas: conversasDaCasa.length,
  };

  const final = db.batch();
  /* O principal por último dentro do lote — a ordem num lote não importa para
   * o Firestore, mas importa para quem lê: é ele que carrega o selo que a tela
   * consulta. */
  for (const d of [...l.fundidos, l.cadastro]) {
    final.update(d.ref, {
      ...(patchDeIdentificacao(d.data() ?? {}) ?? {}),
      /* Fora da lista e da deduplicação. `resolverCliente` o reativa se a
       * pessoa, com conta, agendar de novo — tratamento novo, base nova. */
      active: false,
      anonimizadoEm: FieldValue.serverTimestamp(),
      anonimizadoPor: { uid: params.autor.uid, papel: params.autor.papel },
    });
  }
  final.set(shopRef.collection("audit_log").doc(), {
    action: "titular.anonimizado",
    by: params.autor.uid,
    papel: params.autor.papel,
    at: FieldValue.serverTimestamp(),
    /* Id e contagens, nunca o nome: um log que guardasse quem foi anonimizado
     * desfaria a anonimização. */
    detail: { clientId, ...resultado },
  });
  await final.commit();

  return resultado;
}

/* ================================================================== */
/* Excluir a própria conta                                             */
/* ================================================================== */

/**
 * Todos os cadastros de uma pessoa, em todas as barbearias.
 *
 * Duas consultas de GRUPO — `uid` e `mergedInto` —, e as duas exigem índice de
 * campo com escopo de grupo declarado em `firestore.indexes.json`. Sem ele
 * funcionam no emulador e falham em produção, no primeiro pedido real.
 */
async function cadastrosDoTitular(
  db: Firestore,
  uid: string
): Promise<Map<string, string[]>> {
  const [porUid, fundidos] = await Promise.all([
    db.collectionGroup("clients").where("uid", "==", uid).get(),
    db.collectionGroup("clients").where("mergedInto", "==", uid).get(),
  ]);

  const porBarbearia = new Map<string, string[]>();
  for (const d of porUid.docs) {
    const shopId = d.ref.parent.parent?.id;
    if (!shopId) continue;
    porBarbearia.set(shopId, [...(porBarbearia.get(shopId) ?? []), d.id]);
  }
  /* Fundido cujo destino existe já é alcançado pelo `levantar` do destino.
   * Só entra sozinho o que ficou sem o cadastro novo — caso de dado torto,
   * mas é telefone de alguém. */
  for (const d of fundidos.docs) {
    const shopId = d.ref.parent.parent?.id;
    if (!shopId || porBarbearia.has(shopId)) continue;
    porBarbearia.set(shopId, [d.id]);
  }
  return porBarbearia;
}

export type ResultadoDaExclusao = {
  barbearias: number;
  porBarbearia: Array<{ barbershopId: string; clientId: string } & ResultadoDaAnonimizacao>;
};

export async function excluirContaDoCliente(params: {
  db: Firestore;
  auth: Pick<Auth, "deleteUser">;
  uid: string;
}): Promise<ResultadoDaExclusao> {
  const { db, uid } = params;

  const perfilRef = db.doc(`users/${uid}`);
  const perfil = await perfilRef.get();
  const telefonesExtras = variantesDoTelefone(perfil.get("whatsapp"));

  const cadastros = await cadastrosDoTitular(db, uid);
  const pares = [...cadastros.entries()].flatMap(([barbershopId, clientIds]) =>
    clientIds.map((clientId) => ({ barbershopId, clientId }))
  );

  /* ---- Tudo ou nada NA VERIFICAÇÃO ----
   *
   * Confere todas as barbearias antes de mudar qualquer uma. Anonimizar duas e
   * parar na terceira deixaria a pessoa com a conta viva, meio apagada, e sem
   * saber o que aconteceu. */
  const recusas: string[] = [];
  for (const p of pares) {
    const l = await levantar(db, p.barbershopId, p.clientId);
    const r = recusasDe(l);
    if (r.length) recusas.push(`${l.shopNome}: ${r.join("; ")}`);
  }
  if (recusas.length) {
    throw new HttpsError(
      "failed-precondition",
      `Ainda não dá para excluir a conta — ${recusas.join(" | ")}.`
    );
  }

  const porBarbearia: ResultadoDaExclusao["porBarbearia"] = [];
  for (const p of pares) {
    const r = await anonimizarNaBarbearia({
      db,
      barbershopId: p.barbershopId,
      clientId: p.clientId,
      autor: { uid, papel: "titular" },
      telefonesExtras,
    });
    porBarbearia.push({ ...p, ...r });
  }

  /* O índice de conversa por telefone é da PLATAFORMA (número único), e o
   * telefone é do titular. Sai inteiro, qualquer que seja a barbearia. */
  await Promise.all(
    telefonesExtras.map((t) => db.doc(`whatsapp_conversations/${t}`).delete())
  );

  /* A conta global — de que o CorteHub é controlador de fato. */
  await db.recursiveDelete(perfilRef);
  await db.doc(`platform_users/${uid}`).delete();

  /* O Auth por ÚLTIMO: enquanto ele existir, a pessoa ainda consegue entrar e
   * repetir o pedido se algo acima falhar. Apagado antes, uma falha no meio
   * deixaria dado para trás sem ninguém capaz de pedir de novo. */
  await params.auth.deleteUser(uid).catch((e: { code?: string }) => {
    if (e?.code !== "auth/user-not-found") throw e;
  });

  return { barbearias: cadastros.size, porBarbearia };
}

/* ================================================================== */
/* As portas                                                           */
/* ================================================================== */

/**
 * O dono entrega ao cliente tudo o que a barbearia guarda sobre ele.
 *
 * Só o dono: é ato do controlador, e entrega o histórico inteiro de uma
 * pessoa — o barbeiro não tem por que baixá-lo.
 */
export const exportarDadosDoCliente = onCall<{ barbershopId: string; clientId: string }>(
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Entre na sua conta.");

    const { barbershopId, clientId } = request.data ?? {};
    if (!barbershopId) throw new HttpsError("invalid-argument", "Barbearia não informada.");
    if (!clientId) throw new HttpsError("invalid-argument", "Cliente não informado.");

    const ehDono =
      (request.auth?.token.barbershops as Record<string, string> | undefined)?.[
        barbershopId
      ] === "owner";
    if (!ehDono) throw new HttpsError("permission-denied", "Só o dono exporta dados de cliente.");

    return exportarDoCliente({
      db: getFirestore(),
      barbershopId: String(barbershopId),
      clientId: String(clientId),
      autorUid: uid,
    });
  }
);

/**
 * O dono atende ao pedido de exclusão de um cliente: sai quem, fica o quê,
 * quando e quanto. Irreversível — por isso só o dono.
 */
export const anonimizarCliente = onCall<{ barbershopId: string; clientId: string }>(
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Entre na sua conta.");

    const { barbershopId, clientId } = request.data ?? {};
    if (!barbershopId) throw new HttpsError("invalid-argument", "Barbearia não informada.");
    if (!clientId) throw new HttpsError("invalid-argument", "Cliente não informado.");

    const ehDono =
      (request.auth?.token.barbershops as Record<string, string> | undefined)?.[
        barbershopId
      ] === "owner";
    if (!ehDono) throw new HttpsError("permission-denied", "Só o dono anonimiza cliente.");

    return anonimizarNaBarbearia({
      db: getFirestore(),
      barbershopId: String(barbershopId),
      clientId: String(clientId),
      autor: { uid, papel: "dono" },
    });
  }
);

/**
 * O cliente final apaga a própria conta.
 *
 * Não recebe `barbershopId`: age sobre o próprio `uid`, em todas as
 * barbearias, e sobre nada mais.
 */
export const excluirMinhaConta = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Entre na sua conta.");

  /* Dono, equipe ou operador NÃO passam por aqui. Apagar a conta deixaria uma
   * barbearia sem dono — o caminho deles é encerrar a conta da barbearia, ou
   * ser removido pelo dono. */
  const vinculos = (request.auth?.token.barbershops ?? {}) as Record<string, string>;
  if (Object.keys(vinculos).length > 0 || request.auth?.token.platformAdmin === true) {
    throw new HttpsError(
      "failed-precondition",
      "Esta conta administra uma barbearia. Encerre a conta da barbearia pelo painel, ou peça ao dono para remover seu acesso, antes de excluí-la."
    );
  }

  /* Login recente. Um token vazado vale uma hora, e apagar é irreversível — é
   * o furo de `changeInitialPassword` (P2-1), que não vamos repetir na função
   * que destrói a conta. */
  const authTime = Number(request.auth?.token.auth_time ?? 0);
  if (!authTime || Date.now() / 1000 - authTime > LOGIN_RECENTE_SEGUNDOS) {
    throw new HttpsError(
      "failed-precondition",
      "Por segurança, saia e entre de novo na sua conta, e peça a exclusão em até 10 minutos."
    );
  }

  return excluirContaDoCliente({ db: getFirestore(), auth: getAuth(), uid });
});
