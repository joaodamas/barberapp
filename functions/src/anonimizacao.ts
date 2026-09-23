/**
 * As regras puras da anonimização e da exportação — sem Firestore, sem Auth.
 *
 * Separadas das callables pelo motivo de sempre neste projeto: dentro de um
 * `onCall`, "o que conta como dado identificador" só se exerceria com
 * emulador, autenticação e barbearia semeada, e é justamente a lista que mais
 * precisa de teste — uma chave esquecida aqui é um telefone que continua no
 * banco com a tela dizendo "anonimizado".
 *
 * Desenho completo em `docs/LGPD-DIREITOS-DO-TITULAR.md`.
 */

/**
 * O que aparece no lugar do nome.
 *
 * Um texto legível, e não string vazia: a agenda e o DRE continuam mostrando a
 * linha, e um buraco onde havia um nome parece defeito. "Cliente anonimizado"
 * diz o que aconteceu — e é diferente de "Cliente", que o produto já usa para
 * "nome não informado".
 */
export const MARCADOR_ANONIMO = "Cliente anonimizado";

/**
 * Reserva que ainda vai acontecer. A mesma lista de `booking.ts` e
 * `comecar-do-zero.ts`.
 */
export const EM_ABERTO = [
  "pending_payment",
  "confirmed",
  "confirmed_by_client",
  "fit_in_requested",
] as const;

/**
 * Campo identificador → valor que o substitui, nos documentos que FICAM
 * (cadastro, reserva, mensalidade, ocorrência).
 *
 * Nome vira o marcador; contato vira vazio. Vazio, e não o marcador, porque
 * telefone e e-mail são CHAVES: `acharClientePorWhatsapp` deduplica por
 * telefone, e um marcador comum a todos os anonimizados faria o próximo
 * cadastro de balcão "reencontrar" um deles. `whatsappServeComoChave("")` é
 * falso — ninguém casa com vazio.
 */
const SUBSTITUTOS: Record<string, string> = {
  name: MARCADOR_ANONIMO,
  clientName: MARCADOR_ANONIMO,
  displayName: MARCADOR_ANONIMO,
  whatsapp: "",
  clientWhatsapp: "",
  phone: "",
  clientPhone: "",
  email: "",
  clientEmail: "",
};

/**
 * O que precisa mudar neste documento para ele deixar de identificar alguém.
 *
 * Devolve SÓ os campos que ainda carregam dado — `null` quando não há nada a
 * fazer. É o que torna a anonimização idempotente sem flag: rodar de novo
 * sobre um documento já limpo não produz escrita.
 */
export function patchDeIdentificacao(
  dados: Record<string, unknown>
): Record<string, string> | null {
  const patch: Record<string, string> = {};
  for (const [campo, substituto] of Object.entries(SUBSTITUTOS)) {
    if (!(campo in dados)) continue;
    if (dados[campo] === substituto) continue;
    patch[campo] = substituto;
  }
  return Object.keys(patch).length ? patch : null;
}

/**
 * O registro de uma mensagem de WhatsApp, sem o telefone e sem o texto.
 *
 * Fica que houve a mensagem, quando e de qual modelo — é o rastro de que a
 * barbearia avisou o cliente. Sai o número e o texto livre, que pode conter
 * qualquer coisa que a pessoa escreveu.
 */
export function patchDaMensagem(
  dados: Record<string, unknown>
): Record<string, string | null> | null {
  const patch: Record<string, string | null> = {};
  if (typeof dados.to === "string" && dados.to !== "") patch.to = "";
  if (typeof dados.de === "string" && dados.de !== "") patch.de = "";
  if (dados.texto != null) patch.texto = null;
  return Object.keys(patch).length ? patch : null;
}

/**
 * As formas em que o mesmo telefone aparece no banco.
 *
 * O cadastro guarda "11988887777" (DDD, sem país); o envio do WhatsApp guarda
 * "5511988887777" (`normalizarNumero` acrescenta o 55). Procurar só uma das
 * formas deixaria a outra para trás — com a tela dizendo que limpou.
 */
export function variantesDoTelefone(bruto: unknown): string[] {
  const d = String(bruto ?? "").replace(/\D/g, "");
  if (d.length < 10) return [];
  const variantes = new Set([d]);
  if (d.startsWith("55") && d.length >= 12) variantes.add(d.slice(2));
  else variantes.add(`55${d}`);
  return [...variantes];
}

/**
 * Por que NÃO anonimizar agora — lista vazia libera.
 *
 * Reserva futura em aberto: o barbeiro esperaria alguém que o sistema não sabe
 * mais quem é, sem telefone para avisar. Reserva em aberto de dias passados
 * não trava: é pendência do dono (não fechou o atendimento), e o cliente não
 * tem como resolvê-la — travar por ela deixaria o direito dele refém de uma
 * tarefa alheia.
 *
 * Mensalidade ativa: a cobrança continuaria rodando em nome de ninguém.
 */
export function motivosParaRecusar(params: {
  reservas: Array<{ status?: unknown; date?: unknown }>;
  assinaturas: Array<{ status?: unknown }>;
  hoje: string;
}): string[] {
  const motivos: string[] = [];

  const futuras = params.reservas.filter(
    (r) =>
      (EM_ABERTO as readonly string[]).includes(String(r.status)) &&
      String(r.date ?? "") >= params.hoje
  ).length;
  if (futuras > 0) {
    motivos.push(
      futuras === 1
        ? "há 1 horário marcado daqui para a frente — cancele antes"
        : `há ${futuras} horários marcados daqui para a frente — cancele antes`
    );
  }

  if (params.assinaturas.some((a) => a.status === "ativo")) {
    motivos.push("há um plano de mensalista ativo — cancele o plano antes");
  }

  return motivos;
}

/**
 * Campos que NÃO entram no arquivo fiscal, em qualquer profundidade.
 *
 * O arquivo prova que o dinheiro existiu, não quem era a pessoa. `staffName`
 * está aqui de propósito: o barbeiro também é titular, e o arquivo guarda o
 * `uid`/`staffId` opaco da comissão — o suficiente para somar, não para
 * identificar. `ownerEmail` aparece no `audit_log` do provisionamento.
 */
const FORA_DO_ARQUIVO = new Set([
  "name",
  "clientName",
  "staffName",
  "displayName",
  "whatsapp",
  "clientWhatsapp",
  "phone",
  "clientPhone",
  "email",
  "clientEmail",
  "ownerEmail",
  "to",
  "de",
  "texto",
]);

function ehObjetoSimples(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== "object") return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/**
 * Cópia do documento sem identificação, para o arquivo fiscal.
 *
 * Só desce em objeto simples e em array. `Timestamp` e afins passam intactos:
 * são a data do fato, que é exatamente o que precisa ficar.
 */
export function semIdentificacao<T>(valor: T): T {
  if (Array.isArray(valor)) return valor.map((v) => semIdentificacao(v)) as T;
  if (!ehObjetoSimples(valor)) return valor;
  const limpo: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(valor)) {
    if (FORA_DO_ARQUIVO.has(k)) continue;
    limpo[k] = semIdentificacao(v);
  }
  return limpo as T;
}

/**
 * Documento do Firestore → JSON que qualquer pessoa abre.
 *
 * `Timestamp` vira ISO 8601; referência vira caminho. Sem isso a exportação
 * sairia com `{"_seconds": 1695…, "_nanoseconds": 0}` — tecnicamente
 * completa, inútil para o titular que pediu para ver os próprios dados.
 */
export function paraJson(valor: unknown): unknown {
  if (valor === null || valor === undefined) return null;
  if (Array.isArray(valor)) return valor.map(paraJson);
  if (typeof valor !== "object") return valor;

  const v = valor as Record<string, unknown>;
  if (typeof v.toDate === "function") {
    return (v.toDate as () => Date)().toISOString();
  }
  if (valor instanceof Date) return valor.toISOString();
  if (typeof v.path === "string" && typeof v.id === "string" && "firestore" in v) {
    return v.path;
  }

  const saida: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v)) saida[k] = paraJson(x);
  return saida;
}
