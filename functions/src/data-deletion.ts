import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

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

const DIA_MS = 24 * 60 * 60 * 1000;

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
 * Tudo que precisa sumir quando uma barbearia é apagada.
 *
 * Isto é uma LISTA e não um `recursiveDelete` solto porque nem todo dado
 * pessoal da barbearia mora debaixo dela. Dois exemplos reais:
 *
 * - `whatsapp_conversations` usa **o telefone do cliente como id do
 *   documento**, na raiz do banco;
 * - `slugs/{slug}` é o que prende o subdomínio, e sem liberá-lo o endereço
 *   fica reservado para sempre a uma barbearia que não existe mais.
 *
 * Apagar só a árvore da barbearia deixaria telefone de cliente final no banco
 * — e a política afirmando que não deixou.
 */
export type AlvoDeExpurgo =
  | { tipo: "arvore"; caminho: string }
  | { tipo: "documento"; caminho: string }
  | { tipo: "consulta"; colecao: string; campo: string; valor: string }
  | { tipo: "grupo"; colecao: string; documento: string };

export function alvosDoExpurgo(barbershopId: string, slug: string | null): AlvoDeExpurgo[] {
  const alvos: AlvoDeExpurgo[] = [
    // A barbearia e TODAS as subcoleções dela, inclusive as que ninguém listou
    // aqui: enumerar subcoleção à mão é garantir esquecer a próxima que entrar.
    { tipo: "arvore", caminho: `barbershops/${barbershopId}` },
    // Vínculos do dono e da equipe, que vivem debaixo de cada usuário.
    { tipo: "grupo", colecao: "memberships", documento: barbershopId },
    // Índices de WhatsApp na raiz — o segundo tem telefone no id do documento.
    { tipo: "consulta", colecao: "whatsapp_sent", campo: "barbershopId", valor: barbershopId },
    { tipo: "consulta", colecao: "whatsapp_conversations", campo: "barbershopId", valor: barbershopId },
    { tipo: "consulta", colecao: "whatsapp_numbers", campo: "barbershopId", valor: barbershopId },
  ];
  // Libera o subdomínio. Sem isto o endereço fica preso a um fantasma.
  if (slug) alvos.push({ tipo: "documento", caminho: `slugs/${slug}` });
  return alvos;
}

/**
 * O dono encerra a própria conta.
 *
 * Não apaga nada agora: marca a data e deixa a janela correr. O acesso ao
 * painel continua — quem encerrou precisa exatamente disso para exportar o que
 * quiser antes do prazo.
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
    if (!(await ref.get()).exists) {
      throw new HttpsError("not-found", "Barbearia não encontrada.");
    }

    const agora = Date.now();
    await ref.update({
      status: "encerrada",
      encerradaEm: FieldValue.serverTimestamp(),
      encerradaEmMs: agora,
      encerradaPor: uid,
      encerramentoMotivo: motivo ?? null,
    });

    return {
      expurgoEm: new Date(agora + DIAS_ATE_O_EXPURGO * DIA_MS).toISOString(),
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

  await getFirestore().doc(`barbershops/${barbershopId}`).update({
    status: "suspenso",
    encerradaEm: FieldValue.delete(),
    encerradaEmMs: FieldValue.delete(),
    encerradaPor: FieldValue.delete(),
    encerramentoMotivo: FieldValue.delete(),
  });

  return { reaberta: true };
});

/**
 * Apaga o que passou da janela. Uma vez por dia.
 *
 * Por que não a cada hora: a diferença entre apagar às 3h e às 15h do trigésimo
 * dia não muda nada para ninguém, e uma rotina de exclusão que roda com
 * frequência é uma rotina com mais chances de apagar o que não devia.
 */
export const expurgarContasEncerradas = onSchedule(
  { schedule: "0 4 * * *", timeZone: "America/Sao_Paulo", region: "southamerica-east1" },
  async () => {
    const db = getFirestore();
    const agora = Date.now();
    const decisoes: string[] = [];

    const encerradas = await db
      .collection("barbershops")
      .where("status", "==", "encerrada")
      .get();

    for (const shop of encerradas.docs) {
      const nome = shop.get("brand.name") ?? shop.id;
      const encerradaEmMs = shop.get("encerradaEmMs");

      if (!venceuAJanela(encerradaEmMs, agora)) {
        const dias = Number.isFinite(encerradaEmMs)
          ? Math.ceil((encerradaEmMs + DIAS_ATE_O_EXPURGO * DIA_MS - agora) / DIA_MS)
          : "?";
        decisoes.push(`${nome}: dentro da janela, faltam ${dias} dia(s)`);
        continue;
      }

      const alvos = alvosDoExpurgo(shop.id, shop.get("slug") ?? null);
      decisoes.push(`${nome}: EXPURGO — ${alvos.length} alvos`);

      if (DRY_RUN) continue;

      for (const alvo of alvos) {
        if (alvo.tipo === "arvore") {
          // Apaga o documento e toda subcoleção abaixo dele, conhecida ou não.
          await db.recursiveDelete(db.doc(alvo.caminho));
        } else if (alvo.tipo === "documento") {
          await db.doc(alvo.caminho).delete();
        } else if (alvo.tipo === "consulta") {
          const achados = await db
            .collection(alvo.colecao)
            .where(alvo.campo, "==", alvo.valor)
            .get();
          await Promise.all(achados.docs.map((d) => d.ref.delete()));
        } else {
          const achados = await db.collectionGroup(alvo.colecao).get();
          await Promise.all(
            achados.docs.filter((d) => d.id === alvo.documento).map((d) => d.ref.delete())
          );
        }
      }
    }

    console.log(
      `[expurgo]${DRY_RUN ? " (DRY_RUN)" : ""} ${decisoes.length} conta(s) encerrada(s)\n` +
        decisoes.map((d) => `  - ${d}`).join("\n")
    );
  }
);
