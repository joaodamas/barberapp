import { onRequest, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { getAuth, type UserRecord } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import {
  criarBarbeariaAssistida,
  grantRole,
  MOTIVO_CONTA_NAO_VERIFICADA,
  podeAssumirContaExistente,
  precisaDeEmailDeAcesso,
} from "../provisioning";
import { urlDaBarbearia } from "../destinos";
import {
  idDoEventoRecebido,
  rotaDe,
  tokenConfere,
  tokenDoCabecalho,
  transicaoDoHub,
  validarMudancaDeStatus,
  validarProvisionamento,
  type MudancaDeStatus,
  type PedidoDeProvisionamento,
} from "./contrato";
import { autorizarDominio, enviarEmailDeDefinirSenha } from "./acesso-do-dono";

/**
 * A API que o JP Projects Hub chama (`POST /plataforma/provisionar` e
 * `POST /plataforma/status`).
 *
 * URL base, que o Hub guarda em `CORTEHUB_API_URL`:
 *   https://southamerica-east1-axon-barber.cloudfunctions.net
 * (o Hub acrescenta `/plataforma/...`; aqui o caminho chega sem o nome da
 * função). Contrato e segredos em `docs/INTEGRACAO-HUB.md`.
 *
 * Endpoint PÚBLICO na rede, como o webhook do WhatsApp: quem protege é o
 * `Authorization: Bearer <CORTEHUB_TOKEN>`, conferido em tempo constante. Sem
 * o segredo configurado, recusa tudo (503) — integração meio configurada não
 * pode virar integração aberta.
 */

export const CORTEHUB_TOKEN = defineSecret("CORTEHUB_TOKEN");

/**
 * Chave web do projeto (a mesma `NEXT_PUBLIC_FIREBASE_API_KEY` do site). Não é
 * segredo de verdade — está no JavaScript de toda página —, mas mora no Secret
 * Manager porque o deploy roda no GitHub, sem `functions/.env`, e é o único
 * lugar de configuração que ele já lê.
 */
export const TOPETE_WEB_API_KEY = defineSecret("TOPETE_WEB_API_KEY");

type Resposta = { codigo: number; corpo: Record<string, unknown> };

const erro = (codigo: number, mensagem: string): Resposta => ({
  codigo,
  corpo: { ok: false, error: mensagem },
});

function projetoAtual(): string {
  if (process.env.GCLOUD_PROJECT) return process.env.GCLOUD_PROJECT;
  try {
    return JSON.parse(process.env.FIREBASE_CONFIG ?? "{}").projectId ?? "";
  } catch {
    return "";
  }
}

export const plataforma = onRequest(
  { secrets: [CORTEHUB_TOKEN, TOPETE_WEB_API_KEY], timeoutSeconds: 60 },
  async (req, res) => {
    res.set("Cache-Control", "no-store");

    const esperado = CORTEHUB_TOKEN.value().trim();
    if (!esperado) {
      console.error("[plataforma] CORTEHUB_TOKEN vazio — recusando tudo");
      res.status(503).json({ ok: false, error: "integracao nao configurada" });
      return;
    }
    if (!tokenConfere(tokenDoCabecalho(req.get("authorization")), esperado)) {
      res.status(401).json({ ok: false, error: "nao autorizado" });
      return;
    }
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "use POST" });
      return;
    }

    const rota = rotaDe(req.path);
    let r: Resposta;
    try {
      if (rota === "provisionar") {
        const v = validarProvisionamento(req.body);
        r = v.ok ? await provisionar(v.dados) : erro(400, v.erro);
      } else if (rota === "status") {
        const v = validarMudancaDeStatus(req.body);
        r = v.ok ? await mudarStatus(v.dados) : erro(400, v.erro);
      } else {
        r = erro(404, "rota desconhecida (use /provisionar ou /status)");
      }
    } catch (e) {
      console.error(`[plataforma] ${rota ?? req.path} falhou`, e);
      r = erro(500, "falha interna");
    }
    res.status(r.codigo).json(r.corpo);
  }
);

/* ------------------------------------------------------------------ */
/* POST /provisionar                                                   */
/* ------------------------------------------------------------------ */

async function provisionar(d: PedidoDeProvisionamento): Promise<Resposta> {
  const db = getFirestore();
  const auth = getAuth();

  /* Slug tomado. Se foi o PRÓPRIO Hub que criou, para este mesmo cliente, é a
   * mesma chamada chegando de novo — o Hub espera 20 segundos e pode ter
   * desistido de uma resposta que chegou depois. Devolver a barbearia que já
   * existe torna o provisionamento idempotente; devolver 409 deixaria o
   * cliente no Hub sem `externoId` para sempre. Para qualquer outro, 409. */
  const indice = await db.doc(`slugs/${d.slug}`).get();
  if (indice.exists) {
    const barbershopId = String(indice.get("barbershopId") ?? "");
    const hub = barbershopId ? await db.doc(`barbershops/${barbershopId}/private/hub`).get() : null;
    if (hub?.get("tenantId") === d.hubTenantId) {
      const dono = await garantirVinculoDoDono(barbershopId, d.ownerEmail);
      const shop = await db.doc(`barbershops/${barbershopId}`).get();
      const url = urlDaBarbearia(shop.data() ?? {});
      /* A chamada repetida também diz como o dono entra. Se a primeira caiu
       * antes do e-mail de senha (o vínculo falhou, o Hub desistiu de
       * esperar), é aqui que ele sai — uma vez só: `acessoEnviadoEmMs` evita
       * um e-mail por tentativa do Hub. */
      const acesso = await entregarAcesso({
        dono,
        email: d.ownerEmail,
        url,
        slug: d.slug,
        hubRef: db.doc(`barbershops/${barbershopId}/private/hub`),
        jaEnviadoEmMs: hub?.get("acessoEnviadoEmMs"),
        dominioAutorizado: null,
      });
      return {
        codigo: 200,
        corpo: { ok: true, barbershopId, url, acesso, repetido: true },
      };
    }
    return erro(409, `o endereco "${d.slug}" ja esta em uso`);
  }

  /* A conta do dono. Sem senha: quem define é ele, pelo e-mail do Firebase.
   * Se o e-mail já tem conta (entrou com Google, é dono de outra barbearia),
   * ela é usada como está — desde que o e-mail dela esteja PROVADO
   * (`podeAssumirContaExistente`). Conta com senha e e-mail não confirmado
   * pode ser de quem cadastrou o e-mail de outra pessoa para ficar com a
   * barbearia dela: recusa, com um motivo que o Hub reconhece. */
  let dono: UserRecord;
  try {
    dono = await auth.getUserByEmail(d.ownerEmail);
  } catch (e) {
    if ((e as { code?: string })?.code !== "auth/user-not-found") throw e;
    dono = await auth.createUser({
      email: d.ownerEmail,
      displayName: d.ownerNome ?? undefined,
      emailVerified: false,
    });
  }
  if (!podeAssumirContaExistente(dono)) {
    console.warn(`[plataforma] ${d.slug}: conta de ${d.ownerEmail} existe e não confirmou o e-mail — recusado`);
    return {
      codigo: 409,
      corpo: {
        ok: false,
        error: MOTIVO_CONTA_NAO_VERIFICADA,
        mensagem:
          "ja existe uma conta com este e-mail, com senha, que ainda nao confirmou o e-mail; " +
          "peca ao dono para confirmar o e-mail (ou entrar com Google) e tente de novo",
      },
    };
  }

  let barbershopId: string;
  try {
    ({ barbershopId } = await criarBarbeariaAssistida(db, {
      slug: d.slug,
      name: d.nome,
      plan: d.plano,
      owner: { uid: dono.uid, displayName: d.ownerNome ?? dono.displayName ?? null, email: d.ownerEmail },
      criadoPor: null,
      hubTenantId: d.hubTenantId,
    }));
  } catch (e) {
    // Outra criação levou o slug entre a leitura acima e a transação.
    if (e instanceof HttpsError && e.code === "already-exists") {
      return erro(409, `o endereco "${d.slug}" ja esta em uso`);
    }
    throw e;
  }

  /* Fora da transação, como em `provisionBarbershop`. Falhar aqui deixa a
   * barbearia sem dono: responde 500, e a nova chamada do Hub cai no caminho
   * idempotente acima, que refaz o vínculo. */
  await grantRole(dono.uid, barbershopId, "owner");

  const url = urlDaBarbearia({ slug: d.slug });
  const dominio = url ? new URL(url).host : null;

  /* Os dois passos abaixo não desfazem a barbearia se falharem: ela existe e
   * funciona pelo painel. O que falta vai para o log de erro e para a
   * resposta, e o operador resolve pelo console do Firebase. */
  let dominioAutorizado = false;
  if (dominio) {
    try {
      await autorizarDominio({ projeto: projetoAtual(), dominio });
      dominioAutorizado = true;
    } catch (e) {
      console.error(`[plataforma] domínio ${dominio} NÃO autorizado no Firebase Auth`, e);
    }
  }

  const acesso = await entregarAcesso({
    dono,
    email: d.ownerEmail,
    url,
    slug: d.slug,
    hubRef: db.doc(`barbershops/${barbershopId}/private/hub`),
    jaEnviadoEmMs: null,
    dominioAutorizado,
  });

  return {
    codigo: 200,
    corpo: { ok: true, barbershopId, url, acesso, dominioAutorizado },
  };
}

type Acesso = "email_enviado" | "conta_existente" | "email_falhou";

/**
 * Manda o e-mail de definir senha quando a conta não tem como entrar.
 *
 * A decisão é pela CONTA (`precisaDeEmailDeAcesso`: sem senha e sem Google),
 * não por "acabei de criar": se `createUser` deu certo e a criação da loja
 * falhou, a nova tentativa achava a conta pronta e o e-mail nunca saía — o
 * dono ficava com uma barbearia e nenhum jeito de entrar nela.
 *
 * `dominioAutorizado` nulo é a chamada repetida, que não sabe se a primeira
 * autorizou o domínio: tenta de novo (é idempotente) só se for mandar.
 */
async function entregarAcesso(p: {
  dono: UserRecord | null;
  email: string;
  url: string | null;
  slug: string;
  hubRef: FirebaseFirestore.DocumentReference;
  jaEnviadoEmMs: unknown;
  dominioAutorizado: boolean | null;
}): Promise<Acesso> {
  if (!p.dono || !precisaDeEmailDeAcesso(p.dono)) return "conta_existente";
  if (Number(p.jaEnviadoEmMs) > 0) return "email_enviado";

  let autorizado = p.dominioAutorizado;
  if (autorizado === null) {
    const dominio = p.url ? new URL(p.url).host : null;
    autorizado = false;
    if (dominio) {
      try {
        await autorizarDominio({ projeto: projetoAtual(), dominio });
        autorizado = true;
      } catch (e) {
        console.error(`[plataforma] domínio ${dominio} NÃO autorizado no Firebase Auth`, e);
      }
    }
  }

  try {
    await enviarEmailDeDefinirSenha({
      email: p.email,
      chaveWeb: TOPETE_WEB_API_KEY.value(),
      continueUrl: autorizado && p.url ? `${p.url}/login` : null,
    });
  } catch (e) {
    console.error(`[plataforma] e-mail de acesso NÃO enviado para o dono de ${p.slug}`, e);
    return "email_falhou";
  }
  /* Marca o envio para a próxima repetição do Hub não mandar outro. Falhar
   * aqui só custa um e-mail a mais depois — não desfaz o que saiu. */
  await p.hubRef.set({ acessoEnviadoEmMs: Date.now() }, { merge: true }).catch((e) => {
    console.warn(`[plataforma] envio do e-mail de acesso de ${p.slug} não ficou registrado`, e);
  });
  return "email_enviado";
}

/**
 * Refaz o vínculo do dono quando a mesma criação chega de novo. Idempotente.
 * Devolve a conta do dono — ou nulo, se o e-mail do pedido não é o dono
 * registrado na criação.
 */
async function garantirVinculoDoDono(barbershopId: string, email: string): Promise<UserRecord | null> {
  const dono = await getAuth()
    .getUserByEmail(email)
    .catch(() => null);
  if (!dono) return null;
  const membro = await getFirestore().doc(`barbershops/${barbershopId}/members/${dono.uid}`).get();
  // Só quem a criação registrou como dono: o e-mail do pedido não dá papel a mais ninguém.
  if (membro.get("role") !== "owner") return null;
  const papel = (dono.customClaims?.barbershops as Record<string, string> | undefined)?.[barbershopId];
  if (papel !== "owner") await grantRole(dono.uid, barbershopId, "owner");
  return dono;
}

/* ------------------------------------------------------------------ */
/* POST /status                                                        */
/* ------------------------------------------------------------------ */

async function mudarStatus(d: MudancaDeStatus): Promise<Resposta> {
  const db = getFirestore();
  const shopRef = db.doc(`barbershops/${d.barbershopId}`);
  const hubRef = shopRef.collection("private").doc("hub");
  const eventoRef = db.collection("plataforma_eventos").doc(idDoEventoRecebido(d.eventoId));

  return db.runTransaction(async (tx): Promise<Resposta> => {
    const [evento, shop, hub] = await Promise.all([tx.get(eventoRef), tx.get(shopRef), tx.get(hubRef)]);

    // Idempotência: o mesmo evento chegando de novo não aplica nada.
    if (evento.exists) return { codigo: 200, corpo: { ok: true, duplicado: true } };
    if (!shop.exists) return erro(404, "barbearia nao encontrada");

    /* O comando precisa ser do cliente do Hub que está ligado a esta
     * barbearia. Um `barbershopId` trocado no Hub suspenderia a barbearia de
     * outra pessoa. Sem vínculo ainda (o O Siqueira, criado antes da
     * integração), o primeiro comando liga. */
    const tenantAtual = hub.get("tenantId");
    if (tenantAtual && tenantAtual !== d.hubTenantId) {
      return erro(409, `barbearia ligada a outro cliente do Hub (${tenantAtual})`);
    }

    const antes = shop.get("status") ?? null;
    const t = transicaoDoHub(shop.data() ?? {}, d.status, Date.now());
    if (t.tipo === "conflito") return erro(409, t.erro);

    if (t.tipo === "aplicar") tx.update(shopRef, t.campos);
    if (!tenantAtual) {
      tx.set(
        hubRef,
        { tenantId: d.hubTenantId, origem: "status", vinculadoEm: FieldValue.serverTimestamp() },
        { merge: true }
      );
    }
    tx.create(eventoRef, {
      eventoId: d.eventoId,
      barbershopId: d.barbershopId,
      hubTenantId: d.hubTenantId,
      statusDoHub: d.status,
      de: antes,
      para: t.para,
      aplicado: t.tipo === "aplicar",
      motivo: t.tipo === "nada" ? t.motivo : null,
      recebidoEm: FieldValue.serverTimestamp(),
    });
    tx.set(shopRef.collection("audit_log").doc(), {
      action: "barbershop.status_pelo_hub",
      by: "hub",
      at: FieldValue.serverTimestamp(),
      detail: { de: antes, para: t.para, statusDoHub: d.status, eventoId: d.eventoId, aplicado: t.tipo === "aplicar" },
    });

    return {
      codigo: 200,
      corpo: { ok: true, barbershopId: d.barbershopId, status: t.para, aplicado: t.tipo === "aplicar" },
    };
  });
}
