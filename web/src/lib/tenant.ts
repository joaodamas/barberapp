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

/**
 * Onde a barbearia fica, para efeito de dinheiro, data e hora.
 *
 * Isto NÃO é enfeite de internacionalização — é correção.
 *
 * O produto inteiro assumia São Paulo e real, em 21 arquivos. Numa barbearia em
 * Dublin, "amanhã às 15:00" vira o dia errado na confirmação e a antecedência
 * mínima calcula com três horas de diferença: o cliente reserva um horário que
 * o sistema acha que já passou, ou aparece um dia depois. O erro não aparece em
 * log nenhum — aparece na cadeira vazia.
 *
 * E fica mais caro a cada reserva gravada, porque data e hora já persistidas
 * passam a significar coisas diferentes conforme o fuso de quem as leu.
 *
 * `locale` é só apresentação (como o número é escrito). `currency` é o dinheiro
 * de verdade. `timeZone` é o que decide QUE DIA é hoje.
 */
export type TenantLocale = {
  /** IANA, ex.: "America/Sao_Paulo", "Europe/Dublin". */
  timeZone: string;
  /** ISO 4217, ex.: "BRL", "EUR", "GBP". */
  currency: string;
  /** BCP 47, ex.: "pt-BR", "en-IE". */
  locale: string;
};

export const DEFAULT_LOCALE: TenantLocale = {
  timeZone: "America/Sao_Paulo",
  currency: "BRL",
  locale: "pt-BR",
};

/**
 * Taxa de cada meio de pagamento, em percentual sobre o valor bruto.
 *
 * É o que a barbearia PAGA à maquininha — não a tabela de referência de mercado
 * que a tela de Financeiro exibe. Sem isto, `gatewayFeesTotal` fica fixo em zero
 * e o lucro aparece maior do que é: numa barbearia que passa metade do
 * faturamento no crédito, some cerca de 1,5% do faturamento total.
 *
 * Sem parcelamento nesta versão. Quando entrar, `credito` vira a taxa de 1x e
 * as demais parcelas ganham chaves próprias — por isso é objeto, não número.
 */
export type TenantPaymentFees = {
  dinheiro: number;
  pix: number;
  debito: number;
  credito: number;
};

/**
 * Configurável, portanto `number` — nunca o literal.
 *
 * `bookingPolicy` é `as const`, e herdar o tipo dele dava
 * `lateToleranceMinutes: 15`: o tipo passava a afirmar que a tolerância É
 * quinze, e a barbearia que salvasse 30 não compilava. Isso se sustenta
 * enquanto o valor é constante de código; a tolerância deixou de ser.
 *
 * As demais políticas continuam com o tipo do literal só porque ninguém as
 * edita ainda. Quando alguma virar campo de tela, ela passa por aqui.
 */
export type TenantBookingPolicy = {
  [K in keyof typeof defaultBookingPolicy]: number;
};

export type TenantPolicies = {
  cancellation: typeof defaultCancellationPolicy;
  reschedule: typeof defaultReschedulePolicy;
  booking: TenantBookingPolicy;
  loyalty: typeof defaultLoyaltyPolicy;
  commissionSplit: typeof defaultCommissionSplit;
  /** Alíquota do Simples Nacional sobre a receita bruta, em %. */
  taxRatePct: number;
  /** Dias em que abre (0 = domingo). */
  openWeekdays: number[];
  /** Taxa da maquininha por meio de recebimento, em %. */
  paymentFees: TenantPaymentFees;
};

/**
 * Todas zeradas de propósito.
 *
 * Taxa é contrato de cada barbearia com a maquininha dela; chutar uma média de
 * mercado faria o DRE debitar dinheiro que talvez não seja cobrado. Zero é
 * honesto: até o dono preencher, o sistema não inventa custo — e a tela de
 * Configurações sinaliza que o dado falta.
 */
export const DEFAULT_PAYMENT_FEES: TenantPaymentFees = {
  dinheiro: 0,
  pix: 0,
  debito: 0,
  credito: 0,
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

/**
 * Plano contratado na plataforma. Ver `docs/COBRANCA-E-ENTRADA.md` para a
 * matriz e o preço de cada um.
 */
export type PlanId = "agenda" | "crescimento" | "gestao";

/** O que uma barbearia sem plano conhecido recebe: o mínimo, nunca o máximo. */
export const PLANO_DE_ENTRADA: PlanId = "agenda";

/**
 * Recursos que o plano libera. Espelha `functions/src/plans.ts` — os dois
 * caminhos de criação gravam `features`, e esta função decide o que fazer com
 * a barbearia cujo documento foi criado antes disso e não tem o campo.
 */
export function featuresForPlan(plan: PlanId): TenantFeatures {
  return FEATURES_POR_PLANO[plan];
}

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
  /**
   * Plano contratado. Decide o que `acessoDaBarbearia` libera.
   *
   * Obrigatório e já normalizado: `tenant-shape` resolve ausência e valor
   * desconhecido para `PLANO_DE_ENTRADA`, para que ninguém aqui precise de um
   * fallback — e fallback de plano, quando existe, tende a ser generoso.
   */
  plan: PlanId;
  brand: TenantBrand;
  contact: TenantContact;
  /** Fuso, moeda e formato. Decide QUE DIA é hoje e em que moeda o valor é. */
  locale: TenantLocale;
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

/**
 * Nome curto — o que aparece sob o ícone na tela inicial do celular.
 *
 * Cortar por caractere parte a palavra no meio: "O Siqueira Barbearia" virava
 * "O Siqueira Bar". A função já existia corrigida no cadastro self-service
 * (`functions/src/signup.ts`), mas o onboarding guiado gravava com `slice(14)`
 * e reintroduziu o defeito — foi assim que a barbearia piloto ficou com
 * "O Siqueira Bar" no ícone, no cabeçalho e no título da aba.
 *
 * A cópia entre `web` e `functions` é intencional: são pacotes que não
 * compartilham código. Mudar uma exige mudar a outra — os testes dos dois lados
 * cobrem o mesmo caso justamente para essa divergência aparecer.
 */
export function shortNameFrom(name: string, max = 14): string {
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

/** Políticas padrão da plataforma — o ponto de partida de toda barbearia nova. */
export const PLATFORM_DEFAULT_POLICIES: TenantPolicies = {
  cancellation: defaultCancellationPolicy,
  reschedule: defaultReschedulePolicy,
  booking: defaultBookingPolicy,
  loyalty: defaultLoyaltyPolicy,
  commissionSplit: defaultCommissionSplit,
  taxRatePct: defaultTaxRatePct,
  openWeekdays: defaultOpenWeekdays,
  paymentFees: DEFAULT_PAYMENT_FEES,
};

export const ALL_FEATURES: TenantFeatures = {
  subscriptions: true,
  store: true,
  loyalty: true,
  whatsapp: true,
  advancedFinance: true,
};

/**
 * O que cada plano entrega. O trial libera tudo.
 *
 * `Record<PlanId, …>` e não `Record<string, …>` de propósito: com a chave
 * aberta, plano desconhecido devolvia `undefined` e o chamador caía num
 * `?? ALL_FEATURES` — barbearia com plano escrito errado ganhava o catálogo
 * inteiro. Agora o valor é normalizado na entrada (`tenant-shape`) e aqui o
 * acesso é total.
 *
 * WhatsApp entra já no Agenda de propósito: é o que o Trinks cobra como
 * add-on, e o argumento de venda mais direto contra ele.
 */
export const FEATURES_POR_PLANO: Record<PlanId, TenantFeatures> = {
  agenda: {
    subscriptions: false,
    store: false,
    loyalty: false,
    whatsapp: true,
    advancedFinance: false,
  },
  crescimento: {
    subscriptions: true,
    store: true,
    loyalty: true,
    whatsapp: true,
    advancedFinance: false,
  },
  gestao: ALL_FEATURES,
};

/**
 * O que a barbearia pode FAZER agora.
 *
 * `features` e `trial` existiam no modelo e não eram consultados por tela
 * nenhuma — plano de R$ 97 enxergava DRE, e teste vencido funcionava para
 * sempre. Cobrança sem isto é cobrança voluntária.
 *
 * Modo LEITURA em vez de bloqueio: barbearia que perde a agenda no meio de um
 * sábado não volta para negociar, cria caso. O cliente final continua
 * agendando, o dono continua vendo o que existe — o que trava é editar e o que
 * é do plano de cima.
 */
export type Acesso = {
  /** Pode alterar dados: catálogo, despesas, equipe, horários. */
  podeEditar: boolean;
  /** O que o plano libera, já considerando trial e suspensão. */
  features: TenantFeatures;
  /** Por que está em leitura, quando está. */
  motivo: "trial_vencido" | "suspensa" | "cancelada" | null;
};

const NADA: TenantFeatures = {
  subscriptions: false,
  store: false,
  loyalty: false,
  whatsapp: false,
  advancedFinance: false,
};

export function acessoDaBarbearia(tenant: Tenant, agora = new Date()): Acesso {
  const trialAcabou = isTrialExpired(tenant.trial, agora);

  if (tenant.status === "suspenso") {
    return { podeEditar: false, features: NADA, motivo: "suspensa" };
  }
  if (tenant.status === "trial") {
    return trialAcabou
      ? { podeEditar: false, features: NADA, motivo: "trial_vencido" }
      : { podeEditar: true, features: ALL_FEATURES, motivo: null };
  }

  /* Barbearia ativa: vale o plano contratado. `features` gravado no documento
   * ainda tem a palavra final — é como o suporte libera algo pontualmente sem
   * mexer no plano.
   *
   * Sem `?? ALL_FEATURES`: o fallback generoso era o furo. Plano ausente ou
   * escrito errado já virou `PLANO_DE_ENTRADA` na normalização. */
  const doPlano = FEATURES_POR_PLANO[tenant.plan];
  return {
    podeEditar: true,
    features: { ...doPlano, ...tenant.features },
    motivo: null,
  };
}

/**
 * O tenant da PLATAFORMA — o que vale quando o host não tem subdomínio de
 * barbearia, e o que preenche campo faltante de qualquer barbearia.
 *
 * Era a ficha da barbearia piloto, com endereço e WhatsApp inventados. Isso
 * tinha duas consequências ruins: quem abrisse o domínio raiz via a marca de um
 * cliente, e qualquer barbearia com um campo de contato vazio herdava "Rua das
 * Tesouras, 120" em silêncio — endereço falso na tela do cliente dela, sem erro
 * em lugar nenhum.
 *
 * Agora é a CorteHub, e os contatos nascem VAZIOS: campo em branco é honesto,
 * campo com dado de outro é mentira.
 */
export const DEFAULT_TENANT: Tenant = {
  id: "cortehub",
  slug: "cortehub",
  status: "ativo",
  /* A própria plataforma não é cliente de si mesma; `gestao` aqui só evita que
   * a vitrine do domínio raiz apareça capada. */
  plan: "gestao",
  brand: {
    name: "CorteHub",
    shortName: "CorteHub",
    logo: "/cortehub-marca.svg",
    logoHorizontal: "/cortehub-horizontal.svg",
    accentColor: "#b8863a",
    themeColor: "#ffffff",
    panelLabel: "Painel do dono",
    clientTagline: "Sua barbearia",
  },
  contact: {
    address: "",
    whatsapp: "",
  },
  locale: DEFAULT_LOCALE,
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
 * `osiqueira.cortehub.com.br` → "osiqueira".
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
