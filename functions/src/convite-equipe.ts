import { randomBytes } from "node:crypto";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { exigirEdicao, idSeguro, vinculosDe } from "./acesso";
import { mutarClaims } from "./claims";

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
  /**
   * O dono tirou o acesso que este convite deu (08/10). Sem esta marca, o
   * caminho de "repetição" do aceite — feito para a resposta perdida da
   * primeira chamada — devolvia o papel a quem já tinha sido retirado: bastava
   * chamar `aceitarConviteDeBarbeiro` de novo com o token antigo.
   */
  revogadoEm?: number | null;
};

export type MotivoDeRecusa =
  | "inexistente"
  | "usado"
  | "cancelado"
  | "expirado"
  | "outro_email"
  | "email_nao_verificado"
  | "revogado";

/** Por que este convite não pode ser aceito agora — ou `null` se pode. */
export function recusaDoConvite(params: {
  convite: Pick<ConviteDeEquipe, "email" | "expiraEmMs" | "usadoEm" | "canceladoEm" | "revogadoEm"> | null;
  agoraMs: number;
  emailDaConta: string | null | undefined;
  /**
   * O e-mail da conta foi CONFIRMADO (ou a conta é do Google, que só entrega
   * e-mail verificado). Convite por e-mail exige isto: qualquer pessoa cria
   * uma conta de e-mail e senha com o endereço de outra, sem nunca abrir a
   * caixa de entrada — e o convite "preso àquele e-mail" passava a valer para
   * quem só sabia o endereço (08/10). Ausente = não confirmado.
   */
  emailVerificado?: boolean;
}): MotivoDeRecusa | null {
  const { convite, agoraMs } = params;
  if (!convite) return "inexistente";
  if (convite.revogadoEm) return "revogado";
  if (convite.usadoEm) return "usado";
  if (convite.canceladoEm) return "cancelado";
  if (agoraMs > convite.expiraEmMs) return "expirado";
  if (convite.email) {
    const daConta = String(params.emailDaConta ?? "").trim().toLowerCase();
    if (daConta !== convite.email) return "outro_email";
    if (params.emailVerificado !== true) return "email_nao_verificado";
  }
  return null;
}

/**
 * A repetição do aceite pode devolver o papel? (08/10)
 *
 * Existe para a resposta perdida: a primeira chamada gravou tudo e a tela não
 * soube. Só vale enquanto a cadeira AINDA é desta conta e o dono não tirou o
 * acesso — e dentro do prazo do convite, que é a janela em que uma resposta
 * perdida faz sentido. Fora disso, regravar o claim era devolver o acesso a
 * quem o dono tinha tirado.
 */
export function podeRepetirAceite(params: {
  convite: Pick<ConviteDeEquipe, "usadoEm" | "usadoPor" | "expiraEmMs" | "revogadoEm"> | null;
  uid: string;
  uidDaCadeira: string | null | undefined;
  agoraMs: number;
}): boolean {
  const { convite } = params;
  if (!convite?.usadoEm || convite.usadoPor !== params.uid) return false;
  if (convite.revogadoEm) return false;
  if (params.agoraMs > convite.expiraEmMs) return false;
  return params.uidDaCadeira === params.uid;
}

/**
 * O e-mail do token é confiável para casar com o convite? Verificado, ou
 * vindo do Google (que não entrega e-mail sem verificação).
 */
export function emailConfirmadoNoToken(token: Record<string, unknown> | undefined): boolean {
  if (!token) return false;
  if (token.email_verified === true) return true;
  const provedor = (token.firebase as { sign_in_provider?: unknown } | undefined)?.sign_in_provider;
  return provedor === "google.com";
}

export const MENSAGEM_DA_RECUSA: Record<MotivoDeRecusa, string> = {
  inexistente: "Este convite não existe. Peça um link novo ao dono da barbearia.",
  usado: "Este convite já foi usado. Se não foi você, avise o dono da barbearia.",
  cancelado: "Este convite foi cancelado. Peça um link novo ao dono da barbearia.",
  expirado: "Este convite venceu (vale 7 dias). Peça um link novo ao dono da barbearia.",
  outro_email: "Este convite foi enviado para outro e-mail. Entre com o e-mail que recebeu o convite.",
  email_nao_verificado:
    "Confirme o seu e-mail antes de aceitar: abra o link que chegou na sua caixa de entrada e toque em aceitar de novo.",
  revogado: "O acesso deste convite foi retirado pelo dono. Peça um link novo ao dono da barbearia.",
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
  await mutarClaims(params.uid, (claims) => {
    const barbershops = { ...((claims.barbershops as Record<string, string>) ?? {}) };
    const equipe = { ...((claims.equipe as Record<string, string>) ?? {}) };

    if (params.staffId) {
      if (barbershops[params.barbershopId] !== "owner") barbershops[params.barbershopId] = "staff";
      equipe[params.barbershopId] = params.staffId;
    } else {
      if (barbershops[params.barbershopId] === "staff") delete barbershops[params.barbershopId];
      delete equipe[params.barbershopId];
    }

    claims.barbershops = barbershops;
    claims.equipe = equipe;
  });
  /* Retirar acesso precisa valer já: revogar força o token novo, sem o
   * papel. Dar acesso NÃO revoga — derrubaria a sessão que o barbeiro acabou
   * de abrir para aceitar; a tela renova o token sozinha. */
  if (params.revogarSessao) await getAuth().revokeRefreshTokens(params.uid);
}

/** Cancela os convites em aberto deste barbeiro. Devolve quantos. */
async function cancelarAbertos(
  barbershopId: string,
  staffId: string,
  db: FirebaseFirestore.Firestore = getFirestore()
): Promise<number> {
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
  /* Antes do login não há conta para conferir: o e-mail e a confirmação dele
   * são cobrados no aceite. */
  const motivo = recusaDoConvite({
    convite,
    agoraMs: Date.now(),
    emailDaConta: convite?.email ?? null,
    emailVerificado: true,
  });
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

/**
 * O aceite, sem a casca da callable: a transação que liga a conta à cadeira.
 * Fora do `onCall` para o emulador poder exercê-la (o claim, que precisa do
 * Auth, é gravado depois, por quem chama).
 */
export async function aceitarNaTransacao(params: {
  db: FirebaseFirestore.Firestore;
  token: string;
  uid: string;
  emailDaConta: string | null;
  emailVerificado: boolean;
  agoraMs?: number;
}): Promise<{ barbershopId: string; staffId: string; repetido: boolean }> {
  const { db, token, uid, emailDaConta, emailVerificado } = params;
  const agoraMs = params.agoraMs ?? Date.now();
  const conviteRef = db.doc(`convites_equipe/${token}`);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(conviteRef);
    const convite = snap.exists ? (snap.data() as ConviteDeEquipe) : null;

    /* Repetição do MESMO barbeiro (a resposta da primeira chamada se perdeu):
     * devolve o que já foi feito, sem erro — mas SÓ se a cadeira ainda é dele.
     * Antes bastava `usadoPor === uid`, e o barbeiro de quem o dono tirou o
     * acesso chamava de novo com o token antigo e recebia o papel de volta
     * (08/10). */
    if (convite?.usadoEm && convite.usadoPor === uid) {
      const cadeira = await tx.get(db.doc(`barbershops/${convite.barbershopId}/staff/${convite.staffId}`));
      const pode = podeRepetirAceite({
        convite,
        uid,
        uidDaCadeira: cadeira.exists ? (cadeira.get("uid") as string | null) : null,
        agoraMs,
      });
      if (!pode) {
        throw new HttpsError(
          "failed-precondition",
          MENSAGEM_DA_RECUSA[convite.revogadoEm || !cadeira.exists || cadeira.get("uid") !== uid ? "revogado" : "usado"]
        );
      }
      return { barbershopId: convite.barbershopId, staffId: convite.staffId, repetido: true };
    }

    const motivo = recusaDoConvite({ convite, agoraMs, emailDaConta, emailVerificado });
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

    tx.update(conviteRef, { usadoEm: agoraMs, usadoPor: uid });
    tx.update(staffRef, { uid, convitePendente: FieldValue.delete() });
    tx.set(
      shopRef.collection("members").doc(uid),
      { role: "staff", staffId: convite.staffId, email: emailDaConta, addedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
    return { barbershopId: convite.barbershopId, staffId: convite.staffId, repetido: false };
  });
}

export const aceitarConviteDeBarbeiro = onCall<{ token: string }>(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Entre na sua conta para aceitar o convite.");
  if (request.auth?.token.mustChangePassword === true) {
    throw new HttpsError("failed-precondition", "Troque a senha provisória antes de aceitar o convite.");
  }
  const token = String(request.data?.token ?? "");
  if (!/^[0-9a-f]{48}$/.test(token)) throw new HttpsError("invalid-argument", "Convite inválido.");

  const resultado = await aceitarNaTransacao({
    db: getFirestore(),
    token,
    uid,
    emailDaConta: (request.auth?.token.email as string | undefined) ?? null,
    emailVerificado: emailConfirmadoNoToken(request.auth?.token as Record<string, unknown> | undefined),
  });

  await definirAcessoDeBarbeiro({
    uid,
    barbershopId: resultado.barbershopId,
    staffId: resultado.staffId,
    revogarSessao: false,
  });
  return resultado;
});

/**
 * Tudo que liga uma conta a uma cadeira, desfeito de uma vez (08/10).
 *
 * Tirar o acesso era só `staff.uid = null`, apagar `members` e o claim. Ficavam
 * para trás três portas:
 *
 * 1. o convite usado — o caminho de "repetição" do aceite devolvia o papel;
 * 2. os aparelhos registrados para notificação — o celular de quem saiu
 *    seguia recebendo nome e horário dos clientes;
 * 3. o Telegram ligado àquela cadeira — mesma coisa, por outro canal.
 *
 * O dono que também corta tem a própria cadeira com o uid dele: tirar o acesso
 * dela tiraria o dono do sistema, e por isso `donoDaCadeira` só desliga o que
 * é da CADEIRA (convites e Telegram), nunca a conta.
 */
export async function desligarCadeira(params: {
  barbershopId: string;
  staffId: string;
  uid: string | null;
  donoDaCadeira: boolean;
  /** Injetáveis para o emulador, que não tem o Auth. */
  db?: FirebaseFirestore.Firestore;
  retirarClaims?: (uid: string) => Promise<void>;
}): Promise<void> {
  const db = params.db ?? getFirestore();
  const shopRef = db.doc(`barbershops/${params.barbershopId}`);
  const agora = Date.now();

  await cancelarAbertos(params.barbershopId, params.staffId, db);

  /* Telegram da cadeira: desligado, não apagado — a tela de Avisos mostra o
   * histórico, e religar é gerar um convite novo. */
  const contatos = await shopRef.collection("telegram_contatos").where("staffId", "==", params.staffId).get();
  const lote = db.batch();
  for (const c of contatos.docs) {
    if (c.get("alvo") === "dono") continue;
    lote.set(c.ref, { ativo: false, desligadoPor: "acesso retirado", desligadoEm: agora }, { merge: true });
  }

  if (params.uid && !params.donoDaCadeira) {
    const usados = await db
      .collection("convites_equipe")
      .where("barbershopId", "==", params.barbershopId)
      .where("staffId", "==", params.staffId)
      .where("usadoPor", "==", params.uid)
      .get();
    for (const c of usados.docs) lote.update(c.ref, { revogadoEm: agora });

    const aparelhos = await shopRef.collection("push_tokens").where("uid", "==", params.uid).get();
    for (const a of aparelhos.docs) lote.delete(a.ref);

    lote.delete(shopRef.collection("members").doc(params.uid));
  }
  await lote.commit();

  if (params.uid && !params.donoDaCadeira) {
    const uid = params.uid;
    await (params.retirarClaims ??
      ((u: string) =>
        definirAcessoDeBarbeiro({ uid: u, barbershopId: params.barbershopId, staffId: null, revogarSessao: true })))(uid);
  }
}

/** A conta ligada à cadeira é do dono desta barbearia (ou de quem chamou)? */
async function cadeiraEhDoDono(uid: string, barbershopId: string, quem: string): Promise<boolean> {
  if (uid === quem) return true;
  const conta = await getAuth().getUser(uid).catch(() => null);
  return (conta?.customClaims?.barbershops as Record<string, string> | undefined)?.[barbershopId] === "owner";
}

/**
 * A conta ligada à ficha é MESMO desta cadeira? (09/10)
 *
 * O `uid` da ficha vem de um campo; a prova de que a conta aceitou o convite
 * está nos claims (`equipe[loja] == staffId`, gravado pelo aceite) e em
 * `members/{uid}` (só o servidor grava; sem `staffId`, no legado, vale com a
 * ficha apontando para a conta). Sem nenhum dos dois, o `uid` da ficha
 * é de alguém que nunca aceitou nada aqui — e reescrever os claims ou revogar
 * as sessões dessa conta seria mexer na vida de terceiro.
 */
export async function contaEhDaCadeira(params: {
  uid: string;
  barbershopId: string;
  staffId: string;
  db?: FirebaseFirestore.Firestore;
  /** Injetável para o emulador, que não tem o Auth. */
  claimsDaConta?: (uid: string) => Promise<Record<string, unknown> | null>;
}): Promise<boolean> {
  const db = params.db ?? getFirestore();
  const membro = await db.doc(`barbershops/${params.barbershopId}/members/${params.uid}`).get();
  if (membro.exists && membro.get("role") === "staff" && membro.get("staffId") === params.staffId) return true;
  /* Barbeiro ligado antes do convite existir (`grantShopRole` do suporte):
   * `members` sem `staffId`, sem claim `equipe`. A prova é `members` (só o
   * servidor grava) de papel staff MAIS a ficha apontando para a conta. */
  if (membro.exists && membro.get("role") === "staff" && !membro.get("staffId")) {
    const ficha = await db.doc(`barbershops/${params.barbershopId}/staff/${params.staffId}`).get();
    if (ficha.exists && ficha.get("uid") === params.uid) return true;
  }
  const claims = await (params.claimsDaConta ??
    (async (u: string) => (await getAuth().getUser(u).catch(() => null))?.customClaims ?? null))(params.uid);
  const equipe = claims?.equipe as Record<string, string> | undefined;
  return equipe?.[params.barbershopId] === params.staffId;
}

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

    if (await cadeiraEhDoDono(uid, barbershopId, quem)) {
      throw new HttpsError("failed-precondition", "Esta cadeira é do dono — o acesso dele não é tirado por aqui.");
    }

    /* Só mexe na conta se ela é, de fato, desta cadeira (09/10). Ficha com um
     * `uid` que nunca aceitou convite aqui é solta sem tocar na conta. */
    const daCadeira = await contaEhDaCadeira({ uid, barbershopId, staffId });

    /* A cadeira solta PRIMEIRO: é o `staff.uid` que as regras e as callables
     * conferem a cada pedido, e com ele nulo o barbeiro para de ler e de fechar
     * atendimento na hora — sem esperar o token dele vencer. */
    await staffRef.update({ uid: null });
    await desligarCadeira({ barbershopId, staffId, uid: daCadeira ? uid : null, donoDaCadeira: false });
    return { revogado: true };
  }
);

/**
 * O dono remove o barbeiro da equipe (08/10).
 *
 * A tela de Equipe apagava a ficha direto no Firestore. A ficha sumia, mas a
 * conta continuava com o papel `staff`, o `members` continuava lá, o celular
 * seguia recebendo notificação e o Telegram da cadeira, os avisos. Agora a
 * remoção passa por aqui: desfaz o acesso e só então apaga a ficha. As regras
 * deixam o dono apagar direto apenas a ficha SEM conta ligada.
 *
 * Os atendimentos e a comissão de quem saiu continuam: o histórico guarda o
 * `staffId` e o nome congelado, e nada aqui os toca.
 */
export const removerBarbeiro = onCall<{ barbershopId: string; staffId: string }>(async (request) => {
  const barbershopId = idSeguro(request.data?.barbershopId, "Barbearia");
  const staffId = idSeguro(request.data?.staffId, "Barbeiro");
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Entre na sua conta.");
  if (vinculosDe(request)[barbershopId] !== "owner") {
    throw new HttpsError("permission-denied", "Só o dono da barbearia remove barbeiro.");
  }
  await exigirEdicao(barbershopId);
  const quem = request.auth.uid;

  const db = getFirestore();
  const equipeRef = db.collection(`barbershops/${barbershopId}/staff`);
  const staffRef = equipeRef.doc(staffId);
  const staff = await staffRef.get();
  if (!staff.exists) return { removido: false };

  /* A mesma regra da tela, agora também no servidor: barbearia sem barbeiro
   * atendendo não recebe reserva nenhuma. */
  if (staff.get("active") !== false) {
    const ativos = (await equipeRef.get()).docs.filter((d) => d.get("active") !== false);
    if (ativos.length <= 1) {
      throw new HttpsError(
        "failed-precondition",
        "A barbearia precisa de ao menos um barbeiro atendendo para receber reservas."
      );
    }
  }

  const uid = (staff.get("uid") as string | null) ?? null;
  const donoDaCadeira = uid ? await cadeiraEhDoDono(uid, barbershopId, quem) : false;
  /* A conta só é tocada se for MESMO desta cadeira (09/10): o `uid` da ficha,
   * sozinho, não prova que a pessoa aceitou o convite. */
  const daCadeira = uid && !donoDaCadeira ? await contaEhDaCadeira({ uid, barbershopId, staffId }) : false;
  await desligarCadeira({ barbershopId, staffId, uid: daCadeira ? uid : null, donoDaCadeira });
  await staffRef.delete();
  return { removido: true };
});

/**
 * Qual cadeira é a de quem chamou — conferida na FICHA, não só no claim.
 *
 * O claim `equipe` diz qual cadeira a conta tinha quando o token foi emitido.
 * Tirar o acesso revoga a sessão, mas o token já emitido segue válido por até
 * uma hora: confiar só nele deixava quem saiu fechando atendimento e marcando
 * cliente nesse intervalo (08/10). A ficha (`staff.uid`) é a verdade de agora:
 * a revogação a zera antes de qualquer outra coisa.
 *
 * Sem o claim (conta ligada antes dele existir), a consulta por `uid` acha a
 * cadeira — a mesma ficha, pelo outro lado.
 */
export async function staffIdDeQuemChamou(
  request: { auth?: { uid: string; token: Record<string, unknown> } | null },
  barbershopId: string
): Promise<string | null> {
  const uid = request.auth?.uid;
  if (!uid) return null;
  const equipe = getFirestore().collection(`barbershops/${barbershopId}/staff`);
  const doClaim = (request.auth?.token.equipe as Record<string, string> | undefined)?.[barbershopId];
  if (doClaim) {
    const ficha = await equipe.doc(doClaim).get();
    if (ficha.exists && ficha.get("uid") === uid) return doClaim;
  }
  const snap = await equipe.where("uid", "==", uid).limit(1).get();
  return snap.docs[0]?.id ?? null;
}

/**
 * Para as callables abertas ao barbeiro: o dono passa direto; o barbeiro só
 * passa com a cadeira AINDA ligada à conta dele. Devolve a cadeira (ou `null`
 * para o dono).
 */
export async function exigirCadeiraAtiva(
  request: { auth?: { uid: string; token: Record<string, unknown> } | null },
  barbershopId: string,
  papel: string | undefined
): Promise<string | null> {
  if (papel === "owner") return null;
  const meu = papel === "staff" ? await staffIdDeQuemChamou(request, barbershopId) : null;
  if (!meu) {
    throw new HttpsError("permission-denied", "Sua conta não está mais ligada a um barbeiro desta barbearia.");
  }
  return meu;
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
