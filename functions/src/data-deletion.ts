import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { getAuth, type Auth } from "firebase-admin/auth";
import { FieldValue, getFirestore, type Firestore, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { semIdentificacao } from "./anonimizacao";

/**
 * Encerramento de conta e expurgo dos dados.
 *
 * Existe por uma obrigação que o próprio produto criou: a Política de
 * Privacidade publicada promete que, encerrada a conta, os dados ficam 30 dias
 * disponíveis para exportação e depois são **excluídos**. Documento que promete
 * o que o código não faz é o defeito que este projeto persegue — só que aqui
 * com efeito legal.
 *
 * A janela de 30 dias não é enfeite: exclusão imediata transforma um clique
 * errado, ou uma briga com um sócio, em perda definitiva do histórico de um
 * negócio. E prazo longo demais contraria o que foi prometido ao titular.
 *
 * O desenho — ordem, o que é retido e por quê — está em
 * `docs/LGPD-DIREITOS-DO-TITULAR.md` §4.
 */

/**
 * Enquanto for `true`, o expurgo REGISTRA o que apagaria e não apaga nada.
 *
 * Mesma decisão de `revisarAssinaturas`, pelo mesmo motivo e com mais razão:
 * rotina que apaga dado de cliente é do tipo que só se confia depois de ver o
 * que ela decidiria, e o custo de descobrir errado é irreversível por
 * definição. Desligar exige ter lido o log ao menos uma vez com conta real
 * encerrada.
 */
const DRY_RUN = true;

/** Dias entre encerrar a conta e apagar os dados. Prometido na política. */
export const DIAS_ATE_O_EXPURGO = 30;

/**
 * Por quanto tempo o arquivo fiscal fica, depois do expurgo.
 *
 * Cinco anos é o prazo decadencial do CTN (arts. 173 e 174) — o número comum,
 * não uma opinião legal. ⚖️ A confirmar em revisão jurídica.
 */
export const ANOS_DE_RETENCAO_FISCAL = 5;

/**
 * O que a Política §6 manda reter "pelo prazo que a lei exigir, mesmo após a
 * exclusão do restante". Entram no arquivo SEM identificação
 * (`semIdentificacao`): o arquivo prova que o dinheiro existiu, não quem era a
 * pessoa. `private` é o contrato da barbearia com a plataforma.
 */
export const COLECOES_FISCAIS = [
  "payments",
  "refunds",
  "commissions",
  "cash_entries",
  "expenses",
  "subscription_invoices",
  "audit_log",
  "private",
] as const;

const DIA_MS = 24 * 60 * 60 * 1000;
const ANO_MS = 365.25 * DIA_MS;
const TAMANHO_DO_LOTE = 400;

/**
 * A conta já passou da janela de exportação?
 *
 * Separado do handler para poder ser exercido sem emulador, sem autenticação e
 * sem barbearia semeada — que foi exatamente o motivo de a conta do
 * cancelamento ter vivido sem teste nenhum até ser extraída.
 */
export function venceuAJanela(
  encerradaEm: number | null | undefined,
  agora: number,
  dias = DIAS_ATE_O_EXPURGO
): boolean {
  if (!Number.isFinite(encerradaEm as number) || !encerradaEm) return false;
  return agora - encerradaEm >= dias * DIA_MS;
}

/**
 * Tudo que precisa acontecer quando uma barbearia é apagada, NA ORDEM.
 *
 * Isto é uma LISTA e não um `recursiveDelete` solto porque nem todo dado
 * pessoal da barbearia mora debaixo dela. Dois exemplos reais:
 *
 * - `whatsapp_conversations` usa **o telefone do cliente como id do
 *   documento**, na raiz do banco;
 * - `slugs/{slug}` é o que prende o subdomínio, e sem liberá-lo o endereço
 *   fica reservado para sempre a uma barbearia que não existe mais.
 *
 * ## Por que a árvore é o ÚLTIMO alvo
 *
 * A rotina reencontra a conta pela consulta `status == "encerrada"` — ou seja,
 * pelo documento da barbearia. Esta lista apagava a árvore PRIMEIRO: se
 * qualquer passo seguinte falhasse, a próxima execução não achava mais a conta,
 * e slug e telefones ficavam órfãos para sempre. Com a árvore no fim, qualquer
 * falha é simplesmente repetida no dia seguinte.
 *
 * ## O que saiu
 *
 * `{ tipo: "grupo", colecao: "memberships" }` apontava para uma coleção que
 * nada escreve, e varria o collection group da plataforma inteira para apagar
 * zero documentos. O vínculo de dono e equipe vive no claim e em `members/`, e
 * é disso que o passo `contas` cuida.
 */
export type AlvoDeExpurgo =
  | { tipo: "marcar"; caminho: string }
  | { tipo: "arquivar"; origem: string; destino: string; colecoes: readonly string[] }
  | { tipo: "consulta"; colecao: string; campo: string; valor: string }
  | { tipo: "storage"; prefixo: string }
  | { tipo: "contas"; membros: string }
  | { tipo: "documento"; caminho: string }
  | { tipo: "arvore"; caminho: string };

export function alvosDoExpurgo(barbershopId: string, slug: string | null): AlvoDeExpurgo[] {
  const shop = `barbershops/${barbershopId}`;
  const alvos: AlvoDeExpurgo[] = [
    // Primeiro, o selo: impede `reabrirConta` de ressuscitar uma conta pela metade.
    { tipo: "marcar", caminho: shop },
    // Antes de qualquer exclusão, o que a Política manda reter.
    {
      tipo: "arquivar",
      origem: shop,
      destino: `arquivo_fiscal/${barbershopId}`,
      colecoes: COLECOES_FISCAIS,
    },
    // Índices de WhatsApp na raiz — o segundo tem telefone no id do documento.
    { tipo: "consulta", colecao: "whatsapp_sent", campo: "barbershopId", valor: barbershopId },
    { tipo: "consulta", colecao: "whatsapp_conversations", campo: "barbershopId", valor: barbershopId },
    { tipo: "consulta", colecao: "whatsapp_numbers", campo: "barbershopId", valor: barbershopId },
    // Logo, fotos, qualquer arquivo — o Storage não some com o Firestore.
    { tipo: "storage", prefixo: `${shop}/` },
    // Claims, Auth, `users` e `platform_users` de dono e equipe. Lê `members`,
    // que mora na árvore — por isso vem antes dela.
    { tipo: "contas", membros: `${shop}/members` },
  ];
  // Libera o subdomínio. Sem isto o endereço fica preso a um fantasma.
  if (slug) alvos.push({ tipo: "documento", caminho: `slugs/${slug}` });
  // A barbearia e TODAS as subcoleções dela, inclusive as que ninguém listou
  // aqui: enumerar subcoleção à mão é garantir esquecer a próxima que entrar.
  alvos.push({ tipo: "arvore", caminho: shop });
  return alvos;
}

/**
 * O que fazer com a conta de quem era dono ou equipe da barbearia que fechou.
 *
 * O vínculo sai SEMPRE. A conta só é apagada quando não sobra motivo para ela
 * existir: um barbeiro que trabalha em duas casas, um dono que corta em outra,
 * ou o operador da plataforma perdem só o vínculo com a que fechou.
 */
export function destinoDaConta(params: {
  outrasBarbearias: number;
  operadorDaPlataforma: boolean;
  clienteEmOutraBarbearia: boolean;
}): "apagar" | "so_vinculo" {
  if (params.outrasBarbearias > 0) return "so_vinculo";
  if (params.operadorDaPlataforma) return "so_vinculo";
  if (params.clienteEmOutraBarbearia) return "so_vinculo";
  return "apagar";
}

/**
 * O status a restaurar quando o dono reabre.
 *
 * Gravava sempre `suspenso`: a barbearia `ativa` e pagante que encerrasse e se
 * arrependesse voltava bloqueada. Sem o dado — conta encerrada antes de o
 * campo existir, ou valor desconhecido —, o mínimo, e o suporte ajusta
 * (`HANDOFF.md` §5.3: ausência resolve para o mínimo, nunca para o generoso).
 */
export function statusAoReabrir(statusAntes: unknown): "ativo" | "trial" | "suspenso" {
  return statusAntes === "ativo" || statusAntes === "trial" ? statusAntes : "suspenso";
}

/** Só o que precisa do bucket — injetável para o emulador e para o teste. */
export type Balde = {
  getFiles(opts: { prefix: string }): Promise<[Array<{ name: string }>, ...unknown[]]>;
  deleteFiles(opts: { prefix: string; force?: boolean }): Promise<unknown>;
};

type Contexto = {
  db: Firestore;
  auth: Pick<Auth, "getUser" | "setCustomUserClaims" | "revokeRefreshTokens" | "deleteUser">;
  balde: Balde;
  barbershopId: string;
  agora: number;
  dryRun: boolean;
};

/** Copia uma coleção para o arquivo fiscal, sem identificação. Idempotente: mesmo id. */
async function arquivarColecao(
  ctx: Contexto,
  origem: string,
  destino: string
): Promise<number> {
  const docs = (await ctx.db.collection(origem).get()).docs;
  if (ctx.dryRun) return docs.length;
  for (let i = 0; i < docs.length; i += TAMANHO_DO_LOTE) {
    const batch = ctx.db.batch();
    for (const d of docs.slice(i, i + TAMANHO_DO_LOTE)) {
      batch.set(ctx.db.doc(`${destino}/${d.id}`), semIdentificacao(d.data()));
    }
    await batch.commit();
  }
  return docs.length;
}

async function tratarContas(ctx: Contexto, membros: QueryDocumentSnapshot[]): Promise<string[]> {
  const linhas: string[] = [];
  for (const m of membros) {
    const uid = m.id;
    const usuario = await ctx.auth.getUser(uid).catch((e: { code?: string }) => {
      if (e?.code === "auth/user-not-found") return null;
      throw e;
    });
    if (!usuario) {
      linhas.push(`conta ${uid}: já não existe no Auth`);
      continue;
    }

    const claims = { ...(usuario.customClaims ?? {}) } as Record<string, unknown>;
    const vinculos = { ...((claims.barbershops ?? {}) as Record<string, string>) };
    delete vinculos[ctx.barbershopId];

    const comoCliente = await ctx.db.collectionGroup("clients").where("uid", "==", uid).get();
    const destino = destinoDaConta({
      outrasBarbearias: Object.keys(vinculos).length,
      operadorDaPlataforma: claims.platformAdmin === true,
      clienteEmOutraBarbearia: comoCliente.docs.some(
        (d) => d.ref.parent.parent?.id !== ctx.barbershopId
      ),
    });
    linhas.push(`conta ${uid}: ${destino === "apagar" ? "APAGAR" : "só retirar o vínculo"}`);
    if (ctx.dryRun) continue;

    if (destino === "apagar") {
      await ctx.db.recursiveDelete(ctx.db.doc(`users/${uid}`));
      await ctx.db.doc(`platform_users/${uid}`).delete();
      await ctx.auth.deleteUser(uid);
    } else {
      await ctx.auth.setCustomUserClaims(uid, { ...claims, barbershops: vinculos });
      // O claim antigo continuaria valendo até o token vencer.
      await ctx.auth.revokeRefreshTokens(uid);
    }
  }
  return linhas;
}

/**
 * Expurga UMA barbearia, na ordem de `alvosDoExpurgo`.
 *
 * Em `dryRun` só LÊ: conta o que arquivaria, lista o que apagaria e decide o
 * destino de cada conta — é o log que precisa ser lido antes de desligar.
 */
export async function expurgarBarbearia(
  ctx: Contexto,
  slug: string | null,
  nome: string
): Promise<string[]> {
  const { db } = ctx;
  const linhas: string[] = [];

  for (const alvo of alvosDoExpurgo(ctx.barbershopId, slug)) {
    if (alvo.tipo === "marcar") {
      if (!ctx.dryRun) {
        await db.doc(alvo.caminho).update({
          expurgo: { iniciadoEm: FieldValue.serverTimestamp(), iniciadoEmMs: ctx.agora },
        });
      }
    } else if (alvo.tipo === "arquivar") {
      const contagens: string[] = [];
      for (const colecao of alvo.colecoes) {
        const n = await arquivarColecao(ctx, `${alvo.origem}/${colecao}`, `${alvo.destino}/${colecao}`);
        if (n) contagens.push(`${colecao}=${n}`);
      }
      if (!ctx.dryRun) {
        const shop = await db.doc(alvo.origem).get();
        await db.doc(alvo.destino).set({
          barbershopId: ctx.barbershopId,
          nome,
          slug,
          encerradaEmMs: shop.get("encerradaEmMs") ?? null,
          arquivadoEmMs: ctx.agora,
          reterAteMs: ctx.agora + ANOS_DE_RETENCAO_FISCAL * ANO_MS,
        });
      }
      linhas.push(`arquivo fiscal: ${contagens.join(", ") || "nada a reter"}`);
    } else if (alvo.tipo === "consulta") {
      const achados = await db.collection(alvo.colecao).where(alvo.campo, "==", alvo.valor).get();
      if (achados.size) linhas.push(`${alvo.colecao}: ${achados.size}`);
      if (!ctx.dryRun) await Promise.all(achados.docs.map((d) => d.ref.delete()));
    } else if (alvo.tipo === "storage") {
      const [arquivos] = await ctx.balde.getFiles({ prefix: alvo.prefixo });
      if (arquivos.length) linhas.push(`storage: ${arquivos.length} arquivo(s)`);
      if (!ctx.dryRun && arquivos.length) {
        await ctx.balde.deleteFiles({ prefix: alvo.prefixo, force: true });
      }
    } else if (alvo.tipo === "contas") {
      const membros = await db.collection(alvo.membros).get();
      linhas.push(...(await tratarContas(ctx, membros.docs)));
    } else if (alvo.tipo === "documento") {
      linhas.push(`${alvo.caminho}`);
      if (!ctx.dryRun) await db.doc(alvo.caminho).delete();
    } else {
      linhas.push(`árvore ${alvo.caminho}`);
      // Apaga o documento e toda subcoleção abaixo dele, conhecida ou não.
      if (!ctx.dryRun) await db.recursiveDelete(db.doc(alvo.caminho));
    }
  }
  return linhas;
}

/**
 * O dono encerra a própria conta.
 *
 * Não apaga nada agora: marca a data e deixa a janela correr. O acesso ao
 * painel continua — quem encerrou precisa exatamente disso para exportar o que
 * quiser antes do prazo.
 *
 * Guarda o status de antes, para `reabrirConta` devolver o que era. E chamar de
 * novo numa conta já encerrada NÃO reinicia o relógio: devolve o prazo que já
 * corre.
 */
export const encerrarConta = onCall<{ barbershopId: string; motivo?: string }>(
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Entre na sua conta.");

    const { barbershopId, motivo } = request.data ?? {};
    if (!barbershopId) throw new HttpsError("invalid-argument", "Barbearia não informada.");

    const ehDono =
      (request.auth?.token.barbershops as Record<string, string> | undefined)?.[barbershopId] ===
      "owner";
    if (!ehDono) throw new HttpsError("permission-denied", "Só o dono encerra a conta.");

    const db = getFirestore();
    const ref = db.doc(`barbershops/${barbershopId}`);

    const encerradaEmMs = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new HttpsError("not-found", "Barbearia não encontrada.");

      const jaEncerrada = snap.get("status") === "encerrada";
      const desde = Number(snap.get("encerradaEmMs"));
      if (jaEncerrada && Number.isFinite(desde) && desde > 0) return desde;

      const agora = Date.now();
      tx.update(ref, {
        status: "encerrada",
        statusAntesDeEncerrar: jaEncerrada ? null : snap.get("status") ?? null,
        encerradaEm: FieldValue.serverTimestamp(),
        encerradaEmMs: agora,
        encerradaPor: uid,
        encerramentoMotivo: motivo ? String(motivo).slice(0, 500) : null,
      });
      return agora;
    });

    return {
      expurgoEm: new Date(encerradaEmMs + DIAS_ATE_O_EXPURGO * DIA_MS).toISOString(),
      diasParaExportar: DIAS_ATE_O_EXPURGO,
    };
  }
);

/** O dono se arrepende dentro da janela. Não haveria por que impedir. */
export const reabrirConta = onCall<{ barbershopId: string }>(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Entre na sua conta.");

  const { barbershopId } = request.data ?? {};
  if (!barbershopId) throw new HttpsError("invalid-argument", "Barbearia não informada.");

  const ehDono =
    (request.auth?.token.barbershops as Record<string, string> | undefined)?.[barbershopId] ===
    "owner";
  if (!ehDono) throw new HttpsError("permission-denied", "Só o dono reabre a conta.");

  const db = getFirestore();
  const ref = db.doc(`barbershops/${barbershopId}`);

  const status = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Barbearia não encontrada.");
    if (snap.get("status") !== "encerrada") {
      throw new HttpsError("failed-precondition", "Esta conta não está encerrada.");
    }
    /* Depois que o expurgo começou, parte dos dados já pode ter saído. Reabrir
     * ali seria devolver ao dono uma barbearia pela metade dizendo que está
     * inteira. */
    if (snap.get("expurgo")) {
      throw new HttpsError(
        "failed-precondition",
        "A exclusão desta conta já começou e não dá mais para reabrir."
      );
    }

    const volta = statusAoReabrir(snap.get("statusAntesDeEncerrar"));
    tx.update(ref, {
      status: volta,
      statusAntesDeEncerrar: FieldValue.delete(),
      encerradaEm: FieldValue.delete(),
      encerradaEmMs: FieldValue.delete(),
      encerradaPor: FieldValue.delete(),
      encerramentoMotivo: FieldValue.delete(),
    });
    return volta;
  });

  return { reaberta: true, status };
});

/**
 * Apaga o que passou da janela. Uma vez por dia.
 *
 * Por que não a cada hora: a diferença entre apagar às 3h e às 15h do trigésimo
 * dia não muda nada para ninguém, e uma rotina de exclusão que roda com
 * frequência é uma rotina com mais chances de apagar o que não devia.
 *
 * Cada barbearia roda no próprio `try/catch`. Antes, a primeira exceção abortava
 * todas as outras — e, com a árvore apagada primeiro, a que falhou nem voltava
 * a ser encontrada.
 */
export const expurgarContasEncerradas = onSchedule(
  { schedule: "0 4 * * *", timeZone: "America/Sao_Paulo", region: "southamerica-east1" },
  async () => {
    const db = getFirestore();
    const auth = getAuth();
    const balde = getStorage().bucket() as unknown as Balde;
    const agora = Date.now();
    const decisoes: string[] = [];
    let falhas = 0;

    const encerradas = await db
      .collection("barbershops")
      .where("status", "==", "encerrada")
      .get();

    for (const shop of encerradas.docs) {
      const nome = String(shop.get("brand.name") ?? shop.id);
      const encerradaEmMs = shop.get("encerradaEmMs");

      if (!venceuAJanela(encerradaEmMs, agora)) {
        const dias = Number.isFinite(encerradaEmMs)
          ? Math.ceil((encerradaEmMs + DIAS_ATE_O_EXPURGO * DIA_MS - agora) / DIA_MS)
          : "?";
        decisoes.push(`${nome}: dentro da janela, faltam ${dias} dia(s)`);
        continue;
      }

      try {
        const linhas = await expurgarBarbearia(
          { db, auth, balde, barbershopId: shop.id, agora, dryRun: DRY_RUN },
          shop.get("slug") ?? null,
          nome
        );
        decisoes.push(`${nome}: EXPURGO\n${linhas.map((l) => `      · ${l}`).join("\n")}`);
      } catch (erro) {
        /* A conta continua `encerrada`, com a árvore no lugar: amanhã a rotina
         * a encontra de novo e repete. É para isso que a árvore é a última. */
        falhas++;
        decisoes.push(`${nome}: FALHOU — ${erro instanceof Error ? erro.message : String(erro)}`);
      }
    }

    /* O arquivo fiscal também vence. Sem isto a retenção "pelo prazo da lei"
     * viraria retenção para sempre — outra promessa quebrada, no sentido
     * contrário. */
    try {
      const vencidos = await db.collection("arquivo_fiscal").where("reterAteMs", "<=", agora).get();
      for (const a of vencidos.docs) {
        decisoes.push(`arquivo fiscal de ${a.get("nome") ?? a.id}: prazo de retenção vencido, APAGAR`);
        if (!DRY_RUN) await db.recursiveDelete(a.ref);
      }
    } catch (erro) {
      falhas++;
      decisoes.push(`arquivo fiscal: FALHOU — ${erro instanceof Error ? erro.message : String(erro)}`);
    }

    const relatorio =
      `[expurgo]${DRY_RUN ? " (DRY_RUN)" : ""} ${encerradas.size} conta(s) encerrada(s)` +
      `${falhas ? `, ${falhas} falha(s)` : ""}\n` +
      decisoes.map((d) => `  - ${d}`).join("\n");
    // Falha vai para o nível de erro: é o que um alerta de log enxerga.
    if (falhas) console.error(relatorio);
    else console.log(relatorio);
  }
);
