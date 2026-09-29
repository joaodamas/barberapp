import { applicationDefault } from "firebase-admin/app";
import { comDominioAutorizado } from "./contrato";

/**
 * As duas chamadas ao Identity Toolkit que o provisionamento pelo Hub precisa,
 * isoladas aqui para poderem falhar sem desfazer a barbearia e para serem
 * trocadas sem mexer no handler.
 *
 * `fetch` é injetável: o teste confere o que seria enviado sem tocar a rede.
 */

type Fetch = typeof fetch;

/**
 * Manda ao dono o e-mail de "definir senha" do próprio Firebase.
 *
 * É o `PASSWORD_RESET` da REST pública (`accounts:sendOobCode`) com a chave
 * web do projeto: a conta é criada SEM senha, e o link do e-mail é como o dono
 * escolhe a dele. Assim nenhuma senha viaja — nem para o Hub, nem por
 * WhatsApp, que foi o furo da senha provisória (auditoria de 28/09, A1).
 *
 * `continueUrl` leva o dono de volta ao endereço da barbearia depois de
 * definir a senha. Só vai quando o domínio foi autorizado: domínio fora da
 * lista faz a chamada inteira falhar com `UNAUTHORIZED_DOMAIN`, e aí é melhor
 * o e-mail sem o botão de volta do que nenhum e-mail.
 */
export async function enviarEmailDeDefinirSenha(p: {
  email: string;
  chaveWeb: string;
  continueUrl?: string | null;
  fetch?: Fetch;
}): Promise<void> {
  const chave = p.chaveWeb.trim();
  if (!chave) throw new Error("TOPETE_WEB_API_KEY vazio: e-mail de acesso não enviado");
  const corpo: Record<string, string> = { requestType: "PASSWORD_RESET", email: p.email };
  if (p.continueUrl) corpo.continueUrl = p.continueUrl;
  const r = await (p.fetch ?? fetch)(
    `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(chave)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(10_000),
    }
  );
  if (!r.ok) {
    throw new Error(`sendOobCode respondeu ${r.status}: ${(await r.text().catch(() => "")).slice(0, 300)}`);
  }
}

/**
 * Acrescenta um domínio aos autorizados do Firebase Auth.
 *
 * Sem isto o login com Google falha no subdomínio novo (`auth/unauthorized-
 * domain`), e o `continueUrl` do e-mail de senha também. Lê a lista atual e
 * grava a lista com o domínio a mais — nunca uma lista montada do zero, que
 * tiraria o domínio do piloto e derrubaria o login dele.
 *
 * Usa a conta de serviço da função (Admin API do Identity Toolkit). Precisa de
 * `firebaseauth.configs.get` e `firebaseauth.configs.update` — ver
 * `docs/INTEGRACAO-HUB.md`.
 *
 * Duas criações ao mesmo tempo podem se sobrescrever (a API não tem controle
 * de versão). O custo é um domínio faltando, que a próxima criação ou o
 * console corrigem; o login dos outros não é afetado, porque cada PATCH parte
 * da lista lida.
 */
export async function autorizarDominio(p: {
  projeto: string;
  dominio: string;
  fetch?: Fetch;
  token?: () => Promise<string>;
}): Promise<"acrescentado" | "ja_estava"> {
  const f = p.fetch ?? fetch;
  const token = await (p.token ?? tokenDaContaDeServico)();
  const url = `https://identitytoolkit.googleapis.com/admin/v2/projects/${encodeURIComponent(p.projeto)}/config`;
  const cabecalhos = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const atual = await f(url, { headers: cabecalhos, signal: AbortSignal.timeout(10_000) });
  if (!atual.ok) {
    throw new Error(`leitura da config do Auth respondeu ${atual.status}: ${(await atual.text().catch(() => "")).slice(0, 300)}`);
  }
  const config = (await atual.json()) as { authorizedDomains?: unknown };
  const nova = comDominioAutorizado(config.authorizedDomains, p.dominio);
  if (!nova) return "ja_estava";

  const r = await f(`${url}?updateMask=authorizedDomains`, {
    method: "PATCH",
    headers: cabecalhos,
    body: JSON.stringify({ authorizedDomains: nova }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) {
    throw new Error(`atualização da config do Auth respondeu ${r.status}: ${(await r.text().catch(() => "")).slice(0, 300)}`);
  }
  return "acrescentado";
}

async function tokenDaContaDeServico(): Promise<string> {
  const { access_token } = await applicationDefault().getAccessToken();
  return access_token;
}
