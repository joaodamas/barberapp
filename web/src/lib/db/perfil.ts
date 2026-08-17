"use client";

import { doc, getDoc, setDoc } from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import { userPath } from "@/lib/db/paths";
import { normalizarWhatsapp } from "@/lib/whatsapp-numero";

/* Reexportadas para as telas continuarem importando de um lugar só. */
export {
  normalizarWhatsapp,
  whatsappValido,
  mascararWhatsapp,
} from "@/lib/whatsapp-numero";

/**
 * O perfil do cliente final — nome e WhatsApp.
 *
 * Existe porque o produto inteiro se apoia em WhatsApp e **nunca coletava o
 * número**. A reserva era gravada com `clientWhatsapp: user.phoneNumber`, que
 * só existe para quem entrou por SMS — e o provider de SMS não está habilitado.
 * Com e-mail ou Google, que são os dois caminhos que funcionam, o campo era
 * sempre nulo.
 *
 * O efeito em cadeia: a coluna Telefone da agenda mostrava "—" para todos, o
 * dono não conseguia avisar ninguém de um cancelamento (com a tela dizendo que
 * avisaria), e `notifyBookingCreated` nunca teria para onde enviar a
 * confirmação, mesmo depois de a Meta liberar.
 *
 * A tela de Perfil parecia resolver e não resolvia: `saveProfile` fazia
 * `setSaved(true)` e fechava o modal com "Salvo!", sem gravar nada.
 *
 * Mora em `users/{uid}`, e não sob a barbearia, porque a conta do cliente
 * atravessa barbearias: quem corta em duas não deve digitar o telefone duas
 * vezes. O documento é dele, e as regras permitem que ele leia e escreva o
 * próprio — menos os campos de autoridade.
 */

export type PerfilDoCliente = {
  name: string;
  /** Só dígitos, com DDI. É o formato que a Cloud API do WhatsApp exige. */
  whatsapp: string;
};

export async function lerPerfil(uid: string): Promise<PerfilDoCliente | null> {
  const db = await getDb();
  const snap = await getDoc(doc(db, userPath(uid)));
  if (!snap.exists()) return null;

  const d = snap.data();
  return {
    name: String(d.name ?? ""),
    whatsapp: String(d.whatsapp ?? ""),
  };
}

/**
 * Grava o perfil. `merge` de propósito: este documento é do cliente e pode
 * ganhar outros campos depois — sobrescrever apagaria o que outra tela gravou.
 *
 * Não passa pela trava de escrita do painel: ela existe para a conta da
 * BARBEARIA em modo leitura, e o cliente final não pode ser impedido de manter
 * o próprio contato atualizado por causa da mensalidade do dono.
 */
export async function salvarPerfil(uid: string, perfil: Partial<PerfilDoCliente>) {
  const db = await getDb();
  const dados: Record<string, string> = {};

  if (perfil.name !== undefined) dados.name = perfil.name.trim();
  if (perfil.whatsapp !== undefined) dados.whatsapp = normalizarWhatsapp(perfil.whatsapp);

  await setDoc(doc(db, userPath(uid)), dados, { merge: true });
}
