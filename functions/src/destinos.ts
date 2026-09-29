import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getFirestore } from "firebase-admin/firestore";
import { vinculosDe } from "./acesso";

/**
 * Para onde vai quem entra pelo domínio da PLATAFORMA (29/09).
 *
 * Em `topete.com.br/login` não há barbearia: o painel de cada uma mora no
 * endereço dela (`osiqueira.jpproject.com.br`, `nome.topete.com.br`). Esta
 * função devolve os endereços das barbearias às quais a conta está vinculada,
 * para a tela mandar a pessoa direto ao painel certo.
 *
 * O endereço vem de `barbershops/{id}.dominio` quando existe (o O Siqueira
 * segue no domínio antigo); sem ele, `{slug}.{DOMINIO_PRINCIPAL}`.
 *
 * Só devolve o que o TOKEN diz: é a mesma fonte de vínculo que o resto do
 * sistema usa (`vinculosDe`), e senha provisória não abre nada.
 */

export const DOMINIO_PRINCIPAL = "topete.com.br";

export type Destino = {
  barbershopId: string;
  nome: string;
  papel: "owner" | "staff";
  url: string;
};

export function urlDaBarbearia(shop: { slug?: unknown; dominio?: unknown }): string | null {
  const dominio = typeof shop.dominio === "string" && shop.dominio.trim() ? shop.dominio.trim() : null;
  if (dominio) return `https://${dominio}`;
  const slug = typeof shop.slug === "string" && /^[a-z0-9-]{2,63}$/.test(shop.slug) ? shop.slug : null;
  return slug ? `https://${slug}.${DOMINIO_PRINCIPAL}` : null;
}

export const meusDestinos = onCall(async (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Entre na sua conta.");
  const vinculos = Object.entries(vinculosDe(request)).filter(
    ([, papel]) => papel === "owner" || papel === "staff"
  );
  if (vinculos.length === 0) return { destinos: [] as Destino[] };

  const db = getFirestore();
  const snaps = await Promise.all(vinculos.map(([id]) => db.doc(`barbershops/${id}`).get()));
  const destinos: Destino[] = [];
  snaps.forEach((snap, i) => {
    if (!snap.exists) return;
    const d = snap.data() ?? {};
    if (d.status === "encerrada") return;
    const url = urlDaBarbearia(d);
    if (!url) return;
    destinos.push({
      barbershopId: snap.id,
      nome: String(d.brand?.name ?? d.slug ?? "Barbearia"),
      papel: vinculos[i][1] as "owner" | "staff",
      url,
    });
  });
  return { destinos };
});
