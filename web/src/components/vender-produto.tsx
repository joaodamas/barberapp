"use client";

import { useMemo, useState } from "react";
import { Check, Minus, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { CorrecaoDeVenda } from "@/components/corrigir-venda";
import { formatBRL } from "@/lib/format";
import { lerReais, reaisParaCampo } from "@/lib/reais";
import { estaArquivado } from "@/lib/produtos";
import { useTenant } from "@/lib/tenant-context";
import { useClients, useProducts, useStaff } from "@/lib/db/use-shop-data";
import { filtrarClientes } from "@/lib/clientes-busca";
import { mascararWhatsapp } from "@/lib/whatsapp-numero";
import { chaveDeIdempotencia } from "@/lib/chave-de-idempotencia";
import { mensagemDaFuncao } from "@/lib/mensagem-da-funcao";
import { formasAtivas, type FormaDePagamento } from "@/lib/formas-de-pagamento";
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

/** Preço combinado para uma linha, diferente do cadastro. */
type Combinado = { unitPrice: number; motivo: string };

const MOTIVO_DA_VENDA_ORIGINAL = "Preço da venda original (correção)";

/**
 * `inicial` é a VENDA CERTA de uma correção: o dono acabou de devolver o que
 * estava errado, e o Vender abre com os mesmos itens, preços e forma para ele
 * ajustar e confirmar. Monte com `key={inicial.nonce}` — o estado nasce da
 * correção, sem efeito que o copie depois.
 */
export function VenderProduto({
  aoVender,
  inicial = null,
}: {
  aoVender?: () => void;
  inicial?: CorrecaoDeVenda | null;
}) {
  const tenant = useTenant();
  const formasDeCobranca = formasAtivas(tenant.policies);
  const { items: produtos } = useProducts();
  const { items: clientes } = useClients();
  const { items: equipe } = useStaff();

  const [linhas, setLinhas] = useState<Linha[]>(() =>
    (inicial && !inicial.desistiu ? inicial.linhas : []).map((l) => ({
      productId: l.productId,
      quantity: l.quantity,
    }))
  );
  const [forma, setForma] = useState<FormaDePagamento | null>(() =>
    inicial
      ? (formasDeCobranca.find((f) => f.id === inicial.formaId) ??
        formasDeCobranca.find((f) => f.base === inicial.paymentMethod) ??
        null)
      : null
  );
  const metodo = forma?.base ?? null;
  const [vendedorClicado, setVendedorClicado] = useState<string | null>(inicial?.staffId ?? null);
  const [busca, setBusca] = useState("");
  const [clienteId, setClienteId] = useState<string | null>(inicial?.clientId ?? null);
  const cliente: Doc<ClientDoc> | null = clienteId
    ? (clientes.find((c) => c.id === clienteId) ?? null)
    : null;
  const [buscando, setBuscando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<{ itens: number; valor: number; corrigida: boolean } | null>(null);

  /* Preço combinado por produto (só o dono vende aqui). Nasce da correção com o
   * preço da venda original; o resto é decisão do dono, linha a linha. */
  const [combinados, setCombinados] = useState<Record<string, Combinado>>(() => {
    const mapa: Record<string, Combinado> = {};
    for (const l of inicial && !inicial.desistiu ? inicial.linhas : []) {
      mapa[l.productId] = { unitPrice: l.unitPrice, motivo: MOTIVO_DA_VENDA_ORIGINAL };
    }
    return mapa;
  });
  const [editandoPreco, setEditandoPreco] = useState<string | null>(null);
  const [rascunhoPreco, setRascunhoPreco] = useState("");
  const [rascunhoMotivo, setRascunhoMotivo] = useState("");
  const [erroDoPreco, setErroDoPreco] = useState<string | null>(null);

  /* A correção em andamento: devolução feita, venda certa por fazer. */
  const [correcaoAtiva, setCorrecaoAtiva] = useState(inicial !== null);
  const [desistiu, setDesistiu] = useState(inicial?.desistiu === true);

  /**
   * Chave de idempotência da tentativa atual.
   *
   * Nasce quando o carrinho começa e só muda quando a venda fecha. Toque duplo
   * no botão, ou um retry depois de a rede cair no meio, reusam a mesma chave e
   * o servidor devolve a venda original em vez de baixar o estoque de novo.
   */
  const [chave, setChave] = useState(chaveDeIdempotencia);

  /* Arquivado sai do Vender, mesmo com saldo. */
  const disponiveis = useMemo(
    () => produtos.filter((p) => (p.stock ?? 0) > 0 && !estaArquivado(p)),
    [produtos]
  );

  const noCarrinho = (id: string) => linhas.find((l) => l.productId === id)?.quantity ?? 0;

  function ajustar(id: string, delta: number) {
    setErro(null);
    /* A linha saiu do carrinho: o preço combinado sai com ela. */
    if (noCarrinho(id) + delta <= 0) voltarAoPrecoDeTabela(id);
    /* Carrinho novo, tentativa nova: o servidor recusa a mesma chave com outro
     * pedido. Só o retry do MESMO carrinho reaproveita a chave. */
    setChave(chaveDeIdempotencia());
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

  const itensDoCarrinho = linhas.map((l) => {
    const produto = produtos.find((p) => p.id === l.productId);
    const guardado = combinados[l.productId] ?? null;
    /* Igual ao cadastro não é preço combinado: nada a justificar nem a enviar. */
    const combinado = guardado && guardado.unitPrice !== produto?.price ? guardado : null;
    return {
      ...l,
      produto,
      combinado,
      /* O preço que a venda vai praticar: o combinado, ou o do cadastro. */
      preco: combinado?.unitPrice ?? produto?.price ?? 0,
    };
  });
  const totalItens = linhas.reduce((s, l) => s + l.quantity, 0);
  const totalValor = itensDoCarrinho.reduce((s, i) => s + i.preco * i.quantity, 0);

  const encontrados = useMemo(() => filtrarClientes(clientes, busca, 6), [clientes, busca]);

  /* Quem vendeu — Rodada 3.1.
   *
   * A comissão de produto virou fato, e todo fato precisa de beneficiário.
   * Antes ela era um agregado do mês derivado da política de hoje; agora nasce
   * na venda, congelada, e sem vendedor não nasce.
   *
   * Com um barbeiro só, o servidor não escolhe sozinho como faz no
   * agendamento: aqui a escolha tem consequência financeira direta no acerto
   * de alguém, e um padrão silencioso pagaria comissão para quem talvez não
   * tenha vendido. A tela pré-seleciona e deixa visível. */
  const ativos = useMemo(() => equipe.filter((b) => b.active !== false), [equipe]);
  const vendedorId =
    vendedorClicado && ativos.some((b) => b.id === vendedorClicado)
      ? vendedorClicado
      : ativos.length === 1
        ? ativos[0].id
        : null;

  /* Preço digitado e não aplicado não pode sair pelo preço de tabela sem
   * aviso: enquanto o editor estiver aberto, confirmar fica travado (teste de
   * 09/10 — a venda saiu por R$ 55 com R$ 50 escrito no campo). */
  const precoPendente = editandoPreco !== null;
  const podeConfirmar = linhas.length > 0 && metodo !== null && !precoPendente;

  function abrirPreco(id: string, precoAtual: number) {
    setEditandoPreco(id);
    setRascunhoPreco(reaisParaCampo(precoAtual));
    setRascunhoMotivo(combinados[id]?.motivo ?? "");
    setErroDoPreco(null);
  }

  function aplicarPreco(id: string, precoDeTabela: number) {
    const preco = lerReais(rascunhoPreco);
    if (preco === null || !(preco > 0)) {
      setErroDoPreco("Informe um preço maior que zero.");
      return;
    }
    setChave(chaveDeIdempotencia());
    if (preco === precoDeTabela) {
      /* Igual ao cadastro: não há o que justificar. */
      voltarAoPrecoDeTabela(id);
      setEditandoPreco(null);
      return;
    }
    if (rascunhoMotivo.trim().length < 3) {
      setErroDoPreco("Diga por que o preço é diferente (ex.: desconto combinado).");
      return;
    }
    setCombinados((c) => ({ ...c, [id]: { unitPrice: preco, motivo: rascunhoMotivo.trim() } }));
    setEditandoPreco(null);
  }

  function voltarAoPrecoDeTabela(id: string) {
    setChave(chaveDeIdempotencia());
    setCombinados((c) => {
      const resto = { ...c };
      delete resto[id];
      return resto;
    });
  }

  /* Desistir da correção NÃO desfaz a devolução — ela já aconteceu. Limpa o
   * carrinho e deixa o aviso com a saída à vista. */
  function descartarCorrecao() {
    setLinhas([]);
    setCombinados({});
    setEditandoPreco(null);
    setChave(chaveDeIdempotencia());
    setDesistiu(true);
  }

  function retomarCorrecao() {
    if (!inicial) return;
    setLinhas(inicial.linhas.map((l) => ({ productId: l.productId, quantity: l.quantity })));
    const mapa: Record<string, Combinado> = {};
    for (const l of inicial.linhas) {
      mapa[l.productId] = { unitPrice: l.unitPrice, motivo: MOTIVO_DA_VENDA_ORIGINAL };
    }
    setCombinados(mapa);
    setChave(chaveDeIdempotencia());
    setDesistiu(false);
  }

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
        itens: itensDoCarrinho.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          ...(i.combinado ? { unitPrice: i.combinado.unitPrice, priceReason: i.combinado.motivo } : {}),
        })),
        paymentMethod: metodo,
        paymentFormId: forma?.id ?? null,
        clientId: cliente?.id ?? null,
        staffId: vendedorId,
        idempotencyKey: chave,
      });

      setFeito({ itens: totalItens, valor: r.value, corrigida: correcaoAtiva });
      setCorrecaoAtiva(false);
      setDesistiu(false);
      setLinhas([]);
      setCombinados({});
      setEditandoPreco(null);
      setForma(null);
      setClienteId(null);
      setVendedorClicado(null);
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
      setErro(mensagemDaFuncao(err, "Não foi possível registrar a venda."));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ---- Correção de venda: a devolução já foi registrada ---- */}
      {inicial && correcaoAtiva && !desistiu && (
        <Card className="flex flex-col gap-2 border-gold/50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-gold-strong">
            Corrigindo uma venda
          </p>
          <p className="text-sm text-ink">
            A devolução de <span className="tabular-nums">{formatBRL(inicial.valorDevolvido)}</span> já
            está registrada. Ajuste os itens, o preço e a forma abaixo e confirme a venda certa. Se a correção era só tirar unidades, não precisa vender de novo: toque em “Não refazer agora”.
          </p>
          <div>
            <Button variant="ghost" size="sm" onClick={descartarCorrecao}>
              Não refazer agora
            </Button>
          </div>
        </Card>
      )}
      {inicial && correcaoAtiva && desistiu && (
        <Card role="alert" className="flex flex-col gap-2 border-danger/40 p-3">
          <p className="text-sm text-ink">
            A devolução de <span className="tabular-nums">{formatBRL(inicial.valorDevolvido)}</span> continua
            registrada: o dinheiro e as unidades já voltaram. A venda certa ainda NÃO foi feita.
          </p>
          <div>
            <Button size="sm" onClick={retomarCorrecao}>
              Registrar a venda certa agora
            </Button>
          </div>
        </Card>
      )}

      {/* ---- Produtos ---- */}
      <section className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-muted md:text-sm">
            Vender
          </h2>
          {produtos.length > 0 && disponiveis.length === 0 && (
            <span className="text-xs text-danger">Tudo sem estoque</span>
          )}
        </div>

        {disponiveis.length === 0 ? (
          <Card className="p-4">
            <p className="text-sm text-ink-muted">
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
                    <p className="truncate text-sm text-ink">{p.name}</p>
                    <p className="text-xs text-ink-muted">
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
                      <span className="w-8 text-center font-display text-base text-ink">
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
            <span className="text-sm text-ink-muted">
              {totalItens} {totalItens === 1 ? "produto" : "produtos"}
            </span>
            <span className="font-display text-xl font-semibold tabular-nums text-ink">
              {formatBRL(totalValor)}
            </span>
          </div>

          {/* O preço de cada linha. Combinar outro preço (desconto na hora) é do
              dono e pede motivo; o preço fica congelado na venda. */}
          <ul className="flex flex-col divide-y divide-border">
            {itensDoCarrinho.map((i) => (
              <li key={i.productId} className="flex flex-col gap-1.5 py-2">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate text-ink">
                    {i.quantity}× {i.produto?.name ?? "Produto"}
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    <span className="tabular-nums text-ink-muted">{formatBRL(i.preco)} cada</span>
                    {editandoPreco !== i.productId && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => abrirPreco(i.productId, i.preco)}
                      >
                        Mudar preço
                      </Button>
                    )}
                  </span>
                </div>
                {i.combinado && editandoPreco !== i.productId && (
                  <p className="flex flex-wrap items-center gap-x-2 text-[11px] text-ink-muted">
                    <span>
                      Tabela hoje {formatBRL(i.produto?.price ?? 0)} · {i.combinado.motivo}
                    </span>
                    <button
                      type="button"
                      onClick={() => voltarAoPrecoDeTabela(i.productId)}
                      className="alvo-toque cursor-pointer text-gold-strong underline"
                    >
                      Usar o preço de tabela
                    </button>
                  </p>
                )}
                {editandoPreco === i.productId && (
                  <div className="flex flex-col gap-1.5">
                    <div className="grid grid-cols-[7rem_1fr] gap-2">
                      <input
                        autoFocus
                        inputMode="decimal"
                        value={rascunhoPreco}
                        onChange={(e) => {
                          setRascunhoPreco(e.target.value.replace(/[^\d.,]/g, ""));
                          setErroDoPreco(null);
                        }}
                        aria-label="Preço por unidade"
                        className="min-h-11 rounded-xl border border-border bg-surface px-3 text-sm tabular-nums text-ink"
                      />
                      <input
                        value={rascunhoMotivo}
                        onChange={(e) => {
                          setRascunhoMotivo(e.target.value);
                          setErroDoPreco(null);
                        }}
                        maxLength={120}
                        placeholder="Motivo (ex.: desconto combinado)"
                        aria-label="Motivo do preço diferente"
                        className="min-h-11 rounded-xl border border-border bg-surface px-3 text-sm text-ink"
                      />
                    </div>
                    {erroDoPreco && (
                      <p role="alert" className="text-xs text-danger">
                        {erroDoPreco}
                      </p>
                    )}
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setEditandoPreco(null)}
                      >
                        Cancelar
                      </Button>
                      <Button size="sm" onClick={() => aplicarPreco(i.productId, i.produto?.price ?? 0)}>
                        Aplicar preço
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>

          {/* Cliente — opcional, e a tela diz isso */}
          <div className="flex flex-col gap-1.5">
            <p className="text-[11px] uppercase tracking-wide text-ink-muted">
              Cliente <span className="normal-case tracking-normal">(opcional)</span>
            </p>
            {cliente ? (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-gold/60 bg-gold/5 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink">{cliente.name}</p>
                  <p className="text-[11px] text-ink-muted">
                    {cliente.whatsapp ? mascararWhatsapp(cliente.whatsapp) : "sem WhatsApp"}
                  </p>
                </div>
                <Button variant="ghost" onClick={() => { setClienteId(null); setChave(chaveDeIdempotencia()); }}>
                  Tirar
                </Button>
              </div>
            ) : buscando ? (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3">
                  <Search size={14} className="text-ink-muted" />
                  <input
                    autoFocus
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Nome ou WhatsApp"
                    className="min-h-11 flex-1 bg-transparent text-sm text-ink placeholder:text-ink-muted"
                  />
                </div>
                {encontrados.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setClienteId(c.id);
                      setChave(chaveDeIdempotencia());
                      setBuscando(false);
                    }}
                    className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-left transition-colors hover:border-gold/60"
                  >
                    <span className="text-sm text-ink">{c.name}</span>
                    <span className="text-[11px] text-ink-muted">
                      {c.whatsapp ? mascararWhatsapp(c.whatsapp) : "—"}
                    </span>
                  </button>
                ))}
                {busca && encontrados.length === 0 && (
                  <p className="px-1 text-xs text-ink-muted">
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

          {/* Vendedor — define de quem é a comissão */}
          {ativos.length > 1 && (
            <div className="flex flex-col gap-1.5">
              <p className="text-[11px] uppercase tracking-wide text-ink-muted">
                Quem vendeu <span className="normal-case tracking-normal">(opcional)</span>
              </p>
              <div className="flex flex-wrap gap-1.5">
                {ativos.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    aria-pressed={vendedorId === b.id}
                    onClick={() => { setVendedorClicado(vendedorId === b.id ? null : b.id); setChave(chaveDeIdempotencia()); }}
                    className={
                      "min-h-11 rounded-xl border px-3 text-sm transition-colors " +
                      (vendedorId === b.id
                        ? "border-gold bg-gold/10 text-ink"
                        : "border-border text-ink-muted hover:border-gold/60")
                    }
                  >
                    {b.name}
                  </button>
                ))}
              </div>
              {/* Diz a consequência de deixar em branco, em vez de deixar o dono
                  descobrir no acerto do fim do mês. */}
              {!vendedorId && (
                <p className="text-[11px] text-ink-muted">
                  Sem indicar quem vendeu, a venda não gera comissão.
                </p>
              )}
            </div>
          )}

          {/* Pagamento — obrigatório, e o motivo está no comentário */}
          <div className="flex flex-col gap-1.5">
            <p className="text-[11px] uppercase tracking-wide text-ink-muted">Pagamento</p>
            {/* Débito e crédito SEPARADOS, e não um "Cartão" só.
                Juntá-los obrigaria a supor crédito no cálculo da taxa por
                precaução, superestimando o custo do débito em 1,5 ponto — foi
                exatamente por isso que `PaymentMethod` deixou de ser
                `"pix" | "cartao" | "local"`. Um botão a mais aqui é o preço de
                a taxa ser a que a maquininha cobrou. */}
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {formasDeCobranca.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={forma?.id === f.id}
                  onClick={() => {
                    setForma(f);
                    setChave(chaveDeIdempotencia());
                    setErro(null);
                  }}
                  className={
                    "min-h-11 rounded-xl border px-2 text-sm transition-colors " +
                    (forma?.id === f.id
                      ? "border-gold bg-gold/10 text-ink"
                      : "border-border text-ink-muted hover:border-gold/60")
                  }
                >
                  {f.label}
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
              : precoPendente
                ? "Aplique ou cancele o preço antes de confirmar"
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
          <p className="text-sm text-ink">
            {feito.corrigida ? "Venda corrigida: venda certa de " : "Venda de "}
            {formatBRL(feito.valor)} registrada. O estoque já foi baixado.
          </p>
        </Card>
      )}
    </div>
  );
}
