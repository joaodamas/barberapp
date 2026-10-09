"use client";

import { useEffect, useRef } from "react";
import { ZoomIn, ZoomOut } from "lucide-react";
import {
  limitarEnquadramento,
  retanguloNoQuadrado,
  tamanhoDaFonte,
  type FonteDoLogo,
  ZOOM_MAXIMO,
  type Enquadramento,
} from "@/lib/recorte-do-logo";

/** Lado da área de recorte na tela, em px CSS. */
const LADO = 240;

/** Xadrez claro: o padrão de "transparente" que todo editor de imagem usa. */
export const XADREZ = {
  backgroundColor: "#ffffff",
  backgroundImage:
    "linear-gradient(45deg, #e2e8f0 25%, transparent 25%, transparent 75%, #e2e8f0 75%), linear-gradient(45deg, #e2e8f0 25%, transparent 25%, transparent 75%, #e2e8f0 75%)",
  backgroundSize: "16px 16px",
  backgroundPosition: "0 0, 8px 8px",
} as const;

/**
 * O recorte quadrado: arrastar para posicionar, controle para aproximar.
 *
 * Desenha num `<canvas>` com a MESMA conta (`retanguloNoQuadrado`) que gera o
 * arquivo final — o que o dono vê aqui é exatamente o que sobe, só que menor.
 * O xadrez atrás mostra o que vai ficar transparente.
 */
export function RecorteDoLogo({
  imagem,
  enquadramento,
  onChange,
}: {
  imagem: FonteDoLogo;
  enquadramento: Enquadramento;
  onChange: (e: Enquadramento) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const arraste = useRef<{ x: number; y: number; inicio: Enquadramento } | null>(null);
  const { largura, altura } = tamanhoDaFonte(imagem);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const densidade = Math.min(3, window.devicePixelRatio || 1);
    const lado = Math.round(LADO * densidade);
    c.width = lado;
    c.height = lado;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, lado, lado);
    ctx.imageSmoothingQuality = "high";
    const { dx, dy, dw, dh } = retanguloNoQuadrado(largura, altura, lado, enquadramento);
    ctx.drawImage(imagem, dx, dy, dw, dh);
  }, [imagem, largura, altura, enquadramento]);

  const mudar = (e: Enquadramento) => onChange(limitarEnquadramento(largura, altura, e));

  return (
    <div className="flex flex-col items-center gap-3">
      <canvas
        ref={canvas}
        role="img"
        aria-label="Recorte do logo. Arraste para posicionar."
        className="cursor-grab touch-none rounded-2xl border border-border active:cursor-grabbing"
        style={{ width: LADO, height: LADO, ...XADREZ }}
        onPointerDown={(ev) => {
          ev.currentTarget.setPointerCapture(ev.pointerId);
          arraste.current = { x: ev.clientX, y: ev.clientY, inicio: enquadramento };
        }}
        onPointerMove={(ev) => {
          const a = arraste.current;
          if (!a) return;
          mudar({
            ...a.inicio,
            x: a.inicio.x + (ev.clientX - a.x) / LADO,
            y: a.inicio.y + (ev.clientY - a.y) / LADO,
          });
        }}
        onPointerUp={() => (arraste.current = null)}
        onPointerCancel={() => (arraste.current = null)}
      />
      <label className="flex w-full max-w-[240px] items-center gap-2 text-ink-muted">
        <ZoomOut size={16} aria-hidden />
        <span className="sr-only">Aproximar</span>
        <input
          type="range"
          min={1}
          max={ZOOM_MAXIMO}
          step={0.01}
          value={enquadramento.zoom}
          onChange={(ev) => mudar({ ...enquadramento, zoom: Number(ev.target.value) })}
          className="h-11 min-w-0 flex-1 accent-[var(--color-gold-strong)]"
        />
        <ZoomIn size={16} aria-hidden />
      </label>
    </div>
  );
}
