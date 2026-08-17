"use client";

import { useMemo, useState } from "react";
import { Check, Minus, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatBRL } from "@/lib/format";
import { useTenant } from "@/lib/tenant-context";
import { useClients, useProducts } from "@/lib/db/use-shop-data";
import { filtrarClientes } from "@/lib/clientes-busca";
import { mascararWhatsapp } from "@/lib/whatsapp-numero";
import { chaveDeIdempotencia } from "@/lib/chave-de-idempotencia";
import { PAYMENT_METHODS, paymentMethodLabel } from "@/lib/payment-method";
import type { PaymentMethod } from "@/lib/types";
import type { Doc } from "@/lib/db/repository";
import type { ClientDoc } from "@/lib/domain";

/**
 * G1 — a venda de produto.
 *
 * ## A régua desta tela
 *
 * O dono não pensa em `inventory_movements`. Ele pensa: *"o cara levou uma
 * pomada, pagou no Pix"*. A tela precisa ter exatamente esse formato — produto,
 * quantidade, pagamento — e o sistema carrega o resto.
 *
 * Por isso não há campo de preço, nem de custo, nem de data: os três vêm do
 * catálogo e do relógio, no servidor, e deixá-los editáveis aqui seria abrir a
 * porta para digitar receita.
 *
 * ## Uma venda, várias linhas
 *
 * O carrinho é uma venda só, e ela é **atômica**: se o segundo produto não tem
 * estoque, o primeiro também não baixa. Vender item a item deixaria o dono com
 * meia venda registrada e o estoque errado — e ele só descobriria na contagem.
 *
 * ## O que esta tela NÃO decide
 *
 * Nada de financeiro. A venda grava o fato — produto, quantidade, custo
 * congelado, meio de pagamento, cliente. Como esse fato vira CMV, taxa de
 * maquininha e caixa por meio de pagamento é a Rodada 3, e continua
 * deliberadamente errado enquanto isso.
 */

type Linha = { productId: string; quantity: number };

export function VenderProduto({ aoVender }: { aoVender?: () => void }) {
  const tenant = useTenant();
  const { items: produtos } = useProducts();
  const { items: clientes } = useClients();

  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [metodo, setMetodo] = useState<PaymentMethod | null>(null);
  const [busca, setBusca] = useState("");
  const [cliente, setCliente] = useState<Doc<ClientDoc> | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<{ itens: number; valor: number } | null>(null);

  /**
   * Chave de idempotência da tentativa atual.
   *
   * Nasce quando o carrinho começa e só muda quando a venda fecha. Toque duplo
   * no botão, ou um retry depois de a rede cair no meio, reusam a mesma chave e
   * o servidor devolve a venda original em vez de baixar o estoque de novo.
   */
  const [chave, setChave] = useState(chaveDeIdempotencia);

  const disponiveis = useMemo(
    () => produtos.filter((p) => (p.stock ?? 0) > 0),
    [produtos]
  );

  const noCarrinho = (id: string) => linhas.find((l) => l.productId === id)?.quantity ?? 0;

  function ajustar(id: string, delta: number) {
    setErro(null);
    setLinhas((atual) => {
      const existente = atual.find((l) => l.productId === id);
      const produto = produtos.find((p) => p.id === id);
      const teto = produto?.stock ?? 0;
      const nova = Math.min(Math.max((existente?.quantity ?? 0) + delta, 0), teto);

      if (nova === 0) return atual.filter((l) => l.productId !== id);
      if (existente) {
        return atual.map((l) => (l.productId === id ? { ...l, quantity: nova } : l));
      }
      return [...atual, { productId: id, quantity: nova }];
    });
  }

  const itensDoCarrinho = linhas.map((l) => ({
    ...l,
    produto: produtos.find((p) => p.id === l.productId),
  }));
  const totalItens = linhas.reduce((s, l) => s + l.quantity, 0);
  const totalValor = itensDoCarrinho.reduce(
    (s, i) => s + (i.produto?.price ?? 0) * i.quantity,
    0
  );

  const encontrados = useMemo(() => filtrarClientes(clientes, busca, 6), [clientes, busca]);
  const podeConfirmar = linhas.length > 0 && metodo !== null;

  async function confirmar() {
    if (!podeConfirmar || !metodo) return;
    setSalvando(true);
    setErro(null);
    try {
      const { callFunction } = await import("@/lib/firebase");
      const r = await callFunction<
        Record<string, unknown>,
        { value: number; movementIds: string[] }
      >("registrarVendaDeProduto", {
        barbershopId: tenant.id,
        itens: linhas,
        paymentMethod: metodo,
        clientId: cliente?.id ?? null,
        idempotencyKey: chave,
      });

      setFeito({ itens: totalItens, valor: r.value });
      setLinhas([]);
      setMetodo(null);
      setCliente(null);
      setBusca("");
      setBuscando(false);
      /* Chave nova só DEPOIS do sucesso: se a venda falhar e o dono tentar de
       * novo, é a mesma tentativa e a mesma chave — o servidor não pode gravar
       * duas vezes o que o dono entende como uma venda. */
      setChave(chaveDeIdempotencia());
      aoVender?.();
    } catch (err) {
      /* O erro do servidor aparece COMO VEIO: ele diz qual produto ficou sem
       * estoque, e é isso que o dono precisa saber para tirar do carrinho. */
      setErro((err as { message?: string })?.message ?? "Não foi possível registrar a venda.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ---- Produtos ---- */}
      <section className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ivory-muted md:text-sm">
            Vender
          </h2>
          {produtos.length > 0 && disponiveis.length === 0 && (
            <span className="text-xs text-danger">Tudo sem estoque</span>
          )}
        </div>

        {disponiveis.length === 0 ? (
          <Card className="p-4">
            <p className="text-sm text-ivory-muted">
              {produtos.length === 0
                ? "Cadastre um produto abaixo para começar a vender."
                : "Nenhum produto com estoque. Registre a reposição para voltar a vender."}
            </p>
          </Card>
        ) : (
          <div className="flex flex-col gap-1.5">
            {disponiveis.map((p) => {
              const qtd = noCarrinho(p.id);
              const noLimite = qtd >= (p.stock ?? 0);
              return (
                <Card
                  key={p.id}
                  className={
                    "flex items-center justify-between gap-3 p-3 transition-colors " +
                    (qtd > 0 ? "border-gold" : "")
                  }
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-ivory">{p.name}</p>
                    <p className="text-xs text-ivory-muted">
                      {formatBRL(p.price ?? 0)} · estoque {p.stock ?? 0}
                    </p>
                  </div>

                  {qtd === 0 ? (
                    <Button
                      variant="secondary"
                      onClick={() => ajustar(p.id, 1)}
                      aria-label={`Adicionar ${p.name}`}
                      className="min-h-10 shrink-0 px-3"
                    >
                      <Plus size={16} />
                    </Button>
                  ) : (
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="secondary"
                        onClick={() => ajustar(p.id, -1)}
                        aria-label={`Tirar um ${p.name}`}
                        className="min-h-10 px-3"
                      >
                        <Minus size={16} />
                      </Button>
                      <span className="w-8 text-center font-display text-base text-ivory">
                        {qtd}
                      </span>
                      <Button
                        variant="secondary"
                        onClick={() => ajustar(p.id, 1)}
                        disabled={noLimite}
                        aria-label={`Adicionar ${p.name}`}
                        className="min-h-10 px-3"
                      >
                        <Plus size={16} />
                      </Button>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* ---- A venda ---- */}
      {linhas.length > 0 && (
        <Card className="flex flex-col gap-4 p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-ivory-muted">
              {totalItens} {totalItens === 1 ? "produto" : "produtos"}
            </span>
            <span className="font-display text-xl font-semibold text-ivory">
              {formatBRL(totalValor)}
            </span>
          </div>

          {/* Cliente — opcional, e a tela diz isso */}
          <div className="flex flex-col gap-1.5">
            <p className="text-[11px] uppercase tracking-wide text-ivory-muted">
              Cliente <span className="normal-case tracking-normal">(opcional)</span>
            </p>
            {cliente ? (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-gold/60 bg-gold/5 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm text-ivory">{cliente.name}</p>
                  <p className="text-[11px] text-ivory-muted">
                    {cliente.whatsapp ? mascararWhatsapp(cliente.whatsapp) : "sem WhatsApp"}
                  </p>
                </div>
                <Button variant="ghost" onClick={() => setCliente(null)}>
                  Tirar
                </Button>
              </div>
            ) : buscando ? (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3">
                  <Search size={14} className="text-ivory-muted" />
                  <input
                    autoFocus
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Nome ou WhatsApp"
                    className="min-h-11 flex-1 bg-transparent text-sm text-ivory placeholder:text-ivory-muted"
                  />
                </div>
                {encontrados.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setCliente(c);
                      setBuscando(false);
                    }}
                    className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-left transition-colors hover:border-gold/60"
                  >
                    <span className="text-sm text-ivory">{c.name}</span>
                    <span className="text-[11px] text-ivory-muted">
                      {c.whatsapp ? mascararWhatsapp(c.whatsapp) : "—"}
                    </span>
                  </button>
                ))}
                {busca && encontrados.length === 0 && (
                  <p className="px-1 text-xs text-ivory-muted">
                    Ninguém com esse nome ou número. A venda pode ser registrada sem cliente.
                  </p>
                )}
              </div>
            ) : (
              <Button variant="secondary" onClick={() => setBuscando(true)}>
                Identificar cliente
              </Button>
            )}
          </div>

          {/* Pagamento — obrigatório, e o motivo está no comentário */}
          <div className="flex flex-col gap-1.5">
            <p className="text-[11px] uppercase tracking-wide text-ivory-muted">Pagamento</p>
            {/* Débito e crédito SEPARADOS, e não um "Cartão" só.
                Juntá-los obrigaria a supor crédito no cálculo da taxa por
                precaução, superestimando o custo do débito em 1,5 ponto — foi
                exatamente por isso que `PaymentMethod` deixou de ser
                `"pix" | "cartao" | "local"`. Um botão a mais aqui é o preço de
                a taxa ser a que a maquininha cobrou. */}
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              {PAYMENT_METHODS.map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={metodo === m}
                  onClick={() => {
                    setMetodo(m);
                    setErro(null);
                  }}
                  className={
                    "min-h-11 rounded-xl border text-sm transition-colors " +
                    (metodo === m
                      ? "border-gold bg-gold/10 text-ivory"
                      : "border-border text-ivory-muted hover:border-gold/60")
                  }
                >
                  {paymentMethodLabel[m]}
                </button>
              ))}
            </div>
          </div>

          {erro && (
            <p role="alert" className="text-xs text-danger">
              {erro}
            </p>
          )}

          <Button onClick={confirmar} disabled={!podeConfirmar || salvando}>
            {salvando
              ? "Registrando…"
              : metodo
                ? `Confirmar venda · ${formatBRL(totalValor)}`
                : "Escolha como o cliente pagou"}
          </Button>
        </Card>
      )}

      {/* ---- Confirmação ---- */}
      {feito && linhas.length === 0 && (
        <Card className="flex items-center gap-3 border-success/40 bg-success/5 p-3">
          <Check size={18} className="shrink-0 text-success" />
          <p className="text-sm text-ivory">
            Venda de {formatBRL(feito.valor)} registrada. O estoque já foi baixado.
          </p>
        </Card>
      )}
    </div>
  );
}
