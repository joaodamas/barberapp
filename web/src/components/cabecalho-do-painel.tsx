"use client";

import Image from "next/image";
import Link from "next/link";
import { useTenant } from "@/lib/tenant-context";
import { CLASSE_DO_LOGO_REDONDO, logoSemOtimizar } from "@/lib/logo-da-marca";
import { MARCA_GERADA, svgDoMonograma } from "@/lib/monograma";

/**
 * O topo do painel no celular, com a marca AO VIVO.
 *
 * Morava no layout do servidor, que lê a ficha com cache de 300 s: o dono
 * salvava nome ou cor em "Sua marca", lia "Pronto, sua marca foi salva" e o
 * topo continuava com a marca antiga. Aqui o tenant é o do `TenantLive`.
 *
 * Sem logo próprio, o monograma é desenhado aqui com o nome e a cor da ficha
 * ao vivo — `/marca.svg` usa os SALVOS no servidor, com o mesmo cache, e a
 * URL não muda quando eles mudam. Mesma decisão da prévia de "Sua marca".
 */
export function CabecalhoDoPainel() {
  const { brand } = useTenant();
  const logo =
    brand.logo === MARCA_GERADA
      ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgDoMonograma(brand.name, brand.accentColor))}`
      : brand.logo;

  return (
    <header className="safe-top flex items-center gap-2.5 px-4 pb-3 pt-4 md:hidden">
      <Link href="/painel" className="flex items-center gap-2.5">
        <Image
          src={logo}
          unoptimized={logo.startsWith("data:") || logoSemOtimizar(logo)}
          alt=""
          width={32}
          height={32}
          className={CLASSE_DO_LOGO_REDONDO}
          priority
        />
        <div className="min-w-0 leading-tight">
          <p className="line-clamp-2 break-words font-display text-sm font-semibold text-ink">{brand.name}</p>
          <p className="text-[11px] text-ink-muted">{brand.panelLabel}</p>
        </div>
      </Link>
    </header>
  );
}
