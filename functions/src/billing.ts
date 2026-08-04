import { onSchedule } from "firebase-functions/v2/scheduler";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

/**
 * Rotina diária de estado da assinatura.
 *
 * Existe porque **trial não gera evento**. Todo o resto do ciclo de cobrança é
 * empurrado pelo provedor de pagamento — pagou, falhou, cancelou —, mas o fim
 * dos 7 dias é apenas uma data passando. Sem esta rotina, uma barbearia em
 * teste continua em `trial` para sempre, e o gating nunca dispara.
 *
 * Roda uma vez por dia, e não a cada minuto, de propósito: a diferença entre
 * suspender às 3h e às 15h não muda nada para o dono, e uma função por minuto
 * multiplicaria por 1.440 a leitura de uma coleção que só cresce.
 *
 * `dryRun` no início: enquanto não houver cliente pagante, esta função REGISTRA
 * o que faria e não muda nada. Rotina que suspende conta é do tipo que só se
 * confia depois de ver o que ela decidiria — e o custo de descobrir errado é o
 * dono perder acesso sem motivo.
 */

/** Enquanto for `true`, a rotina só registra o que faria. */
const DRY_RUN = true;

const hojeISO = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

export const revisarAssinaturas = onSchedule(
  { schedule: "0 6 * * *", timeZone: "America/Sao_Paulo", region: "southamerica-east1" },
  async () => {
    const db = getFirestore();
    const agora = Date.now();
    const decisoes: string[] = [];

    const barbearias = await db.collection("barbershops").get();

    for (const shop of barbearias.docs) {
      const status = shop.get("status");
      const nome = shop.get("brand.name") ?? shop.id;

      /* ---- Trial vencido → suspensa ---- */
      if (status === "trial") {
        const fim = shop.get("trial.endsAt");
        const fimMs = fim?.toDate ? fim.toDate().getTime() : Date.parse(String(fim ?? ""));
        if (!Number.isFinite(fimMs)) {
          console.warn(`[assinaturas] ${nome}: trial sem data de fim válida`);
          continue;
        }
        if (fimMs <= agora) {
          decisoes.push(`${nome}: trial vencido → suspensa`);
          if (!DRY_RUN) {
            await shop.ref.update({
              status: "suspenso",
              suspendedAt: FieldValue.serverTimestamp(),
              suspendedReason: "trial_vencido",
            });
          }
        }
        continue;
      }

      /* ---- Ativa com pagamento vencido → régua ---- */
      if (status === "ativo") {
        const billing = await shop.ref.collection("private").doc("billing").get();
        const pagoAte = billing.get("paidUntil");
        if (!pagoAte) continue;

        const pagoAteMs = pagoAte?.toDate ? pagoAte.toDate().getTime() : Date.parse(String(pagoAte));
        if (!Number.isFinite(pagoAteMs) || pagoAteMs > agora) continue;

        const diasVencido = Math.floor((agora - pagoAteMs) / 86_400_000);
        /* Sete dias de régua antes de suspender. Cartão recusado quase nunca é
         * falta de dinheiro — é limite ou validade, e isso se resolve em dias. */
        if (diasVencido >= 7) {
          decisoes.push(`${nome}: ${diasVencido} dias vencido → suspensa`);
          if (!DRY_RUN) {
            await shop.ref.update({
              status: "suspenso",
              suspendedAt: FieldValue.serverTimestamp(),
              suspendedReason: "inadimplencia",
            });
          }
        } else {
          decisoes.push(`${nome}: ${diasVencido} dias vencido → régua (estágio ${diasVencido})`);
          if (!DRY_RUN) {
            await billing.ref.set({ dunningStage: diasVencido }, { merge: true });
          }
        }
      }
    }

    console.info(
      `[assinaturas] ${hojeISO()} · ${barbearias.size} barbearia(s) · ` +
        `${decisoes.length} decisão(ões)${DRY_RUN ? " (SIMULAÇÃO — nada foi alterado)" : ""}`
    );
    for (const d of decisoes) console.info(`  ${d}`);
  }
);
