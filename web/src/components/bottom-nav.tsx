"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Lock, MoreHorizontal, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";
import { itemAtivo, menuDoCelular, rotaAtiva, secoesDoMais, type NavItem } from "@/lib/nav-items";
import { useAcesso } from "@/lib/tenant-context";

/**
 * Navegação do celular.
 *
 * A barra divide a largura igualmente entre os itens, então cada item a mais
 * encolhe todos: num aparelho de 360px, sete itens deixam ~51px cada e o rótulo
 * transborda. Acima de `MAX_VISIVEL`, o excedente vai para uma folha "Mais" em
 * vez de ser espremido — ou pior, escondido, já que a barra lateral só existe
 * no desktop e o item viraria inalcançável no aparelho onde o dono trabalha.
 *
 * O corte e o conteúdo da folha moram em `menuDoCelular`, não aqui: é a regra
 * que decide o que o dono consegue alcançar em pé, no balcão, e uma regra
 * dessas precisa de teste — dentro do componente ela só teria prova visual.
 */
const MAX_VISIVEL = 5;

/**
 * A ação que mais se repete, no centro da barra — o "+" de marcar atendimento
 * no painel. Com ela, a barra cede um lugar: três destinos, a ação e o "Mais".
 */
export type AcaoCentral = { rotulo: string; icone: LucideIcon; aoTocar: () => void };

export function BottomNav({ items, acao }: { items: NavItem[]; acao?: AcaoCentral }) {
  const pathname = usePathname();
  /* O "Mais" guarda a TELA em que foi aberto, e não um liga/desliga: aberto é
   * "aberto nesta tela". Qualquer navegação — item da barra, voltar do
   * navegador, link de dentro da página — fecha o menu sozinha, no mesmo
   * render em que a tela nova aparece. Com um booleano, cada caminho de saída
   * precisava lembrar de fechar, e os itens da barra não lembravam: tocar em
   * Finanças com o menu aberto trocava a tela e deixava o menu por cima
   * (relato do dono, 25/09). */
  const [maisAbertoEm, setMaisAbertoEm] = useState<string | null>(null);
  const maisAberto = maisAbertoEm === pathname;
  const setMaisAberto = (abrir: boolean) => setMaisAbertoEm(abrir ? pathname : null);
  /* Mesma fonte que as telas usam para bloquear (`useAcesso`), e não o
     `tenant.features` cru: senão o menu promete o que a tela nega. */
  const { features } = useAcesso();

  const visiveis = acao ? MAX_VISIVEL - 1 : MAX_VISIVEL;
  const { barra, mais } = menuDoCelular(items, visiveis);
  const secoes = secoesDoMais(items, visiveis);

  /* Com o "Mais" aberto, a página de trás continuava rolando sob o dedo, e
   * não havia como fechar pelo teclado (medido em 24/09). Trava a rolagem do
   * fundo e fecha com Esc. */
  useEffect(() => {
    if (!maisAberto) return;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMaisAbertoEm(null);
    };
    window.addEventListener("keydown", aoTeclar);
    return () => {
      document.body.style.overflow = anterior;
      window.removeEventListener("keydown", aoTeclar);
    };
  }, [maisAberto]);
  const algumNoMaisAtivo = secoes.some((sec) =>
    sec.destinos.some((d) => rotaAtiva(d.href, pathname, d.exato))
  ) && !barra.some((i) => itemAtivo(i, pathname, items));

  return (
    <>
      {maisAberto && (
        <button
          type="button"
          aria-label="Fechar menu"
          onClick={() => setMaisAberto(false)}
          className="fundo-escurece fixed inset-0 z-20 bg-black/50 md:hidden"
        />
      )}

      <nav className="safe-bottom sticky bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur md:hidden">
        {maisAberto && (
          /* Grade compacta por seção, não lista: 14 linhas não cabiam, o "+"
           * cobria a última e Serviços/Equipe sumiam sem sinal de rolagem.
           * Quatro por linha cabem inteiras até no iPhone SE. */
          <div className="gaveta-sobe mx-auto max-h-[75vh] max-w-md overflow-y-auto rounded-t-3xl border-b border-border px-3 pb-3 pt-2">
            <div className="mb-1 flex items-center justify-between">
              <p className="font-display text-base text-ink">Menu</p>
              <button
                type="button"
                onClick={() => setMaisAberto(false)}
                aria-label="Fechar menu"
                className="flex h-10 w-10 items-center justify-center rounded-full text-ink-muted hover:bg-surface-raised"
              >
                <X size={20} />
              </button>
            </div>
            {secoes.map((secao) => (
              <section key={secao.titulo} className="mt-2">
                <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                  {secao.titulo}
                </p>
                <ul className="grid grid-cols-4 gap-1.5">
                  {secao.destinos.map((destino) => {
                    const active = rotaAtiva(destino.href, pathname, destino.exato);
                    const Icon = destino.icon;
                    const bloqueado = !!destino.feature && !features[destino.feature];
                    return (
                      <li key={destino.href}>
                        <Link
                          href={destino.href}
                          aria-current={active ? "page" : undefined}
                          // Fecha no clique, não num efeito sobre `pathname`: a folha
                          // ficaria aberta por um render sobre a tela nova.
                          onClick={() => setMaisAberto(false)}
                          className={cn(
                            "relative flex h-full min-h-16 flex-col items-center justify-center gap-1 rounded-xl border px-0.5 py-1.5 text-center text-[11px] font-medium leading-tight transition-colors",
                            active
                              ? "border-gold/40 bg-gold/10 text-gold-strong"
                              : "border-border bg-surface text-ink"
                          )}
                        >
                          {Icon && (
                            <Icon
                              size={20}
                              strokeWidth={active ? 2.4 : 1.8}
                              className={active ? "text-gold-strong" : "text-ink-muted"}
                            />
                          )}
                          {destino.label}
                          {/* A lateral mostrava cadeado e a barra de baixo não: o
                              mesmo item dizia duas coisas diferentes conforme o
                              tamanho da tela. */}
                          {bloqueado && (
                            <Lock
                              size={12}
                              className="absolute right-1.5 top-1.5 text-ink-muted/70"
                              aria-label="Não incluído no seu plano"
                            />
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}

        <ul className="mx-auto flex max-w-md items-stretch justify-between px-1">
          {barra.map((item, indice) => {
            const active = itemAtivo(item, pathname, items);
            const Icon = item.icon;
            const bloqueado = !!item.feature && !features[item.feature];
            const antesDaAcao = acao && indice === 2 ? (
              <li key="acao-central" className="flex flex-1 items-center justify-center">
                <button
                  type="button"
                  onClick={() => {
                    setMaisAberto(false);
                    acao.aoTocar();
                  }}
                  aria-label={acao.rotulo}
                  /* Com o menu aberto o "+" desce para dentro da barra: saltado,
                     ele cobria a última linha da grade. */
                  className={cn(
                    "flex items-center justify-center rounded-full bg-gold text-ink transition-all active:scale-95",
                    maisAberto
                      ? "h-11 w-11"
                      : "-mt-5 h-14 w-14 shadow-[0_8px_20px_-6px_rgba(15,23,42,0.45)] ring-4 ring-surface"
                  )}
                >
                  <acao.icone size={26} strokeWidth={2.4} />
                </button>
              </li>
            ) : null;
            return [antesDaAcao,
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  // Fecha já no toque; a troca de tela fecharia de qualquer
                  // jeito, mas só depois de a tela nova carregar.
                  onClick={() => setMaisAberto(false)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative flex min-h-14 flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium transition-colors",
                    active ? "text-gold-strong" : "text-ink-muted"
                  )}
                >
                  <span className="relative">
                    <Icon
                      size={22}
                      strokeWidth={active ? 2.4 : 1.8}
                      className={active ? "text-gold-strong" : "text-ink-muted"}
                    />
                    {bloqueado && (
                      <Lock
                        size={11}
                        className="absolute -right-1.5 -top-0.5 text-ink-muted/70"
                        aria-label="Não incluído no seu plano"
                      />
                    )}
                  </span>
                  <span className="whitespace-nowrap">{item.shortLabel ?? item.label}</span>
                </Link>
              </li>,
            ];
          })}

          {mais.length > 0 && (
            <li className="flex-1">
              <button
                type="button"
                onClick={() => setMaisAberto(!maisAberto)}
                aria-expanded={maisAberto}
                aria-label={maisAberto ? "Fechar mais opções" : "Mais opções"}
                className={cn(
                  "flex min-h-14 w-full flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium transition-colors",
                  maisAberto || algumNoMaisAtivo ? "text-gold-strong" : "text-ink-muted"
                )}
              >
                <MoreHorizontal
                  size={22}
                  strokeWidth={maisAberto || algumNoMaisAtivo ? 2.4 : 1.8}
                />
                <span className="whitespace-nowrap">Mais</span>
              </button>
            </li>
          )}
        </ul>
      </nav>
    </>
  );
}
