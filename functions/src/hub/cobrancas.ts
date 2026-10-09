import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { idSeguro, vinculosDe } from "../acesso";
import { isentoDeCobranca } from "./contrato";
import { PLATAFORMA_TOKEN, PROJETO_DE_PRODUCAO, projetoAtual } from "./saida";

/**
 * A assinatura do dono, vista de dentro do Topete (29/09).
 *
 * Quem cobra é o Hub (boleto do Inter); o Topete só MOSTRA. Os boletos moram
 * lá (`cobrancas`, `subscriptions/sub-{tenant}`), e o Topete pergunta por
 * servidor, com o mesmo `PLATAFORMA_TOKEN` dos avisos — nunca pelo navegador,
 * que não pode ter o token nem ler o Firestore do Hub.
 *
 * Contrato do lado do Hub: `POST plataformaCobrancas` (ver
 * `docs/INTEGRACAO-HUB.md`, "Cobranças para o dono"):
 *   { produto, externoId, acao: "listar" }            → assinatura + boletos
 *   { produto, externoId, acao: "segunda_via", id }   → linha, Pix, PDF
 *
 * Três casos em que o Topete NÃO pergunta, e a tela diz por quê:
 *   - barbearia isenta (o O Siqueira): não há boleto a mostrar;
 *   - fora de produção: o DEV não fala com o Hub (mesma regra dos avisos);
 *   - o Hub ainda sem a rota (404): "ainda não disponível", não um erro.
 * A tela nunca inventa um boleto nem diz "em dia" sem o Hub ter dito.
 */

export const URL_DAS_COBRANCAS =
  "https://southamerica-east1-jpproject-hub.cloudfunctions.net/plataformaCobrancas";

/* O PDF vem do Inter na hora e pode passar de 10s (o Hub dá 30s do lado
 * dele). 25s cabe no limite da callable (60s) e ainda responde ao dono. Se
 * estourar, tentar de novo é rápido: linha e Pix ficam em cache no Hub. */
const TEMPO_LIMITE_MS = 25_000;

/** Situação do boleto como o dono entende. O Hub guarda o valor cru do Inter. */
export type SituacaoDoBoleto = "pago" | "aberto" | "atrasado" | "processando" | "cancelado";

export function situacaoDoBoleto(cru: unknown): SituacaoDoBoleto {
  switch (String(cru ?? "").toUpperCase()) {
    case "RECEBIDO":
    case "MARCADO_RECEBIDO":
      return "pago";
    case "ATRASADO":
    case "PROTESTO":
      return "atrasado";
    case "EM_PROCESSAMENTO":
      return "processando";
    case "CANCELADO":
    case "EXPIRADO":
    case "FALHA_EMISSAO":
      return "cancelado";
    default:
      // A_RECEBER e o que o Inter inventar depois: melhor "aberto" que "pago".
      return "aberto";
  }
}

export type Boleto = {
  id: string;
  valor: number;
  vencimento: string; // YYYY-MM-DD
  situacao: SituacaoDoBoleto;
  pagoEm: string | null;
};

export type AssinaturaNoHub = {
  plano: string | null;
  valor: number | null;
  ciclo: string | null;
  /** Total do ciclo em R$ (no anual, o valor à vista); ausente em Hub antigo. */
  valorCiclo: number | null;
  /** Hoje só "avista"; vem do Hub. */
  formaPagamento: string | null;
  /** Status comercial no Hub (ativo, trial, suspenso…). */
  status: string | null;
  proximoVencimento: string | null;
};

export type RespostaDaAssinatura =
  | { disponivel: true; isento: false; assinatura: AssinaturaNoHub; boletos: Boleto[] }
  | { disponivel: false; isento: boolean; motivo: "isento" | "fora_de_producao" | "hub_sem_rota" | "hub_fora" };

const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const numero = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const DATA = /^\d{4}-\d{2}-\d{2}/;

/** Lê a resposta do Hub com desconfiança: campo torto vira nulo, boleto torto sai da lista. */
export function lerRespostaDoHub(corpo: unknown): { assinatura: AssinaturaNoHub; boletos: Boleto[] } {
  const c = (corpo ?? {}) as Record<string, unknown>;
  const a = (c.assinatura ?? {}) as Record<string, unknown>;
  const lista = Array.isArray(c.cobrancas) ? c.cobrancas : [];
  const boletos: Boleto[] = [];
  for (const b of lista as Array<Record<string, unknown>>) {
    const id = texto(b?.id);
    const valor = numero(b?.valor);
    const vencimento = texto(b?.vencimento);
    if (!id || valor === null || !vencimento || !DATA.test(vencimento)) continue;
    boletos.push({
      id,
      valor,
      vencimento: vencimento.slice(0, 10),
      situacao: situacaoDoBoleto(b?.situacao),
      pagoEm: texto(b?.pagoEm),
    });
  }
  boletos.sort((x, y) => y.vencimento.localeCompare(x.vencimento));
  return {
    assinatura: {
      plano: texto(a.plano),
      valor: numero(a.valor),
      ciclo: texto(a.ciclo),
      valorCiclo: numero(a.valorCiclo),
      formaPagamento: texto(a.formaPagamento),
      status: texto(a.status),
      proximoVencimento: texto(a.proximoVencimento),
    },
    boletos: boletos.slice(0, 12),
  };
}

async function perguntarAoHub(corpo: Record<string, unknown>): Promise<{ status: number; json: unknown }> {
  const token = PLATAFORMA_TOKEN.value().trim();
  if (!token) throw new Error("PLATAFORMA_TOKEN vazio");
  const r = await fetch(URL_DAS_COBRANCAS, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ produto: "barber", ...corpo }),
    signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
  });
  const json = await r.json().catch(() => null);
  return { status: r.status, json };
}

/** A barbearia, lida DEPOIS da guarda de vínculo feita no handler. */
async function lerBarbearia(barbershopId: string) {
  const snap = await getFirestore().doc(`barbershops/${barbershopId}`).get();
  if (!snap.exists) throw new HttpsError("not-found", "Barbearia não encontrada.");
  return snap.data() ?? {};
}

/** Só o dono: a assinatura é contrato e dinheiro, não é da equipe. */
function exigirDono(request: { auth?: { uid: string } | null }, papel: string | undefined) {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Entre na sua conta.");
  if (papel !== "owner") throw new HttpsError("permission-denied", "Só o dono da barbearia vê a assinatura.");
}

export const minhaAssinatura = onCall<{ barbershopId: string }>(
  { secrets: [PLATAFORMA_TOKEN] },
  async (request): Promise<RespostaDaAssinatura> => {
    const barbershopId = idSeguro(request.data?.barbershopId, "Barbearia");
    exigirDono(request, vinculosDe(request)[barbershopId]);
    const shop = await lerBarbearia(barbershopId);
    if (isentoDeCobranca(shop)) return { disponivel: false, isento: true, motivo: "isento" };
    if (projetoAtual() !== PROJETO_DE_PRODUCAO) {
      return { disponivel: false, isento: false, motivo: "fora_de_producao" };
    }
    try {
      const r = await perguntarAoHub({ externoId: barbershopId, acao: "listar" });
      if (r.status === 404) return { disponivel: false, isento: false, motivo: "hub_sem_rota" };
      if (r.status < 200 || r.status >= 300) {
        console.error(`[hub] cobranças de ${barbershopId}: ${r.status} ${JSON.stringify(r.json).slice(0, 300)}`);
        return { disponivel: false, isento: false, motivo: "hub_fora" };
      }
      return { disponivel: true, isento: false, ...lerRespostaDoHub(r.json) };
    } catch (erro) {
      console.error(`[hub] cobranças de ${barbershopId}: ${erro instanceof Error ? erro.message : erro}`);
      return { disponivel: false, isento: false, motivo: "hub_fora" };
    }
  }
);

export type SegundaVia = {
  linhaDigitavel: string | null;
  pixCopiaECola: string | null;
  pdfBase64: string | null;
};

export const segundaVia = onCall<{ barbershopId: string; id: string }>(
  { secrets: [PLATAFORMA_TOKEN] },
  async (request): Promise<SegundaVia> => {
    const barbershopId = idSeguro(request.data?.barbershopId, "Barbearia");
    exigirDono(request, vinculosDe(request)[barbershopId]);
    const id = idSeguro(request.data?.id, "Boleto");
    const shop = await lerBarbearia(barbershopId);
    if (isentoDeCobranca(shop) || projetoAtual() !== PROJETO_DE_PRODUCAO) {
      throw new HttpsError("failed-precondition", "Não há boleto para esta barbearia.");
    }
    let r: { status: number; json: unknown };
    try {
      /* O Hub confere que o boleto é DESTA barbearia (externoId) antes de
       * devolver: sem isso, um id de outro cliente abriria o boleto dele. */
      r = await perguntarAoHub({ externoId: barbershopId, acao: "segunda_via", id });
    } catch {
      throw new HttpsError("unavailable", "Não conseguimos falar com a cobrança agora. Tente de novo em instantes.");
    }
    if (r.status === 404) throw new HttpsError("not-found", "Boleto não encontrado.");
    if (r.status === 503) {
      throw new HttpsError("unavailable", "O banco está fora do ar agora. Tente de novo em alguns minutos.");
    }
    if (r.status < 200 || r.status >= 300) {
      throw new HttpsError("unavailable", "Não conseguimos buscar o boleto agora. Tente de novo em instantes.");
    }
    const c = (r.json ?? {}) as Record<string, unknown>;
    return {
      linhaDigitavel: texto(c.linhaDigitavel),
      pixCopiaECola: texto(c.pixCopiaECola),
      pdfBase64: texto(c.pdfBase64),
    };
  }
);
