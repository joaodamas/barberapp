"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useTenant } from "@/lib/tenant-context";
import { patchDoc } from "@/lib/db/repository";
import { soAvisaSeGravou } from "@/lib/so-avisa-se-gravou";
import { lerReais, reaisParaCampo } from "@/lib/reais";
import { camposDoProduto, lerEdicaoDeProduto } from "@/lib/produtos";
import type { Doc } from "@/lib/db/repository";
import type { ProductDoc } from "@/lib/domain";

/**
 * Editar o cadastro de um produto — nome, preço de venda, custo e estoque mínimo.
 *
 * ## O que a edição NÃO muda
 *
 * Cada venda guarda o preço e o custo do dia (`unitPrice` e `unitCost`,
 * congelados no movimento). Mudar o cadastro vale só para as vendas FUTURAS; o
 * que já foi vendido, o CMV e a comissão de ontem continuam como foram. O modal
 * diz isso, porque o dono que corrige um preço errado costuma esperar que a
 * venda errada se conserte sozinha — e ela não se conserta: para isso existe
 * "Corrigir venda".
 *
 * O saldo também não é editável aqui: só o servidor mexe nele (Dar entrada,
 * Ajustar estoque, venda e devolução), cada uma com seu registro.
 *
 * Monte com `key={produto.id}`: os campos nascem do produto e não se reiniciam
 * por efeito.
 */
export function EditarProduto({
  produto,
  aoFechar,
}: {
  produto: Doc<ProductDoc>;
  aoFechar: () => void;
}) {
  const tenant = useTenant();
  const [campos, setCampos] = useState(() => camposDoProduto(produto, reaisParaCampo));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const mudouPreco = lerReais(campos.price) !== produto.price;
  const mudouCusto = lerReais(campos.cost) !== produto.cost;

  async function salvar() {
    const lido = lerEdicaoDeProduto(campos);
    if (!lido.ok) {
      setErro(lido.erro);
      return;
    }
    setErro(null);
    setSalvando(true);
    /* Grava primeiro; fecha depois — o erro cairia num modal já fechado. */
    const r = await soAvisaSeGravou({
      gravar: () => patchDoc(tenant.id, "products", produto.id, lido.valor),
      avisar: aoFechar,
    });
    setSalvando(false);
    if (!r.ok) setErro(r.erro);
  }

  function campo<K extends keyof typeof campos>(chave: K, valor: string) {
    setCampos((c) => ({ ...c, [chave]: valor }));
    setErro(null);
  }

  return (
    <Modal
      open
      onClose={aoFechar}
      title="Editar produto"
      description={produto.name}
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
            <Button onClick={salvar} disabled={salvando} className="flex-1">
              {salvando ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-medium text-ink-muted">Nome do produto</span>
          <input
            autoFocus
            value={campos.name}
            onChange={(e) => campo("name", e.target.value)}
            className="min-h-11 rounded-xl border border-border bg-surface px-3 text-sm text-ink"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-medium text-ink-muted">Preço de venda (R$)</span>
            <input
              inputMode="decimal"
              value={campos.price}
              onChange={(e) => campo("price", e.target.value)}
              className="min-h-11 rounded-xl border border-border bg-surface px-3 text-sm tabular-nums text-ink"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-medium text-ink-muted">Custo unitário (R$)</span>
            <input
              inputMode="decimal"
              value={campos.cost}
              onChange={(e) => campo("cost", e.target.value)}
              className="min-h-11 rounded-xl border border-border bg-surface px-3 text-sm tabular-nums text-ink"
            />
          </label>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-medium text-ink-muted">Estoque mínimo (un.)</span>
          <input
            inputMode="numeric"
            value={campos.minStock}
            onChange={(e) => campo("minStock", e.target.value.replace(/\D/g, ""))}
            className="min-h-11 rounded-xl border border-border bg-surface px-3 text-sm tabular-nums text-ink"
          />
        </label>

        <p className="text-xs text-ink-muted">
          {mudouPreco || mudouCusto
            ? "Preço e custo novos valem só para as vendas daqui para frente. As vendas já feitas guardam o preço e o custo do dia — o histórico e o resultado do mês não mudam."
            : "Mudar preço ou custo vale só para as vendas daqui para frente: as vendas já feitas guardam o preço e o custo do dia."}{" "}
          Para ajustar a quantidade, use Dar entrada ou Ajustar estoque.
        </p>
      </div>
    </Modal>
  );
}
