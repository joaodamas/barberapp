import { CAMINHO_FINANCEIRO } from "./politicas-financeiras";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { exigirEdicao, vinculosDe } from "./acesso";
import { getAuth } from "firebase-admin/auth";
import { mutarClaims } from "./claims";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { featuresFor, type PlanId } from "./plans";
import { politicasIniciais } from "./financial-events";
import { criarCodigoDeEntrada } from "./entrada";
import { montarEvento } from "./hub/contrato";
import { enfileirarNaTransacao, enfileirarSeNovo } from "./hub/saida";

/**
 * Cadastro self-service de uma barbearia.
 *
 * Diferente de `provisionBarbershop`, que exige `platformAdmin` e um dono já
 * existente: aqui quem chama É o futuro dono, autenticado, criando a própria
 * barbearia. A inversão é o que torna o fluxo self-service.
 */

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$/;

/* Única lista de subdomínios reservados das functions — `provisioning.ts` usa
 * esta. Espelhada em `web/src/lib/tenant.ts` (teste de paridade lá). */
export const RESERVED_SLUGS = new Set([
  "www", "app", "admin", "api", "status", "docs", "suporte", "blog", "mail",
  "painel", "login", "cadastro", "comecar", "assets", "static", "cdn",
]);

export const TRIAL_DAYS = 7;

/** O teste roda no plano de cima: o dono só escolhe o plano ao fim dele. */
export const TRIAL_PLAN: PlanId = "gestao";

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

/**
 * Fechado em 23/09 — ver `web/src/lib/platform.ts` (`CADASTRO_ABERTO`). A tela
 * desviar para o WhatsApp não basta: a callable é pública, e uma chamada
 * direta criaria uma barbearia num endereço sem certificado.
 */
export const CADASTRO_ABERTO = false;

export const signUpBarbershop = onCall<SignUpInput>(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Entre na sua conta antes de criar a barbearia.");
  }
  if (!CADASTRO_ABERTO) {
    throw new HttpsError(
      "failed-precondition",
      "O cadastro está pausado por alguns dias. Fale com a gente pelo WhatsApp para começar."
    );
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
      plan: TRIAL_PLAN, // trial libera tudo; o plano é escolhido no fim
      trial,
      /* Gravado explicitamente: quando o campo falta, o leitor do servidor
       * precisa adivinhar — e adivinhava liberando tudo, de graça e para
       * sempre, em toda barbearia criada por aqui. */
      features: featuresFor(TRIAL_PLAN),
      /* Pela MESMA razão do `features` acima, e o D1 nasceu de a razão ter
       * valido só para um dos dois: sem `policies`, o gatilho financeiro lia
       * `commissionSplit` ausente como 0% e gravava a comissão zerada, enquanto
       * a tela de Equipe prometia o padrão da casa. Toda barbearia que entrasse
       * pela porta da frente nascia com o defeito. */
      /* Só a parte PÚBLICA da política. Comissão e taxas nascem no documento
       * privado logo abaixo — na ficha pública, qualquer um lia quanto fica com
       * o barbeiro (auditoria de 28/09, M4). */
      policies: {},
      brand: {
        name,
        shortName: shortNameFrom(name),
        /* Sem logo: o app mostra o monograma DESTA barbearia (`/marca.svg`).
         * Gravava "/logo.svg" — o selo d'O Siqueira, o piloto — e toda
         * barbearia nova nascia com a marca de outra (rodada E2E de 23/09). */
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

    tx.set(
      shopRef.collection(CAMINHO_FINANCEIRO.colecao).doc(CAMINHO_FINANCEIRO.doc),
      politicasIniciais()
    );

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

    /* O aviso ao Hub nasce na mesma transação da barbearia: existe se e só se
     * ela existe. Quem entrega é a caixa de saída (`hub/saida.ts`). */
    enfileirarNaTransacao(
      tx,
      db,
      montarEvento({
        evento: "cadastrada",
        barbershopId: shopRef.id,
        slug,
        nome: name,
        ocorridoEm: new Date(now),
      }),
      { agoraMs: now }
    );

    tx.set(shopRef.collection("audit_log").doc(), {
      action: "barbershop.signup",
      by: uid,
      at: FieldValue.serverTimestamp(),
      detail: { slug, name },
    });
  });

  // Fora da transação: o Auth não participa dela.
  const auth = getAuth();
  await mutarClaims(uid, (claims) => {
    claims.barbershops = {
      ...((claims.barbershops as Record<string, string>) ?? {}),
      [shopRef.id]: "owner",
    };
  });
  await auth.revokeRefreshTokens(uid);

  /* Para a tela entrar já logada no endereço novo — ver `entrada.ts`. Falhar
   * aqui não pode desfazer a barbearia criada: sem código, o dono entra com
   * a senha, como antes. */
  const codigoDeEntrada = await criarCodigoDeEntrada(uid, slug).catch((e) => {
    console.error("[signup] código de entrada não gerado", e);
    return null;
  });

  return {
    barbershopId: shopRef.id,
    slug,
    trialEndsAt: trial.endsAt.toISOString(),
    codigoDeEntrada,
  };
});

/**
 * Campos que o onboarding pode gravar no documento da barbearia.
 *
 * A função escreve com o Admin SDK, que IGNORA `firestore.rules`. Sem esta
 * lista, `Object.assign(update, data)` repassava qualquer chave enviada pelo
 * cliente: o dono chamava com `{ plan: "completo", status: "ativo",
 * trial: null }` e reescrevia exatamente os campos que a regra protege —
 * saindo do teste para ativo permanente, virando plano de cima de graça e
 * desfazendo a própria suspensão por inadimplência. Nenhum teste de regra
 * pegaria isso, porque este caminho contorna as regras.
 *
 * A allowlist é nominal, não por prefixo: `brand.` liberado em bloco deixaria
 * passar chave nova que a tela ainda não manda.
 */
export const ONBOARDING_WRITABLE_FIELDS = new Set([
  "brand.name",
  "brand.shortName",
  "brand.accentColor",
  "contact.address",
  "contact.whatsapp",
  "contact.instagram",
  "schedule.weekdays",
  "schedule.opensAt",
  "schedule.closesAt",
  "schedule.slotMinutes",
  "schedule.breaks",
  /* Entrou na tela do passo 3 em #25 e ficou fora daqui: o passo passou a ser
   * recusado para TODA barbearia nova, e o onboarding não terminava. */
  "schedule.perDay",
]);

/** Os passos que a tela `/comecar` conhece (`ONBOARDING_STEPS` no web). */
export const PASSOS_DO_ONBOARDING = new Set(["barbearia", "servicos", "horarios", "compartilhar"]);

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const ehHora = (v: unknown) => typeof v === "string" && HORA.test(v);
const textoEntre = (v: unknown, min: number, max: number) =>
  typeof v === "string" && v.trim().length >= min && v.length <= max;
const objetoSimples = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function pausasValidas(v: unknown): boolean {
  return (
    Array.isArray(v) &&
    v.length <= 6 &&
    v.every(
      (p) =>
        objetoSimples(p) &&
        Object.keys(p).every((k) => k === "from" || k === "to") &&
        ehHora(p.from) &&
        ehHora(p.to)
    )
  );
}

/**
 * O valor que o onboarding quer gravar tem a forma certa? `null` = vale; a
 * string é o motivo da recusa. Puro, para teste.
 *
 * A allowlist dizia QUAIS chaves, mas não COMO: pelo Admin SDK, que ignora
 * as regras, `brand.name` com 10 mil caracteres, `brand.accentColor` com
 * CSS arbitrário ou `schedule.slotMinutes: 0` (que trava o laço da grade)
 * entravam direto. Os limites da marca são os de `marcaDoDonoValida` em
 * `firestore.rules`; os da jornada, os que a tela de horários produz.
 */
export function validarCampoDoOnboarding(campo: string, valor: unknown): string | null {
  switch (campo) {
    case "brand.name":
      return textoEntre(valor, 2, 60) ? null : "o nome precisa ter de 2 a 60 caracteres";
    case "brand.shortName":
      return textoEntre(valor, 1, 14) ? null : "o nome curto precisa ter de 1 a 14 caracteres";
    case "brand.accentColor":
      return typeof valor === "string" && /^#[0-9a-fA-F]{6}$/.test(valor) ? null : "a cor precisa ser #RRGGBB";
    case "contact.address":
      return typeof valor === "string" && valor.length <= 200 ? null : "o endereço passa de 200 caracteres";
    case "contact.whatsapp":
      return typeof valor === "string" && /^\d{0,15}$/.test(valor) ? null : "o WhatsApp precisa ser só dígitos";
    case "contact.instagram":
      return valor === null || (typeof valor === "string" && valor.length <= 60)
        ? null
        : "o Instagram passa de 60 caracteres";
    case "schedule.weekdays":
      return Array.isArray(valor) &&
        valor.length <= 7 &&
        new Set(valor).size === valor.length &&
        valor.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)
        ? null
        : "dias da semana inválidos";
    case "schedule.opensAt":
    case "schedule.closesAt":
      return ehHora(valor) ? null : "horário precisa ser HH:MM";
    case "schedule.slotMinutes":
      return Number.isInteger(valor) && (valor as number) >= 5 && (valor as number) <= 240
        ? null
        : "o intervalo da agenda precisa ser de 5 a 240 minutos";
    case "schedule.breaks":
      return pausasValidas(valor) ? null : "intervalos inválidos";
    case "schedule.perDay": {
      if (valor === null) return null;
      if (!objetoSimples(valor)) return "horário por dia inválido";
      for (const [dia, j] of Object.entries(valor)) {
        if (!/^[0-6]$/.test(dia)) return "horário por dia inválido";
        if (j === null) continue;
        if (!objetoSimples(j)) return "horário por dia inválido";
        if (!Object.keys(j).every((k) => k === "opensAt" || k === "closesAt" || k === "breaks")) {
          return "horário por dia inválido";
        }
        if (j.opensAt !== undefined && !ehHora(j.opensAt)) return "horário por dia inválido";
        if (j.closesAt !== undefined && !ehHora(j.closesAt)) return "horário por dia inválido";
        if (j.breaks !== undefined && !pausasValidas(j.breaks)) return "horário por dia inválido";
      }
      return null;
    }
    default:
      return `o onboarding não grava "${campo}"`;
  }
}

/** Marca um passo do onboarding como concluído. */
export const completeOnboardingStep = onCall<{
  barbershopId: string;
  step: string;
  data?: Record<string, unknown>;
}>(async (request) => {
  const { barbershopId, step, data } = request.data ?? {};
  const role = vinculosDe(request)?.[
    barbershopId ?? ""
  ];
  if (role !== "owner") {
    throw new HttpsError("permission-denied", "Só o dono conclui o onboarding.");
  }
  if (typeof step !== "string" || !PASSOS_DO_ONBOARDING.has(step)) {
    throw new HttpsError("invalid-argument", "Passo do onboarding desconhecido.");
  }
  /* Grava marca e jornada: é edição, e em modo leitura (teste vencido,
   * suspensa) não vale — como em toda outra callable que edita a operação. */
  await exigirEdicao(barbershopId);

  const db = getFirestore();
  const shopRef = db.doc(`barbershops/${barbershopId}`);

  const update: Record<string, unknown> = {
    "onboarding.completedSteps": FieldValue.arrayUnion(step),
  };

  /* Recusa em vez de ignorar em silêncio: campo fora da lista é tela nova
   * mandando o que ainda não foi liberado, ou tentativa de escalada. Ignorar
   * faria o dono ver "salvo" com o dado no chão. */
  for (const [campo, valor] of Object.entries(data ?? {})) {
    if (!ONBOARDING_WRITABLE_FIELDS.has(campo)) {
      throw new HttpsError("invalid-argument", `O onboarding não grava "${campo}".`);
    }
    const recusa = validarCampoDoOnboarding(campo, valor);
    if (recusa) throw new HttpsError("invalid-argument", `Não deu para salvar: ${recusa}.`);
    update[campo] = valor;
  }

  if (step !== "compartilhar") {
    await shopRef.update(update);
    return { ok: true };
  }

  update["onboarding.completedAt"] = FieldValue.serverTimestamp();
  update["onboarding.sharedLink"] = true;

  /* O último passo conclui o onboarding, e o Hub fica sabendo pela caixa de
   * saída — na mesma transação, para o aviso não existir sem o fato nem o
   * fato sem o aviso. O id do evento é fixo por barbearia: refazer o passo
   * regrava a data aqui, mas não avisa o Hub de novo. */
  await db.runTransaction(async (tx) => {
    const shop = await tx.get(shopRef);
    if (!shop.exists) throw new HttpsError("not-found", "Barbearia não encontrada.");
    const aviso = await enfileirarSeNovo(
      tx,
      db,
      montarEvento({
        evento: "onboarding_concluido",
        barbershopId: shopRef.id,
        slug: String(shop.get("slug") ?? ""),
        nome: String(shop.get("brand.name") ?? shop.get("slug") ?? ""),
        ocorridoEm: new Date(),
      }),
      { agoraMs: Date.now() }
    );
    tx.update(shopRef, update);
    aviso.gravar();
  });
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
