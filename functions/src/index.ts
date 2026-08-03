/**
 * Ponto de entrada das Cloud Functions.
 *
 * `functions/package.json` aponta `main: lib/index.js`. Sem este arquivo o
 * `tsc` compilava só o catálogo de templates, `lib/index.js` nunca existia e
 * `firebase deploy --only functions` falhava ao carregar o módulo.
 *
 * Região: `southamerica-east1` (São Paulo) — a mesma que o cliente web usa em
 * `getAppFunctions()`. Divergir de região quebra a chamada silenciosamente.
 */

import { setGlobalOptions } from "firebase-functions/v2";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

initializeApp();

setGlobalOptions({ region: "southamerica-east1", maxInstances: 10 });

export { provisionBarbershop, grantShopRole } from "./provisioning";
export {
  signUpBarbershop,
  checkSlugAvailability,
  completeOnboardingStep,
} from "./signup";
export { TEMPLATES } from "./whatsapp/templates";
export type {
  TemplateDef,
  TemplateCategory,
  ButtonAction,
  QuickReply,
} from "./whatsapp/templates";

/** Confirma que o deploy subiu e que a região está correta. */
export const healthcheck = onCall(() => ({
  ok: true,
  region: "southamerica-east1",
}));

/**
 * @deprecated Use `grantShopRole`, que vincula a uma barbearia específica.
 *
 * Concede ou revoga o papel de dono GLOBAL — modelo single-tenant. Mantido
 * apenas para o bootstrap do primeiro operador da plataforma.
 *
 * O app inteiro decide o que mostrar a partir do claim `role: owner`, e até
 * aqui NENHUM código do repositório o atribuía — ele havia sido gravado à mão,
 * sem procedimento documentado. Se a conta do dono fosse recriada, ninguém
 * saberia restaurar o acesso ao painel.
 *
 * Bootstrap do primeiro dono (não há dono para autorizar o primeiro dono):
 *
 *   npx firebase-admin ...  — ou, mais simples, uma vez no console:
 *   const { getAuth } = require("firebase-admin/auth");
 *   await getAuth().setCustomUserClaims(uid, { role: "owner" });
 *
 * Depois do primeiro, use esta função. O usuário precisa renovar o token
 * (`getIdToken(true)` ou novo login) para o claim valer no cliente.
 */
export const setOwnerRole = onCall<{ uid: string; isOwner: boolean }>(
  async (request) => {
    if (request.auth?.token.role !== "owner") {
      throw new HttpsError(
        "permission-denied",
        "Só um dono pode conceder ou revogar o papel de dono."
      );
    }

    const { uid, isOwner } = request.data ?? {};
    if (typeof uid !== "string" || !uid) {
      throw new HttpsError("invalid-argument", "Informe o uid do usuário.");
    }
    if (uid === request.auth.uid && !isOwner) {
      throw new HttpsError(
        "failed-precondition",
        "Um dono não pode revogar o próprio acesso — outra conta precisa fazer isso."
      );
    }

    const auth = getAuth();
    const user = await auth.getUser(uid);
    const claims = { ...(user.customClaims ?? {}) };

    if (isOwner) {
      claims.role = "owner";
    } else {
      delete claims.role;
    }

    await auth.setCustomUserClaims(uid, claims);
    // Invalida os refresh tokens: o claim antigo para de valer na próxima renovação.
    await auth.revokeRefreshTokens(uid);

    return { uid, role: claims.role ?? null };
  }
);
