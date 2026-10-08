import * as logger from "firebase-functions/logger";
import { getFirestore, type DocumentReference } from "firebase-admin/firestore";
import { enviar, type Botao } from "./api";

/**
 * Quem recebe os avisos de uma barbearia no Telegram.
 *
 * `barbershops/{id}/telegram_contatos/{chatId}` — um documento por conversa
 * ligada. Só o servidor grava (convite e webhook); o dono lê para a tela.
 *
 * Dois tipos de contato:
 *   - `dono`: recebe tudo, de todos os barbeiros, e o fechamento do dia;
 *   - `barbeiro`: só o que é da cadeira dele (`staffId`). O barbeiro não
 *     precisa ter conta no Topete — o dono gera o convite em nome dele.
 *
 * `telegram_chats/{chatId}` aponta a conversa para a barbearia: é por ele que
 * o toque num botão descobre de qual loja é, sem confiar no que vem no botão.
 */

export type TipoDeAviso = "encaixe" | "cancelamento" | "novo" | "agenda" | "fechamento";

export const AVISOS_PADRAO: Record<TipoDeAviso, boolean> = {
  encaixe: true,
  cancelamento: true,
  novo: true,
  agenda: true,
  fechamento: true,
};

export type Contato = {
  chatId: string;
  alvo: "dono" | "barbeiro";
  staffId: string | null;
  nome: string;
  ativo: boolean;
  avisos?: Partial<Record<TipoDeAviso, boolean>>;
};

/** O contato recebe este aviso, desta cadeira? Puro, para teste. */
export function recebe(contato: Contato, tipo: TipoDeAviso, staffId: string | null | undefined): boolean {
  if (!contato.ativo) return false;
  if (contato.avisos?.[tipo] === false) return false;
  if (contato.alvo === "dono") return true;
  /* Barbeiro: fechamento é do caixa da loja, não dele. */
  if (tipo === "fechamento") return false;
  return !!staffId && contato.staffId === staffId;
}

export function contatosRef(shopRef: DocumentReference) {
  return shopRef.collection("telegram_contatos");
}

export async function contatosDaLoja(shopRef: DocumentReference): Promise<Contato[]> {
  const snap = await contatosRef(shopRef).where("ativo", "==", true).get();
  return snap.docs.map((d) => d.data() as Contato);
}

/**
 * Manda para quem deve receber. Conversa que bloqueou o bot é desligada,
 * para não tentar de novo todo dia.
 */
export async function avisar(params: {
  shopRef: DocumentReference;
  tipo: TipoDeAviso;
  staffId?: string | null;
  html: string;
  botoes?: Botao[][];
  contatos?: Contato[];
}): Promise<number> {
  const contatos = params.contatos ?? (await contatosDaLoja(params.shopRef));
  let enviados = 0;
  for (const c of contatos.filter((x) => recebe(x, params.tipo, params.staffId))) {
    const r = await enviar(c.chatId, params.html, params.botoes);
    if (r.ok) {
      enviados++;
    } else if (r.bloqueado) {
      await desligarPorBloqueio(params.shopRef, c.chatId);
    } else {
      console.warn(`[telegram] aviso ${params.tipo} não saiu para ${c.chatId}: ${r.erro}`);
    }
  }
  return enviados;
}

/**
 * Desliga a conversa que bloqueou o bot. Nunca lança.
 *
 * Era `update`, que falha com NOT_FOUND quando o contato foi apagado no meio
 * do envio (o dono desligou pelo painel, ou a conversa foi ligada em outra
 * loja) — e a exceção abortava o laço, deixando os contatos seguintes sem o
 * aviso. `set` com merge não depende de o documento existir, e um erro aqui
 * fica no log em vez de interromper os demais.
 */
export async function desligarPorBloqueio(shopRef: DocumentReference, chatId: string | number): Promise<void> {
  await contatosRef(shopRef)
    .doc(String(chatId))
    .set({ ativo: false, desligadoPor: "bloqueou o bot" }, { merge: true })
    .catch((e) => {
      logger.warn("[telegram] não consegui desligar a conversa que bloqueou o bot", {
        barbershopId: shopRef.id,
        chatId: String(chatId),
        erro: e instanceof Error ? e.message : String(e),
      });
    });
}

export function lojaDaConversa(chatId: string | number) {
  return getFirestore().doc(`telegram_chats/${chatId}`);
}
