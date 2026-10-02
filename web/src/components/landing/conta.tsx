"use client";

import { useEffect, useRef, useState } from "react";
import { useMenosMovimento } from "@/components/landing/movimento";

/**
 * "Quanto custa ficar como está?" — a conta montada na frente de quem lê.
 *
 * A versão anterior soltava números grandes sem dizer de onde vinham ("R$ 518",
 * "40%"), e número sem origem é a cara mais comum de página feita às pressas.
 * Aqui cada resultado é a multiplicação que está escrita ao lado dele, com
 * valores redondos de exemplo — quem lê troca pelos próprios e refaz de cabeça.
 * A animação só monta a conta na ordem em que ela se lê; quem pediu menos
 * movimento vê a conta pronta.
 */

const CONTAS = [
  {
    pergunta: "Um cliente que sumiu",
    termos: ["R$ 50 por corte", "a cada 15 dias", "26 visitas no ano"],
    resultado: 1300,
    formato: (n: number) => `R$ ${n.toLocaleString("pt-BR")}`,
    sufixo: "por ano, por cliente",
    saida: "No Topete, a lista de clientes mostra há quantos dias cada um não vem.",
  },
  {
    pergunta: "Um horário vago por dia",
    termos: ["1 horário", "× R$ 50", "× 26 dias de trabalho"],
    resultado: 1300,
    formato: (n: number) => `R$ ${n.toLocaleString("pt-BR")}`,
    sufixo: "por mês",
    saida: "Cancelou pelo link? O aviso chega na hora e o horário volta a ficar livre.",
  },
  {
    pergunta: "Responder “tem horário?”",
    termos: ["40 mensagens por dia", "× 1 minuto", "× 26 dias"],
    resultado: 17,
    formato: (n: number) => `${n} horas`,
    sufixo: "por mês — quase 2 dias de trabalho",
    saida: "Com o link, o cliente vê o horário livre e marca sozinho.",
  },
];

export function QuantoCusta() {
  const ref = useRef<HTMLDivElement>(null);
  const reduzir = useMenosMovimento();
  const [montado, setK] = useState(0); // 0 → 1: quanto da conta já foi montado
  const k = reduzir ? 1 : montado;

  useEffect(() => {
    const el = ref.current;
    if (!el || reduzir) return;
    let raf = 0;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        obs.disconnect();
        const t0 = performance.now();
        const passo = (t: number) => {
          const x = Math.min(1, (t - t0) / 2200);
          setK(x);
          if (x < 1) raf = requestAnimationFrame(passo);
        };
        raf = requestAnimationFrame(passo);
      },
      { threshold: 0.35 }
    );
    obs.observe(el);
    return () => {
      obs.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [reduzir]);

  return (
    <div ref={ref} className="grid grid-cols-1 border-t border-[#D9D1C1] md:grid-cols-3 md:border-t-0">
      {CONTAS.map((c, i) => {
        // Cada coluna monta os termos em sequência e só então o resultado conta.
        const termosVisiveis = Math.min(c.termos.length, Math.floor(k * (c.termos.length + 2)));
        const kResultado = Math.max(0, Math.min(1, k * (c.termos.length + 2) - c.termos.length) / 1);
        const valor = Math.round(c.resultado * (1 - Math.pow(1 - Math.min(1, kResultado), 3)));
        return (
          <div
            key={c.pergunta}
            className={
              "flex flex-col border-b border-[#D9D1C1] py-8 md:border-b-0 md:border-t md:px-8 md:py-10 " +
              (i > 0 ? "md:border-l" : "md:pl-0")
            }
          >
            <p className="text-sm font-medium text-[#8F6B22]">{c.pergunta}</p>
            <ul className="mt-4 flex flex-col gap-1.5 text-[#5A554C]">
              {c.termos.map((t, j) => (
                <li
                  key={t}
                  className={
                    "transition-[opacity,transform] duration-300 motion-reduce:transition-none " +
                    (j < termosVisiveis ? "translate-x-0 opacity-100" : "-translate-x-2 opacity-0")
                  }
                >
                  {t}
                </li>
              ))}
            </ul>
            <p
              className="mt-5 font-brand text-5xl tabular-nums tracking-[-0.03em] text-[#16140F] md:text-[3.4rem]"
              aria-label={`${c.formato(c.resultado)} ${c.sufixo}`}
            >
              <span aria-hidden>= {c.formato(valor)}</span>
            </p>
            <p className="mt-1 text-sm text-[#5A554C]">{c.sufixo}</p>
            <p className="mt-6 border-l-2 border-[#C9A45C] pl-3 text-sm leading-relaxed text-[#16140F]">{c.saida}</p>
          </div>
        );
      })}
    </div>
  );
}
