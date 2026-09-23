/**
 * O que as telas de LGPD precisam decidir sem rede — exportar, anonimizar,
 * encerrar a conta, excluir a própria conta.
 *
 * O desenho está em `docs/LGPD-DIREITOS-DO-TITULAR.md`; quem executa é o
 * servidor (`functions/src/titular.ts` e `data-deletion.ts`). Aqui fica só o
 * que a tela diz, para que a frase que o dono lê tenha teste.
 */

/** Prometido na Política §6 e nos Termos §8. O mesmo número do servidor. */
export const DIAS_ATE_O_EXPURGO = 30;

const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * O dia em que os dados deixam de existir.
 *
 * `null` quando a data do encerramento não é um número: dizer "seus dados
 * serão apagados em 1º de janeiro de 1970" seria a tela afirmando algo que o
 * servidor não vai fazer.
 */
export function dataDoExpurgo(encerradaEmMs: unknown): Date | null {
  if (typeof encerradaEmMs !== "number" || !Number.isFinite(encerradaEmMs) || encerradaEmMs <= 0) {
    return null;
  }
  return new Date(encerradaEmMs + DIAS_ATE_O_EXPURGO * DIA_MS);
}

/** "15 de outubro de 2026" — sem dia da semana, que aqui só atrapalha. */
export function dataPorExtenso(d: Date): string {
  return d.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
}

/**
 * Nome do arquivo baixado. Sem o nome da pessoa: o arquivo pode ficar na pasta
 * Downloads do computador do balcão, e o nome do arquivo não precisa ser mais
 * um lugar com o dado.
 */
export function nomeDoArquivo(clientId: string, geradoEm: string): string {
  const dia = String(geradoEm).slice(0, 10) || "sem-data";
  const id = String(clientId).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) || "cliente";
  return `dados-do-cliente-${id}-${dia}.json`;
}

/**
 * Erro da callable → frase para quem está na tela.
 *
 * As recusas do servidor (`failed-precondition`, `permission-denied`) já vêm
 * escritas para o dono — "há 1 horário marcado daqui para a frente, cancele
 * antes" — e escondê-las atrás de uma mensagem genérica tiraria dele a única
 * informação que resolve.
 *
 * O que não tem frase do servidor precisa de cuidado para não mentir:
 *
 * - **Rede caiu:** a chamada pode ter chegado e terminado. Não dá para dizer
 *   "nada foi alterado"; dá para dizer que repetir é seguro, porque as quatro
 *   operações são idempotentes.
 * - **Erro interno numa operação em etapas** (`parcial`): anonimizar e excluir
 *   gravam em lotes, e uma falha no meio deixa parte feita. A frase diz isso, e
 *   diz que repetir completa o que faltou — que é o desenho do servidor.
 */
export function mensagemDoErro(e: unknown, opcoes: { parcial?: boolean } = {}): string {
  const codigo = String((e as { code?: unknown })?.code ?? "");
  const mensagem = e instanceof Error ? e.message : "";
  const doServidor = [
    "functions/failed-precondition",
    "functions/permission-denied",
    "functions/not-found",
    "functions/invalid-argument",
    "functions/unauthenticated",
  ];
  if (doServidor.includes(codigo) && mensagem) return mensagem;
  if (/network|offline|unavailable|deadline/i.test(`${codigo} ${mensagem}`)) {
    return "Sem conexão — não deu para confirmar se foi feito. Tente de novo: repetir é seguro.";
  }
  if (opcoes.parcial) {
    return "Não terminou, e pode ter ficado pela metade. Tente de novo: repetir completa o que faltou.";
  }
  /* Nem aqui dá para afirmar "nada foi alterado": o SDK devolve `internal`
   * tanto para exceção no servidor quanto para resposta perdida no caminho de
   * volta, e no segundo caso a operação terminou. */
  return "Não deu certo desta vez. Tente de novo — repetir é seguro.";
}
