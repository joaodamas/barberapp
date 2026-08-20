import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EstadoCentral } from "@/components/ui/estado-central";

/**
 * Estado vazio que ensina, em vez de tabela em branco.
 *
 * Um tenant novo abre toda tela financeira sem nada. Mostrar "R$ 0,00" em toda
 * célula não diz o que fazer — e é a primeira impressão do produto.
 *
 * VAZIO é "eu li, e não há". Quando a leitura FALHOU, o componente é outro:
 * `ErroAoCarregar`. Trocar um pelo outro é a afirmação falsa do D27 — a tela
 * dizendo "nenhuma despesa em agosto" quando a verdade era "não consegui ler as
 * despesas", e o dono concluindo que não gastou nada.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
}) {
  // Sem rótulo não há ação. Antes, `actionHref` sozinho produzia um `<Link>`
  // com o `false` do curto-circuito dentro: um link vazio, focável pelo
  // teclado, que o leitor de tela anuncia como "link" sem dizer para onde vai.
  const acao = actionLabel
    ? actionHref
      ? (
          <Link href={actionHref}>
            <Button>{actionLabel}</Button>
          </Link>
        )
      : <Button onClick={onAction}>{actionLabel}</Button>
    : undefined;

  return (
    <EstadoCentral icon={Icon} titulo={title} descricao={description} acao={acao} />
  );
}

/**
 * O que o esqueleto está esperando.
 *
 * `aria-label="Carregando"` dizia ao leitor de tela menos do que a tela dizia a
 * quem enxerga: quem vê a página sabe, pela posição do bloco, que é a lista de
 * despesas; quem ouve recebia só "carregando" e não sabia carregando o quê.
 */
function rotulo(oQue?: string) {
  return oQue ? `Carregando ${oQue}` : "Carregando";
}

/** Esqueleto de carregamento — evita o pisca-vazio antes do dado chegar. */
export function LoadingRows({ rows = 3, oQue }: { rows?: number; oQue?: string }) {
  return (
    <div
      className="flex flex-col gap-2"
      role="status"
      aria-busy="true"
      aria-label={rotulo(oQue)}
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-14 animate-pulse rounded-xl bg-surface-raised" />
      ))}
    </div>
  );
}

/**
 * Esqueleto de TABELA financeira.
 *
 * Enquanto os dados eram constantes no código, a tela nascia pronta. Com o
 * Firestore, cada tabela tem o seu tempo de carga — e sem esqueleto o conteúdo
 * entra de uma vez e empurra tudo para baixo. Salto de layout lê como produto
 * frágil mesmo quando é rápido, e é a primeira coisa que o dono vê ao abrir o
 * financeiro no celular, em pé, no salão.
 *
 * As larguras são desiguais de propósito: barra toda do mesmo tamanho parece
 * animação de espera; desigual parece texto carregando.
 */
export function LoadingTable({
  rows = 6,
  cols = 4,
  oQue,
}: {
  rows?: number;
  cols?: number;
  oQue?: string;
}) {
  const larguras = ["w-2/3", "w-1/2", "w-3/4", "w-2/5", "w-4/5", "w-1/3"];
  return (
    <div
      className="flex flex-col gap-3"
      role="status"
      aria-busy="true"
      aria-label={rotulo(oQue)}
    >
      <div className="flex gap-4 border-b border-border pb-3">
        {Array.from({ length: cols }).map((_, c) => (
          <div key={c} className="h-3 flex-1 animate-pulse rounded bg-surface-raised" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4">
          {Array.from({ length: cols }).map((_, c) => (
            <div key={c} className="flex-1">
              <div
                className={`h-4 animate-pulse rounded bg-surface-raised ${
                  larguras[(r + c) % larguras.length]
                }`}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Uma PALAVRA carregando, no meio de uma frase.
 *
 * Não é o mesmo problema de `LoadingRows`: aqui a tela já está montada e falta
 * um pedaço de texto — o primeiro nome no cumprimento, o total do mês no
 * cabeçalho. Estava escrito à mão em três arquivos
 * (`despesas`, `servicos-editor`, `welcome-heading`), sempre como
 * `<span className="inline-block h-4 w-40 animate-pulse rounded bg-surface-raised" />`.
 *
 * O defeito que as três cópias tinham em comum: nenhuma marcação. Quem usa
 * leitor de tela chegava num `<h1>` que simplesmente não tinha texto — nem o
 * nome, nem um aviso de que ele está vindo. Silêncio no lugar de conteúdo lê
 * como página quebrada, não como página carregando.
 */
export function LoadingText({
  largura = "w-32",
  altura = "h-4",
}: {
  /** Classe de largura do Tailwind, aproximando o tamanho do texto esperado. */
  largura?: string;
  altura?: string;
}) {
  return (
    <span
      className={`inline-block animate-pulse rounded bg-surface-raised align-middle ${altura} ${largura}`}
      role="status"
      aria-label="Carregando"
    />
  );
}
