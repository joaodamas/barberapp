"use client";

import { useEffect } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";

export default function OfflinePage() {
  /* A promessa "atualiza sozinho" só vale se algo a cumpre: ao voltar a rede,
   * recarrega. O botão cobre o caso em que o evento `online` não vem (sinal
   * fraco não é "offline" para o navegador). */
  useEffect(() => {
    const voltou = () => window.location.reload();
    window.addEventListener("online", voltou);
    return () => window.removeEventListener("online", voltou);
  }, []);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 overflow-y-auto px-8 text-center md:h-full">
      <Image src="/marca.svg" alt="" width={72} height={72} />
      <h1 className="text-xl text-ink">Sem conexão</h1>
      <p className="max-w-xs text-sm text-ink-muted">
        Você está offline no momento, mas fique tranquilo: sua reserva já
        confirmada continua salva. Quando a conexão voltar, esta tela
        recarrega sozinha — ou toque abaixo para tentar agora.
      </p>
      <Button onClick={() => window.location.reload()}>Tentar de novo</Button>
    </div>
  );
}
