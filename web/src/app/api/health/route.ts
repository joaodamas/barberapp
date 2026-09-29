/**
 * GET /api/health — o contrato que o JP Projects Hub lê a cada 5 minutos.
 * A regra está em `lib/saude.ts`; aqui só se mede.
 */
import { julgarFirestore, montarSaude, type Verificacao } from "@/lib/saude";

export const dynamic = "force-dynamic";

const LIMITE_MS = 8000;

async function verificarFirestore(projectId: string): Promise<Verificacao> {
  const emEmulador = process.env.NEXT_PUBLIC_USE_EMULATOR === "true";
  const base = emEmulador
    ? `http://127.0.0.1:8080/v1/projects/${projectId}/databases/(default)/documents`
    : `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
  const t0 = Date.now();
  try {
    const res = await fetch(`${base}/slugs/__saude__`, {
      cache: "no-store",
      signal: AbortSignal.timeout(LIMITE_MS),
    });
    return { ...julgarFirestore(res.status), ms: Date.now() - t0 };
  } catch (err) {
    const erro = err instanceof Error && err.name === "TimeoutError"
      ? `sem resposta em ${LIMITE_MS / 1000}s`
      : String(err instanceof Error ? err.message : err).slice(0, 160);
    return { ok: false, ms: Date.now() - t0, erro };
  }
}

export async function GET() {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? null;
  const firestore: Verificacao = projectId
    ? await verificarFirestore(projectId)
    : { ok: false, ms: 0, erro: "NEXT_PUBLIC_FIREBASE_PROJECT_ID ausente" };
  const corpo = montarSaude({ checks: { firestore }, projectId });
  return Response.json(corpo, {
    status: corpo.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
