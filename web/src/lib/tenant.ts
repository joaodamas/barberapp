import type { FormaDePagamento } from "@/lib/formas-de-pagamento";
import { tonsDaMarca } from "@/lib/tons-da-marca";
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
  /** Caminho do logo quadrado e do horizontal. Sem logo próprio: `/marca.svg`. */
  logo: string;
  logoHorizontal: string;
  /**
   * Pasta com os PNG do PWA (`icon-192.png`, `maskable-512.png`…) de quem tem
   * ícone próprio. Ausente, os ícones são gerados do monograma em `/icone/*`.
   */
  icones?: string;
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

/**
 * O rateio desta barbearia — D1.
 *
 * Alargado do literal (`40`/`60`) para `number` porque o padrão da casa virou
 * campo de tela, que é exatamente a condição que o comentário acima previa. Com
 * o tipo literal, a barbearia que combinou 50/50 não conseguia sequer ser
 * REPRESENTADA: o próprio teste de analytics precisava de um
 * `as unknown as` para montar um split diferente de 40.
 *
 * O campo era lido por três telas e escrito por nenhuma. O dono lia "o padrão
 * da barbearia (40%)" e não tinha onde mudar os 40.
 */
export type TenantCommissionSplit = {
  barberPct: number;
  shopPct: number;
};

export type TenantPolicies = {
  /**
   * Janela de agenda dos clientes (28/09): o barbeiro libera a agenda dos
   * avulsos por período e define quantos dias o mensalista enxerga. Ausente =
   * horizonte padrão. A regra mora em `lib/janela.ts` (e no servidor, em
   * `functions/src/janela.ts`).
   */
  janela?: { abertaAte?: string | null; diasMensalista?: number | null };
  cancellation: typeof defaultCancellationPolicy;
  reschedule: typeof defaultReschedulePolicy;
  booking: TenantBookingPolicy;
  loyalty: import("./business-rules").LoyaltyPolicy;
  commissionSplit: TenantCommissionSplit;
  /** Alíquota do Simples Nacional sobre a receita bruta, em %. */
  taxRatePct: number;
  /** Dias em que abre (0 = domingo). */
  openWeekdays: number[];
  /**
   * Taxa da maquininha por meio de recebimento, em %.
   *
   * ⚠️ LEGADO desde as formas de pagamento. Continua sendo a fonte da
   * barbearia que nunca abriu a tela — `formasDoTenant` deriva as quatro
   * nativas a partir dele — e o lugar onde as quatro nativas são gravadas,
   * para que nada que ainda leia daqui passe a ler zero. Quem pergunta "quanto
   * a maquininha cobrou" deve chamar `taxaDoPagamento`, nunca este objeto.
   */
  paymentFees: TenantPaymentFees;
  /**
   * As formas que ESTA barbearia recebe, com a taxa de cada uma.
   *
   * Nasceu do pedido do dono d'O Siqueira: aproximação e cartão inserido são
   * preços diferentes na maquininha dele, e com quatro chaves fixas uma das
   * duas estaria errada em todo atendimento no crédito.
   *
   * Opcional porque nenhuma barbearia existente tem o campo — ausente, as
   * quatro nativas são derivadas de `paymentFees` e nada muda.
   */
  paymentForms?: FormaDePagamento[];
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
  /** DRE, fluxo de caixa, despesas e fechamento — o diferencial do plano superior. */
  advancedFinance: boolean;
  /**
   * Projeção de caixa. Separada de `advancedFinance` em 29/09 (decisão do
   * dono): entra já no Crescimento, para o plano do meio ter o "número do
   * futuro", e o Gestão fica com o fechamento completo.
   */
  projection: boolean;
};

/**
 * Plano contratado na plataforma. Ver `docs/COBRANCA-E-ENTRADA.md` para a
 * matriz; preço e teto de barbeiros em `PRECOS_POR_PLANO`.
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

/**
 * Jornada da barbearia — sai de `lib/slots.ts` e vira configuração.
 *
 * `opensAt`/`closesAt`/`breaks` são o **padrão** da semana. `perDay` sobrescreve
 * um dia da semana inteiro; `exceptions` sobrescreve uma data. A régua de
 * precedência mora em `lib/jornada.ts` e **não deve ser reescrita em tela
 * nenhuma** — era exatamente essa conta que estava em quatro lugares.
 *
 * Os dois campos novos são opcionais porque toda barbearia existente hoje foi
 * criada sem eles: ausente significa "segue o padrão da semana", que é o
 * comportamento anterior, byte por byte.
 */
export type TenantSchedule = {
  /** 0 = domingo. */
  weekdays: number[];
  opensAt: string;
  closesAt: string;
  breaks: Array<{ from: string; to: string }>;
  slotMinutes: number;
  /**
   * Horário próprio de um dia da semana. Chave = `"0"`..`"6"`.
   *
   * Objeto e não array porque o dono edita um dia de cada vez: com array, salvar
   * a terça exigiria reenviar os sete, e duas abas abertas se sobrescreveriam.
   * Com caminho pontilhado (`schedule.perDay.2`), o merge do Firestore resolve.
   */
  perDay?: Record<string, Partial<Omit<TenantSchedule, "weekdays" | "slotMinutes" | "perDay" | "exceptions">>>;
  /** Dias fechados e horários especiais, por data. */
  exceptions?: ScheduleException[];
};

/** Um dia com regra própria: fechado, ou aberto em horário diferente. */
export type ScheduleException = {
  /** ISO `YYYY-MM-DD`. */
  date: string;
  closed?: boolean;
  opensAt?: string;
  closesAt?: string;
  breaks?: Array<{ from: string; to: string }>;
  /** O que o dono escreve para si mesmo: "feriado", "compromisso". */
  note?: string;
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
  /**
   * `encerrada` é terminal: o dono pediu para sair e a janela de exportação
   * está correndo. Ver `functions/src/data-deletion.ts`.
   */
  status: "ativo" | "suspenso" | "trial" | "encerrada";
  /**
   * Quando o dono encerrou — só existe com `status: "encerrada"`. É a base da
   * data de expurgo que Configurações mostra; escrito só pelo servidor
   * (`encerrarConta`), e a regra impede o dono de reescrevê-lo.
   */
  encerradaEmMs?: number;
  /**
   * Barbearia sem cobrança, para sempre (o O Siqueira, a fundadora — 29/09).
   * Só a tela de Assinatura lê: troca preço e boletos por "sem mensalidade".
   * Quem decide é o servidor (`isentoDeCobranca`); o dono não grava o campo.
   */
  isento?: boolean;
  /**
   * Endereço próprio da barbearia, quando não é `{slug}.topete.com.br` — o O
   * Siqueira fica em `osiqueira.jpproject.com.br` (29/09). Com ele gravado, o
   * subdomínio da plataforma redireciona para cá (`destinoCanonico`).
   */
  dominio?: string;
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
  /**
   * O retrato do plano no documento. É o que o backend gravou na criação —
   * **não** é a autoridade sobre o que está liberado hoje. Quem responde isso é
   * `acessoDaBarbearia`, que parte do `plan`.
   */
  features: TenantFeatures;
  /**
   * Liberação pontual, concedida por quem opera a plataforma.
   *
   * Só ADICIONA sobre o plano, nunca remove — e por isso é `Partial`. Existe
   * separada de `features` porque as duas respondem perguntas diferentes:
   * `features` é histórico ("com o que ela nasceu"), `featuresExtras` é
   * decisão ("o que abrimos para ela além do plano"). Enquanto eram o mesmo
   * campo, o retrato do trial no plano de cima virava liberação permanente e o
   * downgrade não tinha efeito nenhum.
   */
  featuresExtras?: Partial<TenantFeatures>;
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
  projection: true,
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
    projection: false,
  },
  crescimento: {
    subscriptions: true,
    store: true,
    loyalty: true,
    whatsapp: true,
    advancedFinance: false,
    projection: true,
  },
  gestao: ALL_FEATURES,
};

/**
 * Preço e teto de equipe de cada plano — tabela aprovada pelo dono em 29/09.
 *
 * Espelha `PRECOS_POR_PLANO` em `functions/src/plans.ts`; o teste de paridade
 * compara os dois. Ninguém crava "97" ou "até 3 barbeiros" em componente: a
 * landing e a tela Equipe leem daqui.
 *
 * O teto conta barbeiro **ativo**. Acima dele a barbearia não é bloqueada —
 * cada um a mais custa `barbeiroExtra` por mês, e quem cobra é o Hub (boleto).
 */
export type PrecoDoPlano = {
  /** Mensalidade do plano, em R$. */
  mensal: number;
  /** Quantos barbeiros ativos a mensalidade cobre. */
  tetoDeBarbeiros: number;
  /** R$ por mês de cada barbeiro ativo acima do teto. */
  barbeiroExtra: number;
};

export const PRECOS_POR_PLANO: Record<PlanId, PrecoDoPlano> = {
  agenda: { mensal: 97, tetoDeBarbeiros: 3, barbeiroExtra: 19 },
  crescimento: { mensal: 197, tetoDeBarbeiros: 6, barbeiroExtra: 19 },
  // Era R$ 297 até 29/09.
  gestao: { mensal: 247, tetoDeBarbeiros: 10, barbeiroExtra: 19 },
};

/** Como o plano aparece para o dono e na landing. */
export const NOME_DO_PLANO: Record<PlanId, string> = {
  agenda: "Agenda",
  crescimento: "Crescimento",
  gestao: "Gestão",
};

/**
 * Barbearias fundadoras: 30% de desconto NO PRIMEIRO MÊS, nas 20 primeiras.
 * Do segundo mês em diante, mensalidade cheia (decisão do dono, 01/10/2026 —
 * antes era "vitalício").
 *
 * Só registro — o desconto é aplicado pelo Hub na cobrança. Nenhuma conta
 * daqui o desconta, para a tela nunca afirmar um valor que o boleto não diz.
 */
export const DESCONTO_FUNDADOR = { percentual: 30, vagas: 20, meses: 1 } as const;

/** Barbeiros ativos acima do teto do plano — nunca negativo. */
export function barbeirosExtras(plan: PlanId, ativos: number): number {
  const n = Number.isFinite(ativos) ? Math.floor(ativos) : 0;
  return Math.max(n - PRECOS_POR_PLANO[plan].tetoDeBarbeiros, 0);
}

/** Mensalidade com os extras, sem desconto de fundador. */
export function valorMensal(plan: PlanId, ativos: number): number {
  const p = PRECOS_POR_PLANO[plan];
  return p.mensal + barbeirosExtras(plan, ativos) * p.barbeiroExtra;
}

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
  projection: false,
};

export function acessoDaBarbearia(tenant: Tenant, agora = new Date()): Acesso {
  const trialAcabou = isTrialExpired(tenant.trial, agora);

  /* Conta encerrada entra ANTES de tudo, e em leitura como as demais: durante
   * os 30 dias de janela o dono precisa exatamente disto — enxergar para
   * exportar. Sem este ramo, `encerrada` escorregaria para o caso "ativa" lá
   * embaixo e devolveria o plano contratado inteiro a quem já pediu para sair. */
  if (tenant.status === "encerrada") {
    return { podeEditar: false, features: NADA, motivo: "cancelada" };
  }
  if (tenant.status === "suspenso") {
    return { podeEditar: false, features: NADA, motivo: "suspensa" };
  }
  if (tenant.status === "trial") {
    return trialAcabou
      ? { podeEditar: false, features: NADA, motivo: "trial_vencido" }
      : { podeEditar: true, features: ALL_FEATURES, motivo: null };
  }

  /* Barbearia ativa: vale o PLANO CONTRATADO, e só ele.
   *
   * Aqui havia `{ ...doPlano, ...tenant.features }`, e o spread do documento
   * tinha a palavra final. A intenção era boa — o suporte libera algo
   * pontualmente sem mexer no plano —, mas o efeito era o oposto do desejado,
   * por causa de como as barbearias nascem: o trial roda no plano de cima, e
   * `signUpBarbershop` grava `features: featuresFor("gestao")` no documento.
   *
   * Quando essa barbearia virasse `ativo` no plano Agenda, o `features` antigo
   * sobreporia o do plano e ela manteria DRE, loja e mensalistas. O downgrade
   * era silenciosamente ineficaz, e o produto não conseguiria cobrar pelo que
   * separa um plano do outro. Ninguém perceberia: a tela continua funcionando.
   *
   * A liberação pontual continua possível, e agora é EXPLÍCITA: `featuresExtras`
   * só ADICIONA, nunca remove, e existir no documento significa que alguém
   * decidiu aquilo — diferente de `features`, que é só o retrato do plano no
   * dia da criação. */
  const doPlano = FEATURES_POR_PLANO[tenant.plan];
  const extras = tenant.featuresExtras ?? {};

  return {
    podeEditar: true,
    features: {
      subscriptions: doPlano.subscriptions || extras.subscriptions === true,
      store: doPlano.store || extras.store === true,
      loyalty: doPlano.loyalty || extras.loyalty === true,
      whatsapp: doPlano.whatsapp || extras.whatsapp === true,
      advancedFinance: doPlano.advancedFinance || extras.advancedFinance === true,
      projection: doPlano.projection || extras.projection === true,
    },
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
    name: "Topete",
    shortName: "Topete",
    logo: "/topete-icone.svg",
    logoHorizontal: "/topete-horizontal.svg",
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

/**
 * Domínio raiz da plataforma. Tudo à esquerda dele é o slug da barbearia.
 *
 * Desde 29/09 é `topete.com.br`: é nele que nascem os links e os QR codes das
 * barbearias novas. `jpproject.com.br` continua aceito como LEGADO — o O
 * Siqueira segue em `osiqueira.jpproject.com.br` até migrar com calma.
 */
export const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "topete.com.br";

/** Domínios antigos que ainda resolvem barbearia (separados por vírgula). */
export const DOMINIOS_LEGADOS = (process.env.NEXT_PUBLIC_DOMINIOS_LEGADOS ?? "jpproject.com.br")
  .split(",")
  .map((d) => d.trim().toLowerCase())
  .filter((d) => d && d !== ROOT_DOMAIN.toLowerCase());

/** Todos os domínios de barbearia, o principal primeiro. */
export const DOMINIOS = [ROOT_DOMAIN.toLowerCase(), ...DOMINIOS_LEGADOS];

/** Subdomínios reservados — não são barbearias. */
/* Espelho de `RESERVED_SLUGS` em `functions/src/signup.ts` — o servidor recusa
 * cadastrar estes; aqui eles nunca viram barbearia. */
export const RESERVED_SLUGS = new Set([
  "www", "app", "admin", "api", "status", "docs", "suporte", "blog", "mail",
  "painel", "login", "cadastro", "comecar", "assets", "static", "cdn",
]);

/**
 * Slug a partir do host.
 *
 * `osiqueira.topete.com.br` → "osiqueira" (e `osiqueira.jpproject.com.br`, legado).
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

  const root = DOMINIOS.find((d) => hostname === d || hostname.endsWith(`.${d}`));
  if (!root || hostname === root) return null;

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
  /* Os tons derivados (texto forte, hover, sombra) acompanham a cor — ver
   * `tons-da-marca.ts`. Na cor padrão, os tons medidos do `globals.css`. */
  return {
    ["--color-gold" as string]: tenant.brand.accentColor,
    ...tonsDaMarca(tenant.brand.accentColor),
  };
}

/**
 * Para onde redirecionar quem abriu a barbearia fora do endereço oficial dela.
 *
 * Só quando o host é um subdomínio DA PLATAFORMA (`osiqueira.topete.com.br`)
 * e a barbearia tem outro endereço gravado. Qualquer outro host — o próprio
 * domínio oficial, o DEV (`cortehub-dev.web.app`, que fixa a barbearia por
 * variável), `axon-barber.web.app` — fica onde está: redirecionar o DEV para
 * produção seria testar em cima dos clientes de verdade.
 */
export function destinoCanonico(host: string | null, dominio: string | undefined): string | null {
  if (!host || !dominio) return null;
  const h = host.trim().toLowerCase().replace(/:\d+$/, "");
  const d = dominio.trim().toLowerCase();
  if (h === d) return null;
  return DOMINIOS.some((raiz) => h.endsWith(`.${raiz}`)) ? d : null;
}
