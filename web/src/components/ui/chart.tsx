"use client";

import { useId, useState } from "react";
import { formatBRL } from "@/lib/format";

/**
 * Gráficos em SVG puro, sem biblioteca.
 *
 * Não é preciosismo. O app carrega o Firebase sob demanda justamente para não
 * cobrar 400 KB de quem só quer agendar um corte; puxar uma biblioteca de
 * gráfico de ~100 KB para desenhar barra e linha andaria contra essa decisão.
 * Barra e linha são dois `path` e um `map` — a biblioteca resolveria o que não
 * é o problema.
 *
 * O produto tem o melhor dado financeiro do segmento (DRE, ponto de equilíbrio,
 * projeção) e o apresentava inteiro como planilha. Ler 30 linhas para saber se
 * o mês fecha no azul é trabalho que o gráfico faz em três segundos — e é a
 * diferença entre parecer formulário e parecer sistema de gestão.
 *
 * Acessibilidade: o gráfico é `aria-hidden`. Quem usa leitor de tela lê a
 * TABELA, que continua na página logo abaixo em todas as telas. Gráfico não
 * substitui tabela aqui; ele resume.
 */

type Ponto = { label: string; value: number };

const EIXO = "var(--color-border)";

/** Espaço reservado para os rótulos, em unidades do viewBox. */
const MARGEM = { topo: 8, direita: 4, baixo: 18, esquerda: 4 };

function escala(valores: number[]) {
  const max = Math.max(...valores, 0);
  const min = Math.min(...valores, 0);
  // Amplitude zero (tudo igual, ou tudo zero) dividiria por zero lá embaixo.
  const amplitude = max - min || 1;
  return { max, min, amplitude };
}

/**
 * Linha de saldo acumulado.
 *
 * O que importa nesta curva não é o valor de cada dia — é ONDE ela cruza o
 * zero. Por isso a área abaixo da linha é pintada em duas cores e a linha do
 * zero é desenhada por cima: o dono vê o dia em que o caixa vira negativo sem
 * ler número nenhum.
 */
export function LineChart({
  data,
  height = 160,
  label,
}: {
  data: Ponto[];
  height?: number;
  label: string;
}) {
  const id = useId();
  const [ativo, setAtivo] = useState<number | null>(null);
  if (data.length < 2) return null;

  const largura = 100;
  const { min, amplitude } = escala(data.map((d) => d.value));
  const alturaUtil = 100 - MARGEM.topo - MARGEM.baixo;

  const x = (i: number) =>
    MARGEM.esquerda +
    (i / (data.length - 1)) * (largura - MARGEM.esquerda - MARGEM.direita);
  const y = (v: number) =>
    MARGEM.topo + alturaUtil - ((v - min) / amplitude) * alturaUtil;

  const linha = data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(d.value)}`).join(" ");
  const area = `${linha} L${x(data.length - 1)},${y(min)} L${x(0)},${y(min)} Z`;
  const zero = y(0);
  const mostraZero = min < 0;

  const ponto = ativo !== null ? data[ativo] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${largura} 100`}
        preserveAspectRatio="none"
        style={{ height, width: "100%" }}
        aria-hidden
        onMouseLeave={() => setAtivo(null)}
      >
        <defs>
          <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-gold)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--color-gold)" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        <path d={area} fill={`url(#${id}-fill)`} />
        <path
          d={linha}
          fill="none"
          stroke="var(--color-gold)"
          strokeWidth="1.4"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />

        {mostraZero && (
          <line
            x1={MARGEM.esquerda}
            x2={largura - MARGEM.direita}
            y1={zero}
            y2={zero}
            stroke="var(--color-danger)"
            strokeWidth="1"
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
          />
        )}

        {ativo !== null && (
          <line
            x1={x(ativo)}
            x2={x(ativo)}
            y1={MARGEM.topo}
            y2={MARGEM.topo + alturaUtil}
            stroke="var(--color-border-strong)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        )}

        {/* Faixas invisíveis de toque: apontar para a linha exige precisão que
            ninguém tem no celular. Cada faixa cobre a fatia inteira do dia. */}
        {data.map((d, i) => (
          <rect
            key={d.label}
            x={x(i) - (largura / data.length) / 2}
            y={0}
            width={largura / data.length}
            height={100}
            fill="transparent"
            onMouseEnter={() => setAtivo(i)}
            onTouchStart={() => setAtivo(i)}
          />
        ))}
      </svg>

      <p className="sr-only">{label}</p>

      {ponto && (
        <div
          className="pointer-events-none absolute -top-1 rounded-lg border border-border bg-surface px-2 py-1 text-xs shadow-md"
          style={{
            left: `${(x(ativo!) / largura) * 100}%`,
            transform: "translateX(-50%)",
          }}
        >
          <span className="text-ivory-muted">{ponto.label}</span>{" "}
          <span className={ponto.value < 0 ? "font-semibold text-danger" : "font-semibold text-ivory"}>
            {formatBRL(ponto.value)}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Barras por dia, com uma série ou duas.
 *
 * Com duas séries as barras ficam LADO A LADO, não empilhadas: empilhado
 * responde "quanto entrou no total", e a pergunta aqui é "entrou mais do que
 * saiu?" — que só a comparação lado a lado responde de relance.
 */
export function BarChart({
  data,
  height = 160,
  label,
  segunda,
}: {
  data: Ponto[];
  height?: number;
  label: string;
  /** Série de comparação, na mesma ordem. Ex.: despesa contra receita. */
  segunda?: { data: Ponto[]; color: string; nome: string };
}) {
  const [ativo, setAtivo] = useState<number | null>(null);
  if (!data.length) return null;

  const largura = 100;
  const alturaUtil = 100 - MARGEM.topo - MARGEM.baixo;
  const todos = [...data.map((d) => d.value), ...(segunda?.data.map((d) => d.value) ?? [])];
  const max = Math.max(...todos, 1);

  const passo = (largura - MARGEM.esquerda - MARGEM.direita) / data.length;
  const larguraBarra = segunda ? (passo * 0.7) / 2 : passo * 0.62;
  const alturaDe = (v: number) => Math.max((Math.abs(v) / max) * alturaUtil, v ? 0.8 : 0);

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${largura} 100`}
        preserveAspectRatio="none"
        style={{ height, width: "100%" }}
        aria-hidden
        onMouseLeave={() => setAtivo(null)}
      >
        <line
          x1={MARGEM.esquerda}
          x2={largura - MARGEM.direita}
          y1={MARGEM.topo + alturaUtil}
          y2={MARGEM.topo + alturaUtil}
          stroke={EIXO}
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />

        {data.map((d, i) => {
          const base = MARGEM.esquerda + i * passo + (passo - (segunda ? larguraBarra * 2 : larguraBarra)) / 2;
          const h = alturaDe(d.value);
          const segundoValor = segunda?.data[i]?.value ?? 0;
          const h2 = alturaDe(segundoValor);
          const destacado = ativo === i;

          return (
            <g key={d.label} opacity={ativo === null || destacado ? 1 : 0.45}>
              <rect
                x={base}
                y={MARGEM.topo + alturaUtil - h}
                width={larguraBarra}
                height={h}
                rx="0.8"
                fill="var(--color-gold)"
              />
              {segunda && (
                <rect
                  x={base + larguraBarra}
                  y={MARGEM.topo + alturaUtil - h2}
                  width={larguraBarra}
                  height={h2}
                  rx="0.8"
                  fill={segunda.color}
                />
              )}
              <rect
                x={MARGEM.esquerda + i * passo}
                y={0}
                width={passo}
                height={100}
                fill="transparent"
                onMouseEnter={() => setAtivo(i)}
                onTouchStart={() => setAtivo(i)}
              />
            </g>
          );
        })}
      </svg>

      <p className="sr-only">{label}</p>

      {ativo !== null && (
        <div
          className="pointer-events-none absolute -top-1 whitespace-nowrap rounded-lg border border-border bg-surface px-2 py-1 text-xs shadow-md"
          style={{
            left: `${((MARGEM.esquerda + ativo * passo + passo / 2) / largura) * 100}%`,
            transform: "translateX(-50%)",
          }}
        >
          <span className="text-ivory-muted">{data[ativo].label}</span>{" "}
          <span className="font-semibold text-ivory">{formatBRL(data[ativo].value)}</span>
          {segunda && (
            <>
              {" · "}
              <span style={{ color: segunda.color }} className="font-semibold">
                {formatBRL(segunda.data[ativo]?.value ?? 0)}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
