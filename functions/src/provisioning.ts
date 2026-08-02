import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

/**
 * Provisionamento de uma nova barbearia.
 *
 * O onboarding é assistido nesta fase: o operador da plataforma cria o tenant.
 * Construir cadastro, checkout de assinatura e provisionamento automático antes
 * de saber se o produto vende seria trabalho no escuro — quando a demanda
 * justificar, esta função vira o passo final de um fluxo self-service, sem
 * mudar de forma.
 *
 * A operação é atômica de propósito: barbearia, índice de slug e vínculo do
 * dono precisam existir juntos. Um slug gravado sem barbearia deixa o
 * subdomínio resolvendo para o vazio.
 */

/** Serviços iniciais — o cardápio real que originou o produto. */
const SEED_SERVICES = [
  { id: "sobrancelha", name: "Sobrancelha", durationMin: 20, price: 15 },
  { id: "pezinho", name: "Pezinho", durationMin: 15, price: 15 },
  { id: "barba", name: "Barba", durationMin: 30, price: 35 },
  { id: "corte-infantil", name: "Corte infantil", durationMin: 30, price: 50 },
  { id: "corte-sobrancelha", name: "Corte + sobrancelha", durationMin: 30, price: 70 },
  { id: "corte-barba", name: "Corte + barba", durationMin: 60, price: 90 },
  { id: "corte-barba-sobrancelha", name: "Corte + barba + sobrancelha", durationMin: 60, price: 100 },
];

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/;

/** Subdomínios da plataforma — não podem virar barbearia. */
const RESERVED_SLUGS = new Set([
  "www", "app", "admin", "api", "status", "docs", "suporte", "blog", "mail",
]);

type ProvisionInput = {
  slug: string;
  name: string;
  ownerEmail: string;
  address?: string;
  whatsapp?: string;
  accentColor?: string;
  plan?: "entrada" | "completo";
  seedServices?: boolean;
};

export const provisionBarbershop = onCall<ProvisionInput>(async (request) => {
  if (request.auth?.token.platformAdmin !== true) {
    throw new HttpsError(
      "permission-denied",
      "Só o operador da plataforma provisiona barbearias."
    );
  }

  const input = request.data ?? ({} as ProvisionInput);
  const slug = String(input.slug ?? "").trim().toLowerCase();
  const name = String(input.name ?? "").trim();
  const ownerEmail = String(input.ownerEmail ?? "").trim().toLowerCase();

  if (!SLUG_PATTERN.test(slug)) {
    throw new HttpsError(
      "invalid-argument",
      "Slug deve ter 3–30 caracteres, apenas letras minúsculas, números e hífen, sem começar ou terminar com hífen."
    );
  }
  if (RESERVED_SLUGS.has(slug)) {
    throw new HttpsError("invalid-argument", `"${slug}" é um subdomínio reservado da plataforma.`);
  }
  if (!name) {
    throw new HttpsError("invalid-argument", "Informe o nome da barbearia.");
  }
  if (!ownerEmail) {
    throw new HttpsError("invalid-argument", "Informe o e-mail do dono.");
  }

  const auth = getAuth();
  const db = getFirestore();

  // O dono precisa existir antes: o vínculo é gravado no claim dele.
  let owner;
  try {
    owner = await auth.getUserByEmail(ownerEmail);
  } catch {
    throw new HttpsError(
      "failed-precondition",
      `Nenhuma conta com o e-mail ${ownerEmail}. Peça para o dono entrar uma vez antes de provisionar.`
    );
  }

  const shopRef = db.collection("barbershops").doc();
  const slugRef = db.collection("slugs").doc(slug);
  const plan = input.plan ?? "completo";

  await db.runTransaction(async (tx) => {
    // Leitura dentro da transação: garante que ninguém tomou o slug no meio.
    const existing = await tx.get(slugRef);
    if (existing.exists) {
      throw new HttpsError("already-exists", `O subdomínio "${slug}" já está em uso.`);
    }

    tx.set(shopRef, {
      slug,
      status: "trial",
      plan,
      brand: {
        name,
        shortName: name.length > 14 ? name.slice(0, 14).trim() : name,
        logo: "/logo.svg",
        logoHorizontal: "/logo-horizontal.svg",
        accentColor: input.accentColor ?? "#b8863a",
        themeColor: "#ffffff",
        panelLabel: "Painel do dono",
        clientTagline: "Sua barbearia",
      },
      contact: {
        address: input.address ?? "",
        whatsapp: onlyDigits(input.whatsapp ?? ""),
      },
      features: featuresFor(plan),
      createdAt: FieldValue.serverTimestamp(),
      createdBy: request.auth?.uid ?? null,
    });

    tx.set(slugRef, { barbershopId: shopRef.id });

    tx.set(shopRef.collection("members").doc(owner.uid), {
      role: "owner",
      email: ownerEmail,
      addedAt: FieldValue.serverTimestamp(),
    });

    if (input.seedServices !== false) {
      for (const service of SEED_SERVICES) {
        tx.set(shopRef.collection("services").doc(service.id), { ...service, active: true });
      }
    }

    tx.set(shopRef.collection("audit_log").doc(), {
      action: "barbershop.provisioned",
      by: request.auth?.uid ?? null,
      at: FieldValue.serverTimestamp(),
      detail: { slug, name, ownerEmail, plan },
    });
  });

  // O claim é gravado FORA da transação porque o Auth não participa dela. Se
  // falhar aqui, a barbearia existe sem dono — daí o log explícito e a
  // orientação de reexecutar `grantShopRole`, que é idempotente.
  try {
    await grantRole(owner.uid, shopRef.id, "owner");
  } catch (error) {
    console.error("[provisioning] barbearia criada sem vínculo do dono", {
      barbershopId: shopRef.id,
      ownerUid: owner.uid,
      error,
    });
    throw new HttpsError(
      "internal",
      `Barbearia ${shopRef.id} criada, mas o vínculo do dono falhou. Rode grantShopRole para ${ownerEmail}.`
    );
  }

  return { barbershopId: shopRef.id, slug, ownerUid: owner.uid };
});

/** Concede ou revoga papel de alguém numa barbearia. Idempotente. */
export const grantShopRole = onCall<{
  barbershopId: string;
  email: string;
  role: "owner" | "staff" | null;
}>(async (request) => {
  const { barbershopId, email, role } = request.data ?? {};

  if (!barbershopId || !email) {
    throw new HttpsError("invalid-argument", "Informe barbershopId e email.");
  }

  const isPlatformAdmin = request.auth?.token.platformAdmin === true;
  const callerRole = (request.auth?.token.barbershops as Record<string, string> | undefined)?.[
    barbershopId
  ];
  if (!isPlatformAdmin && callerRole !== "owner") {
    throw new HttpsError("permission-denied", "Só o dono da barbearia ou o suporte pode fazer isso.");
  }

  const auth = getAuth();
  const user = await auth.getUserByEmail(String(email).toLowerCase()).catch(() => {
    throw new HttpsError("failed-precondition", `Nenhuma conta com o e-mail ${email}.`);
  });

  if (user.uid === request.auth?.uid && role !== "owner") {
    throw new HttpsError(
      "failed-precondition",
      "Um dono não pode revogar o próprio acesso — outra conta precisa fazer isso."
    );
  }

  await grantRole(user.uid, barbershopId, role ?? null);

  const db = getFirestore();
  const memberRef = db.doc(`barbershops/${barbershopId}/members/${user.uid}`);
  if (role) {
    await memberRef.set(
      { role, email: user.email ?? null, addedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
  } else {
    await memberRef.delete();
  }

  return { uid: user.uid, barbershopId, role: role ?? null };
});

/* ------------------------------------------------------------------ */

async function grantRole(uid: string, barbershopId: string, role: "owner" | "staff" | null) {
  const auth = getAuth();
  const user = await auth.getUser(uid);
  const claims = { ...(user.customClaims ?? {}) };
  const barbershops = { ...((claims.barbershops as Record<string, string>) ?? {}) };

  if (role) {
    barbershops[barbershopId] = role;
  } else {
    delete barbershops[barbershopId];
  }

  claims.barbershops = barbershops;
  await auth.setCustomUserClaims(uid, claims);
  // O token em uso continua com o claim antigo até renovar; revogar força a
  // renovação na próxima requisição.
  await auth.revokeRefreshTokens(uid);
}

function featuresFor(plan: "entrada" | "completo") {
  const completo = plan === "completo";
  return {
    // WhatsApp entra no plano de entrada de propósito: é o que o Trinks cobra
    // como add-on e o argumento de venda mais direto contra ele.
    whatsapp: true,
    loyalty: true,
    subscriptions: completo,
    store: completo,
    advancedFinance: completo,
  };
}

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}
