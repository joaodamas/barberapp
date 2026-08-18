import Link from "next/link";

/**
 * O 404 do produto.
 *
 * ## O que havia antes
 *
 * Nada. Sem `not-found.tsx`, o Next serve o dele: **fundo preto, texto branco,
 * em inglês** — *"404 · This page could not be found."* — sem marca, sem
 * navegação e sem saída.
 *
 * São duas cláusulas do contrato violadas de uma vez (`UI-UX-GUIDELINES` §10.6:
 * o produto é LIGHT-ONLY; §9: português com acentuação correta), na única tela
 * que ninguém desenha porque ninguém planeja visitá-la. E é justamente a tela
 * de quem digitou errado, seguiu um link velho ou salvou um favorito de uma
 * rota que mudou de nome — gente que já está perdida.
 *
 * ## Por que não busca o tenant
 *
 * Poderia mostrar o logo da barbearia. Não mostra de propósito: sob falha de
 * infraestrutura `getTenant()` devolve o tenant padrão, e a página exibiria a
 * marca de OUTRA empresa para explicar um endereço que não existe — o mesmo
 * defeito que a tela de login acabou de corrigir. Um 404 não precisa afirmar
 * identidade; precisa devolver o caminho.
 *
 * ## Por que dois links e não um
 *
 * "Início" resolve para quem é cliente; "Painel" resolve para quem é dono. O
 * 404 não sabe qual dos dois está lendo, e adivinhar erraria metade das vezes.
 */
export default function NaoEncontrado() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-bg px-4 py-16 text-center">
      <div className="flex flex-col items-center gap-3">
        <p className="font-display text-5xl text-border-strong">404</p>
        <h1 className="font-display text-xl text-ivory">Esta página não existe</h1>
        <p className="max-w-sm text-sm text-ivory-muted">
          O endereço pode ter mudado de nome ou o link estar antigo. Nada foi
          perdido — seus dados continuam onde estavam.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center rounded-xl bg-gold px-5 text-sm font-semibold text-ivory transition-colors hover:bg-gold-hover"
        >
          Ir para o início
        </Link>
        <Link
          href="/painel"
          className="inline-flex min-h-11 items-center rounded-xl border border-border px-5 text-sm text-ivory transition-colors hover:bg-surface-raised"
        >
          Ir para o painel
        </Link>
      </div>
    </main>
  );
}
