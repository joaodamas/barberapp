"use client";

import { useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { formatBRL } from "@/lib/format";
import { useTenant } from "@/lib/tenant-context";
import { useInventoryMovements, useProducts, useRefunds, useStaff } from "@/lib/db/use-shop-data";
import { chaveDeIdempotencia } from "@/lib/chave-de-idempotencia";
import { paymentMethodLabel } from "@/lib/payment-method";
import { situacaoDaVenda, vendasEstornaveis, type VendaEstornavel } from "@/lib/estornos";
import { plural } from "@/lib/plural";
import type { PaymentMethod } from "@/lib/types";

/**
 * Desfazer uma venda — D23.
 *
 * ## O que não existia
 *
 * Venda registrada por engano era irreversível pela interface, com estoque
 * baixado, pagamento gravado e taxa cobrada. O único caminho era editar o banco
 * à mão — que é o mesmo que dizer "não existe caminho".
 *
 * ## Por que a palavra é "devolver", e não "excluir"
 *
 * A tela não oferece apagar a venda, porque o sistema não a apaga. Ela oferece
 * registrar que o dinheiro voltou e que a mercadoria voltou — dois fatos novos,
 * somados ao histórico. Um botão escrito "excluir" prometeria um comportamento
 * que o servidor recusa, e prometer errado é o defeito que esta auditoria
 * inteira persegue.
 *
 * Por isso a lista mantém as vendas já devolvidas, marcadas. Sumir com elas
 * faria a tela contar a mesma história que o `delete` contaria.
 *
 * ## O motivo é obrigatório
 *
 * O servidor recusa sem ele. Três meses depois, olhando um mês fechado, a
 * pergunta do dono não é "quanto voltou" — é "por quê".
 */

export function DesfazerVenda() {
  const tenant = useTenant();
  const { items: movimentos } = useInventoryMovements();
  const { items: refunds } = useRefunds();
  const { items: produtos } = useProducts();
  const { items: equipe } = useStaff();

  const [aDesfazer, setADesfazer] = useState<VendaEstornavel | null>(null);
  const [quantidade, setQuantidade] = useState(1);
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<{ valor: number; unidades: number } | null>(null);
  const [chave, setChave] = useState(chaveDeIdempotencia);

  const vendas = useMemo(
    () => vendasEstornaveis({ movimentos, refunds, limite: 8 }),
    [movimentos, refunds]
  );

  const nomeDoProduto = (id: string) => produtos.find((p) => p.id === id)?.name ?? "Produto";
  const nomeDoVendedor = (id: string | null) =>
    id ? (equipe.find((b) => b.id === id)?.name ?? null) : null;

  function abrir(v: VendaEstornavel) {
    setADesfazer(v);
    setQuantidade(v.resta);
    setMotivo("");
    setErro(null);
    setFeito(null);
    setChave(chaveDeIdempotencia());
  }

  /* O valor SEGUE a quantidade, e não é digitado. Deixá-lo editável permitiria
   * devolver R$ 90 por uma unidade de R$ 45 — e aí o estoque contaria uma
   * história e o caixa outra. */
  const valorADevolver = aDesfazer ? Math.round(aDesfazer.unitPrice * quantidade * 100) / 100 : 0;
  const podeConfirmar =
    aDesfazer !== null && quantidade > 0 && quantidade <= aDesfazer.resta && motivo.trim().length >= 3;

  async function confirmar() {
    if (!aDesfazer || !podeConfirmar) return;
    setSalvando(true);
    setErro(null);
    try {
      const { callFunction } = await import("@/lib/firebase");
      const r = await callFunction<
        Record<string, unknown>,
        { valor: number; quantidade: number | null }
      >("registrarEstorno", {
        barbershopId: tenant.id,
        origem: "produto",
        movementId: aDesfazer.movementId,
        quantity: quantidade,
        reason: motivo.trim(),
        idempotencyKey: chave,
      });

      setFeito({ valor: r.valor, unidades: r.quantidade ?? quantidade });
      setADesfazer(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui registrar a devolução.");
    } finally {
      setSalvando(false);
    }
  }

  if (vendas.length === 0) return null;

  return (
    <section>
      <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ivory-muted md:mb-3 md:text-sm">
        <RotateCcw size={12} /> Vendas recentes
      </h2>

      {feito && (
        <Card className="mb-2 flex items-center gap-2 border-gold/40 py-2.5 text-sm">
          <RotateCcw size={16} className="shrink-0 text-gold-light" />
          {/* Concorda em número: "1 un. voltou", "2 un. voltaram". A frase já
              saía certa — o que estava errado era a FORMA: um ternário inline,
              o mesmo anti-padrão que produziu o defeito 15 linhas abaixo, no
              aviso de quanto já voltou. Enquanto a regra mora na linha, cada
              nova frase é uma chance de errar de novo. */}
          <span>
            Devolvido {formatBRL(feito.valor)} · {feito.unidades} un.{" "}
            {plural(feito.unidades, "voltou", "voltaram")} para o estoque.
          </span>
        </Card>
      )}

      <Card className="flex flex-col divide-y divide-border p-0">
        {vendas.map((v) => {
          const situacao = situacaoDaVenda(v);
          return (
            <div key={v.movementId} className="flex items-center gap-3 px-3 py-2.5 md:px-4">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-ivory">
                  {v.quantidade}× {nomeDoProduto(v.productId)}
                  <span className="text-ivory-muted"> · {formatBRL(v.valor)}</span>
                </p>
                <p className="truncate text-[11px] text-ivory-muted">
                  {v.date}
                  {v.paymentMethod &&
                    ` · ${paymentMethodLabel[v.paymentMethod as PaymentMethod]}`}
                  {nomeDoVendedor(v.staffId) && ` · ${nomeDoVendedor(v.staffId)}`}
                  {/* A devolução aparece na própria linha da venda: é a mesma
                      história, e separá-la em outra lista obrigaria o dono a
                      cruzar as duas de cabeça. */}
                  {situacao && <span className="text-gold-light"> · {situacao}</span>}
                </p>
              </div>
              {v.encerrada ? (
                <span className="shrink-0 text-[11px] text-ivory-muted">Devolvida</span>
              ) : (
                <Button variant="ghost" className="shrink-0 text-xs" onClick={() => abrir(v)}>
                  Devolver
                </Button>
              )}
            </div>
          );
        })}
      </Card>

      <Modal
        open={aDesfazer !== null}
        onClose={() => setADesfazer(null)}
        title="Devolver venda"
        footer={
          <>
            <Button variant="ghost" onClick={() => setADesfazer(null)}>
              Cancelar
            </Button>
            <Button onClick={confirmar} disabled={!podeConfirmar || salvando}>
              {salvando ? "Registrando…" : `Devolver ${formatBRL(valorADevolver)}`}
            </Button>
          </>
        }
      >
        {aDesfazer && (
          <div className="flex flex-col gap-3">
            {/* A frase era "{qtd}× {produto} vendida em ...", e "vendida"
                concordava com um nome que o produto não controla: o dono
                cadastra "Shampoo", e a tela escrevia "Shampoo ... vendida".
                Gênero de nome próprio de produto não é dedutível — nem por
                regra, nem por dicionário —, então a saída não é escolher a
                forma certa, é escrever uma frase que não dependa dela.
                "Venda" é o substantivo da AÇÃO, invariável aqui, e o produto
                passa a ser dado da linha em vez de sujeito de um adjetivo. */}
            <p className="text-sm text-ivory-muted">
              Venda de {aDesfazer.date} · {aDesfazer.quantidade}×{" "}
              {nomeDoProduto(aDesfazer.productId)} · {formatBRL(aDesfazer.valor)}
            </p>

            {aDesfazer.devolvida > 0 && (
              /* Duas concordâncias, e as duas estavam fixas no plural.
               * "1 un. já voltaram" é o par que as UI-UX-GUIDELINES §9 usam
               * como EXEMPLO — o produto escrevia o lado errado do próprio
               * exemplo do próprio guia. E o "Restam" errava sozinho no
               * extremo oposto: com 2 de 3 devolvidas, a tela dizia
               * "Restam 1". */
              <p className="text-xs text-gold-light">
                {aDesfazer.devolvida} un. já{" "}
                {plural(aDesfazer.devolvida, "voltou", "voltaram")}.{" "}
                {plural(aDesfazer.resta, "Resta", "Restam")} {aDesfazer.resta}.
              </p>
            )}

            {aDesfazer.quantidade > 1 && (
              <label className="flex flex-col gap-1 text-xs text-ivory-muted">
                Quantas unidades voltam
                <input
                  type="number"
                  min={1}
                  max={aDesfazer.resta}
                  step={1}
                  value={quantidade}
                  onChange={(e) =>
                    setQuantidade(
                      Math.min(Math.max(Math.trunc(Number(e.target.value) || 0), 1), aDesfazer.resta)
                    )
                  }
                  className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-ivory"
                />
              </label>
            )}

            <label className="flex flex-col gap-1 text-xs text-ivory-muted">
              Por que está devolvendo *
              <input
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ex.: cliente devolveu o produto lacrado"
                className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-ivory"
              />
            </label>

            {/* Diz o que vai acontecer com os três fatos, antes de acontecer.
                O dono não deveria precisar descobrir no fechamento que a
                comissão do barbeiro também mudou. */}
            <div className="rounded-xl border border-border bg-surface-raised/60 p-3 text-xs text-ivory-muted">
              <p className="mb-1 font-semibold text-ivory">O que vai ser registrado</p>
              <p>· Devolução de {formatBRL(valorADevolver)} ao cliente</p>
              <p>· {quantidade} un. de volta no estoque</p>
              {aDesfazer.staffId && <p>· A comissão dessa parte sai do acerto do barbeiro</p>}
              <p className="mt-1.5 text-ivory-muted">
                A venda original continua no histórico — o estorno é um registro
                novo, não um apagamento.
              </p>
            </div>

            {erro && (
              <p role="alert" className="text-xs text-danger">
                {erro}
              </p>
            )}
          </div>
        )}
      </Modal>
    </section>
  );
}
