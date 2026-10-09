"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { formatBRL } from "@/lib/format";
import { useTenant } from "@/lib/tenant-context";
import { chaveDeIdempotencia } from "@/lib/chave-de-idempotencia";
import { mensagemDaFuncao } from "@/lib/mensagem-da-funcao";
import { MOTIVOS_DE_SAIDA, previaDoAjuste, type MotivoDeAjuste } from "@/lib/ajuste-de-estoque";
import type { Doc } from "@/lib/db/repository";
import type { ProductDoc } from "@/lib/domain";

/**
 * Ajustar o estoque — "o saldo real é outro" ou "saiu sem venda".
 *
 * Dois gestos, porque são duas perguntas do dono:
 *
 * - **Contei**: "tenho 6 na prateleira" — o sistema calcula a diferença.
 * - **Saiu sem venda**: "quebrei 2" — o dono diz quantas e POR QUÊ.
 *
 * ## O que cada um faz com o dinheiro
 *
 * - Saída (perda, uso interno, vencido, contagem a menos, outro): vira custo do
 *   mês na linha "Perdas e uso interno de estoque", ao custo do produto no
 *   instante do ajuste.
 * - Contagem a MAIS: só corrige a quantidade. Não gera receita nem custo.
 *
 * O modal diz isso antes de confirmar. Monte com `key={produto.id}`.
 */
export function AjustarEstoque({
  produto,
  aoFechar,
}: {
  produto: Doc<ProductDoc>;
  aoFechar: () => void;
}) {
  const tenant = useTenant();
  const [modo, setModo] = useState<"contagem" | "saida">("contagem");
  const [quantidade, setQuantidade] = useState("");
  const [motivo, setMotivo] = useState<MotivoDeAjuste | null>(null);
  const [motivoTexto, setMotivoTexto] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [chave, setChave] = useState(chaveDeIdempotencia);

  const estoqueAtual = Number(produto.stock) || 0;
  const custoUnit = Number(produto.cost) || 0;
  const previa = previaDoAjuste({ estoqueAtual, modo, quantidade });

  const motivoOk =
    modo === "contagem" ||
    (motivo !== null && (motivo !== "outro" || motivoTexto.trim().length >= 3));
  const podeConfirmar = previa.ok && motivoOk && !salvando;

  /* Qualquer mudança de pedido é tentativa nova: o servidor recusa a mesma
   * chave com outro pedido. */
  function mudou() {
    setErro(null);
    setChave(chaveDeIdempotencia());
  }

  async function confirmar() {
    if (!previa.ok || !podeConfirmar) return;
    setSalvando(true);
    setErro(null);
    try {
      const { callFunction } = await import("@/lib/firebase");
      const base = { barbershopId: tenant.id, productId: produto.id, idempotencyKey: chave };
      await callFunction<Record<string, unknown>, unknown>(
        "ajustarEstoque",
        modo === "contagem"
          ? { ...base, modo, contado: previa.estoqueDepois }
          : {
              ...base,
              modo,
              quantity: -previa.delta,
              reason: motivo,
              reasonText: motivo === "outro" ? motivoTexto.trim() : null,
            }
      );
      aoFechar();
    } catch (e) {
      setErro(mensagemDaFuncao(e, "Não foi possível ajustar o estoque agora."));
    } finally {
      setSalvando(false);
    }
  }

  const custoDoAjuste = previa.ok && previa.delta < 0 ? Math.round(-previa.delta * custoUnit * 100) / 100 : 0;

  return (
    <Modal
      open
      onClose={aoFechar}
      title="Ajustar estoque"
      description={`${produto.name} · ${estoqueAtual} un. no sistema`}
      footer={
        <div className="flex flex-col gap-2">
          {erro && (
            <p role="alert" className="text-xs text-danger">
              {erro}
            </p>
          )}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={aoFechar} className="flex-1">
              Cancelar
            </Button>
            <Button onClick={confirmar} disabled={!podeConfirmar} className="flex-1">
              {salvando ? "Registrando…" : "Confirmar ajuste"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Tipo de ajuste">
          {(
            [
              { id: "contagem", rotulo: "Contei o estoque" },
              { id: "saida", rotulo: "Saiu sem venda" },
            ] as const
          ).map((o) => (
            <button
              key={o.id}
              type="button"
              aria-pressed={modo === o.id}
              onClick={() => {
                setModo(o.id);
                setQuantidade("");
                mudou();
              }}
              className={
                "min-h-11 rounded-xl border text-sm transition-colors " +
                (modo === o.id
                  ? "border-gold bg-gold/10 text-ink"
                  : "border-border text-ink-muted hover:border-gold/60")
              }
            >
              {o.rotulo}
            </button>
          ))}
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-medium text-ink-muted">
            {modo === "contagem" ? "Quantidade real contada" : "Quantas unidades saíram"}
          </span>
          <input
            autoFocus
            inputMode="numeric"
            value={quantidade}
            onChange={(e) => {
              setQuantidade(e.target.value.replace(/\D/g, ""));
              mudou();
            }}
            placeholder={modo === "contagem" ? String(estoqueAtual) : "1"}
            className="min-h-11 rounded-xl border border-border bg-surface px-3 text-sm tabular-nums text-ink"
          />
        </label>

        {modo === "saida" && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-medium text-ink-muted">Motivo</span>
            <div className="flex flex-col gap-1.5">
              {MOTIVOS_DE_SAIDA.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={motivo === m.id}
                  onClick={() => {
                    setMotivo(m.id);
                    mudou();
                  }}
                  className={
                    "min-h-11 rounded-xl border px-3 text-left text-sm transition-colors " +
                    (motivo === m.id
                      ? "border-gold bg-gold/10 text-ink"
                      : "border-border text-ink-muted hover:border-gold/60")
                  }
                >
                  {m.rotulo}
                </button>
              ))}
            </div>
            {motivo === "outro" && (
              <input
                value={motivoTexto}
                onChange={(e) => {
                  setMotivoTexto(e.target.value);
                  mudou();
                }}
                maxLength={200}
                placeholder="Explique em poucas palavras"
                className="min-h-11 rounded-xl border border-border bg-surface px-3 text-sm text-ink"
              />
            )}
          </div>
        )}

        {previa.ok ? (
          <div className="flex flex-col gap-1 border-t border-border pt-3 text-xs text-ink-muted">
            <p className="tabular-nums text-ink">
              Estoque: {estoqueAtual} → {previa.estoqueDepois} un.
            </p>
            {previa.delta < 0 ? (
              <p>
                Vira custo do mês: {formatBRL(custoDoAjuste)} ({-previa.delta} un. ao custo de{" "}
                {formatBRL(custoUnit)}), na linha &ldquo;Perdas e uso interno de estoque&rdquo;
                do resultado.
              </p>
            ) : (
              <p>
                Só corrige a quantidade: não gera receita nem custo. A contagem fica registrada
                no histórico do produto.
              </p>
            )}
          </div>
        ) : (
          previa.erro && <p className="text-xs text-danger">{previa.erro}</p>
        )}
      </div>
    </Modal>
  );
}
