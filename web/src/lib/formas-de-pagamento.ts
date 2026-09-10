/**
 * As formas de recebimento da barbearia — e a taxa de cada uma.
 *
 * ## O que estava faltando
 *
 * `TenantPaymentFees` era fechado em quatro chaves: dinheiro, pix, débito,
 * crédito. A própria tela de Configurações já admitia o buraco — *"Crédito à
 * vista. Parcelado entra numa próxima versão."* O dono da barbearia piloto
 * encontrou o outro lado dele na primeira semana:
 *
 * > *"como também posso colocar mais taxa? Porque eu coloquei aqui a taxa de
 * > aproximação. Mas não coloquei a taxa de maquininha quando insere o cartão"*
 *
 * Aproximação e chip são preços diferentes na maquininha dele. Com quatro
 * chaves, uma das duas **tem** de estar errada em todo atendimento no crédito —
 * e o erro é silencioso, porque a taxa entra no DRE sem passar por tela nenhuma.
 *
 * ## Por que lista, e não mais chaves
 *
 * Alargar o enum (`credito_aproximacao`, `credito_chip`, `credito_2x`…) é
 * adivinhar a tabela da adquirente de cada barbearia — o mesmo erro que fez as
 * quatro chaves nascerem curtas, cometido de novo com mais palavras. Quem sabe
 * o que a maquininha cobra é quem paga a fatura dela.
 *
 * ## O que NÃO muda: a natureza do dinheiro
 *
 * Cada forma declara um `base` (`pix`/`cash`/`debit`/`credit`), e é ele que
 * continua sendo gravado em `paymentMethod`. Assim o fluxo de caixa por meio, o
 * DRE, os estornos, o Action Center e os 34 templates de WhatsApp seguem
 * funcionando sem saber que formas existem — eles perguntam *"entrou em
 * cartão?"*, não *"entrou por aproximação?"*.
 *
 * A forma é o DETALHE do instrumento, e ela existe para responder uma pergunta
 * só: **quanto a maquininha cobrou.**
 *
 * ⚠️ **PAR OBRIGATÓRIO com `functions/src/formas-de-pagamento.ts`.** A tela
 * mostra a taxa que o dono vai ver; o servidor congela a que ele vai pagar.
 * Divergir significa a tela prometer 3,49% e o DRE debitar 4,19% — sem erro em
 * log nenhum, e com a diferença aparecendo só no fim do mês.
 */

/** A natureza do dinheiro. Continua sendo o que vai em `paymentMethod`. */
export type MeioDePagamento = "pix" | "cash" | "debit" | "credit";

export type FormaDePagamento = {
  /** Estável e congelado no pagamento — nunca o rótulo. */
  id: string;
  label: string;
  base: MeioDePagamento;
  /** Percentual sobre o bruto. */
  feePct: number;
  active: boolean;
};

/** As quatro que toda barbearia tem desde sempre, na ordem do balcão. */
export const FORMAS_NATIVAS: Array<{ id: string; label: string; base: MeioDePagamento; chave: string }> = [
  { id: "pix", label: "Pix", base: "pix", chave: "pix" },
  { id: "cash", label: "Dinheiro", base: "cash", chave: "dinheiro" },
  { id: "debit", label: "Débito", base: "debit", chave: "debito" },
  { id: "credit", label: "Crédito", base: "credit", chave: "credito" },
];

type FeesLegado = Record<string, unknown> | null | undefined;

function pct(bruto: unknown): number {
  const n = Number(bruto);
  if (!Number.isFinite(n) || n < 0) return 0;
  /* Teto de sanidade: 100% de taxa não é maquininha, é digitação. Deixar passar
   * faria o líquido do atendimento nascer zero ou negativo, e o dono só
   * descobriria no fechamento do mês. */
  return Math.min(n, 100);
}

function ehMeio(v: unknown): v is MeioDePagamento {
  return v === "pix" || v === "cash" || v === "debit" || v === "credit";
}

/**
 * As formas desta barbearia, sempre — mesmo quando ela nunca abriu a tela.
 *
 * A barbearia que só tem `paymentFees` (todas as de hoje) recebe as quatro
 * nativas com a taxa que já estava lá. É o que permite a lista virar a fonte
 * sem migração nenhuma: quem nunca mexer continua com exatamente os quatro
 * botões de antes, com os mesmos percentuais.
 */
export function formasDoTenant(policies: {
  paymentForms?: unknown;
  paymentFees?: FeesLegado;
}): FormaDePagamento[] {
  const cadastradas = Array.isArray(policies?.paymentForms) ? policies.paymentForms : null;

  if (cadastradas && cadastradas.length > 0) {
    const limpas: FormaDePagamento[] = [];
    for (const f of cadastradas as Array<Record<string, unknown>>) {
      const id = String(f?.id ?? "").trim();
      const base = f?.base;
      if (!id || !ehMeio(base)) continue;
      limpas.push({
        id,
        label: String(f?.label ?? id),
        base,
        feePct: pct(f?.feePct),
        active: f?.active !== false,
      });
    }
    if (limpas.length > 0) return limpas;
  }

  const fees = (policies?.paymentFees ?? {}) as Record<string, unknown>;
  return FORMAS_NATIVAS.map((n) => ({
    id: n.id,
    label: n.label,
    base: n.base,
    feePct: pct(fees[n.chave]),
    active: true,
  }));
}

/** Só o que o balcão vê no fechamento. */
export function formasAtivas(policies: {
  paymentForms?: unknown;
  paymentFees?: FeesLegado;
}): FormaDePagamento[] {
  return formasDoTenant(policies).filter((f) => f.active);
}

/**
 * A taxa que vale para ESTE pagamento — a única régua que decide.
 *
 * A ordem é o contrato:
 *
 * 1. **A forma escolhida**, quando ela existe e ainda está cadastrada;
 * 2. **a primeira forma ativa daquele meio**, quando o pagamento não trouxe
 *    forma — é o caminho de todo documento anterior a este código, e de toda
 *    porta que ainda pergunta só "crédito ou débito";
 * 3. **zero**, que é o que uma barbearia sem taxa cadastrada de fato paga.
 *
 * Sem o passo 2, um atendimento antigo reaberto renasceria com taxa zero: o
 * pagamento existia, a maquininha cobrou, e o DRE passaria a afirmar que não.
 */
export function taxaDoPagamento(params: {
  formaId?: string | null;
  meio: MeioDePagamento | null;
  formas: FormaDePagamento[];
}): { feePct: number; forma: FormaDePagamento | null } {
  if (!params.meio) return { feePct: 0, forma: null };

  if (params.formaId) {
    const exata = params.formas.find((f) => f.id === params.formaId);
    if (exata) return { feePct: exata.feePct, forma: exata };
  }

  const doMeio = params.formas.find((f) => f.base === params.meio && f.active)
    ?? params.formas.find((f) => f.base === params.meio);
  return { feePct: doMeio?.feePct ?? 0, forma: doMeio ?? null };
}

/**
 * Nenhuma taxa preenchida — o gatilho do aviso no painel.
 *
 * Dinheiro e Pix com taxa zero são a verdade na maioria das barbearias; o que
 * denuncia o cadastro em branco é **cartão** a zero, porque maquininha nenhuma
 * é de graça.
 */
export function taxasEmBranco(formas: FormaDePagamento[] | null | undefined): boolean {
  /* Lista ausente é "não sei", e "não sei" não acusa ninguém: o aviso do Action
   * Center é crítico, e dispará-lo a partir de um estado não carregado seria
   * afirmar um problema que ninguém verificou. */
  if (!Array.isArray(formas)) return false;
  const cartao = formas.filter((f) => f.base === "debit" || f.base === "credit");
  if (cartao.length === 0) return false;
  return cartao.every((f) => !f.feePct);
}

/**
 * Um id estável a partir do rótulo que o dono digitou.
 *
 * Estável importa porque o id é **congelado** no pagamento: se ele mudasse ao
 * renomear "Crédito aproximação" para "Crédito por aproximação", todo pagamento
 * do mês passado passaria a apontar para uma forma que não existe mais — e
 * cairia no passo 2 da régua, com a taxa de outra forma.
 */
export function idDaForma(label: string, existentes: string[]): string {
  const base =
    label
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "forma";

  if (!existentes.includes(base)) return base;
  for (let i = 2; i < 100; i++) {
    const tentativa = `${base}-${i}`;
    if (!existentes.includes(tentativa)) return tentativa;
  }
  return `${base}-${existentes.length + 1}`;
}
