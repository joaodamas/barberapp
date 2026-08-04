import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

/**
 * Cadastro self-service de uma barbearia.
 *
 * Diferente de `provisionBarbershop`, que exige `platformAdmin` e um dono já
 * existente: aqui quem chama É o futuro dono, autenticado, criando a própria
 * barbearia. A inversão é o que torna o fluxo self-service.
 */

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/;

const RESERVED_SLUGS = new Set([
  "www", "app", "admin", "api", "status", "docs", "suporte", "blog", "mail",
  "painel", "login", "cadastro", "comecar", "assets", "static", "cdn",
]);

export const TRIAL_DAYS = 7;

/** Catálogo inicial — o dono ajusta preço e apaga o que não faz. */
const SEED_SERVICES = [
  { id: "corte", name: "Corte", durationMin: 30, price: 0 },
  { id: "barba", name: "Barba", durationMin: 30, price: 0 },
  { id: "corte-barba", name: "Corte + barba", durationMin: 60, price: 0 },
  { id: "sobrancelha", name: "Sobrancelha", durationMin: 20, price: 0 },
];

const DEFAULT_SCHEDULE = {
  weekdays: [1, 2, 3, 4, 5, 6],
  opensAt: "09:00",
  closesAt: "19:00",
  breaks: [{ from: "12:00", to: "14:00" }],
  slotMinutes: 30,
};

export type SlugCheck = { available: boolean; reason?: string };

/** Valida o formato sem consultar o banco — usado no cliente e no servidor. */
export function validateSlug(raw: string): SlugCheck {
  const slug = String(raw ?? "").trim().toLowerCase();
  if (!slug) return { available: false, reason: "Escolha um endereço." };
  if (slug.length < 3) return { available: false, reason: "Use pelo menos 3 caracteres." };
  if (slug.length > 30) return { available: false, reason: "Use no máximo 30 caracteres." };
  if (!SLUG_PATTERN.test(slug)) {
    return {
      available: false,
      reason: "Use apenas letras minúsculas, números e hífen — sem acento, espaço ou hífen nas pontas.",
    };
  }
  if (RESERVED_SLUGS.has(slug)) {
    return { available: false, reason: `"${slug}" é reservado pela plataforma.` };
  }
  return { available: true };
}

/** Consulta de disponibilidade, com debounce no cliente. */
export const checkSlugAvailability = onCall<{ slug: string }>(async (request) => {
  const format = validateSlug(request.data?.slug ?? "");
  if (!format.available) return format;

  const slug = request.data.slug.trim().toLowerCase();
  const exists = await getFirestore().doc(`slugs/${slug}`).get();

  return exists.exists
    ? { available: false, reason: "Esse endereço já está em uso." }
    : { available: true };
});

type SignUpInput = {
  slug: string;
  name: string;
  /** Nome do DONO — vira o primeiro barbeiro e o tratamento nas mensagens. */
  ownerName?: string;
  address?: string;
  whatsapp?: string;
  accentColor?: string;
};

export const signUpBarbershop = onCall<SignUpInput>(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Entre na sua conta antes de criar a barbearia.");
  }

  /* Self-service é superfície de squatting de subdomínio: sem e-mail
   * verificado, um script registra os melhores nomes numa tarde. Conta do
   * Google já vem verificada. */
  if (request.auth?.token.email_verified !== true) {
    throw new HttpsError(
      "failed-precondition",
      "Confirme seu e-mail antes de criar a barbearia. Enviamos um link para você."
    );
  }

  const slug = String(request.data?.slug ?? "").trim().toLowerCase();
  const name = String(request.data?.name ?? "").trim();
  const ownerName =
    String(request.data?.ownerName ?? "").trim() ||
    String(request.auth?.token.name ?? "").trim();

  const format = validateSlug(slug);
  if (!format.available) {
    throw new HttpsError("invalid-argument", format.reason ?? "Endereço inválido.");
  }
  if (!name) {
    throw new HttpsError("invalid-argument", "Informe o nome da barbearia.");
  }

  const db = getFirestore();

  /* Uma conta, uma barbearia nesta fase. Sem esse limite, um cadastro em loop
   * cria centenas de tenants e o custo é seu. */
  const existing = await db
    .collection("barbershops")
    .where("createdBy", "==", uid)
    .limit(1)
    .get();
  if (!existing.empty) {
    throw new HttpsError(
      "already-exists",
      "Sua conta já tem uma barbearia. Fale com o suporte para abrir outra."
    );
  }

  const shopRef = db.collection("barbershops").doc();
  const slugRef = db.doc(`slugs/${slug}`);

  const now = Date.now();
  const trial = {
    startedAt: new Date(now),
    endsAt: new Date(now + TRIAL_DAYS * 24 * 60 * 60 * 1000),
  };

  await db.runTransaction(async (tx) => {
    // Leitura dentro da transação: dois cadastros simultâneos no mesmo slug,
    // um ganha e o outro recebe erro — em vez de os dois "conseguirem".
    if ((await tx.get(slugRef)).exists) {
      throw new HttpsError("already-exists", "Esse endereço acabou de ser registrado por outra pessoa.");
    }

    tx.set(shopRef, {
      slug,
      status: "trial",
      plan: "completo", // trial libera tudo; o plano é escolhido no fim
      trial,
      brand: {
        name,
        shortName: shortNameFrom(name),
        logo: "/logo.svg",
        logoHorizontal: "/logo-horizontal.svg",
        accentColor: request.data?.accentColor ?? "#b8863a",
        themeColor: "#ffffff",
        panelLabel: "Painel do dono",
        clientTagline: "Sua barbearia",
      },
      contact: {
        address: String(request.data?.address ?? "").trim(),
        whatsapp: String(request.data?.whatsapp ?? "").replace(/\D/g, ""),
      },
      schedule: DEFAULT_SCHEDULE,
      onboarding: { completedSteps: [], completedAt: null, sharedLink: false },
      createdAt: FieldValue.serverTimestamp(),
      createdBy: uid,
    });

    tx.set(slugRef, { barbershopId: shopRef.id });

    tx.set(shopRef.collection("members").doc(uid), {
      role: "owner",
      email: request.auth?.token.email ?? null,
      addedAt: FieldValue.serverTimestamp(),
    });

    /* A barbearia NUNCA nasce sem barbeiro.
     *
     * Não é conveniência: com pelo menos um garantido, nenhum caminho do
     * código precisa tratar "e se não houver barbeiro?" — o estado não existe.
     * E o dono de uma barbearia solo nunca vê a palavra "barbeiro" na tela,
     * porque a escolha só aparece a partir do segundo. */
    tx.set(shopRef.collection("staff").doc(), {
      name: ownerName || "Eu",
      active: true,
      uid,
      // Vazio significa TODOS os serviços — barbeiro sem serviço marcado não
      // atenderia ninguém, e o dono acharia que o sistema quebrou.
      serviceIds: [],
      commissionPct: null,
      schedule: null,
      order: 1,
      createdAt: FieldValue.serverTimestamp(),
    });

    for (const service of SEED_SERVICES) {
      tx.set(shopRef.collection("services").doc(service.id), { ...service, active: true });
    }

    tx.set(shopRef.collection("audit_log").doc(), {
      action: "barbershop.signup",
      by: uid,
      at: FieldValue.serverTimestamp(),
      detail: { slug, name },
    });
  });

  // Fora da transação: o Auth não participa dela.
  const auth = getAuth();
  const user = await auth.getUser(uid);
  const claims = { ...(user.customClaims ?? {}) };
  claims.barbershops = {
    ...((claims.barbershops as Record<string, string>) ?? {}),
    [shopRef.id]: "owner",
  };
  await auth.setCustomUserClaims(uid, claims);
  await auth.revokeRefreshTokens(uid);

  return {
    barbershopId: shopRef.id,
    slug,
    trialEndsAt: trial.endsAt.toISOString(),
  };
});

/** Marca um passo do onboarding como concluído. */
export const completeOnboardingStep = onCall<{
  barbershopId: string;
  step: string;
  data?: Record<string, unknown>;
}>(async (request) => {
  const { barbershopId, step, data } = request.data ?? {};
  const role = (request.auth?.token.barbershops as Record<string, string> | undefined)?.[
    barbershopId ?? ""
  ];
  if (role !== "owner") {
    throw new HttpsError("permission-denied", "Só o dono conclui o onboarding.");
  }

  const db = getFirestore();
  const shopRef = db.doc(`barbershops/${barbershopId}`);

  const update: Record<string, unknown> = {
    "onboarding.completedSteps": FieldValue.arrayUnion(step),
  };
  if (data) Object.assign(update, data);
  if (step === "compartilhar") {
    update["onboarding.completedAt"] = FieldValue.serverTimestamp();
    update["onboarding.sharedLink"] = true;
  }

  await shopRef.update(update);
  return { ok: true };
});

/**
 * Nome curto para o ícone na tela inicial.
 *
 * `slice(0, 14)` cortava no meio da palavra: "O Siqueira Barbearia" virava
 * "O Siqueira Bar" e "Barbearia do Zé" virava "Barbearia do Z" — e é esse
 * texto que fica sob o ícone no celular do cliente. Corta por palavra.
 */
function shortNameFrom(name: string, max = 14) {
  const limpo = name.trim().replace(/\s+/g, " ");
  if (limpo.length <= max) return limpo;

  let curto = "";
  for (const palavra of limpo.split(" ")) {
    const proximo = curto ? `${curto} ${palavra}` : palavra;
    if (proximo.length > max) break;
    curto = proximo;
  }
  return curto || limpo.slice(0, max).trim();
}
