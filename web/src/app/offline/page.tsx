import Image from "next/image";

/**
 * Página estática, SEM componente de cliente: sem rede o chunk de JS dela não
 * está em cache e não hidrataria. O "Tentar de novo" é um link para a própria
 * URL (recarrega sem JS) e o recarregamento ao voltar a rede é um script
 * inline mínimo (a CSP permite `'unsafe-inline'`).
 */
export default function OfflinePage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 overflow-y-auto px-8 text-center md:h-full">
      <Image src="/marca.svg" alt="" width={72} height={72} />
      <h1 className="text-xl text-ink">Sem conexão</h1>
      <p className="max-w-xs text-sm text-ink-muted">
        Você está offline no momento, mas fique tranquilo: sua reserva já
        confirmada continua salva. Quando a conexão voltar, esta tela
        recarrega sozinha — ou toque abaixo para tentar agora.
      </p>
      <a
        href=""
        className="inline-flex min-h-11 items-center justify-center rounded-xl bg-gold px-5 text-sm font-semibold text-ink"
      >
        Tentar de novo
      </a>
      <script dangerouslySetInnerHTML={{ __html: 'addEventListener("online",function(){location.reload()})' }} />
    </div>
  );
}
