import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineString } from "firebase-functions/params";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { materializarConclusao } from "./financial-events";
import { hojeNoFuso, localeDoDocumento } from "./locale";
import { enviar, TELEGRAM_BOT_TOKEN } from "./telegram/api";

/**
 * Conferência noturna do financeiro (05/10, auditoria P0-2).
 *
 * Todo atendimento concluído tem comissão — inclusive o coberto pelo plano e
 * a cortesia —, e o pagamento nasce na MESMA transação que ela. Então
 * "concluído sem comissão" é exatamente o sintoma de um gatilho que não rodou.
 * Antes, isso deixava caixa, DRE e acerto do barbeiro menores sem ninguém saber.
 *
 * - Primeira conclusão sem comissão: refaz pelo MESMO caminho do gatilho
 *   (`materializarConclusao`), que é idempotente.
 * - Reconclusão (conclusão desfeita e refeita) sem a comissão do ciclo: NÃO
 *   refaz sozinha — o ciclo depende do evento original. Só alerta.
 *
 * Alerta: registro em `alertas_da_plataforma` + log de erro e, quando
 * configurado, mensagem no Telegram da plataforma (`PLATAFORMA_TELEGRAM_CHAT_ID`).
 */

/** Chat do Telegram de quem opera a plataforma. Vazio = só registro e log. */
const PLATAFORMA_TELEGRAM_CHAT_ID = defineString("PLATAFORMA_TELEGRAM_CHAT_ID", { default: "" });

const JANELA_DIAS = 7;

export type SituacaoDaConclusao = "ok" | "refazer" | "alertar";

/** Pura: o que fazer com um atendimento concluído, dado o que existe dele. */
export function situacaoDaConclusao(params: {
  reconclusao: boolean;
  temComissao: boolean;
}): SituacaoDaConclusao {
  if (params.temComissao) return "ok";
  return params.reconclusao ? "alertar" : "refazer";
}

/** `AAAA-MM-DD` deslocado em dias. */
export function diasAntes(iso: string, dias: number): string {
  const t = Date.parse(`${iso}T00:00:00Z`) - dias * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

export const conferirFinanceiroDaNoite = onSchedule(
  {
    schedule: "30 3 * * *",
    timeZone: "America/Sao_Paulo",
    region: "southamerica-east1",
    timeoutSeconds: 540,
    secrets: [TELEGRAM_BOT_TOKEN],
  },
  async () => {
    const db = getFirestore();
    const barbearias = await db.collection("barbershops").get();
    const refeitos: string[] = [];
    const pendentes: string[] = [];
    const falhas: string[] = [];

    for (const shop of barbearias.docs) {
      /* Uma loja com problema não pode impedir a conferência das outras. */
      try {
        const hoje = hojeNoFuso(localeDoDocumento(shop.data()).timeZone);
        const concluidos = await shop.ref
          .collection("bookings")
          .where("status", "==", "completed")
          .where("date", ">=", diasAntes(hoje, JANELA_DIAS))
          .get();

        for (const reserva of concluidos.docs) {
          const dados = reserva.data();
          /* Histórico importado não passou pelo gatilho por desenho. */
          if (dados.origin === "importacao") continue;
          const ciclo = dados.cicloFinanceiro as { revertidoEm?: unknown; comissaoVigenteId?: string } | undefined;
          const reconclusao = Boolean(ciclo?.revertidoEm);
          const idDaComissao = reconclusao && ciclo?.comissaoVigenteId
            ? ciclo.comissaoVigenteId
            : `comissao_${reserva.id}`;
          const comissao = await shop.ref.collection("commissions").doc(idDaComissao).get();
          const situacao = situacaoDaConclusao({ reconclusao, temComissao: comissao.exists });
          const rotulo = `${shop.id}/${reserva.id} (${dados.date} ${dados.time ?? ""})`;

          if (situacao === "refazer") {
            try {
              await materializarConclusao({
                db,
                barbershopId: shop.id,
                bookingId: reserva.id,
                depois: dados,
                chaveDoEvento: `conferencia-${hoje}`,
              });
              refeitos.push(rotulo);
            } catch (err) {
              falhas.push(`${rotulo}: ${(err as Error)?.message ?? err}`);
            }
          } else if (situacao === "alertar") {
            pendentes.push(rotulo);
          }
        }
      } catch (err) {
        falhas.push(`${shop.id}: ${(err as Error)?.message ?? err}`);
      }
    }

    if (refeitos.length === 0 && pendentes.length === 0 && falhas.length === 0) {
      console.info("[conferencia] financeiro em dia.");
      return;
    }

    const resumo = { refeitos, pendentes, falhas };
    console.error("[conferencia] o financeiro precisou de atenção", JSON.stringify(resumo));
    await db.collection("alertas_da_plataforma").add({
      tipo: "conferencia_financeira",
      ...resumo,
      criadoEm: FieldValue.serverTimestamp(),
    });

    const chat = PLATAFORMA_TELEGRAM_CHAT_ID.value().trim();
    if (chat) {
      const linhas = [
        "<b>Conferência do financeiro</b>",
        refeitos.length ? `Refeitos: ${refeitos.length} atendimento(s) que estavam sem pagamento/comissão.` : "",
        pendentes.length ? `Precisam de olhar: ${pendentes.length} (conclusão refeita sem comissão do ciclo).` : "",
        falhas.length ? `Falhas: ${falhas.length}. Ver alertas_da_plataforma.` : "",
      ].filter(Boolean);
      await enviar(chat, linhas.join("\n"));
    }
  }
);
