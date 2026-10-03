/**
 * Lê `barbershops/{id}/private/financeiro` pela API REST do Firestore, com o
 * token do usuário logado — SEM o SDK e o cache local dele (02/10).
 *
 * Por quê: no navegador do dono, o SDK (cache persistente + multi-aba) ficou
 * preso numa visão "não existe" deste documento. A escuta e até
 * `getDocFromServer` respondiam vazio, enquanto a API, com o mesmo login,
 * devolvia as 9 formas salvas. O painel mostrava taxas 0% e o alerta falso de
 * "taxas não informadas". Esta leitura é a segunda opinião: só é usada quando o
 * SDK diz que o documento não existe.
 *
 * Devolve os campos já convertidos, `null` se a API confirmar que não existe,
 * e lança erro se não conseguir perguntar.
 */
import { auth } from "@/lib/firebase";
import { converterCampos, type ValorRest } from "@/lib/firestore-rest";

export async function lerFinanceiroPelaApi(barbershopId: string): Promise<Record<string, unknown> | null> {
  const usuario = auth.currentUser;
  if (!usuario) throw new Error("sem login para ler o financeiro");
  const token = await usuario.getIdToken();
  const projeto = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  /* Mesma base das outras leituras diretas (tenant-server): emulador em
   * desenvolvimento, produção fora dele — o token do emulador não vale lá. */
  const base =
    process.env.NEXT_PUBLIC_USE_EMULATOR === "true"
      ? `http://127.0.0.1:8080/v1/projects/${projeto}/databases/(default)/documents`
      : `https://firestore.googleapis.com/v1/projects/${projeto}/databases/(default)/documents`;
  const url = `${base}/barbershops/${encodeURIComponent(barbershopId)}/private/financeiro`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`API do Firestore respondeu ${r.status}`);
  const corpo = (await r.json()) as { fields?: Record<string, ValorRest> };
  return converterCampos(corpo.fields ?? {});
}
