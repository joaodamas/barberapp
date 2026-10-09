/**
 * POST /api/erro — o coletor de erros do navegador.
 *
 * Sem auth de propósito: o erro pode acontecer antes do login. A defesa é
 * barata e em camadas: só aceita Origin do próprio produto, corpo de no máximo
 * 4 KB, campos truncados, e nada de dado pessoal (ver `lib/erro-front.ts`).
 * O front ainda limita a 5 por sessão. Responde 204 mesmo ao descartar um
 * corpo inútil, para não dar ao curioso um oráculo do que é aceito.
 */
import {
  LIMITE_CORPO_BYTES,
  montarLinhaDeLog,
  normalizarErro,
  origemPermitida,
  tenantDoHost,
} from "@/lib/erro-front";

export const dynamic = "force-dynamic";

const semConteudo = () => new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  if (!origemPermitida(origin, referer, { aceitarLocal: process.env.NODE_ENV !== "production" })) {
    return new Response(null, { status: 403 });
  }

  const declarado = Number(req.headers.get("content-length") ?? "0");
  if (declarado > LIMITE_CORPO_BYTES) return new Response(null, { status: 413 });
  // O cabeçalho pode mentir (ou faltar): o que vale é o que de fato chegou.
  const texto = await req.text().catch(() => "");
  if (texto.length > LIMITE_CORPO_BYTES) return new Response(null, { status: 413 });

  let corpo: unknown = null;
  try {
    corpo = JSON.parse(texto);
  } catch {
    return semConteudo();
  }
  const erro = normalizarErro(corpo);
  if (!erro) return semConteudo();

  let host: string | null = null;
  try {
    host = new URL(origin ?? referer ?? "").hostname.toLowerCase();
  } catch {
    host = null;
  }
  // JSON numa linha só no stdout: o Cloud Run/Functions o indexa como log estruturado.
  console.log(JSON.stringify(montarLinhaDeLog(erro, tenantDoHost(host))));
  return semConteudo();
}
