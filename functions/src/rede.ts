import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getAuth, type Auth } from "firebase-admin/auth";
import { FieldValue, getFirestore, type Firestore } from "firebase-admin/firestore";
import { idSeguro } from "./acesso";
import {
  LIMITE_DE_CLAIMS_BYTES,
  mutarClaims,
  tamanhoDosClaims,
  type AuthDeClaims,
  type Claims,
} from "./claims";
import { podeAssumirContaExistente } from "./provisioning";
import { RESERVED_SLUGS } from "./signup";

/**
 * A rede / franquia (09/10) — a fundação.
 *
 * Modelo FEDERADO: cada unidade continua sendo uma `barbershops/{id}` com todo
 * o código de hoje. A rede é uma camada em cima, e tudo o que ela acrescenta
 * fica atrás de `barbershops/{id}.redeId`: barbearia sem `redeId` (o O
 * Siqueira) percorre o mesmo caminho de antes, linha por linha.
 *
 * ## O dono da rede não tem papel novo
 *
 * Ele recebe claims DERIVADOS: `redes: { <redeId>: "dono" }` e
 * `barbershops[<unidade>] = "owner"` em cada unidade da rede. As regras do
 * Firestore e as callables (`vinculosDe`) já sabem ler isso, então nenhuma
 * regra de unidade mudou e nenhuma consulta de documento entra nelas. O
 * gerente de unidade é só `owner` daquela unidade.
 *
 * ## O teto de unidades
 *
 * Os claims cabem em 1000 bytes (medimos 900, ver `claims.ts`): ~58 bytes fixos
 * mais ~31 por unidade. Daí o teto de 20 unidades no contrato — e a conferência
 * por MEDIDA, e não só por contagem, porque o dono pode ter outros vínculos.
 *
 * ## Quem escreve
 *
 * Só as callables daqui, todas de `platformAdmin`; as regras negam a escrita
 * em `redes`, `redes_slugs` e no campo `redeId` até ao dono da unidade.
 */

export const MAX_UNIDADES_PADRAO = 20;
/** Teto duro: o contrato pode baixar, nunca passar disso. */
export const MAX_UNIDADES_ABSOLUTO = 20;

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/;

export type UnidadeDaRede = {
  id: string;
  slug: string;
  nome: string;
  dominio?: string;
};

export type ContratoDaRede = {
  donos: string[];
  maxUnidades: number;
  hubTenantId?: string | null;
  criadoPor: string | null;
};

/* ------------------------------------------------------------------ */
/* Claims: a parte pura                                                */
/* ------------------------------------------------------------------ */

/**
 * Aplica o acesso da rede a UMA conta, devolvendo os claims novos.
 *
 * - `dono`: a conta está no contrato → `redes[r]="dono"`; senão o item sai.
 * - `conceder`: unidades em que ela vira `owner`.
 * - `retirar`: unidades de onde sai — mas só se o papel ali for `owner`; um
 *   `staff` não é rebaixado nem apagado por engano.
 *
 * Mexe numa cópia; nunca no objeto recebido.
 */
export function aplicarAcessoDaRede(
  claims: Claims,
  params: { redeId: string; dono: boolean; conceder: string[]; retirar: string[] }
): Claims {
  const novos: Claims = { ...claims };

  const redes = { ...((novos.redes as Record<string, string>) ?? {}) };
  if (params.dono) redes[params.redeId] = "dono";
  else delete redes[params.redeId];
  if (Object.keys(redes).length > 0) novos.redes = redes;
  else delete novos.redes;

  const barbershops = { ...((novos.barbershops as Record<string, string>) ?? {}) };
  for (const u of params.retirar) {
    if (barbershops[u] === "owner") delete barbershops[u];
  }
  for (const u of params.conceder) barbershops[u] = "owner";
  novos.barbershops = barbershops;

  return novos;
}

/** Normaliza o teto do contrato: inteiro entre 1 e o teto absoluto. */
export function maxUnidadesValido(bruto: unknown): number {
  if (bruto === undefined || bruto === null) return MAX_UNIDADES_PADRAO;
  const n = Number(bruto);
  if (!Number.isInteger(n) || n < 1 || n > MAX_UNIDADES_ABSOLUTO) {
    throw new HttpsError(
      "invalid-argument",
      `O máximo de unidades vai de 1 a ${MAX_UNIDADES_ABSOLUTO} (limite das permissões da conta).`
    );
  }
  return n;
}

/* ------------------------------------------------------------------ */
/* Sincronização                                                       */
/* ------------------------------------------------------------------ */

type AuthDaRede = AuthDeClaims & Pick<Auth, "revokeRefreshTokens">;

export type OpcoesDaSincronizacao = {
  db?: Firestore;
  auth?: AuthDaRede;
  /** Unidades que acabaram de sair da rede: ainda precisam ter o acesso retirado. */
  unidadesRetiradas?: string[];
  /** Contas que acabaram de sair do contrato: ainda precisam perder o acesso. */
  donosRetirados?: string[];
};

export type ResultadoDaSincronizacao = {
  concedidos: number;
  retirados: number;
};

/**
 * Faz o acesso refletir o contrato. Idempotente: rodar duas vezes grava o
 * mesmo estado e a segunda não revoga nada.
 *
 * Para cada dono em `contrato.donos` e cada unidade em `rede.unidades`:
 * `redes[r]="dono"`, `barbershops[u]="owner"` e o membro
 * `barbershops/{u}/members/{uid}` = `{role:"owner", origem:"rede", redeId}`.
 * Quem já era dono da unidade por conta própria (membro SEM `origem`) segue
 * assim — a marca "rede" não é gravada por cima, e por isso retirar a rede
 * nunca lhe tira a unidade.
 *
 * Retirar mexe SÓ no que tem `origem:"rede"` e `redeId` desta rede, e revoga a
 * sessão (o claim antigo valeria até o token vencer). Conceder não revoga: a
 * tela renova o token (`getIdToken(true)`), como em `definirAcessoDeBarbeiro`.
 *
 * Se algum claim estouraria o limite, NADA é gravado (conferência prévia) — a
 * rede não fica com metade das contas sincronizadas.
 */
export async function sincronizarAcessoDaRede(
  redeId: string,
  opcoes: OpcoesDaSincronizacao = {}
): Promise<ResultadoDaSincronizacao> {
  const db = opcoes.db ?? getFirestore();
  const auth = opcoes.auth ?? getAuth();

  const [redeSnap, contratoSnap] = await Promise.all([
    db.doc(`redes/${redeId}`).get(),
    db.doc(`redes/${redeId}/private/contrato`).get(),
  ]);
  if (!redeSnap.exists || !contratoSnap.exists) {
    throw new HttpsError("not-found", "Rede não encontrada.");
  }
  const unidades = ((redeSnap.get("unidades") ?? []) as UnidadeDaRede[]).map((u) => u.id);
  const donos = ((contratoSnap.get("donos") ?? []) as string[]).filter(Boolean);
  const retiradas = (opcoes.unidadesRetiradas ?? []).filter((u) => !unidades.includes(u));

  /* O que cada conta tem hoje de "origem rede", por unidade — inclusive nas
   * unidades que acabaram de sair. Consulta por um campo só (índice
   * automático). */
  type Marca = { uid: string; unidade: string };
  const marcas: Marca[] = [];
  for (const u of [...unidades, ...retiradas]) {
    const snap = await db.collection(`barbershops/${u}/members`).where("origem", "==", "rede").get();
    for (const m of snap.docs) {
      if (m.get("redeId") === redeId) marcas.push({ uid: m.id, unidade: u });
    }
  }

  /* Quem sai de uma unidade: tinha a marca e já não é dono-numa-unidade-da-rede. */
  const aRetirar = new Map<string, Set<string>>();
  for (const { uid, unidade } of marcas) {
    const continua = donos.includes(uid) && unidades.includes(unidade);
    if (continua) continue;
    if (!aRetirar.has(uid)) aRetirar.set(uid, new Set());
    aRetirar.get(uid)!.add(unidade);
  }
  for (const uid of opcoes.donosRetirados ?? []) {
    if (!donos.includes(uid) && !aRetirar.has(uid)) aRetirar.set(uid, new Set());
  }

  const contas = new Set<string>([...donos, ...aRetirar.keys()]);

  /* Conferência prévia: calcula os claims de todo mundo antes de gravar um. */
  type ParamsDaConta = Parameters<typeof aplicarAcessoDaRede>[1];
  const novosPorConta = new Map<string, { antes: Claims; depois: Claims; params: ParamsDaConta }>();
  for (const uid of contas) {
    const user = await auth.getUser(uid);
    const antes = { ...(user.customClaims ?? {}) } as Claims;
    const params: ParamsDaConta = {
      redeId,
      dono: donos.includes(uid),
      conceder: donos.includes(uid) ? unidades : [],
      retirar: [...(aRetirar.get(uid) ?? [])],
    };
    const depois = aplicarAcessoDaRede(antes, params);
    const tamanho = tamanhoDosClaims(depois);
    if (tamanho > LIMITE_DE_CLAIMS_BYTES && tamanho > tamanhoDosClaims(antes)) {
      throw new HttpsError(
        "resource-exhausted",
        `A conta ${uid} não comporta mais acessos (${tamanho} de ${LIMITE_DE_CLAIMS_BYTES} bytes de permissões). ` +
          "Reduza as unidades da rede ou os outros vínculos dela. Nada foi alterado."
      );
    }
    novosPorConta.set(uid, { antes, depois, params });
  }

  let concedidos = 0;
  let retirados = 0;

  for (const uid of contas) {
    const { antes, depois, params } = novosPorConta.get(uid)!;
    const saidas = aRetirar.get(uid) ?? new Set<string>();
    const ehDono = donos.includes(uid);

    /* Membros: a marca só vai em quem NÃO era dono por conta própria. */
    if (ehDono) {
      for (const u of unidades) {
        const ref = db.doc(`barbershops/${u}/members/${uid}`);
        const atual = await ref.get();
        if (atual.exists && atual.get("origem") !== "rede") continue;
        if (atual.exists && atual.get("redeId") === redeId) continue; // já está como deve
        await ref.set(
          {
            role: "owner",
            origem: "rede",
            redeId,
            addedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }
    }
    for (const u of saidas) {
      await db.doc(`barbershops/${u}/members/${uid}`).delete();
    }

    /* Claims: grava só se mudou, para a segunda rodada ser inócua. */
    if (JSON.stringify(depois) !== JSON.stringify(antes)) {
      await mutarClaims(uid, (c) => aplicarAcessoDaRede(c, params), auth);
      if (ehDono) concedidos++;
    }
    if (saidas.size > 0 || (!ehDono && (antes.redes as Record<string, string> | undefined)?.[redeId])) {
      await auth.revokeRefreshTokens(uid);
      retirados++;
    }
  }

  return { concedidos, retirados };
}

/* ------------------------------------------------------------------ */
/* Callables de plataforma                                             */
/* ------------------------------------------------------------------ */

async function donoPorEmail(auth: Auth, emailBruto: unknown): Promise<{ uid: string; email: string }> {
  const email = String(emailBruto ?? "").trim().toLowerCase();
  if (!email) throw new HttpsError("invalid-argument", "Informe o e-mail do dono da rede.");
  let conta;
  try {
    conta = await auth.getUserByEmail(email);
  } catch {
    throw new HttpsError(
      "failed-precondition",
      `Nenhuma conta com o e-mail ${email}. Peça para o dono entrar uma vez antes.`
    );
  }
  /* Mesma trava do provisionamento: e-mail não confirmado pode ser de quem
   * digitou o endereço de outra pessoa, e aqui o ganho seria uma rede inteira. */
  if (!podeAssumirContaExistente(conta)) {
    throw new HttpsError(
      "failed-precondition",
      `A conta de ${email} ainda não confirmou o e-mail. Peça para o dono confirmar (ou entrar com Google).`
    );
  }
  return { uid: conta.uid, email };
}

function unidadeDe(id: string, shop: FirebaseFirestore.DocumentData): UnidadeDaRede {
  const dominio = typeof shop.dominio === "string" && shop.dominio.trim() ? shop.dominio.trim() : null;
  return {
    id,
    slug: String(shop.slug ?? id),
    nome: String(shop.brand?.name ?? shop.name ?? shop.slug ?? id),
    ...(dominio ? { dominio } : {}),
  };
}

type EntradaDeCriarRede = {
  nome: string;
  slug: string;
  donoEmail: string;
  accentColor?: string;
  maxUnidades?: number;
};

export const criarRede = onCall<EntradaDeCriarRede>(async (request) => {
  /* A guarda fica À VISTA em cada callable (e não num helper): o teste de
   * autorização lê o corpo de cada uma procurando por ela. */
  if (request.auth?.token.platformAdmin !== true) {
    throw new HttpsError("permission-denied", "Só o operador da plataforma administra redes.");
  }
  const d: Partial<EntradaDeCriarRede> = request.data ?? {};
  const nome = String(d.nome ?? "").trim();
  const slug = String(d.slug ?? "").trim().toLowerCase();
  if (nome.length < 2 || nome.length > 60) {
    throw new HttpsError("invalid-argument", "O nome da rede precisa ter de 2 a 60 caracteres.");
  }
  if (!SLUG_PATTERN.test(slug)) {
    throw new HttpsError(
      "invalid-argument",
      "Slug deve ter 3–30 caracteres, apenas letras minúsculas, números e hífen, sem começar ou terminar com hífen."
    );
  }
  if (RESERVED_SLUGS.has(slug)) {
    throw new HttpsError("invalid-argument", `"${slug}" é um subdomínio reservado da plataforma.`);
  }
  const accentColor = d.accentColor === undefined ? null : String(d.accentColor);
  if (accentColor !== null && !/^#[0-9a-fA-F]{6}$/.test(accentColor)) {
    throw new HttpsError("invalid-argument", "A cor precisa ser #rrggbb.");
  }
  const maxUnidades = maxUnidadesValido(d.maxUnidades);

  const auth = getAuth();
  const db = getFirestore();
  const dono = await donoPorEmail(auth, d.donoEmail);

  const redeRef = db.collection("redes").doc();
  await db.runTransaction(async (tx) => {
    /* Os DOIS namespaces: uma rede com o slug de uma barbearia dividiria o
     * subdomínio com ela. */
    const [emSlugs, emRedes] = await Promise.all([
      tx.get(db.doc(`slugs/${slug}`)),
      tx.get(db.doc(`redes_slugs/${slug}`)),
    ]);
    if (emSlugs.exists || emRedes.exists) {
      throw new HttpsError("already-exists", `O endereço "${slug}" já está em uso.`);
    }
    tx.set(redeRef, {
      nome,
      slug,
      marca: { name: nome, accentColor, logo: null },
      unidades: [],
      status: "ativa",
      politicas: { fidelidade: "por_unidade", mensalidadeValeNaRede: false },
      createdAt: FieldValue.serverTimestamp(),
    });
    const contrato: ContratoDaRede = {
      donos: [dono.uid],
      maxUnidades,
      hubTenantId: null,
      criadoPor: request.auth?.uid ?? null,
    };
    tx.set(redeRef.collection("private").doc("contrato"), contrato);
    tx.set(db.doc(`redes_slugs/${slug}`), { redeId: redeRef.id });
  });

  await sincronizarAcessoDaRede(redeRef.id, { db, auth });
  return { redeId: redeRef.id, slug, donoUid: dono.uid };
});

export const vincularUnidade = onCall<{ redeId: string; barbershopId: string }>(async (request) => {
  /* A guarda fica À VISTA em cada callable (e não num helper): o teste de
   * autorização lê o corpo de cada uma procurando por ela. */
  if (request.auth?.token.platformAdmin !== true) {
    throw new HttpsError("permission-denied", "Só o operador da plataforma administra redes.");
  }
  const redeId = idSeguro(request.data?.redeId, "Rede");
  const barbershopId = idSeguro(request.data?.barbershopId, "Barbearia");
  const db = getFirestore();
  const auth = getAuth();

  const redeRef = db.doc(`redes/${redeId}`);
  const contratoRef = db.doc(`redes/${redeId}/private/contrato`);
  const shopRef = db.doc(`barbershops/${barbershopId}`);

  await db.runTransaction(async (tx) => {
    const [rede, contrato, shop] = await Promise.all([tx.get(redeRef), tx.get(contratoRef), tx.get(shopRef)]);
    if (!rede.exists || !contrato.exists) throw new HttpsError("not-found", "Rede não encontrada.");
    if (!shop.exists) throw new HttpsError("not-found", "Barbearia não encontrada.");
    if (shop.get("status") === "encerrada") {
      throw new HttpsError("failed-precondition", "Esta barbearia foi encerrada e não pode entrar numa rede.");
    }
    const atual = shop.get("redeId");
    if (atual && atual !== redeId) {
      throw new HttpsError("failed-precondition", "Esta barbearia já pertence a outra rede. Desvincule antes.");
    }
    const unidades = (rede.get("unidades") ?? []) as UnidadeDaRede[];
    if (unidades.some((u) => u.id === barbershopId)) return; // já está: idempotente

    const max = Math.min(Number(contrato.get("maxUnidades") ?? MAX_UNIDADES_PADRAO), MAX_UNIDADES_ABSOLUTO);
    if (unidades.length + 1 > max) {
      throw new HttpsError(
        "resource-exhausted",
        `A rede já tem ${unidades.length} de ${max} unidades. O limite existe porque as permissões do dono precisam caber na conta.`
      );
    }
    tx.update(shopRef, { redeId });
    tx.update(redeRef, { unidades: [...unidades, unidadeDe(barbershopId, shop.data()!)] });
  });

  await sincronizarAcessoDaRede(redeId, { db, auth });
  return { redeId, barbershopId };
});

export const desvincularUnidade = onCall<{ redeId: string; barbershopId: string }>(async (request) => {
  /* A guarda fica À VISTA em cada callable (e não num helper): o teste de
   * autorização lê o corpo de cada uma procurando por ela. */
  if (request.auth?.token.platformAdmin !== true) {
    throw new HttpsError("permission-denied", "Só o operador da plataforma administra redes.");
  }
  const redeId = idSeguro(request.data?.redeId, "Rede");
  const barbershopId = idSeguro(request.data?.barbershopId, "Barbearia");
  const db = getFirestore();
  const auth = getAuth();

  const redeRef = db.doc(`redes/${redeId}`);
  const shopRef = db.doc(`barbershops/${barbershopId}`);

  await db.runTransaction(async (tx) => {
    const [rede, shop] = await Promise.all([tx.get(redeRef), tx.get(shopRef)]);
    if (!rede.exists) throw new HttpsError("not-found", "Rede não encontrada.");
    if (shop.exists && shop.get("redeId") && shop.get("redeId") !== redeId) {
      throw new HttpsError("failed-precondition", "Esta barbearia pertence a outra rede.");
    }
    const unidades = (rede.get("unidades") ?? []) as UnidadeDaRede[];
    tx.update(redeRef, { unidades: unidades.filter((u) => u.id !== barbershopId) });
    if (shop.exists) tx.update(shopRef, { redeId: FieldValue.delete() });
  });

  await sincronizarAcessoDaRede(redeId, { db, auth, unidadesRetiradas: [barbershopId] });
  return { redeId, barbershopId };
});

export const definirDonoDaRede = onCall<{ redeId: string; donoEmail: string }>(async (request) => {
  /* A guarda fica À VISTA em cada callable (e não num helper): o teste de
   * autorização lê o corpo de cada uma procurando por ela. */
  if (request.auth?.token.platformAdmin !== true) {
    throw new HttpsError("permission-denied", "Só o operador da plataforma administra redes.");
  }
  const redeId = idSeguro(request.data?.redeId, "Rede");
  const db = getFirestore();
  const auth = getAuth();
  const dono = await donoPorEmail(auth, request.data?.donoEmail);

  const contratoRef = db.doc(`redes/${redeId}/private/contrato`);
  let anteriores: string[] = [];
  await db.runTransaction(async (tx) => {
    const contrato = await tx.get(contratoRef);
    if (!contrato.exists) throw new HttpsError("not-found", "Rede não encontrada.");
    anteriores = (contrato.get("donos") ?? []) as string[];
    tx.update(contratoRef, { donos: [dono.uid] });
  });

  await sincronizarAcessoDaRede(redeId, {
    db,
    auth,
    donosRetirados: anteriores.filter((u) => u !== dono.uid),
  });
  return { redeId, donoUid: dono.uid };
});
