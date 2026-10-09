"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, Package, Percent, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { Modal } from "@/components/ui/modal";
import { formatBRL } from "@/lib/format";
import { contar } from "@/lib/plural";
import { lerPercentual, lerReais, VALOR_ILEGIVEL } from "@/lib/reais";
import { useProducts } from "@/lib/db/use-shop-data";
import { useFeature, useTenant } from "@/lib/tenant-context";
import { RecursoBloqueado } from "@/components/recurso-bloqueado";
import { VenderProduto } from "@/components/vender-produto";
import { EntradaDeEstoque } from "@/components/entrada-de-estoque";
import { AjustarEstoque } from "@/components/ajustar-estoque";
import { EditarProduto } from "@/components/editar-produto";
import { HistoricoDoProduto } from "@/components/historico-do-produto";
import { DesfazerVenda } from "@/components/desfazer-venda";
import type { CorrecaoDeVenda } from "@/components/corrigir-venda";
import { soAvisaSeGravou } from "@/lib/so-avisa-se-gravou";
import { createDoc, patchDoc } from "@/lib/db/repository";
import type { Doc } from "@/lib/db/repository";
import type { ProductDoc } from "@/lib/domain";
import { EmptyState, LoadingRows } from "@/components/ui/empty-state";
import { ErroAoCarregar } from "@/components/ui/erro-ao-carregar";
import { splitSale } from "@/lib/business-rules";
import { pedeConfirmacaoParaArquivar, separarArquivados } from "@/lib/produtos";

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
  const { items: products, status, error } = useProducts();
  /* Texto cru: ler a cada tecla com Number() perdia a vírgula ("27,5"). */
  const [simPriceTxt, setSimPriceTxt] = useState("45");
  const simPrice = lerReais(simPriceTxt) ?? 0;
  const [simCostTxt, setSimCostTxt] = useState("18");
  const simCost = lerReais(simCostTxt) ?? 0;
  const [modalOpen, setModalOpen] = useState(false);
  const [aReceber, setAReceber] = useState<Doc<ProductDoc> | null>(null);
  const [aAjustar, setAAjustar] = useState<Doc<ProductDoc> | null>(null);
  const [aEditar, setAEditar] = useState<Doc<ProductDoc> | null>(null);
  const [historicoDe, setHistoricoDe] = useState<Doc<ProductDoc> | null>(null);
  const [aArquivar, setAArquivar] = useState<Doc<ProductDoc> | null>(null);
  const [arquivadosAbertos, setArquivadosAbertos] = useState(false);
  const [avisoDeErro, setAvisoDeErro] = useState<string | null>(null);
  /* A venda certa de uma correção: remonta o Vender já preenchido. */
  const [correcao, setCorrecao] = useState<CorrecaoDeVenda | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);

  const { ativos, arquivados } = useMemo(() => separarArquivados(products), [products]);
  /* Arquivado não pede reposição: o aviso de mínimo é do que está à venda. */
  const lowStock = ativos.filter((p) => p.stock < p.minStock);

  const simSplit = useMemo(
    () => splitSale({ price: simPrice, cost: simCost, barberPct: padraoDaCasa, taxPct: impostoDaCasa }),
    [simPrice, simCost, padraoDaCasa, impostoDaCasa]
  );

  const preview = useMemo(() => {
    const cost = Math.max(lerReais(form.cost) ?? 0, 0);
    const rawPct = lerPercentual(form.profitPct) ?? 0;
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

  async function saveProduct() {
    // O clique não fazia nada e nenhuma mensagem aparecia.
    if (!form.name.trim()) {
      setFormError("Informe o nome do produto.");
      return;
    }
    if (form.cost.trim() !== "" && lerReais(form.cost) === null) {
      setFormError(VALOR_ILEGIVEL);
      return;
    }
    if (!((lerReais(form.cost) ?? 0) > 0)) {
      setFormError("Informe um custo unitário maior que zero.");
      return;
    }
    setFormError(null);
    /* Grava primeiro; fecha depois. O modal fechava na mesma linha em que a
     * escrita saía, e o erro caía num modal já fechado — o dono via o produto
     * "cadastrado" e ele não existia (o padrão "dispara e esquece" do
     * HANDOFF §3.1, achado na rodada E2E de 23/09). */
    const r = await soAvisaSeGravou({
      gravar: () =>
        createDoc(barbershopId, "products", {
          name: form.name.trim(),
          cost: preview.cost,
          price: Math.round(preview.price * 100) / 100,
          stock: Number(form.stock) || 0,
          minStock: Number(form.minStock) || 0,
        }),
      avisar: () => setModalOpen(false),
    });
    if (!r.ok) setFormError(r.erro);
  }

  /* Arquivar e reativar mudam só a flag. Nunca se exclui produto: ele tem
   * vendas, movimentos e CMV no histórico. */
  async function marcarArquivado(p: Doc<ProductDoc>, arquivado: boolean) {
    setAvisoDeErro(null);
    const r = await soAvisaSeGravou({
      gravar: () => patchDoc(barbershopId, "products", p.id, { archived: arquivado }),
      avisar: () => setAArquivar(null),
    });
    if (!r.ok) setAvisoDeErro(r.erro);
  }

  function pedirArquivamento(p: Doc<ProductDoc>) {
    if (pedeConfirmacaoParaArquivar(p)) setAArquivar(p);
    else void marcarArquivado(p, true);
  }

  function refazerVenda(c: Omit<CorrecaoDeVenda, "nonce">) {
    setCorrecao({ ...c, nonce: Date.now() });
    /* O Vender é o topo da página; a correção termina nele. */
    document.getElementById("vender")?.scrollIntoView({ block: "start" });
  }

  return (
    <div className="flex flex-col gap-6 pt-1 md:gap-10 md:pt-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-ink-muted md:text-base">Catálogo</p>
          <h1 className="text-xl text-ink md:text-4xl md:tracking-tight">Loja</h1>
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
      <div id="vender">
        <VenderProduto key={correcao?.nonce ?? 0} inicial={correcao} />
      </div>

      {/* D23 · logo abaixo de vender, porque é onde o erro é percebido.
          Quem registrou a venda errada descobre segundos depois, ainda com o
          cliente na frente — e não no fechamento do mês. Daqui saem Devolver,
          Corrigir forma e Corrigir venda. */}
      <DesfazerVenda aoCorrigirVenda={refazerVenda} />

      <EntradaDeEstoque produto={aReceber} aoFechar={() => setAReceber(null)} />
      {aAjustar && (
        /* O saldo AO VIVO: se uma venda entra com o modal aberto, a prévia muda
           e o servidor recusa a contagem feita sobre o saldo velho. */
        <AjustarEstoque
          key={aAjustar.id}
          produto={products.find((x) => x.id === aAjustar.id) ?? aAjustar}
          aoFechar={() => setAAjustar(null)}
        />
      )}
      {aEditar && <EditarProduto key={aEditar.id} produto={aEditar} aoFechar={() => setAEditar(null)} />}
      {historicoDe && (
        <HistoricoDoProduto key={historicoDe.id} produto={historicoDe} aoFechar={() => setHistoricoDe(null)} />
      )}

      {lowStock.length > 0 && (
        <Card className="flex items-start gap-3 border-danger/30 md:p-5">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-danger" />
          <div>
            <p className="text-sm text-ink md:text-base">
              {contar(lowStock.length, "produto", "produtos")} abaixo do estoque
              mínimo
            </p>
            <p className="text-xs text-ink-muted md:text-sm">
              {lowStock.map((p) => p.name).join(", ")}
            </p>
          </div>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-[1.4fr_1fr] md:gap-8">
        <section>
          <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-muted md:mb-3 md:text-sm">
            <Package size={12} /> Produtos
          </h2>
          {avisoDeErro && (
            <p role="alert" className="mb-2 text-xs text-danger">
              {avisoDeErro}
            </p>
          )}
          {status === "carregando" && <LoadingRows rows={3} oQue="seus produtos" />}
          {status === "erro" && <ErroAoCarregar oQue="seus produtos" erro={error} />}
          {status === "pronto" && products.length === 0 && (
            <EmptyState
              icon={Package}
              title="Nenhum produto cadastrado"
              description="Cadastre o que você revende. O sistema calcula preço de venda, comissão e imposto a partir do custo."
              actionLabel="Adicionar produto"
              onAction={openModal}
            />
          )}
          {ativos.length > 0 && (
            <Card className="flex flex-col gap-3 md:gap-4 md:p-6">
              {ativos.map((p) => {
                const belowMin = p.stock < p.minStock;
                const margin = p.price - p.cost;
                return (
                  <div
                    key={p.id}
                    className="flex flex-col gap-2 border-b border-border pb-3 last:border-0 last:pb-0 md:pb-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm text-ink md:text-base">{p.name}</p>
                        <p className="text-xs text-ink-muted md:text-sm">
                          Custo {formatBRL(p.cost)} · Venda {formatBRL(p.price)} ·
                          margem {formatBRL(margin)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Pill tone={belowMin ? "danger" : "neutral"}>{p.stock} un.</Pill>
                        {/* G1.5 · a entrada mora AQUI, ao lado do estoque.
                            É onde o dono olha quando a caixa chega — e onde ele
                            antes editava o número na mão, sem custo nem data. O
                            ajuste mora ao lado: "contei outro número" e "saiu
                            sem venda" também são fatos, com motivo. */}
                        <Button
                          variant="secondary"
                          onClick={() => setAReceber(p)}
                          className="min-h-9 px-3 text-xs"
                        >
                          Dar entrada
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => setAAjustar(p)}
                          className="min-h-9 px-3 text-xs"
                        >
                          Ajustar estoque
                        </Button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <Button variant="ghost" className="text-xs" onClick={() => setAEditar(p)}>
                        Editar
                      </Button>
                      <Button variant="ghost" className="text-xs" onClick={() => setHistoricoDe(p)}>
                        Histórico
                      </Button>
                      <Button variant="ghost" className="text-xs" onClick={() => pedirArquivamento(p)}>
                        Arquivar
                      </Button>
                    </div>
                  </div>
                );
              })}
            </Card>
          )}
          {status === "pronto" && products.length > 0 && ativos.length === 0 && (
            <p className="text-sm text-ink-muted">Todos os produtos estão arquivados.</p>
          )}

          {arquivados.length > 0 && (
            <div className="mt-4">
              <button
                type="button"
                aria-expanded={arquivadosAbertos}
                onClick={() => setArquivadosAbertos((x) => !x)}
                className="mb-2 flex cursor-pointer items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-muted md:text-sm"
              >
                <ChevronDown
                  size={14}
                  className={`transition-transform ${arquivadosAbertos ? "" : "-rotate-90"}`}
                />
                Arquivados ({arquivados.length})
              </button>
              {arquivadosAbertos && (
                <Card className="flex flex-col gap-3 md:gap-4 md:p-6">
                  {arquivados.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between gap-3 border-b border-border pb-3 last:border-0 last:pb-0 md:pb-4"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm text-ink-muted md:text-base">{p.name}</p>
                        <p className="text-xs text-ink-muted">
                          {p.stock} un. em estoque · fora do Vender
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button variant="ghost" className="text-xs" onClick={() => setHistoricoDe(p)}>
                          Histórico
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => void marcarArquivado(p, false)}
                          className="min-h-9 px-3 text-xs"
                        >
                          Reativar
                        </Button>
                      </div>
                    </div>
                  ))}
                </Card>
              )}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-muted md:mb-3 md:text-sm">
            <Percent size={12} /> Simulador rápido de comissão
          </h2>
          <Card className="flex flex-col gap-3 md:gap-4 md:p-6">
            <label className="flex flex-col gap-1 text-xs text-ink-muted md:text-sm">
              Preço de venda
              <input
                inputMode="decimal"
                /* `value={0}` renderiza o texto "0" no campo, e digitar depois
                 * dele produz "059,90" — o zero não sai porque ele não é
                 * placeholder, é conteúdo. Zero vira string vazia; o
                 * placeholder faz o papel visual que o zero fazia mal. */
                value={simPriceTxt}
                placeholder="0,00"
                onChange={(e) => setSimPriceTxt(e.target.value)}
                className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-ink md:py-2.5 md:text-base"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-ink-muted md:text-sm">
              Custo do produto
              <input
                inputMode="decimal"
                value={simCostTxt}
                placeholder="0,00"
                onChange={(e) => setSimCostTxt(e.target.value)}
                className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-ink md:py-2.5 md:text-base"
              />
            </label>
            <div className="flex items-center justify-between border-t border-border pt-3 text-sm md:text-base">
              <span className="text-ink-muted">
                Comissão do profissional ({padraoDaCasa}% do lucro)
              </span>
              <span className="font-display font-semibold text-gold-strong md:text-lg">
                {formatBRL(simSplit.commission)}
              </span>
            </div>
            {/* O simulador projeta com o padrão da casa, mas a comissão real
                nasce com o percentual de quem vendeu. Dizer isso aqui custa
                uma linha; deixar o dono descobrir no acerto custa a confiança
                dele na tela. */}
            <p className="text-xs text-ink-muted md:text-sm">
              Rateio sobre o lucro da venda, não sobre o preço cheio. Usa o
              padrão da casa — quem tem percentual próprio na Equipe recebe o
              dele.
            </p>
          </Card>
        </section>
      </div>

      <Modal
        open={aArquivar !== null}
        onClose={() => setAArquivar(null)}
        title="Arquivar produto"
        description={aArquivar?.name}
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setAArquivar(null)} className="flex-1">
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={() => aArquivar && void marcarArquivado(aArquivar, true)}
              className="flex-1"
            >
              Arquivar
            </Button>
          </div>
        }
      >
        {aArquivar && (
          <div className="flex flex-col gap-2 text-sm text-ink-muted">
            <p>
              Ainda há {aArquivar.stock} un. em estoque. Arquivado, o
              produto sai de &ldquo;Vender&rdquo; e da lista principal — e o aviso de estoque mínimo
              deixa de contá-lo.
            </p>
            <p>
              Nada é apagado: as vendas, o histórico e o resultado do mês continuam. Você pode reativar
              quando quiser, na seção Arquivados.
            </p>
          </div>
        )}
      </Modal>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        /* Três nomes para um gesto só: o botão dizia "Adicionar produto", o
           diálogo abria como "Novo Produto" (caixa alta de inglês) e o botão
           de confirmar dizia "Cadastrar produto". O dono não sabe se são a
           mesma coisa — e no diálogo de cadastro ele não deveria precisar
           pensar nisso. */
        title="Adicionar produto"
        className="max-w-xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={saveProduct}>Adicionar produto</Button>
          </>
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-ink-muted md:col-span-2">
            Nome do produto *
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Ex: Cera modeladora"
              className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-ink"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-ink-muted">
            Custo unitário (R$) *
            <input
              inputMode="decimal"
              value={form.cost}
              onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))}
              placeholder="0"
              className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-ink"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-ink-muted">
            Margem sobre o preço de venda (%)
            <input
              inputMode="decimal"
              value={form.profitPct}
              onChange={(e) => setForm((f) => ({ ...f, profitPct: e.target.value }))}
              className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-ink"
            />
            <span className="text-[11px] text-ink-muted">
              preço = custo ÷ (1 − margem). Não é markup sobre o custo.
            </span>
          </label>

          <label className="flex flex-col gap-1 text-xs text-ink-muted">
            Estoque inicial (un.)
            <input
              type="number"
              min={0}
              value={form.stock}
              onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))}
              placeholder="0"
              className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-ink"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs text-ink-muted">
            Estoque mínimo (un.)
            <input
              type="number"
              min={0}
              value={form.minStock}
              onChange={(e) => setForm((f) => ({ ...f, minStock: e.target.value }))}
              className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-ink"
            />
          </label>
        </div>

        <div className="mt-4 flex flex-col gap-2 rounded-xl border border-border bg-surface-raised/60 p-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gold-strong">
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
  const valueClass = tone === "success" ? "text-success" : tone === "danger" ? "text-danger" : "text-ink";
  return (
    <div className="flex flex-col">
      <span className="text-xs text-ink-muted">{label}</span>
      <span className={`${strong ? "font-display font-semibold" : "font-medium"} ${valueClass}`}>
        {value}
      </span>
    </div>
  );
}
