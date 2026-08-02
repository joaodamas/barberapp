import Image from "next/image";

export default function OfflinePage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
      <Image src="/logo.svg" alt="" width={72} height={72} />
      <h1 className="text-xl text-ivory">Sem conexão</h1>
      <p className="max-w-xs text-sm text-ivory-muted">
        Você está offline no momento, mas fique tranquilo: sua reserva já
        confirmada continua salva. Assim que a conexão voltar, o app
        atualiza sozinho.
      </p>
    </div>
  );
}
