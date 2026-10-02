"use client";

import Image from "next/image";
import { useState } from "react";
import { Play } from "lucide-react";

/**
 * O tour narrado (55 s, voz do dono): o app real no notebook e no celular.
 *
 * Nada toca sozinho. A capa é uma imagem comum — a página não baixa um byte do
 * vídeo até a pessoa pedir — e só no clique o `<video>` nasce, já tocando, com
 * os controles do navegador (legenda queimada no vídeo, para quem está sem som).
 */
export function TourDoTopete() {
  const [tocando, setTocando] = useState(false);

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-[#0B0A08] shadow-[0_40px_80px_-40px_rgba(11,10,8,.5)] ring-1 ring-white/10">
      {tocando ? (
        <video
          className="h-full w-full"
          src="/landing/tour.mp4"
          poster="/landing/tour-capa.jpg"
          controls
          autoPlay
          playsInline
          preload="auto"
        >
          O seu navegador não toca vídeo. O tour mostra o Topete funcionando no notebook e no celular.
        </video>
      ) : (
        <button
          type="button"
          onClick={() => setTocando(true)}
          className="group absolute inset-0 h-full w-full cursor-pointer focus-visible:outline-none"
          aria-label="Assistir ao tour do Topete, 55 segundos, com som"
        >
          <Image
            src="/landing/tour-capa.jpg"
            alt=""
            fill
            sizes="(min-width: 1024px) 60rem, 100vw"
            className="object-cover transition-[filter] duration-300 group-hover:brightness-90"
          />
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex items-center gap-3 rounded-full bg-[#F4EFE4] py-3 pl-3 pr-6 text-[#0B0A08] shadow-[0_12px_30px_-10px_rgba(11,10,8,.45)] transition-transform duration-300 group-hover:scale-[1.03] group-focus-visible:ring-4 group-focus-visible:ring-[#E0AE58] motion-reduce:transition-none">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#E0AE58]">
                <Play size={20} className="translate-x-[1px] fill-current" />
              </span>
              <span className="text-left leading-tight">
                <span className="block font-semibold">Assistir</span>
                <span className="block text-xs text-[#5A554C]">55 segundos · com som</span>
              </span>
            </span>
          </span>
        </button>
      )}
    </div>
  );
}
