"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Volume2, VolumeX } from "lucide-react";
import { useMenosMovimento } from "@/components/landing/movimento";

/**
 * "Sem Topete × Com Topete": três episódios da série de cartoons do Instagram.
 *
 * Cada vídeo só toca enquanto está na tela, mudo e em loop — é a vitrine do
 * episódio, como no feed. Fora da tela ele para (não gasta bateria nem dados).
 * O som é escolha de quem assiste: um toque liga a narração daquele vídeo e
 * silencia os outros. Quem pediu menos movimento vê a capa com um botão de
 * play, e nada toca sozinho.
 */

const EPISODIOS = [
  { id: "K1", titulo: "O WhatsApp que não para", texto: "Cortando e respondendo “tem horário?” ao mesmo tempo." },
  { id: "K3", titulo: "22h e a conta não fecha", texto: "Papelzinho, calculadora — e o caixa que nunca bate." },
  { id: "K6", titulo: "Dá pra pagar o aluguel?", texto: "O fim do mês chegando, e ninguém sabe quanto vai sobrar." },
];

function Episodio({
  ep,
  comSom,
  aoPedirSom,
}: {
  ep: (typeof EPISODIOS)[number];
  comSom: boolean;
  aoPedirSom: () => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const reduzir = useMenosMovimento();
  const [iniciado, setIniciado] = useState(false);

  useEffect(() => {
    const v = ref.current;
    if (!v || reduzir) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setIniciado(true);
          v.play().catch(() => {});
        } else {
          v.pause();
        }
      },
      { threshold: 0.55 }
    );
    obs.observe(v);
    return () => obs.disconnect();
  }, [reduzir]);

  useEffect(() => {
    if (ref.current) ref.current.muted = !comSom;
  }, [comSom]);

  return (
    <figure className="flex w-[78vw] max-w-[17.5rem] shrink-0 snap-center flex-col sm:w-auto sm:max-w-none">
      <div className="relative aspect-[9/16] overflow-hidden rounded-[1.6rem] bg-[#16140F] ring-1 ring-white/10">
        <video
          ref={ref}
          className="h-full w-full object-cover"
          src={`/landing/${ep.id}.mp4`}
          poster={`/landing/${ep.id}-capa.jpg`}
          muted
          loop
          playsInline
          preload="none"
          controls={reduzir && iniciado}
          aria-label={`Cartoon: ${ep.titulo}`}
        />
        {reduzir && !iniciado ? (
          <button
            type="button"
            onClick={() => {
              setIniciado(true);
              aoPedirSom();
              ref.current?.play().catch(() => {});
            }}
            className="absolute inset-0 flex items-center justify-center"
            aria-label={`Assistir: ${ep.titulo}`}
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#E0AE58] text-[#0B0A08]">
              <Play size={22} className="translate-x-[1px] fill-current" />
            </span>
          </button>
        ) : (
          <button
            type="button"
            onClick={aoPedirSom}
            className="absolute bottom-3 right-3 flex h-10 w-10 items-center justify-center rounded-full bg-[#0B0A08]/70 text-[#F4EFE4] backdrop-blur transition-colors hover:bg-[#0B0A08]/90"
            aria-label={comSom ? `Tirar o som de: ${ep.titulo}` : `Ouvir: ${ep.titulo}`}
            aria-pressed={comSom}
          >
            {comSom ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
        )}
      </div>
      <figcaption className="mt-4">
        <p className="font-brand text-xl tracking-[-0.01em]">{ep.titulo}</p>
        <p className="mt-1 text-sm leading-relaxed text-[#A79F8F]">{ep.texto}</p>
      </figcaption>
    </figure>
  );
}

export function SemComTopete() {
  const [comSom, setComSom] = useState<string | null>(null);
  return (
    <div className="-mx-5 flex snap-x snap-mandatory gap-5 overflow-x-auto px-5 pb-2 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-6 sm:overflow-visible sm:px-0 md:gap-8">
      {EPISODIOS.map((ep) => (
        <Episodio
          key={ep.id}
          ep={ep}
          comSom={comSom === ep.id}
          aoPedirSom={() => setComSom((atual) => (atual === ep.id ? null : ep.id))}
        />
      ))}
    </div>
  );
}
