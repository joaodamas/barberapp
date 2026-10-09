/**
 * Erros do navegador que chegam ao log do servidor — a parte PURA.
 *
 * O desenho: o front manda um JSON pequeno para `POST /api/erro`; a rota o
 * escreve no stdout com `severity: "ERROR"`; o Cloud Logging o indexa como log
 * estruturado e a política de alerta "Topete · erro no site"
 * (`jsonPayload.origem="front"`) manda o e-mail. Sem serviço de terceiro.
 *
 * Aqui mora o que merece teste: de onde um pedido é aceito, o que se guarda
 * (e o que NUNCA se guarda) e como o navegador evita virar enxurrada.
 */

/** Tamanho máximo do corpo aceito pela rota, em bytes. */
export const LIMITE_CORPO_BYTES = 4096;

/** Teto por campo — o log não precisa de mais para achar a causa. */
const LIMITES = { mensagem: 300, digest: 80, rota: 200, userAgent: 200, tipo: 24 } as const;

/** No máximo isto por sessão do navegador (aba) — o resto é descartado. */
export const MAXIMO_POR_SESSAO = 5;

const RAIZES = ["jpproject.com.br", "topete.com.br"];
const HOSTS_EXATOS = ["cortehub-dev.web.app", "axon-barber.web.app"];

/** Extrai o host de uma URL/Origin; null se não for uma URL válida. */
function hostDe(valor: string | null | undefined): string | null {
  if (!valor) return null;
  try {
    return new URL(valor).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** O host é do produto? Raiz, subdomínio de barbearia ou os sites do Hosting. */
export function hostConhecido(host: string | null): boolean {
  if (!host) return false;
  if (HOSTS_EXATOS.includes(host)) return true;
  return RAIZES.some((raiz) => host === raiz || host.endsWith(`.${raiz}`));
}

/**
 * Aceita o pedido só se a Origin (ou, na falta dela, o Referer) for um host
 * conhecido. Não é autenticação — qualquer um pode forjar o header fora de um
 * navegador —, é o freio contra o uso casual do endpoint por outros sites.
 * O resto do abuso é contido pelo limite de tamanho e pelo truncamento.
 */
export function origemPermitida(
  origin: string | null | undefined,
  referer: string | null | undefined,
  { aceitarLocal = false }: { aceitarLocal?: boolean } = {},
): boolean {
  const host = hostDe(origin) ?? hostDe(referer);
  if (aceitarLocal && host && (host === "localhost" || host.endsWith(".lvh.me") || host === "127.0.0.1")) return true;
  return hostConhecido(host);
}

/** A barbearia do host: o primeiro rótulo de `osiqueira.jpproject.com.br`. */
export function tenantDoHost(host: string | null): string | null {
  if (!host) return null;
  for (const raiz of RAIZES) {
    if (host.endsWith(`.${raiz}`)) {
      const sub = host.slice(0, -(raiz.length + 1));
      return sub && !sub.includes(".") && sub !== "www" ? sub : null;
    }
  }
  return null;
}

/**
 * Tira o que pode identificar uma pessoa de um texto livre: e-mail e
 * sequências longas de dígitos (telefone, CPF, com ou sem máscara). Mensagem de
 * erro de biblioteca às vezes carrega o valor que o usuário digitou.
 */
export function tirarDadosPessoais(texto: string): string {
  return texto
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[e-mail]")
    .replace(/\+?\d[\d\s().-]{6,}\d/g, "[número]");
}

const cortar = (v: unknown, max: number): string =>
  typeof v === "string" ? tirarDadosPessoais(v).replace(/\s+/g, " ").trim().slice(0, max) : "";

/** A rota só guarda o caminho: query e hash podem carregar token ou telefone. */
function caminhoDe(v: unknown): string {
  if (typeof v !== "string") return "";
  const semQuery = v.split(/[?#]/)[0];
  try {
    return cortar(new URL(semQuery, "https://x.invalid").pathname, LIMITES.rota);
  } catch {
    return cortar(semQuery, LIMITES.rota);
  }
}

export type ErroDoFront = {
  tipo: string;
  mensagem: string;
  digest: string;
  rota: string;
  userAgent: string;
};

/**
 * Normaliza o corpo recebido. Devolve null se não houver mensagem — sem ela
 * o registro não ajuda ninguém e só gastaria cota de log.
 */
export function normalizarErro(corpo: unknown): ErroDoFront | null {
  if (!corpo || typeof corpo !== "object") return null;
  const c = corpo as Record<string, unknown>;
  const mensagem = cortar(c.mensagem, LIMITES.mensagem);
  if (!mensagem) return null;
  return {
    tipo: cortar(c.tipo, LIMITES.tipo) || "desconhecido",
    mensagem,
    digest: cortar(c.digest, LIMITES.digest),
    rota: caminhoDe(c.rota),
    userAgent: cortar(c.userAgent, LIMITES.userAgent),
  };
}

/**
 * A linha de log. `severity` e `message` são campos especiais do Cloud
 * Logging; `origem` é o marcador que a política de alerta filtra.
 */
export function montarLinhaDeLog(erro: ErroDoFront, tenant: string | null) {
  return {
    severity: "ERROR",
    message: `[front] ${erro.mensagem}`,
    origem: "front",
    tipo: erro.tipo,
    digest: erro.digest || undefined,
    rota: erro.rota,
    tenant: tenant ?? undefined,
    userAgent: erro.userAgent,
  };
}

// ── Lado do navegador ─────────────────────────────────────────────────────

type EntradaDoRelator = Pick<ErroDoFront, "tipo" | "mensagem" | "digest"> & { rota?: string };
export type RelatorDeErros = (erro: EntradaDoRelator) => boolean;

/**
 * Cria o relator que o navegador usa: deduplica mensagem igual e para depois
 * de `maximo` envios. Devolve true se mandou, false se descartou. O envio em
 * si é injetado — o teste não precisa de `fetch`.
 */
export function criarRelator(
  enviar: (erro: ErroDoFront) => void,
  { maximo = MAXIMO_POR_SESSAO, rota = () => "", userAgent = () => "" } = {},
): RelatorDeErros {
  const vistas = new Set<string>();
  let enviados = 0;
  return (erro) => {
    if (enviados >= maximo) return false;
    const chave = `${erro.tipo}|${erro.digest}|${erro.mensagem}`.slice(0, 400);
    if (vistas.has(chave)) return false;
    vistas.add(chave);
    enviados += 1;
    enviar({ ...erro, rota: erro.rota ?? rota(), userAgent: userAgent() });
    return true;
  };
}
