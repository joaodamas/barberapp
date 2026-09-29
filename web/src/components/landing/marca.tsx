import Image from "next/image";
import localFont from "next/font/local";

/**
 * A marca da plataforma: Topete (desde 28/09/2026; antes, CorteHub).
 *
 * O símbolo é o mascote — o homem de topete dourado — no quadro escuro do ícone
 * do app. A palavra é "topete" em minúsculas, na Outfit, a mesma do logo
 * desenhado em `docs/marca` (fonte da verdade: `docs/marca/gerar-marca.py`).
 *
 * A Outfit entra só aqui, auto-hospedada como as outras fontes do app
 * (`app/layout.tsx` explica por quê): um peso só, ~14 KB.
 */
export const outfit = localFont({
  src: "../../assets/fontes/outfit-700.woff2",
  weight: "700",
  display: "swap",
  variable: "--font-outfit",
});

/** O ícone: o mascote no quadro escuro. */
export function SimboloTopete({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <Image
      src="/topete-icone.svg"
      alt=""
      width={64}
      height={64}
      className={`${className} shrink-0 rounded-[22%]`}
      unoptimized
    />
  );
}

/** Ícone + nome, do jeito que a marca se assina. */
export function AssinaturaTopete({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`} aria-label="Topete">
      <SimboloTopete />
      <span className={`${outfit.className} text-[1.65rem] leading-none tracking-[-0.03em]`}>topete</span>
    </span>
  );
}
