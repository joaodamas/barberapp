import { describe, expect, it } from "vitest";
import {
  camposDoProduto,
  ERRO_DA_COMISSAO_DO_PRODUTO,
  estaArquivado,
  historicoDoProduto,
  lerEdicaoDeProduto,
  pedeConfirmacaoParaArquivar,
  separarArquivados,
} from "../produtos";
import { MOTIVOS_DE_SAIDA, previaDoAjuste, rotuloDoMotivo } from "../ajuste-de-estoque";
import { reaisParaCampo } from "../reais";
import type { Doc } from "@/lib/db/repository";
import type { InventoryMovementDoc } from "@/lib/domain";

/**
 * Editar, arquivar e ajustar produto — a lógica pura da tela da Loja.
 *
 * ⚠️ A forma que a edição aceita é a mesma que `firestore.rules` impõe
 * (`produtoValido`): o que a tela recusa aqui, a regra também recusaria.
 */

const campos = (over: Partial<Parameters<typeof lerEdicaoDeProduto>[0]> = {}) => ({
  name: "Pomada",
  price: "45,00",
  cost: "18",
  minStock: "5",
  commissionPct: "",
  ...over,
});

describe("lerEdicaoDeProduto", () => {
  it("lê nome, preço, custo e mínimo", () => {
    expect(lerEdicaoDeProduto(campos())).toEqual({
      ok: true,
      valor: { name: "Pomada", price: 45, cost: 18, minStock: 5, commissionPct: null },
    });
  });

  it("entende o jeito brasileiro de escrever dinheiro", () => {
    const r = lerEdicaoDeProduto(campos({ price: "1.500,50", cost: "1.200" }));
    expect(r).toEqual({ ok: true, valor: { name: "Pomada", price: 1500.5, cost: 1200, minStock: 5, commissionPct: null } });
  });

  it("apara o nome e recusa vazio ou longo demais", () => {
    expect(lerEdicaoDeProduto(campos({ name: "  Cera  " }))).toMatchObject({ ok: true, valor: { name: "Cera" } });
    expect(lerEdicaoDeProduto(campos({ name: "   " }))).toEqual({ ok: false, erro: "Informe o nome do produto." });
    expect(lerEdicaoDeProduto(campos({ name: "x".repeat(121) }))).toMatchObject({ ok: false });
  });

  it("preço precisa ser maior que zero", () => {
    expect(lerEdicaoDeProduto(campos({ price: "0" }))).toMatchObject({ ok: false });
    expect(lerEdicaoDeProduto(campos({ price: "" }))).toMatchObject({ ok: false });
    expect(lerEdicaoDeProduto(campos({ price: "abc" }))).toMatchObject({ ok: false });
  });

  it("custo zero é válido (brinde); negativo ou ilegível, não", () => {
    expect(lerEdicaoDeProduto(campos({ cost: "0" }))).toMatchObject({ ok: true, valor: { cost: 0 } });
    expect(lerEdicaoDeProduto(campos({ cost: "-3" }))).toMatchObject({ ok: false });
    expect(lerEdicaoDeProduto(campos({ cost: "" }))).toMatchObject({ ok: false });
    expect(lerEdicaoDeProduto(campos({ cost: "1,2,3" }))).toMatchObject({ ok: false });
  });

  it("mínimo vazio vale zero; fração ou texto são recusados", () => {
    expect(lerEdicaoDeProduto(campos({ minStock: "" }))).toMatchObject({ ok: true, valor: { minStock: 0 } });
    expect(lerEdicaoDeProduto(campos({ minStock: "2,5" }))).toMatchObject({ ok: false });
    expect(lerEdicaoDeProduto(campos({ minStock: "-1" }))).toMatchObject({ ok: false });
  });

  it("🔒 nunca devolve o saldo: estoque não se edita aqui", () => {
    const r = lerEdicaoDeProduto(campos());
    expect(r.ok && Object.keys(r.valor).sort()).toEqual(["commissionPct", "cost", "minStock", "name", "price"]);
  });

  it("produto sem custo gravado abre com o campo vazio — e pede o custo ao salvar", () => {
    const c = camposDoProduto(
      { name: "Antigo", price: 30, cost: undefined as unknown as number, minStock: undefined as unknown as number },
      reaisParaCampo
    );
    expect(c).toEqual({ name: "Antigo", price: "30", cost: "", minStock: "", commissionPct: "" });
    expect(lerEdicaoDeProduto(c)).toEqual({ ok: false, erro: "Informe o custo unitário." });
  });

  it("os campos de abertura voltam pelo mesmo caminho", () => {
    const c = camposDoProduto({ name: "Cera", price: 49.9, cost: 20, minStock: 3 }, reaisParaCampo);
    expect(c).toEqual({ name: "Cera", price: "49,90", cost: "20", minStock: "3", commissionPct: "" });
    expect(lerEdicaoDeProduto(c)).toEqual({
      ok: true,
      valor: { name: "Cera", price: 49.9, cost: 20, minStock: 3, commissionPct: null },
    });
  });
});

describe("comissão do barbeiro no produto", () => {
  it("em branco = sem % próprio (null), e não zero", () => {
    expect(lerEdicaoDeProduto(campos({ commissionPct: "" }))).toMatchObject({ ok: true, valor: { commissionPct: null } });
    expect(lerEdicaoDeProduto(campos({ commissionPct: "  " }))).toMatchObject({ ok: true, valor: { commissionPct: null } });
  });

  it("0 é valor legítimo e se mantém 0", () => {
    expect(lerEdicaoDeProduto(campos({ commissionPct: "0" }))).toMatchObject({ ok: true, valor: { commissionPct: 0 } });
  });

  it("lê 10, 12,5 e 100", () => {
    expect(lerEdicaoDeProduto(campos({ commissionPct: "10" }))).toMatchObject({ valor: { commissionPct: 10 } });
    expect(lerEdicaoDeProduto(campos({ commissionPct: "12,5%" }))).toMatchObject({ valor: { commissionPct: 12.5 } });
    expect(lerEdicaoDeProduto(campos({ commissionPct: "100" }))).toMatchObject({ valor: { commissionPct: 100 } });
  });

  it("fora de 0–100 ou ilegível é recusado (a regra também recusaria)", () => {
    for (const t of ["101", "-1", "abc", "1,2,3"]) {
      expect(lerEdicaoDeProduto(campos({ commissionPct: t }))).toEqual({
        ok: false,
        erro: ERRO_DA_COMISSAO_DO_PRODUTO,
      });
    }
  });

  it("o produto abre com o % gravado, inclusive 0, e vazio quando ausente/null", () => {
    const base = { name: "Cera", price: 30, cost: 10, minStock: 1 };
    expect(camposDoProduto({ ...base, commissionPct: 12.5 }, reaisParaCampo).commissionPct).toBe("12,5");
    expect(camposDoProduto({ ...base, commissionPct: 0 }, reaisParaCampo).commissionPct).toBe("0");
    expect(camposDoProduto({ ...base, commissionPct: null }, reaisParaCampo).commissionPct).toBe("");
    expect(camposDoProduto(base, reaisParaCampo).commissionPct).toBe("");
  });
});

describe("arquivar", () => {
  const p = (id: string, over: { archived?: boolean; stock?: number } = {}) => ({ id, stock: 0, ...over });

  it("ausente é ativo; só `true` arquiva", () => {
    expect(estaArquivado({})).toBe(false);
    expect(estaArquivado({ archived: false })).toBe(false);
    expect(estaArquivado({ archived: true })).toBe(true);
  });

  it("separa ativos de arquivados sem perder ninguém", () => {
    const r = separarArquivados([p("a"), p("b", { archived: true }), p("c", { archived: false })]);
    expect(r.ativos.map((x) => x.id)).toEqual(["a", "c"]);
    expect(r.arquivados.map((x) => x.id)).toEqual(["b"]);
  });

  it("produto com saldo pede confirmação; sem saldo, não", () => {
    expect(pedeConfirmacaoParaArquivar({ stock: 3 })).toBe(true);
    expect(pedeConfirmacaoParaArquivar({ stock: 0 })).toBe(false);
    expect(pedeConfirmacaoParaArquivar({})).toBe(false);
    expect(pedeConfirmacaoParaArquivar({ stock: undefined })).toBe(false);
  });
});

describe("historicoDoProduto", () => {
  const m = (id: string, over: Partial<InventoryMovementDoc>): Doc<InventoryMovementDoc> =>
    ({ id, productId: "pomada", kind: "venda", quantity: 1, value: 0, date: "2026-10-01", ...over }) as Doc<InventoryMovementDoc>;

  it("mostra entrada, venda, devolução e ajuste — com o sinal certo no saldo", () => {
    const h = historicoDoProduto(
      [
        m("c1", { kind: "compra", quantity: 10, unitCost: 18, date: "2026-10-01" }),
        m("v1", { kind: "venda", quantity: 2, unitPrice: 45, date: "2026-10-02" }),
        m("d1", { kind: "ajuste", quantity: 1, refundOf: "v1", date: "2026-10-03" }),
        m("a1", { kind: "ajuste", quantity: -2, reason: "perda", date: "2026-10-04" }),
        m("a2", { kind: "ajuste", quantity: 3, reason: "contagem", date: "2026-10-05" }),
      ],
      "pomada"
    );

    expect(h.map((l) => [l.tipo, l.delta])).toEqual([
      ["ajuste", 3],
      ["ajuste", -2],
      ["devolucao", 1],
      ["venda", -2],
      ["compra", 10],
    ]);
    // O saldo de quem soma o histórico é o que o produto tem.
    expect(h.reduce((s, l) => s + l.delta, 0)).toBe(10);
  });

  it("o ajuste mostra o motivo; 'outro' mostra o texto", () => {
    const h = historicoDoProduto(
      [
        m("a1", { kind: "ajuste", quantity: -1, reason: "vencido", date: "2026-10-01" }),
        m("a2", { kind: "ajuste", quantity: -1, reason: "outro", reasonText: "amostra", date: "2026-10-02" }),
      ],
      "pomada"
    );
    expect(h.find((l) => l.id === "a1")?.detalhe).toBe("Vencido");
    expect(h.find((l) => l.id === "a2")?.detalhe).toBe("Outro: amostra");
  });

  it("devolução e ajuste manual não se confundem", () => {
    const h = historicoDoProduto(
      [
        m("d1", { kind: "ajuste", quantity: 1, refundOf: "v1" }),
        m("a1", { kind: "ajuste", quantity: 1, reason: "contagem" }),
      ],
      "pomada"
    );
    expect(h.find((l) => l.id === "d1")?.tipo).toBe("devolucao");
    expect(h.find((l) => l.id === "a1")?.tipo).toBe("ajuste");
  });

  it("só o produto pedido", () => {
    const h = historicoDoProduto([m("v1", { productId: "pomada" }), m("v2", { productId: "cera" })], "cera");
    expect(h.map((l) => l.id)).toEqual(["v2"]);
  });
});

describe("previaDoAjuste · o que a tela antecipa", () => {
  it("contagem define o saldo", () => {
    expect(previaDoAjuste({ estoqueAtual: 10, modo: "contagem", quantidade: "7" })).toEqual({
      ok: true,
      delta: -3,
      estoqueDepois: 7,
    });
    expect(previaDoAjuste({ estoqueAtual: 4, modo: "contagem", quantidade: "6" })).toEqual({
      ok: true,
      delta: 2,
      estoqueDepois: 6,
    });
    expect(previaDoAjuste({ estoqueAtual: 4, modo: "contagem", quantidade: "0" })).toMatchObject({
      ok: true,
      estoqueDepois: 0,
    });
  });

  it("saída baixa o saldo e nunca o deixa negativo", () => {
    expect(previaDoAjuste({ estoqueAtual: 3, modo: "saida", quantidade: "2" })).toEqual({
      ok: true,
      delta: -2,
      estoqueDepois: 1,
    });
    expect(previaDoAjuste({ estoqueAtual: 3, modo: "saida", quantidade: "4" })).toEqual({
      ok: false,
      erro: "Só há 3 un. no estoque.",
    });
  });

  it("campo vazio não grita; zero, fração e texto explicam", () => {
    expect(previaDoAjuste({ estoqueAtual: 3, modo: "saida", quantidade: "" })).toEqual({ ok: false, erro: null });
    expect(previaDoAjuste({ estoqueAtual: 3, modo: "saida", quantidade: "0" })).toMatchObject({ ok: false });
    expect(previaDoAjuste({ estoqueAtual: 3, modo: "saida", quantidade: "1,5" })).toMatchObject({ ok: false });
    expect(previaDoAjuste({ estoqueAtual: 3, modo: "contagem", quantidade: "abc" })).toMatchObject({ ok: false });
  });

  it("contar o mesmo que o sistema diz não é ajuste", () => {
    expect(previaDoAjuste({ estoqueAtual: 5, modo: "contagem", quantidade: "5" })).toMatchObject({ ok: false });
  });
});

describe("os motivos", () => {
  it("são os cinco do pedido, nesta ordem", () => {
    expect(MOTIVOS_DE_SAIDA.map((x) => x.id)).toEqual(["perda", "uso_interno", "vencido", "contagem", "outro"]);
    expect(MOTIVOS_DE_SAIDA.map((x) => x.rotulo)).toEqual([
      "Perda/quebra",
      "Uso interno (na barbearia)",
      "Vencido",
      "Contagem (diferença de inventário)",
      "Outro",
    ]);
  });

  it("rótulo de motivo desconhecido não quebra", () => {
    expect(rotuloDoMotivo(undefined)).toBe("Ajuste");
    expect(rotuloDoMotivo("perda")).toBe("Perda/quebra");
    expect(rotuloDoMotivo("outro", "amostra")).toBe("Outro: amostra");
  });
});
