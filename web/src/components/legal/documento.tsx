import Link from "next/link";
import { AssinaturaCorteHub } from "@/components/landing/marca";

/**
 * Casca dos documentos legais.
 *
 * Fora dos grupos de rota `(cliente)` e `painel` de propósito: política e termos
 * precisam abrir para quem **não** tem conta, em qualquer subdomínio, sem passar
 * por `AuthGuard` nem herdar a navegação de um painel que o visitante não usa.
 *
 * O texto é largo o suficiente para caber uma tabela e estreito o suficiente
 * para se ler — documento legal que ninguém consegue ler cumpre a letra da lei e
 * falha no propósito dela.
 */
export function DocumentoLegal({
  titulo,
  atualizadoEm,
  resumo,
  children,
}: {
  titulo: string;
  atualizadoEm: string;
  /** Uma frase honesta sobre o que o documento diz. Não substitui o texto. */
  resumo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-full bg-canvas">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-5 py-5 md:px-8">
          <Link href="/">
            <AssinaturaCorteHub className="text-ink" />
          </Link>
          <span className="text-xs text-ink-muted">
            Atualizado em {atualizadoEm}
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-5 py-10 md:px-8 md:py-16">
        <h1 className="font-display text-2xl text-ink md:text-4xl">{titulo}</h1>
        <p className="mt-3 border-l-2 border-gold/50 pl-4 text-sm leading-relaxed text-ink-muted md:text-base">
          {resumo}
        </p>

        <div className="documento-legal mt-10 flex flex-col gap-6 text-sm leading-relaxed text-ink-muted md:text-base">
          {children}
        </div>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 px-5 py-8 text-xs text-ink-muted md:flex-row md:justify-between md:px-8">
          <span>CorteHub</span>
          <span className="flex gap-4">
            <Link href="/privacidade" className="underline-offset-2 hover:text-ink hover:underline">
              Privacidade
            </Link>
            <Link href="/termos" className="underline-offset-2 hover:text-ink hover:underline">
              Termos
            </Link>
          </span>
        </div>
      </footer>
    </div>
  );
}

/** Seção numerada. O número existe para dar endereço a uma cláusula. */
export function Secao({
  n,
  titulo,
  children,
}: {
  n: number;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 id={`s${n}`} className="scroll-mt-6 font-display text-lg text-ink md:text-xl">
        {n}. {titulo}
      </h2>
      {children}
    </section>
  );
}

/**
 * Marca um campo que ainda não tem valor real.
 *
 * Existe para o documento não conseguir ir ao ar mentindo: um `[NOME COMPLETO]`
 * esquecido é visível em amarelo na tela, enquanto um texto plausível e errado
 * passa despercebido e vira declaração falsa num documento com efeito legal.
 */
export function AConfirmar({ children }: { children: React.ReactNode }) {
  return (
    <mark
      className="rounded bg-gold/20 px-1 font-medium text-gold-strong"
      title="Campo pendente de preenchimento antes da publicação"
    >
      {children}
    </mark>
  );
}
