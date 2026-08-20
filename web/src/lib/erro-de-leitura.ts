/**
 * Por que a leitura falhou — e o que o dono pode fazer a respeito.
 *
 * ## O defeito que esta função existe para corrigir
 *
 * `ErroAoCarregar` dizia, para qualquer falha:
 *
 * > *"Pode ser a conexão **ou** uma permissão que mudou."*
 *
 * A frase é honesta e o comentário ao lado dela declarava a intenção certa —
 * *"permissão e conexão pedem ações diferentes de quem está lendo"*. Mas ela é
 * a **admissão de que o produto não sabe qual das duas foi**, escrita na tela.
 *
 * E o produto sabia. `useShopCollection` já guardava o `FirebaseError` inteiro
 * em `state.error` desde sempre; o componente simplesmente não o recebia. A
 * informação existia no hook e morria a um parâmetro de distância.
 *
 * ## Por que a diferença importa para quem está olhando
 *
 * ```
 * conexão    →  "Tentar de novo" resolve. O dado está lá.
 * permissão  →  recarregar não resolve NUNCA. O dado deixou de ser seu.
 * ```
 *
 * Oferecer "Tentar de novo" para uma falha de permissão é pedir que o dono
 * clique num botão que não pode funcionar. Ele clica três vezes, conclui que o
 * produto está quebrado, e a causa real — o vínculo dele com a barbearia mudou
 * — nunca chega até ele.
 *
 * ## Por que três motivos e não quatro
 *
 * `desconhecido` preserva o texto atual, que é bom. Um motivo novo só entra
 * aqui quando existir uma **ação diferente** para o dono tomar — a régua é
 * essa, não a taxonomia do Firestore.
 */

/** O que o dono precisa fazer. É isto que separa os motivos, não o código. */
export type MotivoDaFalha =
  /** O dado existe e não chegou. Recarregar resolve. */
  | "conexao"
  /** O dado deixou de ser acessível. Recarregar não resolve. */
  | "permissao"
  /** Não deu para classificar — mantém o texto genérico, que já era honesto. */
  | "desconhecido";

/**
 * Códigos do Firestore que significam **"o dado deixou de ser seu"**.
 *
 * `unauthenticated` entra junto de propósito: da perspectiva de quem olha a
 * tela, sessão expirada e permissão revogada produzem a mesma frustração —
 * recarregar não devolve o acesso.
 */
const DE_PERMISSAO = new Set(["permission-denied", "unauthenticated"]);

/**
 * Códigos que significam **"não consegui chegar lá agora"**.
 *
 * `internal` e `cancelled` entram aqui, e não em `desconhecido`, porque são
 * transitórios por natureza: a ação certa é a mesma da queda de rede.
 * `failed-precondition` **não** entra — no Firestore ele costuma ser índice
 * faltando, que é defeito nosso e não se resolve no botão do dono.
 */
const DE_CONEXAO = new Set([
  "unavailable",
  "deadline-exceeded",
  "cancelled",
  "internal",
  "resource-exhausted",
  "aborted",
]);

/**
 * Classifica o erro cru que veio do listener.
 *
 * Aceita `unknown` de propósito: quem chama é uma tela, e uma tela não deve
 * precisar afirmar o tipo de um erro para poder exibi-lo. Qualquer coisa que
 * não tenha um `code` string cai em `desconhecido` sem lançar.
 */
export function motivoDaFalha(erro: unknown): MotivoDaFalha {
  const codigo =
    typeof erro === "object" && erro !== null && "code" in erro
      ? (erro as { code: unknown }).code
      : undefined;

  if (typeof codigo !== "string") return "desconhecido";

  /* O SDK web prefixa com o serviço em alguns caminhos ("firestore/unavailable",
   * "auth/network-request-failed"). Comparar o sufixo cobre os dois formatos sem
   * manter duas listas — e manter duas listas era exatamente como o `origin` de
   * `commissions` deixou de casar com o histórico na Rodada 3.2. */
  const sufixo = codigo.includes("/") ? codigo.slice(codigo.lastIndexOf("/") + 1) : codigo;

  if (DE_PERMISSAO.has(sufixo)) return "permissao";
  if (DE_CONEXAO.has(sufixo)) return "conexao";

  /* Falha de rede do SDK de auth não usa os códigos do Firestore. */
  if (sufixo === "network-request-failed") return "conexao";

  return "desconhecido";
}

/** O que a tela diz, por motivo. */
export type TextoDaFalha = {
  /** A causa, em linguagem de dono. Sempre termina em ponto. */
  explicacao: string;
  /**
   * Se "Tentar de novo" tem chance de funcionar.
   *
   * Em `permissao` é `false`: o botão continuaria na tela prometendo uma saída
   * que não existe.
   */
  temRetry: boolean;
};

/**
 * O texto que acompanha "Não foi possível carregar X".
 *
 * Mora aqui, e não no componente, porque é uma **afirmação sobre o que
 * aconteceu** — e afirmação tem de ser testável sem renderizar nada. Mesma
 * decisão de `situacaoDaVenda` em `estornos.ts`.
 */
export function textoDaFalha(motivo: MotivoDaFalha): TextoDaFalha {
  switch (motivo) {
    case "permissao":
      return {
        explicacao:
          "Seu acesso a esta informação mudou. Recarregar não resolve — " +
          "entre de novo ou peça para quem administra a barbearia liberar.",
        temRetry: false,
      };
    case "conexao":
      return {
        explicacao: "Parece falta de conexão com o servidor. Nada foi perdido.",
        temRetry: true,
      };
    default:
      return {
        explicacao: "Pode ser a conexão ou uma permissão que mudou. Nada foi perdido.",
        temRetry: true,
      };
  }
}

/** Atalho para quem só quer o texto a partir do erro cru. */
export function explicarFalha(erro: unknown): TextoDaFalha {
  return textoDaFalha(motivoDaFalha(erro));
}
