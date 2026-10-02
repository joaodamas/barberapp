import Image, { type StaticImageData } from "next/image";

/**
 * Molduras de aparelho para as telas REAIS do Topete (02/10/2026).
 *
 * As imagens são quadros das gravações do app de verdade, com a barbearia
 * fictícia "Navalha" (docs/materiais/landing/extrair.sh). A moldura é CSS
 * puro — sem PNG de iPhone/MacBook de banco de imagem, que pesa e envelhece —
 * e só o suficiente para o olho ler "celular" e "notebook": borda, raio,
 * a câmera e a base. O conteúdo é o produto, não o aparelho.
 */

export function Celular({
  src,
  alt,
  priority = false,
  className = "",
  sizes = "(min-width: 1024px) 18rem, 60vw",
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
        "relative rounded-[2.1rem] bg-[#16140F] p-[0.55rem] shadow-[0_30px_60px_-28px_rgba(22,20,15,.28),inset_0_0_0_1px_rgba(255,255,255,.08)] " +
        className
      }
    >
      <div className="relative overflow-hidden rounded-[1.6rem] bg-white">
        {/* A tela gravada é o viewport do app, sem a barra de status do aparelho.
            A faixa de cima faz esse papel e guarda a câmera — assim ela não
            cobre o cabeçalho da barbearia, como cobria quando ia por cima. */}
        <div aria-hidden className="relative pt-[11%]">
          <span className="absolute left-1/2 top-[22%] h-[38%] w-[30%] -translate-x-1/2 rounded-full bg-[#16140F]" />
        </div>
        <Image src={src} alt={alt} sizes={sizes} priority={priority} placeholder="blur" className="block h-auto w-full" />
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
    <div className={"relative " + className}>
      <div className="relative rounded-t-[1rem] bg-[#16140F] p-[0.7%] pb-[1.2%] shadow-[0_30px_60px_-30px_rgba(22,20,15,.26),inset_0_0_0_1px_rgba(255,255,255,.08)]">
        <span aria-hidden className="absolute left-1/2 top-[0.35%] h-1 w-1 -translate-x-1/2 rounded-full bg-[#3A352C]" />
        <div className="overflow-hidden rounded-[0.35rem] bg-white">
          <Image src={src} alt={alt} sizes={sizes} priority={priority} placeholder="blur" className="block h-auto w-full" />
        </div>
      </div>
      {/* Base: um pouco mais larga que a tela, como a de um notebook aberto. */}
      <div aria-hidden className="relative mx-[-4%] h-[0.9rem] rounded-b-[1rem] bg-gradient-to-b from-[#2A2620] to-[#16140F]">
        <span className="absolute left-1/2 top-0 h-[0.35rem] w-[16%] -translate-x-1/2 rounded-b-md bg-[#0B0A08]/60" />
      </div>
    </div>
  );
}
