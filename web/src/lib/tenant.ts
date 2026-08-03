import {
  bookingPolicy as defaultBookingPolicy,
  cancellationPolicy as defaultCancellationPolicy,
  commissionSplit as defaultCommissionSplit,
  loyaltyPolicy as defaultLoyaltyPolicy,
  openWeekdays as defaultOpenWeekdays,
  reschedulePolicy as defaultReschedulePolicy,
  taxRatePct as defaultTaxRatePct,
} from "@/lib/business-rules";

/**
 * A barbearia como unidade de configuração.
 *
 * Tudo que estava escrito no código como "O Siqueira" e em
 * `business-rules.ts` como constante da plataforma passa a ser campo do tenant.
 * A ferramenta nasceu resolvendo a dor de UMA barbearia; este arquivo é a linha
 * que separa "produto interno" de "produto que se vende".
 *
 * Documento em `/barbershops/{id}`. Enquanto o Firestore não entra,
 * `DEFAULT_TENANT` mantém o comportamento atual sem nenhuma tela mudar.
 */

export type TenantBrand = {
  /** Nome comercial, usado em títulos, PWA e mensagens de WhatsApp. */
  name: string;
  /** Nome curto para o ícone na tela inicial (máx. ~12 caracteres). */
  shortName: string;
  /** Caminho do logo quadrado e do horizontal. */
  logo: string;
  logoHorizontal: string;
  /** Cor de destaque. Vira `--color-gold` em tempo de execução. */
  accentColor: string;
  /** Cor do tema do navegador e do splash do PWA. */
  themeColor: string;
  /** Como o painel se apresenta ao dono ("Painel do dono", "Gestão"...). */
  panelLabel: string;
  /** Legenda sob o logo no app do cliente. */
  clientTagline: string;
};

export type TenantContact = {
  address: string;
  /** Somente dígitos, com DDI. Usado em `wa.me` e `tel:`. */
  whatsapp: string;
  instagram?: string;
  since?: number;
};

export type TenantPolicies = {
  cancellation: typeof defaultCancellationPolicy;
  reschedule: typeof defaultReschedulePolicy;
  booking: typeof defaultBookingPolicy;
  loyalty: typeof defaultLoyaltyPolicy;
  commissionSplit: typeof defaultCommissionSplit;
  taxRatePct: number;
  /** Dias em que abre (0 = domingo). */
  openWeekdays: number[];
};

/** Recursos liberados pelo plano contratado na plataforma. */
export type TenantFeatures = {
  subscriptions: boolean;
  store: boolean;
  loyalty: boolean;
  whatsapp: boolean;
  /** DRE, projeção e fechamento — o diferencial do plano superior. */
  advancedFinance: boolean;
};

/** Jornada da barbearia — sai de `lib/slots.ts` e vira configuração. */
export type TenantSchedule = {
  /** 0 = domingo. */
  weekdays: number[];
  opensAt: string;
  closesAt: string;
  breaks: Array<{ from: string; to: string }>;
  slotMinutes: number;
};

export type TenantTrial = {
  startedAt: string;
  endsAt: string;
};

export const ONBOARDING_STEPS = ["barbearia", "servicos", "horarios", "compartilhar"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export type TenantOnboarding = {
  completedSteps: OnboardingStep[];
  completedAt: string | null;
  sharedLink: boolean;
};

export type Tenant = {
  id: string;
  /** Subdomínio: `osiqueira` em `osiqueira.dominio.com.br`. */
  slug: string;
  status: "ativo" | "suspenso" | "trial";
  brand: TenantBrand;
  contact: TenantContact;
  policies: TenantPolicies;
  features: TenantFeatures;
  schedule: TenantSchedule;
  trial: TenantTrial | null;
  onboarding: TenantOnboarding;
};

export const DEFAULT_SCHEDULE: TenantSchedule = {
  weekdays: [1, 2, 3, 4, 5, 6],
  opensAt: "09:00",
  closesAt: "19:00",
  breaks: [{ from: "12:00", to: "14:00" }],
  slotMinutes: 30,
};

export const TRIAL_DAYS = 7;

/** Dias restantes de teste. Negativo quando já venceu. */
export function trialDaysLeft(trial: TenantTrial | null, now = new Date()): number | null {
  if (!trial?.endsAt) return null;
  const ms = new Date(trial.endsAt).getTime() - now.getTime();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

/** O aviso só aparece na reta final — antes disso é ruído. */
export function shouldWarnAboutTrial(trial: TenantTrial | null, now = new Date()) {
  const left = trialDaysLeft(trial, now);
  return left !== null && left <= 4;
}

export function isTrialExpired(trial: TenantTrial | null, now = new Date()) {
  const left = trialDaysLeft(trial, now);
  return left !== null && left <= 0;
}

/** Onde o dono parou. `null` quando terminou tudo. */
export function nextOnboardingStep(onboarding: TenantOnboarding): OnboardingStep | null {
  return ONBOARDING_STEPS.find((step) => !onboarding.completedSteps.includes(step)) ?? null;
}

export function isOnboardingComplete(onboarding: TenantOnboarding) {
  return nextOnboardingStep(onboarding) === null;
}

/** Políticas padrão da plataforma — o ponto de partida de toda barbearia nova. */
export const PLATFORM_DEFAULT_POLICIES: TenantPolicies = {
  cancellation: defaultCancellationPolicy,
  reschedule: defaultReschedulePolicy,
  booking: defaultBookingPolicy,
  loyalty: defaultLoyaltyPolicy,
  commissionSplit: defaultCommissionSplit,
  taxRatePct: defaultTaxRatePct,
  openWeekdays: defaultOpenWeekdays,
};

export const ALL_FEATURES: TenantFeatures = {
  subscriptions: true,
  store: true,
  loyalty: true,
  whatsapp: true,
  advancedFinance: true,
};

/**
 * O tenant de referência — a barbearia que originou o produto.
 * Serve de fallback enquanto o Firestore não entra e de exemplo do formato.
 */
export const DEFAULT_TENANT: Tenant = {
  id: "osiqueira",
  slug: "osiqueira",
  status: "ativo",
  brand: {
    name: "O Siqueira Barbearia",
    shortName: "O Siqueira",
    logo: "/logo.svg",
    logoHorizontal: "/logo-horizontal.svg",
    accentColor: "#b8863a",
    themeColor: "#ffffff",
    panelLabel: "Painel do dono",
    clientTagline: "Sua barbearia",
  },
  contact: {
    address: "Rua das Tesouras, 120 — Centro",
    whatsapp: "5511999999999",
    instagram: "@osiqueirabarbearia",
    since: 2012,
  },
  policies: PLATFORM_DEFAULT_POLICIES,
  features: ALL_FEATURES,
  schedule: {
    weekdays: [1, 2, 3, 4, 5, 6],
    opensAt: "09:00",
    closesAt: "19:00",
    breaks: [{ from: "12:00", to: "14:00" }],
    slotMinutes: 30,
  },
  // A barbearia de referência não está em teste.
  trial: null,
  onboarding: { completedSteps: [...ONBOARDING_STEPS], completedAt: null, sharedLink: true },
};

/** Domínio raiz da plataforma. Tudo à esquerda dele é o slug da barbearia. */
export const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "jpproject.com.br";

/** Subdomínios reservados — não são barbearias. */
const RESERVED_SLUGS = new Set(["www", "app", "admin", "api", "status", "docs"]);

/**
 * Slug a partir do host.
 *
 * `osiqueira.jpbarber.com.br` → "osiqueira".
 *
 * A comparação é contra o domínio raiz configurado, não por contagem de
 * rótulos: `jpproject.com.br` tem três rótulos e é o apex, enquanto
 * `osiqueira.jpproject.com.br` tem quatro. Contar quebra em todo domínio
 * brasileiro `.com.br`.
 *
 * Em `localhost`, IP e domínios de preview do Firebase não há subdomínio de
 * tenant — cai no padrão, para o desenvolvimento não exigir DNS local.
 */
export function slugFromHost(host: string | null | undefined): string | null {
  if (!host) return null;

  const hostname = host.split(":")[0].toLowerCase().replace(/\.$/, "");
  if (!hostname) return null;

  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    /^\d+\.\d+\.\d+\.\d+$/.test(hostname) ||
    hostname.endsWith(".web.app") ||
    hostname.endsWith(".firebaseapp.com")
  ) {
    return null;
  }

  const root = ROOT_DOMAIN.toLowerCase();
  if (hostname === root) return null;
  if (!hostname.endsWith(`.${root}`)) return null;

  const slug = hostname.slice(0, -(root.length + 1));
  // Só o primeiro nível conta: "a.b.dominio.com.br" não é uma barbearia.
  if (!slug || slug.includes(".")) return null;

  return RESERVED_SLUGS.has(slug) ? null : slug;
}

/** URL pública de uma barbearia — usada em templates de WhatsApp e convites. */
export function tenantUrl(slug: string, path = "/") {
  return `https://${slug}.${ROOT_DOMAIN}${path}`;
}

/**
 * Aplica a cor da barbearia sobre os tokens do design system.
 *
 * Só a cor de destaque é personalizável. Fundo, texto e semânticas (sucesso,
 * perigo) continuam da plataforma — foi o que garantiu o contraste medido, e
 * deixar o lojista escolher fundo e texto reintroduz o problema que acabou de
 * ser corrigido.
 */
export function tenantCssVars(tenant: Tenant): React.CSSProperties {
  return {
    ["--color-gold" as string]: tenant.brand.accentColor,
  };
}
