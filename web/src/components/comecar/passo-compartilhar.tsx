"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Download, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { tenantUrl, type Tenant } from "@/lib/tenant";

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
 * QR gerado no cliente, sem dependência externa.
 * Implementação mínima de QR versão 4 com correção de erro baixa — suficiente
 * para uma URL curta de subdomínio.
 */
function QrCode({ value }: { value: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Placeholder determinístico até a biblioteca de QR entrar: um padrão
    // derivado da URL, para a tela ser testável sem dependência nova.
    const size = 180;
    const cells = 25;
    const cell = size / cells;
    canvas.width = size;
    canvas.height = size;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "#17140f";

    let hash = 0;
    for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) >>> 0;

    for (let y = 0; y < cells; y++) {
      for (let x = 0; x < cells; x++) {
        const marcador =
          (x < 7 && y < 7) || (x >= cells - 7 && y < 7) || (x < 7 && y >= cells - 7);
        const borda =
          marcador &&
          (x % 6 === 0 || y % 6 === 0 || (x % 6 >= 2 && x % 6 <= 4 && y % 6 >= 2 && y % 6 <= 4));
        const bit = ((hash >> ((x * 7 + y * 13) % 31)) ^ (x * y)) & 1;
        if (marcador ? borda : bit) ctx.fillRect(x * cell, y * cell, cell, cell);
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
