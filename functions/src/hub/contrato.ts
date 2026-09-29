import { createHash, timingSafeEqual } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { PRECOS_POR_PLANO, toPlanId, type PlanId } from "../plans";
import { validateSlug } from "../signup";
import { camposDeEncerramento, camposDeReabertura } from "../data-deletion";

/**
 * O contrato com o JP Projects Hub, na parte que não precisa de rede nem de
 * banco.
 *
 * O contrato está em `hub/docs/CONTRATO-PLATAFORMA-BARBER.md` e o lado de cá em
 * `docs/INTEGRACAO-HUB.md`. A regra que atravessa tudo: **o Hub manda no
 * dinheiro, o Topete manda na operação**. Por isso nada aqui muda plano ou
 * valor cobrado; o que o dono pede vira aviso, e quem aplica é o operador no
 * Hub.
 *
 * Separado dos handlers pelo motivo de sempre neste repositório: dentro de um
 * `onRequest` a validação e a decisão só se exerceriam com emulador, e são
 * elas que decidem se uma barbearia é suspensa ou encerrada por uma chamada
 * de fora.
 */

/* ------------------------------------------------------------------ */
/* Autenticação                                                        */
/* ------------------------------------------------------------------ */

/** O token de `Authorization: Bearer <token>`, ou vazio. */
export function tokenDoCabecalho(cabecalho: unknown): string {
  const m = /^Bearer\s+(.+)$/i.exec(String(cabecalho ?? "").trim());
  return m ? m[1].trim() : "";
}

/**
 * Compara o token recebido com o esperado em tempo constante.
 *
 * `timingSafeEqual` exige buffers do MESMO tamanho, e comparar o tamanho antes
 * vazaria o tamanho do segredo pelo tempo de resposta. Os dois lados passam
 * por SHA-256 e a comparação é sempre entre 32 bytes.
 *
 * Esperado vazio recusa sempre: segredo não configurado não pode virar "aceita
 * qualquer coisa" — `"" === ""` seria exatamente isso.
 */
export function tokenConfere(recebido: string, esperado: string): boolean {
  const e = (esperado ?? "").trim();
  const r = (recebido ?? "").trim();
  if (!e || !r) return false;
  const hash = (v: string) => createHash("sha256").update(v, "utf8").digest();
  return timingSafeEqual(hash(r), hash(e));
}

/* ------------------------------------------------------------------ */
/* Rotas                                                               */
/* ------------------------------------------------------------------ */

export type Rota = "provisionar" | "status";

/**
 * A rota a partir de `req.path`.
 *
 * Chamada pela URL da função (`.../plataforma/provisionar`), o caminho chega
 * como `/provisionar`. Aceita também `/plataforma/provisionar`, para o dia em
 * que a API passar por um rewrite do Hosting e o prefixo vier junto.
 */
export function rotaDe(caminho: unknown): Rota | null {
  const limpo = String(caminho ?? "")
    .replace(/\/+$/, "")
    .replace(/^\/plataforma(?=\/)/, "");
  if (limpo === "/provisionar") return "provisionar";
  if (limpo === "/status") return "status";
  return null;
}

/* ------------------------------------------------------------------ */
/* Corpo das chamadas do Hub                                           */
/* ------------------------------------------------------------------ */

type Validacao<T> = { ok: true; dados: T } | { ok: false; erro: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Mesmo formato que o Hub aceita para eventoId e externoId: sem barra, sem espaço. */
const ID_EXTERNO = /^[^/\s]{1,200}$/;
const ID_DOCUMENTO = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * Plano que o Hub mandou → plano do Topete.
 *
 * Nulo ou vazio vira o plano de entrada (decisão de 29/09): quem define o que
 * é cobrado é o Hub, e o operador sobe o plano depois com `definirPlano`.
 *
 * Nome desconhecido é RECUSADO, e não rebaixado: o Hub pode guardar o plano
 * como texto digitado ("Gestão"), e cair no plano de entrada sem aviso criaria
 * uma barbearia capada que ninguém saberia explicar. Acento e maiúscula são
 * normalizados antes, porque são o erro de digitação mais comum.
 */
export function planoDoHub(bruto: unknown): PlanId | null {
  if (bruto === null || bruto === undefined) return "agenda";
  const texto = String(bruto)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
  if (!texto) return "agenda";
  const plano = toPlanId(texto);
  // `toPlanId` devolve o plano de entrada para o que não conhece; aqui isso
  // precisa ser erro. Os nomes antigos (`entrada`, `completo`) continuam valendo.
  if (plano !== texto && texto !== "entrada" && texto !== "completo") return null;
  return plano;
}

export type PedidoDeProvisionamento = {
  hubTenantId: string;
  slug: string;
  nome: string;
  ownerEmail: string;
  ownerNome: string | null;
  plano: PlanId;
};

export function validarProvisionamento(corpo: unknown): Validacao<PedidoDeProvisionamento> {
  const b = (corpo ?? {}) as Record<string, unknown>;
  if (typeof corpo !== "object" || corpo === null || Array.isArray(corpo)) {
    return { ok: false, erro: "corpo precisa ser um objeto JSON" };
  }
  const hubTenantId = String(b.hubTenantId ?? "").trim();
  if (!ID_EXTERNO.test(hubTenantId)) return { ok: false, erro: "hubTenantId invalido" };

  const slug = String(b.slug ?? "").trim().toLowerCase();
  const formato = validateSlug(slug);
  if (!formato.available) return { ok: false, erro: `slug invalido: ${formato.reason}` };

  const nome = String(b.nome ?? "").trim().replace(/\s+/g, " ");
  if (!nome) return { ok: false, erro: "nome obrigatorio" };
  if (nome.length > 80) return { ok: false, erro: "nome com mais de 80 caracteres" };

  const ownerEmail = String(b.ownerEmail ?? "").trim().toLowerCase();
  if (!EMAIL.test(ownerEmail) || ownerEmail.length > 254) {
    return { ok: false, erro: "ownerEmail invalido" };
  }

  const ownerNome = b.ownerNome == null ? null : String(b.ownerNome).trim().slice(0, 80) || null;

  const plano = planoDoHub(b.plano);
  if (!plano) {
    return { ok: false, erro: `plano "${String(b.plano)}" nao existe (use agenda, crescimento, gestao ou null)` };
  }

  return { ok: true, dados: { hubTenantId, slug, nome, ownerEmail, ownerNome, plano } };
}

export type StatusDoHub = "ativo" | "suspenso" | "cancelado";

export type MudancaDeStatus = {
  barbershopId: string;
  hubTenantId: string;
  status: StatusDoHub;
  eventoId: string;
};

export function validarMudancaDeStatus(corpo: unknown): Validacao<MudancaDeStatus> {
  if (typeof corpo !== "object" || corpo === null || Array.isArray(corpo)) {
    return { ok: false, erro: "corpo precisa ser um objeto JSON" };
  }
  const b = corpo as Record<string, unknown>;
  // O Hub manda os dois nomes (`externoId` é o nome novo, para outros produtos).
  const barbershopId = String(b.barbershopId ?? b.externoId ?? "").trim();
  if (!ID_DOCUMENTO.test(barbershopId)) return { ok: false, erro: "barbershopId invalido" };
  const hubTenantId = String(b.hubTenantId ?? "").trim();
  if (!ID_EXTERNO.test(hubTenantId)) return { ok: false, erro: "hubTenantId invalido" };
  const status = String(b.status ?? "").trim();
  if (status !== "ativo" && status !== "suspenso" && status !== "cancelado") {
    return { ok: false, erro: "status invalido (use ativo, suspenso ou cancelado)" };
  }
  const eventoId = String(b.eventoId ?? "").trim();
  if (!ID_EXTERNO.test(eventoId)) return { ok: false, erro: "eventoId invalido" };
  return { ok: true, dados: { barbershopId, hubTenantId, status, eventoId } };
}

/**
 * Id do documento que registra um evento recebido do Hub.
 *
 * O `eventoId` é do Hub e o formato é dele (hoje `{tenant}_{status}_{id}`).
 * Usá-lo cru como id de documento amarraria o Topete a esse formato — um `.`
 * sozinho ou `__nome__` é id inválido no Firestore. O hash tem tamanho fixo e
 * caracteres seguros, e o valor original fica gravado dentro do documento.
 */
export function idDoEventoRecebido(eventoId: string): string {
  return createHash("sha256").update(eventoId, "utf8").digest("hex");
}

/* ------------------------------------------------------------------ */
/* Status comercial do Hub → status da barbearia                       */
/* ------------------------------------------------------------------ */

export type Transicao =
  | { tipo: "aplicar"; para: string; campos: Record<string, unknown> }
  | { tipo: "nada"; para: string; motivo: string }
  | { tipo: "conflito"; erro: string };

/**
 * Barbearia ISENTA: acesso completo, sem cobrança, sem data para acabar.
 *
 * Hoje é só o O Siqueira, a barbearia fundadora (29/09): nasceu antes da
 * plataforma e o dono decidiu que nunca paga. O campo `isento` no documento
 * é gravado à mão (`scripts/marcar-isento.mjs`), nunca pelo Hub — é
 * justamente contra um comando do Hub que ele protege.
 *
 * Não se chama `fundador` de propósito: "fundadoras" são também as 20
 * primeiras com 30% de desconto (`DESCONTO_FUNDADOR`), que PAGAM e podem ser
 * suspensas. O nome do campo diz o que ele faz; "Barbearia fundadora" é o
 * motivo gravado dentro dele.
 */
export function isentoDeCobranca(shop: { isento?: unknown }): boolean {
  const c = shop.isento;
  return c === true || (typeof c === "object" && c !== null && (c as { ativa?: unknown }).ativa !== false);
}

/**
 * O que o status comercial do Hub faz com a barbearia.
 *
 *   ativo     → `status: "ativo"`; tira a suspensão; se estava encerrada e o
 *               expurgo ainda não começou, REABRE (o Hub é quem decide que o
 *               cliente voltou);
 *   suspenso  → `status: "suspenso"` — o modo leitura que já existe
 *               (`motivoDeLeitura`, `acessoDaBarbearia`);
 *   cancelado → encerramento, com os MESMOS campos de `encerrarConta`: a
 *               janela de exportação corre e o expurgo LGPD vem depois.
 *
 * Plano e `features` não mudam em nenhum caso: ativar não é escolher plano. O
 * plano pedido pelo dono chega ao Hub como pendência e o operador aplica.
 *
 * Encerrada é o estado mais forte: suspender uma conta encerrada não faz nada
 * (ela já está em leitura e com o relógio do expurgo correndo), e encerrar de
 * novo não reinicia o relógio.
 *
 * Barbearia isenta (`isentoDeCobranca`) não é suspensa nem cancelada pelo Hub:
 * não há cobrança para ficar em atraso, então um "suspenso" vindo de lá só
 * pode ser engano — um teste vencido, um boleto que não devia existir. Volta
 * 409, que o Hub mostra ao operador; a loja segue aberta.
 */
export function transicaoDoHub(
  shop: { status?: unknown; expurgo?: unknown; isento?: unknown },
  alvo: StatusDoHub,
  agoraMs: number
): Transicao {
  const atual = typeof shop.status === "string" ? shop.status : null;

  if (alvo !== "ativo" && isentoDeCobranca(shop)) {
    return {
      tipo: "conflito",
      erro: `barbearia isenta (fundadora, sem cobranca): ${alvo} so pelo Topete`,
    };
  }

  if (alvo === "cancelado") {
    if (atual === "encerrada") return { tipo: "nada", para: "encerrada", motivo: "já estava encerrada" };
    return {
      tipo: "aplicar",
      para: "encerrada",
      campos: camposDeEncerramento({
        statusAtual: atual,
        agoraMs,
        por: "hub",
        motivo: "cancelado no Hub",
      }),
    };
  }

  if (alvo === "suspenso") {
    if (atual === "encerrada") return { tipo: "nada", para: "encerrada", motivo: "conta encerrada não é suspensa" };
    if (atual === "suspenso") return { tipo: "nada", para: "suspenso", motivo: "já estava suspensa" };
    return {
      tipo: "aplicar",
      para: "suspenso",
      campos: {
        status: "suspenso",
        suspendedAt: FieldValue.serverTimestamp(),
        suspendedReason: "hub",
      },
    };
  }

  // alvo === "ativo"
  if (atual === "encerrada") {
    /* Depois que o expurgo começou, parte dos dados pode já ter saído — a
     * mesma trava de `reabrirConta`. Reativar ali devolveria uma barbearia pela
     * metade dizendo que está inteira. */
    if (shop.expurgo) {
      return { tipo: "conflito", erro: "a exclusão desta conta já começou; não dá para reativar" };
    }
    return {
      tipo: "aplicar",
      para: "ativo",
      campos: {
        ...camposDeReabertura("ativo"),
        suspendedAt: FieldValue.delete(),
        suspendedReason: FieldValue.delete(),
      },
    };
  }
  if (atual === "ativo") return { tipo: "nada", para: "ativo", motivo: "já estava ativa" };
  return {
    tipo: "aplicar",
    para: "ativo",
    campos: {
      status: "ativo",
      /* Some com o motivo da suspensão anterior, como em `mudancaDePlano`: uma
       * barbearia reativada não pode continuar contando por que foi suspensa. */
      suspendedAt: FieldValue.delete(),
      suspendedReason: FieldValue.delete(),
      // O teste acabou quando o Hub ativou; a data fica no histórico.
      ...(atual === "trial" ? { trialEncerradoEm: FieldValue.serverTimestamp() } : {}),
    },
  };
}

/* ------------------------------------------------------------------ */
/* Eventos Topete → Hub                                                */
/* ------------------------------------------------------------------ */

export type EventoDoTopete = "cadastrada" | "onboarding_concluido" | "plano_escolhido" | "pediu_cancelamento";

/**
 * Preço mensal de cada plano, em R$ — o `valor` de `plano_escolhido`. Lido da
 * tabela única de `plans.ts` (29/09): uma fonte só para a tela, a landing e o
 * aviso ao Hub. O Hub não cobra por ele — o operador confere e aplica.
 */
export const PRECO_MENSAL: Record<PlanId, number> = {
  agenda: PRECOS_POR_PLANO.agenda.mensal,
  crescimento: PRECOS_POR_PLANO.crescimento.mensal,
  gestao: PRECOS_POR_PLANO.gestao.mensal,
};

export type CorpoDoEvento = {
  produto: "barber";
  evento: EventoDoTopete;
  eventoId: string;
  externoId: string;
  slug: string;
  nome: string;
  ocorridoEm: string;
  plano?: PlanId;
  valor?: number;
  ciclo?: "mensal";
  motivo?: string;
  /** Barbearia sem cobrança (`isentoDeCobranca`): o Hub registra com valor 0 e não gera boleto. */
  isento?: true;
  /** Fora do contrato v1 (o Hub ignora); ajuda o operador a ligar os registros. */
  hubTenantId?: string;
};

/**
 * `eventoId` estável: a reentrega precisa repetir o mesmo, e o Hub deduplica
 * por ele.
 *
 * `cadastrada` e `onboarding_concluido` acontecem uma vez na vida da
 * barbearia, então o id é só evento + barbearia — rodar a carga inicial duas
 * vezes, ou o dono concluir o onboarding de novo, não gera aviso novo.
 * Escolher plano e pedir cancelamento podem se repetir; o dia entra no id para
 * que o toque duplo no botão vire um aviso só, e um pedido em outro dia vire
 * outro.
 */
export function idDoEvento(
  evento: EventoDoTopete,
  barbershopId: string,
  extra?: { plano?: string; dia?: string }
): string {
  if (evento === "plano_escolhido") return `${evento}:${barbershopId}:${extra?.plano}:${extra?.dia}`;
  if (evento === "pediu_cancelamento") return `${evento}:${barbershopId}:${extra?.dia}`;
  return `${evento}:${barbershopId}`;
}

/** Data em São Paulo, `YYYY-MM-DD` — o "dia" dos ids acima. */
export function diaEmSaoPaulo(data: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(data);
}

/**
 * ISO com o fuso de São Paulo (`2026-09-28T14:00:00-03:00`), como no contrato.
 *
 * O Brasil não tem horário de verão desde 2019, então o deslocamento é fixo.
 * Se voltar a ter, este é o lugar a mudar.
 */
export function isoEmSaoPaulo(data: Date): string {
  const local = new Date(data.getTime() - 3 * 60 * 60 * 1000);
  return local.toISOString().replace(/\.\d{3}Z$/, "-03:00");
}

export function montarEvento(p: {
  evento: EventoDoTopete;
  barbershopId: string;
  slug: string;
  nome: string;
  ocorridoEm: Date;
  plano?: PlanId;
  motivo?: string | null;
  hubTenantId?: string | null;
  /** Isenta: o evento leva `isento: true` e valor 0. */
  isento?: boolean;
}): CorpoDoEvento {
  const corpo: CorpoDoEvento = {
    produto: "barber",
    evento: p.evento,
    eventoId: idDoEvento(p.evento, p.barbershopId, {
      plano: p.plano,
      dia: diaEmSaoPaulo(p.ocorridoEm),
    }),
    externoId: p.barbershopId,
    slug: p.slug,
    nome: p.nome || p.slug,
    ocorridoEm: isoEmSaoPaulo(p.ocorridoEm),
  };
  if (p.evento === "plano_escolhido") {
    if (!p.plano) throw new Error("plano_escolhido exige o plano");
    corpo.plano = p.plano;
    corpo.valor = PRECO_MENSAL[p.plano];
    corpo.ciclo = "mensal";
  }
  if (p.isento) {
    corpo.isento = true;
    /* O cadastro de uma barbearia isenta já diz ao Hub o plano e o valor
     * zero: sem isso ela entraria lá como cliente em teste, e o fim do teste
     * viraria cobrança. */
    if (p.plano) {
      corpo.plano = p.plano;
      corpo.ciclo = "mensal";
    }
    if (corpo.plano) corpo.valor = 0;
  }
  if (p.evento === "pediu_cancelamento" && p.motivo) {
    corpo.motivo = String(p.motivo).trim().slice(0, 300);
  }
  if (p.hubTenantId) corpo.hubTenantId = p.hubTenantId;
  return corpo;
}

/* ------------------------------------------------------------------ */
/* Caixa de saída: o que fazer com a resposta do Hub                   */
/* ------------------------------------------------------------------ */

export type Desfecho = "enviado" | "recusado" | "retentar";

/**
 * A tabela de respostas do contrato.
 *
 *   200         → enviado (inclusive `duplicado: true`: o Hub já tinha);
 *   400, 409    → recusado, não repete — repetir igual daria a mesma resposta;
 *                 o 409 é o operador que resolve no Hub;
 *   401, 503    → retenta: token errado ou Hub sem token é configuração, e
 *                 quando alguém corrigir o aviso precisa sair sozinho;
 *   5xx, rede   → retenta com o MESMO eventoId.
 *
 * O resto (404, 403, 429…) também retenta: são erro de configuração ou de
 * limite do nosso lado, e desistir perderia o aviso para sempre por um
 * problema que se corrige.
 */
export function desfechoDaResposta(status: number | null): Desfecho {
  if (status !== null && status >= 200 && status < 300) return "enviado";
  if (status === 400 || status === 409) return "recusado";
  return "retentar";
}

const MINUTO_MS = 60_000;
const TETO_MS = 6 * 60 * MINUTO_MS;

/**
 * Espera até a próxima tentativa: 1, 2, 4, 8… minutos, com teto de 6 horas.
 *
 * Sem teto de tentativas de propósito: o aviso é fato do negócio (uma
 * barbearia nova, um plano pedido) e não expira. Com o teto de 6 horas, um
 * Hub fora do ar por um dia custa quatro chamadas, não milhares.
 */
export function esperaAntesDaTentativa(tentativasFeitas: number): number {
  const n = Math.max(0, Math.min(tentativasFeitas, 20));
  return Math.min(MINUTO_MS * 2 ** n, TETO_MS);
}

/* ------------------------------------------------------------------ */
/* Domínios autorizados do Firebase Auth                               */
/* ------------------------------------------------------------------ */

/**
 * A lista nova de domínios autorizados, ou `null` se o domínio já está nela.
 *
 * Acrescenta sem tirar nada: a lista é compartilhada com o domínio antigo do
 * piloto, o `web.app` e o `localhost`, e um PATCH com a lista errada derrubaria
 * o login de todo mundo.
 */
export function comDominioAutorizado(atual: unknown, dominio: string): string[] | null {
  const lista = Array.isArray(atual) ? atual.map((d) => String(d)) : [];
  const alvo = dominio.trim().toLowerCase();
  if (lista.some((d) => d.toLowerCase() === alvo)) return null;
  return [...lista, alvo];
}
