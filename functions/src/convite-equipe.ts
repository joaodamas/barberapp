import { randomBytes } from "node:crypto";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { exigirEdicao, idSeguro, vinculosDe } from "./acesso";

/**
 * Acesso do barbeiro ao sistema — convite e ativação automática (05/10).
 *
 * Até aqui o barbeiro existia só como linha da agenda (`staff` com `uid: null`)
 * e o único jeito de lhe dar login era o suporte chamar `grantShopRole` com o
 * e-mail dele. O dono não tinha porta nenhuma.
 *
 * ## O desenho
 *
 * ```
 * dono: "Dar acesso"  →  convite (token de uso único, 7 dias)
 *                     →  link no WhatsApp ou e-mail do barbeiro
 * barbeiro: abre o link, entra ou cria a conta  →  aceitarConviteDeBarbeiro
 *                     →  staff.uid = conta, claim de staff, convite usado
 * ```
 *
 * O token é o segredo: quem tem o link vira barbeiro DAQUELA cadeira. Por isso
 * ele é de uso único, expira, vive numa coleção que as regras negam a todos
 * (`convites_equipe`) e nunca é gravado na ficha pública do barbeiro. Quando o
 * convite é por e-mail, a conta que aceita precisa ser daquele e-mail — o link
 * encaminhado para outra pessoa não serve.
 *
 * ## O claim `equipe`
 *
 * Além de `barbershops[id] = "staff"`, a conta ganha `equipe[id] = staffId`.
 * É o que deixa as regras do Firestore dizerem "este barbeiro lê SÓ a agenda
 * dele" sem consultar documento nenhum a cada leitura (decisão do dono:
 * o barbeiro não vê os colegas nem o caixa da casa).
 */

export const PRAZO_DO_CONVITE_MS = 7 * 24 * 60 * 60 * 1000;

export type ConviteDeEquipe = {
  barbershopId: string;
  staffId: string;
  /** Minúsculo. Nulo quando o convite vai pelo WhatsApp. */
  email: string | null;
  criadoPor: string;
  expiraEmMs: number;
  usadoEm: number | null;
  usadoPor: string | null;
  canceladoEm: number | null;
};

export type MotivoDeRecusa = "inexistente" | "usado" | "cancelado" | "expirado" | "outro_email";

/** Por que este convite não pode ser aceito agora — ou `null` se pode. */
export function recusaDoConvite(params: {
  convite: Pick<ConviteDeEquipe, "email" | "expiraEmMs" | "usadoEm" | "canceladoEm"> | null;
  agoraMs: number;
  emailDaConta: string | null | undefined;
}): MotivoDeRecusa | null {
  const { convite, agoraMs } = params;
  if (!convite) return "inexistente";
  if (convite.usadoEm) return "usado";
  if (convite.canceladoEm) return "cancelado";
  if (agoraMs > convite.expiraEmMs) return "expirado";
  if (convite.email) {
    const daConta = String(params.emailDaConta ?? "").trim().toLowerCase();
    if (daConta !== convite.email) return "outro_email";
  }
  return null;
}

export const MENSAGEM_DA_RECUSA: Record<MotivoDeRecusa, string> = {
  inexistente: "Este convite não existe. Peça um link novo ao dono da barbearia.",
  usado: "Este convite já foi usado. Se não foi você, avise o dono da barbearia.",
  cancelado: "Este convite foi cancelado. Peça um link novo ao dono da barbearia.",
  expirado: "Este convite venceu (vale 7 dias). Peça um link novo ao dono da barbearia.",
  outro_email: "Este convite foi enviado para outro e-mail. Entre com o e-mail que recebeu o convite.",
};

/** E-mail aceitável para convite: o básico, sem pretensão de RFC. */
export function emailDoConvite(bruto: unknown): string | null {
  const e = String(bruto ?? "").trim().toLowerCase();
  if (!e) return null;
  if (e.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
    throw new HttpsError("invalid-argument", "E-mail inválido.");
  }
  return e;
}

/**
 * Grava (ou retira) o acesso de barbeiro nos claims. Mantém os outros vínculos
 * da conta. Quem já é DONO da barbearia continua dono: virar barbeiro da
 * própria loja não pode rebaixar o papel.
 */
export async function definirAcessoDeBarbeiro(params: {
  uid: string;
  barbershopId: string;
  staffId: string | null;
  revogarSessao: boolean;
}): Promise<void> {
  const auth = getAuth();
  const user = await auth.getUser(params.uid);
  const claims = { ...(user.customClaims ?? {}) } as Record<string, unknown>;
  const barbershops = { ...((claims.barbershops as Record<string, string>) ?? {}) };
  const equipe = { ...((claims.equipe as Record<string, string>) ?? {}) };

  if (params.staffId) {
    if (barbershops[params.barbershopId] !== "owner") barbershops[params.barbershopId] = "staff";
    equipe[params.barbershopId] = params.staffId;
  } else {
    if (barbershops[params.barbershopId] === "staff") delete barbershops[params.barbershopId];
    delete equipe[params.barbershopId];
  }

  await auth.setCustomUserClaims(params.uid, { ...claims, barbershops, equipe });
  /* Retirar acesso precisa valer já: revogar força o token novo, sem o
   * papel. Dar acesso NÃO revoga — derrubaria a sessão que o barbeiro acabou
   * de abrir para aceitar; a tela renova o token sozinha. */
  if (params.revogarSessao) await auth.revokeRefreshTokens(params.uid);
}

/** Cancela os convites em aberto deste barbeiro. Devolve quantos. */
async function cancelarAbertos(barbershopId: string, staffId: string): Promise<number> {
  const db = getFirestore();
  const abertos = await db
    .collection("convites_equipe")
    .where("barbershopId", "==", barbershopId)
    .where("staffId", "==", staffId)
    .where("usadoEm", "==", null)
    .get();
  const agora = Date.now();
  const lote = db.batch();
  let n = 0;
  for (const d of abertos.docs) {
    if (d.get("canceladoEm")) continue;
    lote.update(d.ref, { canceladoEm: agora });
    n++;
  }
  if (n) await lote.commit();
  return n;
}

/**
 * O dono cria o convite. Um convite novo cancela o anterior do mesmo barbeiro:
 * "reenviar" é sempre um link novo, e só o último vale.
 */
export const criarConviteDeBarbeiro = onCall<{
  barbershopId: string;
  staffId: string;
  email?: string | null;
}>(async (request) => {
  const barbershopId = idSeguro(request.data?.barbershopId, "Barbearia");
  const staffId = idSeguro(request.data?.staffId, "Barbeiro");
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Entre na sua conta.");
  if (vinculosDe(request)[barbershopId] !== "owner") {
    throw new HttpsError("permission-denied", "Só o dono da barbearia dá ou tira acesso.");
  }
  const uid = request.auth.uid;
  await exigirEdicao(barbershopId);
  const email = emailDoConvite(request.data?.email);

  const db = getFirestore();
  const staffRef = db.doc(`barbershops/${barbershopId}/staff/${staffId}`);
  const staff = await staffRef.get();
  if (!staff.exists) throw new HttpsError("not-found", "Barbeiro não encontrado.");
  if (staff.get("uid")) {
    throw new HttpsError("failed-precondition", "Este barbeiro já tem acesso ao sistema.");
  }

  await cancelarAbertos(barbershopId, staffId);

  const token = randomBytes(24).toString("hex");
  const expiraEmMs = Date.now() + PRAZO_DO_CONVITE_MS;
  const convite: ConviteDeEquipe = {
    barbershopId,
    staffId,
    email,
    criadoPor: uid,
    expiraEmMs,
    usadoEm: null,
    usadoPor: null,
    canceladoEm: null,
  };
  await db.doc(`convites_equipe/${token}`).set({ ...convite, criadoEm: FieldValue.serverTimestamp() });
  /* Na ficha pública vai só o ESTADO (para a tela de Equipe), nunca o token
   * nem o e-mail. */
  await staffRef.update({ convitePendente: { expiraEmMs, porEmail: !!email } });

  return { token, expiraEmMs };
});

export const cancelarConviteDeBarbeiro = onCall<{ barbershopId: string; staffId: string }>(
  async (request) => {
    const barbershopId = idSeguro(request.data?.barbershopId, "Barbearia");
    const staffId = idSeguro(request.data?.staffId, "Barbeiro");
    if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Entre na sua conta.");
    if (vinculosDe(request)[barbershopId] !== "owner") {
      throw new HttpsError("permission-denied", "Só o dono da barbearia dá ou tira acesso.");
    }
    const cancelados = await cancelarAbertos(barbershopId, staffId);
    await getFirestore()
      .doc(`barbershops/${barbershopId}/staff/${staffId}`)
      .update({ convitePendente: FieldValue.delete() });
    return { cancelados };
  }
);

/** O que a tela do convite mostra ANTES de pedir login: de qual barbearia é. */
export const lerConviteDeBarbeiro = onCall<{ token: string }>(async (request) => {
  const token = String(request.data?.token ?? "");
  if (!/^[0-9a-f]{48}$/.test(token)) throw new HttpsError("invalid-argument", "Convite inválido.");
  const db = getFirestore();
  const snap = await db.doc(`convites_equipe/${token}`).get();
  const convite = snap.exists ? (snap.data() as ConviteDeEquipe) : null;
  const motivo = recusaDoConvite({ convite, agoraMs: Date.now(), emailDaConta: convite?.email ?? null });
  if (motivo || !convite) return { valido: false, mensagem: MENSAGEM_DA_RECUSA[motivo ?? "inexistente"] };
  const [shop, staff] = await Promise.all([
    db.doc(`barbershops/${convite.barbershopId}`).get(),
    db.doc(`barbershops/${convite.barbershopId}/staff/${convite.staffId}`).get(),
  ]);
  return {
    valido: true,
    barbearia: String(shop.get("brand.name") ?? shop.get("name") ?? "Barbearia"),
    barbeiro: String(staff.get("name") ?? ""),
    porEmail: !!convite.email,
  };
});

export const aceitarConviteDeBarbeiro = onCall<{ token: string }>(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Entre na sua conta para aceitar o convite.");
  if (request.auth?.token.mustChangePassword === true) {
    throw new HttpsError("failed-precondition", "Troque a senha provisória antes de aceitar o convite.");
  }
  const token = String(request.data?.token ?? "");
  if (!/^[0-9a-f]{48}$/.test(token)) throw new HttpsError("invalid-argument", "Convite inválido.");

  const db = getFirestore();
  const conviteRef = db.doc(`convites_equipe/${token}`);
  const emailDaConta = (request.auth?.token.email as string | undefined) ?? null;

  const resultado = await db.runTransaction(async (tx) => {
    const snap = await tx.get(conviteRef);
    const convite = snap.exists ? (snap.data() as ConviteDeEquipe) : null;

    /* Repetição do MESMO barbeiro (a resposta da primeira chamada se perdeu):
     * devolve o que já foi feito, sem erro. */
    if (convite?.usadoEm && convite.usadoPor === uid) {
      return { barbershopId: convite.barbershopId, staffId: convite.staffId, repetido: true };
    }

    const motivo = recusaDoConvite({ convite, agoraMs: Date.now(), emailDaConta });
    if (motivo || !convite) {
      throw new HttpsError("failed-precondition", MENSAGEM_DA_RECUSA[motivo ?? "inexistente"]);
    }

    const shopRef = db.doc(`barbershops/${convite.barbershopId}`);
    const staffRef = shopRef.collection("staff").doc(convite.staffId);
    /* Esta conta já é outro barbeiro da mesma casa? Uma pessoa, uma cadeira. */
    const jaSou = await tx.get(shopRef.collection("staff").where("uid", "==", uid).limit(1));
    const staff = await tx.get(staffRef);
    if (!staff.exists) throw new HttpsError("not-found", "Este barbeiro não existe mais na barbearia.");
    if (staff.get("uid") && staff.get("uid") !== uid) {
      throw new HttpsError("failed-precondition", "Esta cadeira já tem uma conta ligada. Fale com o dono.");
    }
    if (!jaSou.empty && jaSou.docs[0].id !== convite.staffId) {
      throw new HttpsError("failed-precondition", "Sua conta já está ligada a outro barbeiro desta barbearia.");
    }

    const agora = Date.now();
    tx.update(conviteRef, { usadoEm: agora, usadoPor: uid });
    tx.update(staffRef, { uid, convitePendente: FieldValue.delete() });
    tx.set(
      shopRef.collection("members").doc(uid),
      { role: "staff", staffId: convite.staffId, email: emailDaConta, addedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
    return { barbershopId: convite.barbershopId, staffId: convite.staffId, repetido: false };
  });

  await definirAcessoDeBarbeiro({
    uid,
    barbershopId: resultado.barbershopId,
    staffId: resultado.staffId,
    revogarSessao: false,
  });
  return resultado;
});

/** O dono tira o acesso. O barbeiro continua na agenda; só perde o login. */
export const revogarAcessoDoBarbeiro = onCall<{ barbershopId: string; staffId: string }>(
  async (request) => {
    const barbershopId = idSeguro(request.data?.barbershopId, "Barbearia");
    const staffId = idSeguro(request.data?.staffId, "Barbeiro");
    if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Entre na sua conta.");
    if (vinculosDe(request)[barbershopId] !== "owner") {
      throw new HttpsError("permission-denied", "Só o dono da barbearia dá ou tira acesso.");
    }
    const quem = request.auth.uid;

    const db = getFirestore();
    const staffRef = db.doc(`barbershops/${barbershopId}/staff/${staffId}`);
    const staff = await staffRef.get();
    if (!staff.exists) throw new HttpsError("not-found", "Barbeiro não encontrado.");
    const uid = staff.get("uid") as string | null;
    if (!uid) return { revogado: false };

    /* O dono que também corta tem a própria cadeira com o uid dele. Tirar o
     * acesso dela tiraria o dono do sistema. */
    const conta = await getAuth().getUser(uid).catch(() => null);
    const papelDela = (conta?.customClaims?.barbershops as Record<string, string> | undefined)?.[barbershopId];
    if (uid === quem || papelDela === "owner") {
      throw new HttpsError("failed-precondition", "Esta cadeira é do dono — o acesso dele não é tirado por aqui.");
    }

    await staffRef.update({ uid: null });
    await db.doc(`barbershops/${barbershopId}/members/${uid}`).delete();
    await definirAcessoDeBarbeiro({ uid, barbershopId, staffId: null, revogarSessao: true });
    return { revogado: true };
  }
);

/**
 * Qual cadeira é a de quem chamou — do claim `equipe`, com a consulta por
 * `uid` como reserva para conta ligada antes do claim existir.
 */
export async function staffIdDeQuemChamou(
  request: { auth?: { uid: string; token: Record<string, unknown> } | null },
  barbershopId: string
): Promise<string | null> {
  const doClaim = (request.auth?.token.equipe as Record<string, string> | undefined)?.[barbershopId];
  if (doClaim) return doClaim;
  if (!request.auth?.uid) return null;
  const snap = await getFirestore()
    .collection(`barbershops/${barbershopId}/staff`)
    .where("uid", "==", request.auth.uid)
    .limit(1)
    .get();
  return snap.docs[0]?.id ?? null;
}

/**
 * Barbeiro ligado ANTES do convite existir (suporte com `grantShopRole`, ou o
 * `uid` gravado à mão no `staff`): tem o papel, mas não o claim `equipe`, e as
 * regras não sabem qual é a cadeira dele. O painel do barbeiro chama isto na
 * entrada; acha a cadeira pelo `uid` e completa o claim.
 */
export const sincronizarMeuAcessoDeBarbeiro = onCall<{ barbershopId: string }>(async (request) => {
  const barbershopId = idSeguro(request.data?.barbershopId, "Barbearia");
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Entre na sua conta.");
  if (vinculosDe(request)[barbershopId] !== "staff") {
    throw new HttpsError("permission-denied", "Sua conta não é de barbeiro desta barbearia.");
  }
  const snap = await getFirestore()
    .collection(`barbershops/${barbershopId}/staff`)
    .where("uid", "==", uid)
    .limit(1)
    .get();
  const staffId = snap.docs[0]?.id ?? null;
  if (!staffId) {
    throw new HttpsError(
      "failed-precondition",
      "Sua conta ainda não está ligada a uma cadeira. Peça um convite ao dono."
    );
  }
  const atual = (request.auth?.token.equipe as Record<string, string> | undefined)?.[barbershopId];
  if (atual !== staffId) {
    await definirAcessoDeBarbeiro({ uid, barbershopId, staffId, revogarSessao: false });
  }
  return { staffId, atualizado: atual !== staffId };
});
