"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Download, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { tenantUrl, type Tenant } from "@/lib/tenant";
import { matrizDoQr } from "@/lib/qr";

/**
 * O passo que decide o trial.
 *
 * Quem não compartilha o link não recebe agendamento, não vê valor e cancela.
 * É a métrica de ativação — por isso entrega tudo pronto para copiar e colar,
 * em vez de só mostrar a URL.
 */
export function PassoCompartilhar({
  tenant,
  onSubmit,
  saving,
}: {
  tenant: Tenant;
  /* Opcionais: no onboarding existe um "pronto, ir para o painel"; no painel
   * não há para onde avançar — o dono já chegou. Sem eles, o bloco final some
   * e o resto (link, mensagem, WhatsApp, QR) é idêntico nos dois lugares. */
  onSubmit?: (data?: Record<string, unknown>) => void;
  saving?: boolean;
}) {
  const link = tenantUrl(tenant.slug);
  const [copiado, setCopiado] = useState<string | null>(null);

  const mensagem =
    `Agora você pode agendar seu horário na ${tenant.brand.name} direto pelo link, ` +
    `sem precisar me chamar: ${link}\n\n` +
    `Dá pra ver os horários livres e escolher o que der certo pra você. 💈`;

  async function copiar(texto: string, qual: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(qual);
      setTimeout(() => setCopiado(null), 2000);
    } catch {
      setCopiado(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-gold/30 bg-gold/5 p-5">
        <QrCode value={link} />
        <p className="text-center text-xs text-ivory-muted">
          Imprima e deixe no balcão ou no espelho.
        </p>
      </div>

      <Bloco
        titulo="Link do seu app"
        dica="Cole na bio do Instagram e no seu status do WhatsApp."
        valor={link}
      >
        <Button variant="secondary" onClick={() => copiar(link, "link")}>
          {copiado === "link" ? <Check size={16} /> : <Copy size={16} />}
          {copiado === "link" ? "Copiado" : "Copiar"}
        </Button>
      </Bloco>

      <Bloco
        titulo="Mensagem pronta"
        dica="Mande na lista de transmissão para seus clientes de sempre."
        valor={mensagem}
        multilinha
      >
        <Button variant="secondary" onClick={() => copiar(mensagem, "msg")}>
          {copiado === "msg" ? <Check size={16} /> : <Copy size={16} />}
          {copiado === "msg" ? "Copiado" : "Copiar"}
        </Button>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(mensagem)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Button variant="secondary">
            <MessageCircle size={16} /> Abrir WhatsApp
          </Button>
        </a>
      </Bloco>

      {onSubmit && (
        <Button onClick={() => onSubmit()} disabled={saving}>
          {saving ? "Finalizando…" : "Pronto, ir para o painel"}
        </Button>
      )}
    </div>
  );
}

function Bloco({
  titulo, dica, valor, multilinha, children,
}: {
  titulo: string;
  dica: string;
  valor: string;
  multilinha?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div>
        <p className="text-sm font-medium text-ivory">{titulo}</p>
        <p className="text-xs text-ivory-muted">{dica}</p>
      </div>
      <div
        className={
          "rounded-xl border border-border bg-surface-raised px-4 py-3 text-sm text-ivory " +
          (multilinha ? "whitespace-pre-wrap" : "truncate")
        }
      >
        {valor}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

/**
 * QR gerado no cliente, sem dependência externa e sem rede.
 *
 * A matriz vem de `lib/qr.ts`, que é onde o teste a verifica: aqui só há
 * desenho. O `quietZone` de 4 módulos não é decoração — é exigência da
 * especificação, e sem ela leitor nenhum reconhece o código impresso.
 */
function QrCode({ value }: { value: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const matriz = matrizDoQr(value);
    const modulos = matriz.length;
    const quietZone = 4;
    const total = modulos + quietZone * 2;

    /* Escala inteira: um módulo fracionado gera meia célula cinza no
     * antialiasing, e é assim que QR impresso deixa de ser lido. */
    const alvo = 220;
    const escala = Math.max(2, Math.floor(alvo / total));
    const size = total * escala;

    canvas.width = size;
    canvas.height = size;
    /* Dobro no CSS mantém o desenho nítido em tela retina sem esticar pixel. */
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "#17140f";

    for (let linha = 0; linha < modulos; linha++) {
      for (let coluna = 0; coluna < modulos; coluna++) {
        if (!matriz[linha][coluna]) continue;
        ctx.fillRect(
          (coluna + quietZone) * escala,
          (linha + quietZone) * escala,
          escala,
          escala
        );
      }
    }
    setPronto(true);
  }, [value]);

  function baixar() {
    const url = ref.current?.toDataURL("image/png");
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = "qr-agendamento.png";
    a.click();
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <canvas ref={ref} className="rounded-xl" aria-label={`QR code para ${value}`} />
      <Button variant="ghost" onClick={baixar} disabled={!pronto}>
        <Download size={14} /> Baixar QR
      </Button>
    </div>
  );
}
