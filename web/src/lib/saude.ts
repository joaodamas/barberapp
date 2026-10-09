/**
 * Saúde — o contrato `/api/health` que o JP Projects Hub vigia a cada 5 min.
 *
 * Sem este endpoint o Hub só sabe se a PÁGINA abre; com ele, sabe se o
 * servidor consegue falar com o Firestore — o que separa "site no ar" de
 * "o cliente consegue agendar".
 *
 * Contrato (o mesmo dos outros produtos do Hub):
 *   { ok, product, projectId, version, time, checks, error? }
 * `ok` é false se uma verificação essencial falhar, e o HTTP vira 503.
 *
 * Não lê dado de barbearia nem de cliente: pergunta ao Firestore por um slug
 * que não existe. Resposta 404 do FIRESTORE prova que ele está de pé e que as
 * regras respondem — é a mesma leitura pública que resolve o subdomínio.
 * (Formato conferido contra a API real em 29/09/2026.)
 */

export type Verificacao = { ok: boolean; ms: number; erro?: string };

export const VERSAO_SAUDE = "0.1.0";

/** O veredito a partir das verificações. Puro, testado. */
export function montarSaude({ checks, projectId, agora = new Date() }: {
  checks: Record<string, Verificacao>;
  projectId: string | null;
  agora?: Date;
}) {
  const falhas = Object.entries(checks).filter(([, c]) => !c.ok);
  return {
    ok: falhas.length === 0,
    product: "topete",
    projectId,
    version: VERSAO_SAUDE,
    time: agora.toISOString(),
    checks,
    ...(falhas.length ? { error: falhas.map(([k, c]) => `${k}: ${c.erro ?? "falhou"}`).join("; ") } : {}),
  };
}

/** O endereço do callable `healthcheck` (HTTPS do protocolo callable). */
export function urlDoHealthcheck(projectId: string, emEmulador = false): string {
  return emEmulador
    ? `http://127.0.0.1:5001/${projectId}/southamerica-east1/healthcheck`
    : `https://southamerica-east1-${projectId}.cloudfunctions.net/healthcheck`;
}

/**
 * Lê a resposta do callable `healthcheck`. O protocolo callable devolve
 * `{"result":{"ok":true,...}}` com HTTP 200; erro vem como `{"error":{...}}`.
 * HTTP 200 sem `result.ok` não conta: pode ser um proxy no meio.
 */
export function julgarFunctions(status: number, corpo: unknown): Pick<Verificacao, "ok" | "erro"> {
  if (status !== 200) return { ok: false, erro: `functions respondeu HTTP ${status}` };
  const result = (corpo as { result?: { ok?: unknown } } | null)?.result;
  return result?.ok === true ? { ok: true } : { ok: false, erro: "functions respondeu sem result.ok" };
}

/**
 * Lê a resposta do Firestore. 200 quer dizer que respondeu. 404 SÓ conta
 * como "respondeu" quando é o DOCUMENTO que não existe — a REST também
 * devolve 404 quando o próprio banco `(default)` não existe (projeto errado,
 * banco removido), e esse é o pior caso possível para dizer "ok" (achado da
 * revisão do Codex no PR #78). 403 = regras recusando a leitura pública de
 * `slugs`, a mesma que resolve o subdomínio; 5xx = Firestore com falha.
 */
export function julgarFirestore(status: number, mensagem = ""): Pick<Verificacao, "ok" | "erro"> {
  if (status === 200) return { ok: true };
  if (status === 404) {
    return /^Document ".*" not found/i.test(mensagem.trim())
      ? { ok: true }
      : { ok: false, erro: `Firestore 404 sem documento: ${mensagem.slice(0, 120) || "banco inexistente?"}` };
  }
  if (status === 403) return { ok: false, erro: "leitura pública de slugs recusada (403)" };
  return { ok: false, erro: `Firestore respondeu HTTP ${status}` };
}
