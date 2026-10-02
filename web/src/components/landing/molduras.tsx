import Image, { type StaticImageData } from "next/image";

/**
 * Molduras de aparelho para as telas REAIS do Topete (02/10/2026).
 *
 * As imagens são quadros das gravações do app de verdade, com a barbearia
 * fictícia "Navalha" (docs/materiais/landing/extrair.sh). A moldura é CSS
 * puro — sem PNG de iPhone/MacBook de banco de imagem, que pesa, envelhece e
 * tem dono.
 *
 * O celular segue as medidas do iPhone 17 Pro Max (pedido do dono: "usa um
 * iPhone de verdade"): corpo de 78 × 163,4 mm, borda de titânio fina, raio de
 * canto contínuo, Dynamic Island dentro da tela e os botões laterais. A tela
 * gravada é só o viewport do navegador (390 × 664 pt); acima dela entra a barra
 * de status, abaixo a barra do Safari com o endereço da barbearia — que é
 * exatamente o que o cliente vê: um link, sem app para baixar.
 *
 * Medidas em porcentagem da LARGURA do aparelho; nas propriedades verticais
 * convertidas pela proporção (78 / 163,4 ≈ 0,4774), para a borda ter a mesma
 * espessura em cima e dos lados.
 */

const PROPORCAO = 78 / 163.4; // largura / altura do corpo
const v = (pctDaLargura: number) => `${(pctDaLargura * PROPORCAO).toFixed(3)}%`; // → % da altura

/* Titânio: tom quente e escovado, com um reflexo de luz na diagonal. */
const TITANIO =
  "linear-gradient(140deg,#e9e4da 0%,#a8a298 18%,#d8d2c7 34%,#8c867c 52%,#cbc5ba 70%,#9a948a 86%,#e2ddd3 100%)";

function Botao({
  lado,
  topo,
  altura,
  camera = false,
}: {
  lado: "e" | "d";
  topo: number;
  altura: number;
  camera?: boolean;
}) {
  return (
    <span
      aria-hidden
      className="absolute rounded-[1px]"
      style={{
        [lado === "e" ? "left" : "right"]: "-0.85%",
        top: `${topo}%`,
        height: `${altura}%`,
        width: "1.1%",
        background: camera ? "linear-gradient(90deg,#6f6a62,#3a3732)" : TITANIO,
        boxShadow: "0 0 0 0.5px rgba(22,20,15,.22)",
      }}
    />
  );
}

function BarraDeStatus() {
  return (
    <div
      aria-hidden
      className="relative flex h-[5.4%] shrink-0 items-center justify-between bg-white px-[8.5%] text-[#0B0A08]"
    >
      <span
        className="pt-[1.2cqw] font-semibold tracking-[-0.02em]"
        style={{ fontSize: "4.1cqw" }}
      >
        9:41
      </span>
      <span
        className="flex items-center gap-[1.3cqw] pt-[1.2cqw]"
        style={{ height: "3.2cqw" }}
      >
        {/* sinal */}
        <svg viewBox="0 0 18 12" className="h-full w-auto" fill="currentColor">
          <rect x="0" y="8" width="3" height="4" rx="1" />
          <rect x="5" y="5.5" width="3" height="6.5" rx="1" />
          <rect x="10" y="3" width="3" height="9" rx="1" />
          <rect x="15" y="0" width="3" height="12" rx="1" />
        </svg>
        {/* wi-fi */}
        <svg viewBox="0 0 16 12" className="h-full w-auto" fill="currentColor">
          <path d="M8 2.2c2.4 0 4.6.9 6.3 2.5l1.3-1.4A10.9 10.9 0 0 0 8 .2 10.9 10.9 0 0 0 .4 3.3l1.3 1.4A9 9 0 0 1 8 2.2Zm0 3.6c1.4 0 2.8.5 3.8 1.5l1.3-1.4A7.4 7.4 0 0 0 8 3.8 7.4 7.4 0 0 0 2.9 5.9l1.3 1.4c1-1 2.4-1.5 3.8-1.5Zm0 3.5c.5 0 1 .2 1.4.6L8 11.9 6.6 9.9c.4-.4.9-.6 1.4-.6Z" />
        </svg>
        {/* bateria */}
        <svg viewBox="0 0 27 12" className="h-full w-auto">
          <rect
            x="0.5"
            y="0.5"
            width="22"
            height="11"
            rx="3.2"
            fill="none"
            stroke="currentColor"
            opacity=".4"
          />
          <rect x="2" y="2" width="17" height="8" rx="2" fill="currentColor" />
          <path
            d="M24.5 4v4a2.2 2.2 0 0 0 0-4Z"
            fill="currentColor"
            opacity=".45"
          />
        </svg>
      </span>
    </div>
  );
}

function BarraDoSafari({ endereco }: { endereco: string }) {
  return (
    <div
      aria-hidden
      className="relative flex h-[11.2%] shrink-0 flex-col items-center bg-[#F6F6F8] pt-[2.2cqw]"
    >
      <div
        className="flex w-[88%] items-center justify-between rounded-full bg-white px-[4cqw] text-[#3c3c43] shadow-[0_1px_3px_rgba(22,20,15,.12)]"
        style={{ height: "10cqw", fontSize: "3.4cqw" }}
      >
        <span className="font-semibold">aA</span>
        <span className="flex min-w-0 items-center gap-[1.2cqw] truncate font-medium text-[#16140F]">
          <svg
            viewBox="0 0 10 12"
            style={{ height: "2.9cqw" }}
            className="w-auto shrink-0"
            fill="currentColor"
            opacity=".55"
          >
            <path d="M5 0a3 3 0 0 1 3 3v2h.6c.8 0 1.4.6 1.4 1.4v4.2c0 .8-.6 1.4-1.4 1.4H1.4C.6 12 0 11.4 0 10.6V6.4C0 5.6.6 5 1.4 5H2V3a3 3 0 0 1 3-3Zm0 1.4A1.6 1.6 0 0 0 3.4 3v2h3.2V3A1.6 1.6 0 0 0 5 1.4Z" />
          </svg>
          {endereco}
        </span>
        <svg
          viewBox="0 0 12 12"
          style={{ height: "3.2cqw" }}
          className="w-auto shrink-0"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        >
          <path d="M10.2 6.2A4.3 4.3 0 1 1 8.9 3" />
          <path d="M9.4 0.9v2.6H6.8" />
        </svg>
      </div>
      {/* Indicador de início. */}
      <span className="absolute bottom-[9%] left-1/2 h-[1.15cqw] w-[36%] -translate-x-1/2 rounded-full bg-[#0B0A08]/85" />
    </div>
  );
}

export function Celular({
  src,
  alt,
  priority = false,
  className = "",
  sizes = "(min-width: 1024px) 18rem, 60vw",
  endereco = "navalha.topete.com.br",
}: {
  src: StaticImageData;
  alt: string;
  priority?: boolean;
  className?: string;
  sizes?: string;
  /** O endereço na barra do Safari: a barbearia é um link, não um app. */
  endereco?: string;
}) {
  return (
    /* Duas camadas: a de fora recebe a posição que vem de quem usa (absolute,
       largura); a de dentro guarda a proporção e é a referência das peças. */
    <div className={className}>
      <div className="relative w-full" style={{ aspectRatio: "78 / 163.4" }}>
        {/* Botões: Ação e volume à esquerda; lateral e Controle de Câmera à direita. */}
        <Botao lado="e" topo={17.4} altura={2.9} />
        <Botao lado="e" topo={23.2} altura={5.6} />
        <Botao lado="e" topo={30.0} altura={5.6} />
        <Botao lado="d" topo={25.5} altura={8.8} />
        <Botao lado="d" topo={47.5} altura={5.4} camera />

        {/* Corpo de titânio: borda fina, cantos contínuos. */}
        <div
          className="absolute inset-0 shadow-[0_34px_60px_-30px_rgba(22,20,15,.45),0_10px_22px_-14px_rgba(22,20,15,.35)]"
          style={{ borderRadius: `13.2% / ${v(13.2)}`, background: TITANIO }}
        >
          {/* Vidro com a borda preta da tela. */}
          <div
            className="absolute bg-[#050505]"
            style={{
              left: "1.05%",
              right: "1.05%",
              top: v(1.05),
              bottom: v(1.05),
              borderRadius: `12.3% / ${v(12.3)}`,
            }}
          >
            {/* Tela. */}
            <div
              className="absolute flex flex-col overflow-hidden bg-white [container-type:inline-size]"
              style={{
                left: "3.1%",
                right: "3.1%",
                top: v(3.1),
                bottom: v(3.1),
                borderRadius: `9.8% / ${v(9.8 * 0.94)}`,
              }}
            >
              <BarraDeStatus />
              <div className="relative min-h-0 flex-1 overflow-hidden bg-white">
                <Image
                  src={src}
                  alt={alt}
                  sizes={sizes}
                  priority={priority}
                  placeholder="blur"
                  className="block h-auto w-full"
                />
              </div>
              <BarraDoSafari endereco={endereco} />
              {/* Dynamic Island: pílula preta dentro da tela, no tamanho real. */}
              <span
                aria-hidden
                className="absolute left-1/2 top-[1.25%] h-[3.55%] w-[29%] -translate-x-1/2 rounded-full bg-black"
              />
              {/* Reflexo do vidro, bem leve. */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,rgba(255,255,255,.10)_0%,rgba(255,255,255,0)_32%)]"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Notebook({
  src,
  alt,
  priority = false,
  className = "",
  sizes = "(min-width: 1024px) 44rem, 92vw",
}: {
  src: StaticImageData;
  alt: string;
  priority?: boolean;
  className?: string;
  sizes?: string;
}) {
  return (
    <div
      className={
        className.includes("absolute") ? className : "relative " + className
      }
    >
      {/* Tampa: aro de alumínio fino, borda preta da tela e a câmera. */}
      <div
        className="relative rounded-t-[1.6vw] p-[0.45%] shadow-[0_30px_60px_-30px_rgba(22,20,15,.32)] lg:rounded-t-[1.1rem]"
        style={{ background: "linear-gradient(180deg,#d9dade,#a9abb1)" }}
      >
        <div className="relative rounded-t-[1.4vw] bg-[#0A0A0B] px-[1.4%] pb-[1.6%] pt-[2.1%] lg:rounded-t-[1rem]">
          <span
            aria-hidden
            className="absolute left-1/2 top-[0.75%] h-[3px] w-[3px] -translate-x-1/2 rounded-full bg-[#2B2D33]"
          />
          <div className="overflow-hidden rounded-[2px] bg-white">
            <Image
              src={src}
              alt={alt}
              sizes={sizes}
              priority={priority}
              placeholder="blur"
              className="block h-auto w-full"
            />
          </div>
        </div>
      </div>
      {/* Base: alumínio, um pouco mais larga que a tampa, com o rebaixo de abrir. */}
      <div
        aria-hidden
        className="relative mx-[-5.5%] h-0 rounded-b-[45%_100%] pb-[3%]"
        style={{
          background:
            "linear-gradient(180deg,#e6e7ea 0%,#c4c6cb 45%,#8f9197 100%)",
          boxShadow: "0 14px 22px -14px rgba(22,20,15,.4)",
        }}
      >
        <span className="absolute left-1/2 top-0 h-[42%] w-[15%] -translate-x-1/2 rounded-b-[40%] bg-gradient-to-b from-[#9fa1a7] to-[#c9cbd0]" />
      </div>
    </div>
  );
}
