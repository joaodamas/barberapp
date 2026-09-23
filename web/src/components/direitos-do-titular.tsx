"use client";

import { useState } from "react";
import { AlertTriangle, Download, Loader2, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTenant } from "@/lib/tenant-context";
import { contar } from "@/lib/plural";
import { mensagemDoErro, nomeDoArquivo } from "@/lib/direitos-do-titular";

/**
 * Os pedidos do cliente à barbearia — cópia dos dados e exclusão (LGPD, art.
 * 18) — atendidos pelo dono, dentro da ficha.
 *
 * Existe porque Termos §7 diz ao dono "atenda aos pedidos deles: cópia,
 * correção, portabilidade e exclusão — nós damos o suporte técnico", e não
 * havia botão nenhum. O desenho está em `docs/LGPD-DIREITOS-DO-TITULAR.md`.
 *
 * ## Por que dentro da ficha, e não num modal por cima
 *
 * A ficha já é um diálogo. Um segundo por cima brigaria pelo foco e pelo Esc, e
 * o dono perderia de vista de QUEM está falando — que é a informação que
 * impede anonimizar a pessoa errada. A confirmação troca o conteúdo da ficha;
 * o nome continua no título.
 *
 * ## Nada é anunciado antes de o servidor responder
 *
 * O download só começa com o arquivo em mãos, e "anonimizado" só aparece com a
 * resposta — a regra de `soAvisaSeGravou`. Anonimizar é irreversível e é a
 * resposta a um terceiro: dizer que foi feito quando não foi é exatamente o
 * defeito que o projeto persegue.
 */
export function DireitosDoTitular({ clientId }: { clientId: string }) {
  const tenant = useTenant();
  const [etapa, setEtapa] = useState<"botoes" | "exportar" | "anonimizar">("botoes");
  const [executando, setExecutando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [palavra, setPalavra] = useState("");
  const [exportado, setExportado] = useState(false);
  const [anonimizado, setAnonimizado] = useState<Anonimizado | null>(null);

  function ir(para: typeof etapa) {
    setEtapa(para);
    setErro(null);
    setPalavra("");
  }

  async function exportar() {
    setExecutando(true);
    setErro(null);
    try {
      const { callFunction } = await import("@/lib/firebase");
      const dados = await callFunction<Pedido, { geradoEm: string }>("exportarDadosDoCliente", {
        barbershopId: tenant.id,
        clientId,
      });
      baixar(nomeDoArquivo(clientId, dados.geradoEm), dados);
      setExportado(true);
      setEtapa("botoes");
    } catch (e) {
      setErro(mensagemDoErro(e));
    } finally {
      setExecutando(false);
    }
  }

  async function anonimizar() {
    setExecutando(true);
    setErro(null);
    try {
      const { callFunction } = await import("@/lib/firebase");
      const r = await callFunction<Pedido, Anonimizado>("anonimizarCliente", {
        barbershopId: tenant.id,
        clientId,
      });
      setAnonimizado(r);
    } catch (e) {
      setErro(mensagemDoErro(e, { parcial: true }));
    } finally {
      setExecutando(false);
    }
  }

  if (anonimizado) {
    return (
      <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface-raised p-3">
        <p className="text-sm font-medium text-ink">
          {anonimizado.jaEstava ? "Este cadastro já estava anonimizado" : "Cliente anonimizado"}
        </p>
        {!anonimizado.jaEstava && (
          <p className="text-xs text-ink-muted">
            Nome e WhatsApp saíram do cadastro e de{" "}
            {contar(anonimizado.reservas, "atendimento", "atendimentos")}. Valores e datas
            continuam no financeiro. O cadastro sai da lista de clientes.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      <p className="text-[11px] uppercase tracking-wide text-ink-muted">Pedidos do cliente (LGPD)</p>

      {etapa === "botoes" && (
        <>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => ir("exportar")}>
              <Download size={14} aria-hidden /> Exportar dados
            </Button>
            <Button variant="secondary" size="sm" onClick={() => ir("anonimizar")}>
              <UserX size={14} aria-hidden /> Anonimizar
            </Button>
          </div>
          {exportado && (
            <p className="text-xs text-ink-muted">
              {/* "Gerado", não "baixado": a resposta chegou e o navegador recebeu o
                  arquivo; se ele foi salvo é o navegador quem sabe. */}
              Arquivo gerado — confira a pasta de downloads. Entregue só ao próprio cliente:
              ele tem o histórico inteiro dele.
            </p>
          )}
        </>
      )}

      {etapa === "exportar" && (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-raised p-3">
          <p className="text-sm text-ink">Baixar tudo o que a barbearia guarda sobre este cliente</p>
          <p className="text-xs text-ink-muted">
            Cadastro, atendimentos, pagamentos, fidelidade e mensalidade, num arquivo que ele
            pode abrir ou levar para outro lugar. Entregue só a ele: fica registrado que
            você exportou.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => ir("botoes")} disabled={executando}>
              Cancelar
            </Button>
            <Button size="sm" onClick={() => void exportar()} disabled={executando}>
              {executando ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden /> Gerando…
                </>
              ) : (
                "Baixar arquivo"
              )}
            </Button>
          </div>
        </div>
      )}

      {etapa === "anonimizar" && (
        <div className="flex flex-col gap-3 rounded-xl border border-danger/30 bg-danger/5 p-3">
          <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
            <AlertTriangle size={14} className="text-danger" aria-hidden />
            Anonimizar é para sempre
          </p>
          <ul className="flex flex-col gap-0.5 text-xs text-ink-muted">
            <li>· Nome e WhatsApp saem do cadastro, dos atendimentos e das mensagens.</li>
            <li>· Valores, datas e serviços ficam — o financeiro continua fechando.</li>
            <li>· O cadastro sai da lista, e não dá para desfazer.</li>
            <li>
              · Se ele tiver horário marcado ou plano de mensalista ativo, cancele antes: o
              sistema recusa.
            </li>
          </ul>
          <p className="text-xs text-ink-muted">
            Se ele quer uma cópia dos dados, exporte <strong className="text-ink">antes</strong>.
          </p>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`anonimizar-${clientId}`} className="text-sm text-ink">
              Para confirmar, digite <strong>ANONIMIZAR</strong>
            </label>
            <input
              id={`anonimizar-${clientId}`}
              type="text"
              value={palavra}
              autoComplete="off"
              onChange={(e) => setPalavra(e.target.value.toUpperCase())}
              className="min-h-11 rounded-xl border border-border bg-surface px-3 text-sm text-ink"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => ir("botoes")} disabled={executando}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => void anonimizar()}
              disabled={palavra !== "ANONIMIZAR" || executando}
            >
              {executando ? "Anonimizando…" : "Anonimizar"}
            </Button>
          </div>
        </div>
      )}

      {erro && (
        <p role="alert" className="text-sm text-danger">
          {erro}
        </p>
      )}
    </div>
  );
}

type Pedido = { barbershopId: string; clientId: string };

type Anonimizado = {
  jaEstava: boolean;
  reservas: number;
};

/** Entrega o JSON ao navegador como arquivo. Só roda com a resposta em mãos. */
function baixar(nome: string, dados: unknown) {
  const blob = new Blob([JSON.stringify(dados, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  /* Revogar na mesma volta do laço cancela o download em alguns navegadores —
   * o clique só agenda a gravação. */
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
