import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { TEMPLATES, buttonPayload, type TemplateName } from "./templates";

/**
 * Envio pela WhatsApp Business Cloud API.
 *
 * Três decisões que valem explicar:
 *
 * **Os parâmetros são posicionais, e a ordem vem do catálogo.** Quem chama
 * passa um objeto com nomes (`{ primeiroNome: "João" }`) e é aqui que ele vira
 * `[{type:"text", text:"João"}, ...]` na ordem de `params`. Aceitar array
 * pronto de fora convidava ao erro mais caro possível: trocar valor e hora de
 * lugar numa confirmação, que ninguém percebe até o cliente aparecer no
 * horário errado.
 *
 * **O registro é criado ANTES do envio, e o id pode ser determinístico.**
 * Gatilho do Firestore é reexecutado em caso de retry. Sem trava, o retry
 * manda a mesma mensagem de novo — e mensagem repetida no WhatsApp do cliente
 * é o tipo de coisa que faz ele bloquear o número, o que derruba a nota de
 * qualidade e reduz quanto a barbearia pode enviar por dia. `create()` falhando
 * por id duplicado é a trava, sem checagem extra e sem corrida.
 *
 * **Falha de envio nunca derruba quem chamou.** A reserva já está gravada
 * quando a mensagem sai. Se o WhatsApp estiver fora, a reserva continua válida
 * — o que não pode acontecer é o agendamento falhar porque a notificação
 * falhou. O erro fica em `whatsapp_messages`, que o dono lê.
 */

const VERSAO_API = "v22.0";

export type WhatsappConfig = {
  /** Id do número que ENVIA — não é o telefone, é o id da Cloud API. */
  phoneNumberId: string;
  /** Token da plataforma, do Secret Manager. */
  token: string;
};

export type EnvioResultado =
  | { ok: true; messageId: string | null }
  | { ok: false; erro: string; codigo?: number; duplicado?: boolean };

/**
 * Só dígitos, com DDI.
 *
 * A Cloud API aceita o número em vários formatos e falha em silêncio em
 * alguns: responde 200 e a mensagem nunca chega. Brasileiro sem o 55 é o caso
 * mais comum — e é exatamente o que o dono digita no cadastro.
 */
export function normalizarNumero(bruto: string): string | null {
  const digitos = String(bruto ?? "").replace(/\D/g, "");
  if (digitos.length < 10) return null;
  return digitos.startsWith("55") ? digitos : `55${digitos}`;
}

/** Catálogo + valores nomeados → componentes da Graph API. */
export function montarComponentes(
  template: TemplateName,
  params: Record<string, string>,
  barbershopId?: string,
  bookingId?: string
): unknown[] {
  const def = TEMPLATES[template];
  const components: unknown[] = [];

  if (def.params.length) {
    components.push({
      type: "body",
      parameters: def.params.map((nome) => ({ type: "text", text: params[nome] })),
    });
  }

  /* Cada botão vira um componente próprio com o payload que o webhook lê de
   * volta — barbearia e reserva juntas. Sem eles, o toque chega sem dizer nem
   * de quem é nem do que se trata. */
  const botoes = (def as { buttons?: { action: string }[] }).buttons;
  if (botoes?.length && barbershopId && bookingId) {
    botoes.forEach((botao, indice) => {
      components.push({
        type: "button",
        sub_type: "quick_reply",
        index: String(indice),
        parameters: [
          {
            type: "payload",
            payload: buttonPayload(botao.action as never, barbershopId, bookingId),
          },
        ],
      });
    });
  }
  return components;
}

export async function sendTemplate(opts: {
  barbershopId: string;
  config: WhatsappConfig;
  to: string;
  template: TemplateName;
  /** Valores por NOME do parâmetro; a ordem sai do catálogo. */
  params: Record<string, string>;
  /** Id da reserva, para o botão voltar sabendo do que se trata. */
  refId?: string;
  /**
   * Id fixo do registro. Duas execuções com a mesma chave enviam UMA vez.
   * Use sempre que o disparo vier de um gatilho, que o Firestore reexecuta.
   */
  dedupeKey?: string;
}): Promise<EnvioResultado> {
  const { barbershopId, config, template, params, refId, dedupeKey } = opts;
  const def = TEMPLATES[template];
  const db = getFirestore();
  const colecao = db.collection(`barbershops/${barbershopId}/whatsapp_messages`);
  const logRef = dedupeKey ? colecao.doc(dedupeKey) : colecao.doc();

  const base = {
    template,
    refId: refId ?? null,
    at: FieldValue.serverTimestamp(),
  };

  const to = normalizarNumero(opts.to);
  if (!to) {
    const erro = `Número inválido: "${opts.to}"`;
    await logRef.set({ ...base, to: opts.to, status: "erro", erro });
    return { ok: false, erro };
  }

  const faltando = def.params.filter((nome) => params[nome] === undefined);
  if (faltando.length) {
    /* Erro de programação, não de operação: melhor gritar no log do que mandar
     * "undefined" para o cliente. */
    const erro = `Faltam parâmetros de ${template}: ${faltando.join(", ")}`;
    await logRef.set({ ...base, to, status: "erro", erro });
    return { ok: false, erro };
  }

  // A trava: se já existe registro com esta chave, alguém já enviou.
  try {
    await logRef.create({ ...base, to, status: "enviando" });
  } catch {
    return { ok: false, erro: "Já enviado — retry ignorado.", duplicado: true };
  }

  const corpo = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: def.name,
      language: { code: def.language },
      ...(() => {
        const c = montarComponentes(template, params, barbershopId, refId);
        return c.length ? { components: c } : {};
      })(),
    },
  };

  try {
    const r = await fetch(
      `https://graph.facebook.com/${VERSAO_API}/${config.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${config.token}`,
        },
        body: JSON.stringify(corpo),
      }
    );
    const resposta = (await r.json()) as {
      error?: { message?: string; error_user_msg?: string; code?: number };
      messages?: { id?: string }[];
    };

    if (!r.ok) {
      const erro =
        resposta?.error?.error_user_msg ?? resposta?.error?.message ?? "erro desconhecido";
      await logRef.update({
        status: "erro",
        erro,
        codigo: resposta?.error?.code ?? null,
      });
      return { ok: false, erro, codigo: resposta?.error?.code };
    }

    const messageId = resposta?.messages?.[0]?.id ?? null;
    await logRef.update({ status: "enviado", messageId });

    /* ---- Dois índices na raiz, para o webhook achar o caminho de volta ----
     *
     * Com um número ÚNICO para toda a plataforma, o `phone_number_id` que chega
     * no webhook não diz mais de qual barbearia é o evento. O botão resolve
     * sozinho (a barbearia vai no payload), mas confirmação de entrega e
     * resposta em texto livre não têm essa informação — só o id da mensagem e o
     * telefone de quem respondeu. Estes dois índices são o mapa. */
    if (messageId) {
      await db.doc(`whatsapp_sent/${messageId}`).set({
        barbershopId,
        messagePath: logRef.path,
        at: FieldValue.serverTimestamp(),
      });
    }
    /* Última barbearia com quem este telefone conversou. É o melhor palpite
     * possível para texto livre — um cliente que frequenta duas barbearias da
     * plataforma responderia sem dizer para qual, e a mais recente é a única
     * resposta razoável. */
    await db.doc(`whatsapp_conversations/${to}`).set(
      { barbershopId, at: FieldValue.serverTimestamp() },
      { merge: true }
    );

    return { ok: true, messageId };
  } catch (error) {
    const erro = error instanceof Error ? error.message : String(error);
    await logRef.update({ status: "erro", erro });
    return { ok: false, erro };
  }
}
