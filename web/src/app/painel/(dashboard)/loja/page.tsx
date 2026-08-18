"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Package, Percent, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { Modal } from "@/components/ui/modal";
import { formatBRL } from "@/lib/format";
import { useProducts } from "@/lib/db/use-shop-data";
import { useFeature, useTenant } from "@/lib/tenant-context";
import { RecursoBloqueado } from "@/components/recurso-bloqueado";
import { VenderProduto } from "@/components/vender-produto";
import { EntradaDeEstoque } from "@/components/entrada-de-estoque";
import { DesfazerVenda } from "@/components/desfazer-venda";
import { createDoc } from "@/lib/db/repository";
import type { Doc } from "@/lib/db/repository";
import type { ProductDoc } from "@/lib/domain";
import { EmptyState, LoadingRows } from "@/components/ui/empty-state";
import { ErroAoCarregar } from "@/components/ui/erro-ao-carregar";
import { splitSale } from "@/lib/business-rules";

/* `profitPct` é margem sobre o PREÇO de venda (preço = custo ÷ (1 − m)), não
 * markup sobre o custo. 100% seria divisão por zero: limitamos e avisamos, em
 * vez de exibir "R$ 0,00" em silêncio. */
const MAX_PROFIT_PCT = 95;

const emptyForm = {
  name: "",
  cost: "",
  profitPct: "30",
  stock: "",
  minStock: "5",
};

/* O gate mora num componente à parte, e não num retorno antecipado dentro do
 * conteúdo: os hooks do conteúdo passariam a ser chamados condicionalmente. */
export default function LojaPage() {
  const liberado = useFeature("store");

  if (!liberado) {
    return (
      <RecursoBloqueado
        titulo="Loja"
        oQueFaz="Cadastra o que você revende, calcula preço de venda a partir do custo e acompanha o estoque com aviso de mínimo."
        porQueVale="Pomada e shampoo têm margem melhor que corte e não ocupam cadeira. Sem controle, o que some do balcão some do caixa sem aparecer."
      />
    );
  }

  return <LojaConteudo />;
}

function LojaConteudo() {
  const { id: barbershopId, policies } = useTenant();
  /* P1-7 · do tenant, não da constante da plataforma.
   *
   * A tela de Equipe já lia daqui; a Loja continuava anunciando os 40% padrão
   * a quem tinha combinado outro. A Rodada 3.1 tornou isso indefensável: a
   * comissão de produto agora nasce congelada com o percentual DO BARBEIRO, e
   * o simulador estava prometendo um número que venda nenhuma produzia. */
  const padraoDaCasa = policies.commissionSplit.barberPct;
  const impostoDaCasa = policies.taxRatePct;
  const { items: products, status } = useProducts();
  const [simPrice, setSimPrice] = useState(45);
  const [simCost, setSimCost] = useState(18);
  const [modalOpen, setModalOpen] = useState(false);
  const [aReceber, setAReceber] = useState<Doc<ProductDoc> | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);

  const lowStock = products.filter((p) => p.stock < p.minStock);

  const simSplit = useMemo(
    () => splitSale({ price: simPrice, cost: simCost, barberPct: padraoDaCasa, taxPct: impostoDaCasa }),
    [simPrice, simCost, padraoDaCasa, impostoDaCasa]
  );

  const preview = useMemo(() => {
    const cost = Math.max(Number(form.cost) || 0, 0);
    const rawPct = Number(form.profitPct) || 0;
    const profitPct = Math.min(Math.max(rawPct, 0), MAX_PROFIT_PCT);
    const clamped = rawPct !== profitPct;
    const price = cost / (1 - profitPct / 100);
    const split = splitSale({ price, cost, barberPct: padraoDaCasa, taxPct: impostoDaCasa });
    return { cost, price, profitPct, clamped, ...split, netProfit: split.shopProfit };
  }, [form.cost, form.profitPct, padraoDaCasa, impostoDaCasa]);

  function openModal() {
    setForm(emptyForm);
    setFormError(null);
    setModalOpen(true);
  }

  function saveProduct() {
    // O clique não fazia nada e nenhuma mensagem aparecia.
    if (!form.name.trim()) {
      setFormError("Informe o nome do produto.");
      return;
    }
    if (!(Number(form.cost) > 0)) {
      setFormError("Informe um custo unitário maior que zero.");
      return;
    }
    setFormError(null);
    void createDoc(barbershopId, "products", {
      name: form.name.trim(),
      cost: preview.cost,
      price: Math.round(preview.price * 100) / 100,
      stock: Number(form.stock) || 0,
      minStock: Number(form.minStock) || 0,
    }).catch((err) => {
      console.error("[loja] falha ao cadastrar", err);
      setFormError("Não foi possível cadastrar. Tente de novo.");
    });
    setModalOpen(false);
  }

  return (
    <div className="flex flex-col gap-6 pt-1 md:gap-10 md:pt-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-ivory-muted md:text-base">Catálogo</p>
          <h1 className="text-xl text-ivory md:text-4xl md:tracking-tight">Loja</h1>
        </div>
        <Button onClick={openModal}>
          <Plus size={16} />
          Adicionar produto
        </Button>
      </div>

      {/* G1 · vender vem ANTES do catálogo.
          O dono abre a Loja com alguém no balcão esperando, não para conferir
          margem. Cadastrar produto é tarefa de quando a caixa chega; vender é
          o gesto do dia — e o que ele faz primeiro precisa estar em cima. */}
      <VenderProduto />

      {/* D23 · logo abaixo de vender, porque é onde o erro é percebido.
          Quem registrou a venda errada descobre segundos depois, ainda com o
          cliente na frente — e não no fechamento do mês. */}
      <DesfazerVenda />

      <EntradaDeEstoque produto={aReceber} aoFechar={() => setAReceber(null)} />

      {lowStock.length > 0 && (
        <Card className="flex items-start gap-3 border-danger/30 md:p-5">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-danger" />
          <div>
            <p className="text-sm text-ivory md:text-base">
              {lowStock.length} produto(s) abaixo do estoque mínimo
            </p>
            <p className="text-xs text-ivory-muted md:text-sm">
              {lowStock.map((p) => p.name).join(", ")}
            </p>
          </div>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-[1.4fr_1fr] md:gap-8">
        <section>
          <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ivory-muted md:mb-3 md:text-sm">
            <Package size={12} /> Produtos
          </h2>
          {status === "carregando" && <LoadingRows rows={3} />}
          {status === "erro" && <ErroAoCarregar oQue="seus produtos" />}
          {status === "pronto" && products.length === 0 && (
            <EmptyState
              icon={Package}
              title="Nenhum produto cadastrado"
              description="Cadastre o que você revende. O sistema calcula preço de venda, comissão e imposto a partir do custo."
              actionLabel="Adicionar produto"
              onAction={openModal}
            />
          )}
          {products.length > 0 && (
          <Card className="flex flex-col gap-3 md:gap-4 md:p-6">
            {products.map((p) => {
              const belowMin = p.stock < p.minStock;
              const margin = p.price - p.cost;
              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-3 border-b border-border pb-3 last:border-0 last:pb-0 md:pb-4"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-ivory md:text-base">{p.name}</p>
                    <p className="text-xs text-ivory-muted md:text-sm">
                      Custo {formatBRL(p.cost)} · Venda {formatBRL(p.price)} ·
                      margem {formatBRL(margin)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Pill tone={belowMin ? "danger" : "neutral"}>
                      {p.stock} un.
                    </Pill>
                    {/* G1.5 · a entrada mora AQUI, ao lado do estoque.
                        É onde o dono olha quando a caixa chega — e onde ele
                        antes editava o número na mão, sem custo nem data. */}
                    <Button
                      variant="secondary"
                      onClick={() => setAReceber(p)}
                      className="min-h-9 px-3 text-xs"
                    >
                      Dar entrada
                    </Button>
                  </div>
                </div>
              );
            })}
          </Card>
          )}
        </section>

        <section>
          <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ivory-muted md:mb-3 md:text-sm">
            <Percent size={12} /> Simulador rápido de comissão
          </h2>
          <Card className="flex flex-col gap-3 md:gap-4 md:p-6">
            <label className="flex flex-col gap-1 text-xs text-ivory-muted md:text-sm">
              Preço de venda
              <input
                type="number"
                min={0}
                step="0.01"
                /* `value={0}` renderiza o texto "0" no campo, e digitar depois
                 * dele produz "059,90" — o zero não sai porque ele não é
                 * placeholder, é conteúdo. Zero vira string vazia; o
                 * placeholder faz o papel visual que o zero fazia mal. */
                value={simPrice || ""}
                placeholder="0,00"
                onChange={(e) => setSimPrice(Number(e.target.value) || 0)}
                className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-ivory md:py-2.5 md:text-base"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-ivory-muted md:text-sm">
              Custo do produto
              <input
                type="number"
                min={0}
                step="0.01"
                value={simCost || ""}
                placeholder="0,00"
                onChange={(e) => setSimCost(Number(e.target.value) || 0)}
                className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-ivory md:py-2.5 md:text-base"
              />
            </label>
            <div className="flex items-center justify-between border-t border-border pt-3 text-sm md:text-base">
              <span className="text-ivory-muted">
                Comissão do profissional ({padraoDaCasa}% do lucro)
              </span>
              <span className="font-display font-semibold text-gold-light md:text-lg">
                {formatBRL(simSplit.commission)}
              </span>
            </div>
            {/* O simulador projeta com o padrão da casa, mas a comissão real
                nasce com o percentual de quem vendeu. Dizer isso aqui custa
                uma linha; deixar o dono descobrir no acerto custa a confiança
                dele na tela. */}
            <p className="text-xs text-ivory-muted md:text-sm">
              Rateio sobre o lucro da venda, não sobre o preço cheio. Usa o
              padrão da casa — quem tem percentual próprio na Equipe recebe o
              dele.
            </p>
          </Card>
        </section>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Novo Produto"
        className="max-w-xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={saveProduct}>Cadastrar produto</Button>
          </>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-ivory-muted md:col-span-2">
            Nome do produto *
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Ex: Cera modeladora"
              className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-ivory"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-ivory-muted">
            Custo unitário (R$) *
            <input
              type="number"
              min={0}
              step="0.01"
              value={form.cost}
              onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))}
              placeholder="0"
              className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-ivory"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-ivory-muted">
            Margem sobre o preço de venda (%)
            <input
              type="number"
              min={0}
              max={MAX_PROFIT_PCT}
              value={form.profitPct}
              onChange={(e) => setForm((f) => ({ ...f, profitPct: e.target.value }))}
              className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-ivory"
            />
            <span className="text-[11px] text-ivory-muted">
              preço = custo ÷ (1 − margem). Não é markup sobre o custo.
            </span>
          </label>

          <label className="flex flex-col gap-1 text-xs text-ivory-muted">
            Estoque inicial (un.)
            <input
              type="number"
              min={0}
              value={form.stock}
              onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))}
              placeholder="0"
              className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-ivory"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-ivory-muted">
            Estoque mínimo (un.)
            <input
              type="number"
              min={0}
              value={form.minStock}
              onChange={(e) => setForm((f) => ({ ...f, minStock: e.target.value }))}
              className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-ivory"
            />
          </label>
        </div>

        <div className="mt-4 flex flex-col gap-2 rounded-xl border border-border bg-surface-raised/60 p-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gold-light">
            <Percent size={12} /> Prévia de precificação
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <Row label="Custo unitário" value={formatBRL(preview.cost)} />
            <Row label="Preço de venda" value={formatBRL(preview.price)} strong />
            <Row label="Lucro bruto" value={formatBRL(preview.grossProfit)} />
            <Row
              label={`Comissão do profissional (${padraoDaCasa}%)`}
              value={`− ${formatBRL(preview.commission)}`}
              tone="danger"
            />
            <Row
              label={`Imposto (${impostoDaCasa}%)`}
              value={`− ${formatBRL(preview.tax)}`}
              tone="danger"
            />
            {/* A sobra é derivada do que ficou, não de um `shopPct` guardado à
                parte: os dois números sairiam do mesmo lugar e poderiam
                divergir se o percentual do barbeiro viesse do tenant e o da
                casa não. */}
            <Row
              label={`Sobra da barbearia (${100 - padraoDaCasa}% − imposto)`}
              value={formatBRL(preview.shopProfit)}
              tone="success"
              strong
            />
          </div>
          {preview.clamped && (
            <p className="text-xs text-danger">
              A margem foi limitada a {MAX_PROFIT_PCT}% — 100% seria divisão por zero.
            </p>
          )}
        </div>

        {formError && (
          <p role="alert" className="mt-3 text-xs text-danger">
            {formError}
          </p>
        )}
      </Modal>

    </div>
  );
}

function Row({
  label,
  value,
  tone,
  strong,
}: {
  label: string;
  value: string;
  tone?: "success" | "danger";
  strong?: boolean;
}) {
  const valueClass = tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "text-ivory";
  return (
    <div className="flex flex-col">
      <span className="text-xs text-ivory-muted">{label}</span>
      <span className={`${strong ? "font-display font-semibold" : "font-medium"} ${valueClass}`}>
        {value}
      </span>
    </div>
  );
}
