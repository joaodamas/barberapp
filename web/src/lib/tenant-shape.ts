import {
  DEFAULT_LOCALE,
  DEFAULT_PAYMENT_FEES,
  DEFAULT_SCHEDULE,
  DEFAULT_TENANT,
  featuresForPlan,
  FEATURES_POR_PLANO,
  PLANO_DE_ENTRADA,
  PLATFORM_DEFAULT_POLICIES,
  type PlanId,
  type Tenant,
  type TenantTrial,
} from "@/lib/tenant";

/**
 * Documento da barbearia → `Tenant`. **Uma normalização só, para os dois lados.**
 *
 * O servidor lê pela REST do Firestore e o painel lê pelo SDK cliente, em
 * tempo real. São dois caminhos de dado para a mesma ficha — e enquanto isso
 * morava só no `tenant-server.ts`, o segundo caminho teria de reimplementar
 * as mesmas regras de merge. Duas implementações do mesmo merge divergem: a
 * primeira vez que uma delas esquecesse `policies.booking`, a agenda passaria
 * a aceitar reserva para horário já passado só quando lida por aquele caminho.
 *
 * Aqui não há acesso a rede: entra objeto comum, sai `Tenant`.
 */
export function toTenant(id: string, data: Record<string, unknown>): Tenant {
  const brand = (data.brand ?? {}) as Partial<Tenant["brand"]>;
  const contact = (data.contact ?? {}) as Partial<Tenant["contact"]>;
  const policies = (data.policies ?? {}) as Partial<Tenant["policies"]>;
  const features = (data.features ?? {}) as Partial<Tenant["features"]>;
  const locale = (data.locale ?? {}) as Partial<Tenant["locale"]>;

  const plan = toPlan(data.plan);

  return {
    id,
    slug: String(data.slug ?? id),
    status: (data.status as Tenant["status"]) ?? "ativo",
    plan,
    brand: { ...DEFAULT_TENANT.brand, ...brand },
    contact: { ...DEFAULT_TENANT.contact, ...contact },
    /* Barbearia sem `locale` gravado herda o padrão da plataforma. Nunca
     * `undefined`: `Intl` com fuso indefinido cai no fuso do SERVIDOR, que é
     * UTC — e aí a data da confirmação escorrega um dia sem erro nenhum. */
    locale: { ...DEFAULT_LOCALE, ...locale },
    /* Política ausente cai no padrão da plataforma — nunca em undefined, que
     * viraria NaN em cálculo de reembolso.
     *
     * `paymentFees` e `booking` precisam de merge próprio: o spread é raso, e
     * a tela de Configurações grava por caminho pontilhado. Isto deixou de ser
     * hipótese em 11/08 — a primeira gravação real em produção deixou
     * `policies.booking` com UM campo, `lateToleranceMinutes`, e sem este
     * merge a barbearia perderia antecedência mínima, janela da agenda e prazo
     * do encaixe. Agenda com `minAdvanceMinutes: undefined` aceita reserva
     * para horário que já passou.
     *
     * Toda política que for objeto e virar editável precisa entrar aqui; as
     * demais só não estão porque ninguém grava parte delas ainda. */
    policies: {
      ...PLATFORM_DEFAULT_POLICIES,
      ...policies,
      booking: { ...PLATFORM_DEFAULT_POLICIES.booking, ...(policies.booking ?? {}) },
      paymentFees: { ...DEFAULT_PAYMENT_FEES, ...(policies.paymentFees ?? {}) },
    },
    /* Derivar do plano, não do catálogo completo.
     *
     * Era `{ ...ALL_FEATURES, ...features }`: documento sem o campo `features`
     * — que é exatamente o que `signUpBarbershop` criava — virava todo recurso
     * liberado. Todo cliente self-service ganhava o plano de cima de graça, sem
     * precisar de ataque nenhum. Agora a ausência resolve pelo plano contratado
     * e só o campo explícito sobrepõe. */
    features: { ...featuresForPlan(plan), ...features },
    schedule: { ...DEFAULT_SCHEDULE, ...((data.schedule ?? {}) as object) },
    trial: toTrial(data.trial),
    onboarding: toOnboarding(data.onboarding),
  };
}

/**
 * Valor gravado em `plan` → `PlanId`.
 *
 * O plano é a base do que está liberado, e é campo imutável pela regra — ao
 * contrário de `features`, que o dono conseguia escrever direto.
 *
 * Ausente, escrito errado ou de uma linha de planos antiga cai em
 * `PLANO_DE_ENTRADA`: barbearia sem contrato conhecido recebe o mínimo, nunca
 * o máximo. É o mesmo furo que fazia todo tenant self-service nascer com o
 * plano de cima, agora fechado do lado de fora — depois daqui, nenhum leitor
 * precisa de fallback.
 *
 * `entrada` e `completo` são a linha de dois níveis que existiu entre 11/08 e
 * a volta para três; documento gravado nesse intervalo é traduzido em vez de
 * rebaixado, porque rebaixar tiraria da barbearia algo que ela contratou.
 */
const PLANOS_ANTIGOS: Record<string, PlanId> = {
  entrada: "agenda",
  completo: "gestao",
};

function toPlan(raw: unknown): PlanId {
  if (typeof raw !== "string") return PLANO_DE_ENTRADA;
  if (raw in FEATURES_POR_PLANO) return raw as PlanId;
  return PLANOS_ANTIGOS[raw] ?? PLANO_DE_ENTRADA;
}

/**
 * Timestamp do Firestore → ISO.
 *
 * O tenant atravessa de Server para Client Component. `Timestamp` é uma classe
 * e o React recusa: "Only plain objects can be passed to Client Components".
 * TODA data que sai daqui precisa passar por esta função — foi assim que o
 * `onboarding.completedAt` derrubou a rota inteira com 500.
 *
 * Atende os três formatos porque são três origens reais: string ISO da REST,
 * `Timestamp` do SDK cliente e `Date`.
 */
function toISO(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof (value as { toDate?: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (value instanceof Date) return value.toISOString();
  return null;
}

function toTrial(raw: unknown): TenantTrial | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as { startedAt?: unknown; endsAt?: unknown };
  const startedAt = toISO(value.startedAt);
  const endsAt = toISO(value.endsAt);
  return startedAt && endsAt ? { startedAt, endsAt } : null;
}

function toOnboarding(raw: unknown): Tenant["onboarding"] {
  const value = (raw ?? {}) as Record<string, unknown>;
  return {
    completedSteps: Array.isArray(value.completedSteps)
      ? (value.completedSteps as Tenant["onboarding"]["completedSteps"])
      : [],
    completedAt: toISO(value.completedAt),
    sharedLink: value.sharedLink === true,
  };
}
