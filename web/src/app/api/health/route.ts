/**
 * GET /api/health — o contrato que o JP Projects Hub lê a cada 5 minutos, e
 * a verificação de disponibilidade do Cloud Monitoring (`docs/MONITORAMENTO.md`).
 * A regra está em `lib/saude.ts`; aqui só se mede: o Firestore (o site lê) e o
 * callable `healthcheck` (as functions respondem).
 */
import {
  julgarFirestore,
  julgarFunctions,
  montarSaude,
  urlDoHealthcheck,
  type Verificacao,
} from "@/lib/saude";

export const dynamic = "force-dynamic";

const LIMITE_MS = 8000;
const LIMITE_FUNCTIONS_MS = 10000;

function erroDeRede(err: unknown, limiteMs: number): string {
  return err instanceof Error && err.name === "TimeoutError"
    ? `sem resposta em ${limiteMs / 1000}s`
    : String(err instanceof Error ? err.message : err).slice(0, 160);
}

async function verificarFirestore(projectId: string): Promise<Verificacao> {
  const emEmulador = process.env.NEXT_PUBLIC_USE_EMULATOR === "true";
  const base = emEmulador
    ? `http://127.0.0.1:8080/v1/projects/${projectId}/databases/(default)/documents`
    : `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
  const t0 = Date.now();
  try {
    // Id comum de propósito: ids com dois sublinhados ("__x__") são RESERVADOS
    // no Firestore e voltam 400 — medido em 29/09, o endpoint diria "problema"
    // sempre. Se um dia uma barbearia usar este slug, a leitura volta 200, que
    // também é "respondeu".
    const res = await fetch(`${base}/slugs/saude-monitor-hub`, {
      cache: "no-store",
      signal: AbortSignal.timeout(LIMITE_MS),
    });
    // A mensagem do erro distingue "documento não existe" de "banco não existe".
    const mensagem = res.status === 404
      ? String(((await res.json().catch(() => null)) as { error?: { message?: string } } | null)?.error?.message ?? "")
      : "";
    return { ...julgarFirestore(res.status, mensagem), ms: Date.now() - t0 };
  } catch (err) {
    return { ok: false, ms: Date.now() - t0, erro: erroDeRede(err, LIMITE_MS) };
  }
}

/**
 * O callable `healthcheck` pelo HTTPS do protocolo callable. É anônimo e não
 * devolve nada além de `{ok, region}`; prova que a function sobe e responde.
 */
async function verificarFunctions(projectId: string): Promise<Verificacao> {
  const emEmulador = process.env.NEXT_PUBLIC_USE_EMULATOR === "true";
  const t0 = Date.now();
  try {
    const res = await fetch(urlDoHealthcheck(projectId, emEmulador), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: {} }),
      cache: "no-store",
      signal: AbortSignal.timeout(LIMITE_FUNCTIONS_MS),
    });
    const corpo = await res.json().catch(() => null);
    return { ...julgarFunctions(res.status, corpo), ms: Date.now() - t0 };
  } catch (err) {
    return { ok: false, ms: Date.now() - t0, erro: erroDeRede(err, LIMITE_FUNCTIONS_MS) };
  }
}

export async function GET() {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? null;
  const ausente: Verificacao = { ok: false, ms: 0, erro: "NEXT_PUBLIC_FIREBASE_PROJECT_ID ausente" };
  const [firestore, functions] = projectId
    ? await Promise.all([verificarFirestore(projectId), verificarFunctions(projectId)])
    : [ausente, ausente];
  const corpo = montarSaude({ checks: { firestore, functions }, projectId });
  return Response.json(corpo, {
    status: corpo.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
