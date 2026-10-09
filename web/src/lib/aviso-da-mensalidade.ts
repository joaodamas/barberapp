import type { SubscriberDoc, SubscriptionInvoiceDoc } from "@/lib/domain";
import { estagioDaFatura, ESTAGIOS, type EstagioDaRegua } from "@/lib/mensalidade";
import { formatBRL } from "@/lib/format";
import { contar } from "@/lib/plural";

/**
 * O aviso de vencimento do mensalista — a régua D-5 … D+5 saindo da contagem
 * da tela Mensal e chegando nas duas pontas: o app do cliente (que vê o próprio
 * vencimento) e o painel (que lembra quem está perto de vencer).
 *
 * ## O que isto NÃO é
 *
 * Não é envio. O produto não manda mensagem sozinho: aqui só se ESCREVE o
 * texto, e quem aperta "Lembrar no WhatsApp" é o dono. Nenhuma frase daqui
 * promete um aviso que ninguém dispara.
 *
 * Funções puras, sem Firebase: testáveis sem ambiente.
 */

type Fatura = Pick<
  SubscriptionInvoiceDoc,
  "competencia" | "dueDate" | "status" | "amount" | "planName"
>;

/**
 * Que dia é hoje NO FUSO DA LOJA (`YYYY-MM-DD`). `toISODate(new Date())` usa o
 * fuso do aparelho: quem está em outro fuso veria "vence hoje" no dia errado.
 */
export function hojeNoFuso(timeZone: string, agora: Date = new Date()): string {
  try {
    /* "en-CA" formata como AAAA-MM-DD. */
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(agora);
  } catch {
    /* Fuso inválido no cadastro não pode derrubar a tela. */
    const m = String(agora.getMonth() + 1).padStart(2, "0");
    const d = String(agora.getDate()).padStart(2, "0");
    return `${agora.getFullYear()}-${m}-${d}`;
  }
}

/** Dias até o vencimento: positivo antes, 0 no dia, negativo depois. */
export function diasParaVencer(dueDate: string, hoje: string): number {
  return Math.round(
    (Date.parse(`${dueDate}T00:00:00Z`) - Date.parse(`${hoje}T00:00:00Z`)) / 86_400_000
  );
}

/** `AAAA-MM-DD` → `dd/mm`. */
export function dataCurtaDoAviso(iso: string): string {
  const [, m, d] = iso.split("-");
  return m && d ? `${d}/${m}` : iso;
}

/**
 * A fatura que importa para este cliente: a de competência mais antiga ainda
 * aberta (dívida velha não some porque o mês virou); se não há, a paga do mês.
 */
export function faturaRelevante<T extends Fatura>(faturas: readonly T[], hoje: string): T | null {
  const abertas = faturas
    .filter((f) => f.status === "aberta")
    .sort((a, b) =>
      a.competencia !== b.competencia
        ? a.competencia < b.competencia ? -1 : 1
        : a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0
    );
  if (abertas.length > 0) return abertas[0];
  const mes = hoje.slice(0, 7);
  return faturas.find((f) => f.status === "paga" && f.competencia === mes) ?? null;
}

/**
 * Próximo vencimento, para a linha "Plano em dia · renova em dd/mm".
 * `nextCharge` quando é uma data futura válida; senão deriva do `billingDay`
 * (31 cai no último dia do mês curto). Sem nenhum dos dois, `null`.
 */
export function proximoVencimento(
  assinatura: Pick<SubscriberDoc, "nextCharge" | "billingDay">,
  hoje: string
): string | null {
  const n = assinatura.nextCharge;
  if (n && /^\d{4}-\d{2}-\d{2}$/.test(n) && n >= hoje) return n;
  const dia = Number(assinatura.billingDay);
  if (!Number.isInteger(dia) || dia < 1 || dia > 31) return null;
  let [ano, mes] = hoje.split("-").map(Number);
  for (let i = 0; i < 2; i++) {
    const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
    const iso = `${ano}-${String(mes).padStart(2, "0")}-${String(Math.min(dia, ultimo)).padStart(2, "0")}`;
    if (iso >= hoje) return iso;
    mes += 1;
    if (mes > 12) {
      mes = 1;
      ano += 1;
    }
  }
  return null;
}

export type TomDoAviso = "neutro" | "atencao" | "alerta";

export type AvisoDoCliente =
  | { tipo: "nenhum" }
  | { tipo: "em-dia"; texto: string }
  | {
      tipo: "aviso";
      estagio: EstagioDaRegua;
      tom: TomDoAviso;
      /** Frase principal. */
      texto: string;
      /** Mostra a orientação "Como pagar". */
      comoPagar: boolean;
      /** Oferece o botão de WhatsApp da barbearia. */
      chamarBarbearia: boolean;
    };

/**
 * O que o cliente lê, por estágio. Sem fatura perto de vencer, só a linha
 * discreta — e sem dado nenhum, nada: não se afirma dívida (nem "em dia") sem
 * lastro.
 */
export function avisoDoCliente(
  fatura: Fatura | null,
  assinatura: Pick<SubscriberDoc, "nextCharge" | "billingDay">,
  hoje: string
): AvisoDoCliente {
  const linhaEmDia = (vencimento: string | null): AvisoDoCliente => ({
    tipo: "em-dia",
    texto: vencimento ? `Plano em dia · renova em ${dataCurtaDoAviso(vencimento)}` : "Plano em dia",
  });

  if (!fatura) return { tipo: "nenhum" };
  if (fatura.status === "paga") return linhaEmDia(proximoVencimento(assinatura, hoje));
  if (fatura.status !== "aberta") return { tipo: "nenhum" };

  const estagio = estagioDaFatura(fatura, hoje);
  /* Aberta, mas a mais de 5 dias do vencimento: nada a cobrar ainda. */
  if (!estagio) return linhaEmDia(fatura.dueDate);

  const dias = diasParaVencer(fatura.dueDate, hoje);
  const valor = formatBRL(fatura.amount);
  const data = dataCurtaDoAviso(fatura.dueDate);

  switch (estagio) {
    case "D-5":
    case "D-3":
      return {
        tipo: "aviso",
        estagio,
        tom: "neutro",
        texto: `Sua mensalidade de ${valor} vence em ${contar(dias, "dia", "dias")} (${data}). Seus cortes do plano renovam nesse dia.`,
        comoPagar: false,
        chamarBarbearia: false,
      };
    case "D-1":
      return {
        tipo: "aviso",
        estagio,
        tom: "atencao",
        texto: `Sua mensalidade de ${valor} vence amanhã (${data}).`,
        comoPagar: true,
        chamarBarbearia: true,
      };
    case "D0":
      return {
        tipo: "aviso",
        estagio,
        tom: "atencao",
        texto: `Sua mensalidade de ${valor} vence hoje (${data}).`,
        comoPagar: true,
        chamarBarbearia: true,
      };
    case "D+1":
    case "D+3":
      return {
        tipo: "aviso",
        estagio,
        tom: "atencao",
        texto: `Sua mensalidade de ${valor} venceu há ${contar(-dias, "dia", "dias")} (${data}).`,
        comoPagar: true,
        chamarBarbearia: true,
      };
    case "D+5":
      return {
        tipo: "aviso",
        estagio,
        tom: "alerta",
        texto: `Mensalidade atrasada há ${contar(-dias, "dia", "dias")}. Fale com a barbearia para continuar usando o plano.`,
        comoPagar: false,
        chamarBarbearia: true,
      };
  }
}

/** A ficha da loja não tem forma de pagamento/Pix cadastrada: combina-se. */
export const COMO_PAGAR = "combine com a barbearia.";

/** Mensagem pronta do CLIENTE para a barbearia (botão do app). */
export function mensagemParaABarbearia(fatura: Fatura): string {
  return `Olá! Sobre a minha mensalidade do plano ${fatura.planName} (${formatBRL(fatura.amount)}, vencimento ${dataCurtaDoAviso(fatura.dueDate)}): quero combinar o pagamento.`;
}

/* ------------------------------ lado do dono ------------------------------ */

export type SituacaoNaRegua = {
  estagio: EstagioDaRegua | null;
  /** Etiqueta do painel: "Vence em 3 dias", "Vence hoje", "Atrasado 3 dias", "Em dia". */
  rotulo: string;
  tom: "success" | "neutral" | "gold" | "danger";
  dias: number;
};

/** Etiqueta da fatura relevante do mensalista. `null` sem fatura que diga algo. */
export function situacaoNaRegua(fatura: Fatura | null, hoje: string): SituacaoNaRegua | null {
  if (!fatura) return null;
  if (fatura.status === "paga") return { estagio: null, rotulo: "Em dia", tom: "success", dias: 0 };
  if (fatura.status !== "aberta") return null;
  const dias = diasParaVencer(fatura.dueDate, hoje);
  const estagio = estagioDaFatura(fatura, hoje);
  if (dias > 5) return { estagio, rotulo: "Em dia", tom: "success", dias };
  if (dias > 1) return { estagio, rotulo: `Vence em ${dias} dias`, tom: "gold", dias };
  if (dias === 1) return { estagio, rotulo: "Vence amanhã", tom: "gold", dias };
  if (dias === 0) return { estagio, rotulo: "Vence hoje", tom: "gold", dias };
  return { estagio, rotulo: `Atrasado ${contar(-dias, "dia", "dias")}`, tom: "danger", dias };
}

/**
 * "Precisa lembrar hoje": caiu exatamente num marco da régua (5, 3, 1 dia
 * antes; no dia; 1 e 3 depois) ou está a 5 dias ou mais de atraso — esses
 * ficam na lista todo dia até pagarem.
 */
export function precisaLembrarHoje(fatura: Fatura | null, hoje: string): boolean {
  if (!fatura || fatura.status !== "aberta") return false;
  const dias = diasParaVencer(fatura.dueDate, hoje);
  return dias === 5 || dias === 3 || dias === 1 || dias === 0 || dias === -1 || dias === -3 || dias <= -5;
}

/** Quantos mensalistas há em cada marco da régua (uma fatura por mensalista). */
export function contagemPorEstagio(
  faturas: ReadonlyArray<Fatura | null>,
  hoje: string
): Record<EstagioDaRegua, number> {
  const r = Object.fromEntries(ESTAGIOS.map((e) => [e, 0])) as Record<EstagioDaRegua, number>;
  for (const f of faturas) {
    const e = f ? estagioDaFatura(f, hoje) : null;
    if (e) r[e]++;
  }
  return r;
}

/**
 * Mensagem pronta que o DONO manda ao cliente. O dono revisa e envia no
 * próprio WhatsApp; nada sai sozinho.
 */
export function mensagemDeLembrete(
  fatura: Fatura,
  hoje: string,
  nomeDoCliente: string,
  nomeDaLoja: string
): string {
  const nome = nomeDoCliente.trim().split(/\s+/)[0];
  const saudacao = nome ? `Oi, ${nome}!` : "Oi!";
  const dias = diasParaVencer(fatura.dueDate, hoje);
  const plano = `${fatura.planName} (${formatBRL(fatura.amount)})`;
  const data = dataCurtaDoAviso(fatura.dueDate);
  let corpo: string;
  if (dias > 1) {
    corpo = `Sua mensalidade do plano ${plano} vence em ${contar(dias, "dia", "dias")}, dia ${data}.`;
  } else if (dias === 1) {
    corpo = `Sua mensalidade do plano ${plano} vence amanhã, dia ${data}.`;
  } else if (dias === 0) {
    corpo = `Hoje é o vencimento da sua mensalidade do plano ${plano}.`;
  } else {
    corpo = `Sua mensalidade do plano ${plano} venceu dia ${data} e ainda não consta como paga.`;
  }
  const fecho =
    dias >= 0
      ? "Qualquer dúvida de como pagar, é só responder por aqui."
      : "Se já pagou, me avise por aqui; se não, vamos acertar para você continuar usando o plano.";
  return `${saudacao} ${corpo} ${fecho} — ${nomeDaLoja}`;
}
