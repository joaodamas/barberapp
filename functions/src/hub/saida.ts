import { defineSecret } from "firebase-functions/params";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import {
  FieldValue,
  getFirestore,
  type DocumentReference,
  type Firestore,
  type Transaction,
} from "firebase-admin/firestore";
import { desfechoDaResposta, esperaAntesDaTentativa, type CorpoDoEvento } from "./contrato";

/**
 * Caixa de saída dos avisos ao Hub (`plataforma_saida/{eventoId}`).
 *
 * O aviso é gravado NA MESMA transação do fato que ele conta — a barbearia
 * criada, o onboarding concluído, o plano pedido — e só depois enviado. Chamar
 * o Hub direto de dentro de `signUpBarbershop` faria a criação depender de o
 * Hub estar no ar, ou, pior, criaria a barbearia e perderia o aviso quando a
 * chamada falhasse. Aqui o aviso existe se e só se o fato existe, e quem
 * entrega é um processo que pode tentar de novo.
 *
 * Duas vias de envio:
 *   - `enviarAvisoAoHub`, na criação do documento: o caso normal sai na hora;
 *   - `reenviarAvisosAoHub`, a cada 10 minutos: o que falhou ou foi adiado.
 *
 * As duas podem pegar o mesmo aviso ao mesmo tempo. A reserva
 * (`enviandoAteMs`) evita a chamada dupla na maioria dos casos, e o Hub
 * deduplica por `eventoId` nos demais — a reserva é economia, não garantia.
 */

export const PLATAFORMA_TOKEN = defineSecret("PLATAFORMA_TOKEN");

export const URL_DO_HUB = "https://southamerica-east1-jpproject-hub.cloudfunctions.net/ingestPlataforma";

/**
 * Só produção fala com o Hub.
 *
 * O DEV (`crucial-baton-440119-r8`) roda o mesmo código e cria barbearias de
 * teste o tempo todo; se avisasse, cada uma viraria um cliente em teste no
 * painel de verdade da JP Projects. Lá os avisos ficam na caixa como `retido`,
 * o que ainda deixa ver o que TERIA sido enviado.
 */
export const PROJETO_DE_PRODUCAO = "axon-barber";

export const COLECAO_DA_SAIDA = "plataforma_saida";

export type EstadoDoAviso = "pendente" | "enviado" | "recusado" | "retido";

export function refDoAviso(db: Firestore, eventoId: string): DocumentReference {
  return db.collection(COLECAO_DA_SAIDA).doc(eventoId);
}

/** O documento da caixa de saída para um evento. */
export function registroDoAviso(
  corpo: CorpoDoEvento,
  opcoes: { agoraMs: number; adiarMs?: number }
) {
  return {
    eventoId: corpo.eventoId,
    evento: corpo.evento,
    barbershopId: corpo.externoId,
    corpo,
    estado: "pendente" as EstadoDoAviso,
    tentativas: 0,
    proximaTentativaEmMs: opcoes.agoraMs + (opcoes.adiarMs ?? 0),
    criadoEm: FieldValue.serverTimestamp(),
  };
}

/**
 * Enfileira dentro de uma transação que já fez as leituras dela.
 *
 * Usa `create`: se o aviso já existe, a transação inteira falha — o que é o
 * certo quando o `eventoId` carrega um id recém-gerado (a barbearia nova) e
 * uma colisão seria defeito. Para eventos que podem se repetir, use
 * `enfileirarSeNovo`.
 */
export function enfileirarNaTransacao(
  tx: Transaction,
  db: Firestore,
  corpo: CorpoDoEvento,
  opcoes: { agoraMs: number; adiarMs?: number }
) {
  tx.create(refDoAviso(db, corpo.eventoId), registroDoAviso(corpo, opcoes));
}

/**
 * Lê e, se não existir, enfileira. A leitura precisa vir antes de qualquer
 * escrita da transação (regra do Firestore) — por isso devolve uma função que
 * grava, a ser chamada depois das outras leituras.
 */
export async function enfileirarSeNovo(
  tx: Transaction,
  db: Firestore,
  corpo: CorpoDoEvento,
  opcoes: { agoraMs: number; adiarMs?: number }
): Promise<{ novo: boolean; gravar: () => void }> {
  const ref = refDoAviso(db, corpo.eventoId);
  const existe = (await tx.get(ref)).exists;
  return {
    novo: !existe,
    gravar: () => {
      if (!existe) tx.create(ref, registroDoAviso(corpo, opcoes));
    },
  };
}

/* ------------------------------------------------------------------ */
/* Envio                                                               */
/* ------------------------------------------------------------------ */

const RESERVA_MS = 60_000;
const TEMPO_LIMITE_MS = 15_000;
/** Limite da function de reenvio e o quanto dele se gasta antes de parar (sobra a folga de um envio). */
const TEMPO_DA_ROTINA_S = 300;
const ORCAMENTO_DA_ROTINA_MS = (TEMPO_DA_ROTINA_S - 45) * 1000;

export function projetoAtual(): string {
  if (process.env.GCLOUD_PROJECT) return process.env.GCLOUD_PROJECT;
  try {
    return JSON.parse(process.env.FIREBASE_CONFIG ?? "{}").projectId ?? "";
  } catch {
    return "";
  }
}

/**
 * Tenta entregar UM aviso. Nunca lança: o resultado fica no documento.
 */
export async function entregarAviso(ref: DocumentReference, token: string): Promise<void> {
  const db = ref.firestore;
  const agora = Date.now();

  // Reserva: só um envio por vez, e só o que já está na hora.
  const aviso = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const d = snap.data() ?? {};
    if (d.estado !== "pendente") return null;
    if (Number(d.proximaTentativaEmMs ?? 0) > agora) return null;
    if (Number(d.enviandoAteMs ?? 0) > agora) return null;
    tx.update(ref, { enviandoAteMs: agora + RESERVA_MS });
    return d;
  });
  if (!aviso) return;

  if (projetoAtual() !== PROJETO_DE_PRODUCAO) {
    await ref.update({
      estado: "retido",
      motivo: `projeto ${projetoAtual() || "desconhecido"} não é produção; nada enviado ao Hub`,
      enviandoAteMs: FieldValue.delete(),
    });
    return;
  }

  let status: number | null = null;
  let resposta = "";
  try {
    if (!token.trim()) throw new Error("PLATAFORMA_TOKEN vazio");
    const r = await fetch(URL_DO_HUB, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token.trim()}` },
      body: JSON.stringify(aviso.corpo),
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
    });
    status = r.status;
    resposta = (await r.text().catch(() => "")).slice(0, 500);
  } catch (erro) {
    resposta = erro instanceof Error ? erro.message : String(erro);
  }

  const desfecho = desfechoDaResposta(status);
  const tentativas = Number(aviso.tentativas ?? 0) + 1;
  const base = {
    tentativas,
    ultimaTentativaEm: FieldValue.serverTimestamp(),
    ultimoStatus: status,
    ultimaResposta: resposta,
    enviandoAteMs: FieldValue.delete(),
  };

  if (desfecho === "enviado") {
    await ref.update({ ...base, estado: "enviado", enviadoEm: FieldValue.serverTimestamp() });
    return;
  }
  if (desfecho === "recusado") {
    /* 400 é defeito nosso no corpo; 409 é o slug já ser outro cliente no Hub.
     * Nos dois, repetir igual dá a mesma resposta. Fica registrado para
     * alguém olhar — e no nível de erro, que é o que um alerta de log vê. */
    console.error(`[hub] aviso ${aviso.eventoId} RECUSADO (${status}): ${resposta}`);
    await ref.update({ ...base, estado: "recusado" });
    return;
  }

  const espera = esperaAntesDaTentativa(tentativas - 1);
  /* 401/503 é token errado ou Hub sem token: configuração, que alguém precisa
   * ver. A partir da terceira falha seguida vira erro no log. */
  const log = tentativas >= 3 || status === 401 || status === 503 ? console.error : console.warn;
  log(`[hub] aviso ${aviso.eventoId} falhou (${status ?? "rede"}), tentativa ${tentativas}: ${resposta}`);
  await ref.update({ ...base, proximaTentativaEmMs: Date.now() + espera });
}

/** Envia na hora em que o aviso nasce. Adiado (`proximaTentativaEmMs` futuro) espera a rotina. */
export const enviarAvisoAoHub = onDocumentCreated(
  { document: `${COLECAO_DA_SAIDA}/{eventoId}`, secrets: [PLATAFORMA_TOKEN] },
  async (event) => {
    if (!event.data) return;
    await entregarAviso(event.data.ref, PLATAFORMA_TOKEN.value());
  }
);

/**
 * Reenvia o que ficou pendente.
 *
 * A consulta filtra a hora no Firestore e ORDENA pela próxima tentativa, com
 * índice composto (`estado` + `proximaTentativaEmMs`). Antes era só por
 * `estado` com `limit(200)`, e a hora era filtrada aqui: com mais de 200
 * pendentes (o Hub fora do ar por um dia), os 200 que voltavam podiam ser
 * todos adiados para depois — e o que já estava na hora nunca era alcançado.
 */
export const reenviarAvisosAoHub = onSchedule(
  {
    schedule: "every 10 minutes",
    timeZone: "America/Sao_Paulo",
    region: "southamerica-east1",
    secrets: [PLATAFORMA_TOKEN],
    timeoutSeconds: TEMPO_DA_ROTINA_S,
  },
  async () => {
    const db = getFirestore();
    const agora = Date.now();
    const naHora = await db
      .collection(COLECAO_DA_SAIDA)
      .where("estado", "==", "pendente")
      .where("proximaTentativaEmMs", "<=", agora)
      .orderBy("proximaTentativaEmMs")
      .limit(200)
      .get();
    let tentados = 0;
    for (const d of naHora.docs) {
      /* Orçamento de tempo: com o Hub lento, 200 avisos de 15 s estourariam o
       * limite da function no meio de um envio. Parar ANTES do próximo deixa o
       * resto intacto — segue `pendente` e na hora, e é o primeiro da fila na
       * rodada seguinte (a consulta ordena pela próxima tentativa). */
      if (Date.now() - agora > ORCAMENTO_DA_ROTINA_MS) break;
      try {
        await entregarAviso(d.ref, PLATAFORMA_TOKEN.value());
      } catch (erro) {
        console.error(`[hub] aviso ${d.id}: reenvio falhou`, erro);
      }
      tentados++;
    }
    if (tentados < naHora.size) {
      console.warn(`[hub] tempo da rotina acabou: ${naHora.size - tentados} aviso(s) ficaram para a próxima rodada`);
    }
    if (tentados) console.log(`[hub] ${tentados} aviso(s) na hora reenviado(s)`);
  }
);
