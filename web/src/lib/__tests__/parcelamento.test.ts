import { describe, expect, it } from "vitest";
import {
  agruparProjecaoPorMes,
  mesPeriodo,
  projecaoDeCaixa,
  receitaDoMes,
  resultadoDoMes,
  cenarioDeCrescimento,
} from "@/lib/analytics";
import { movimentosDeCaixa, resumoDoFluxo } from "@/lib/fluxo-de-caixa";
import { apuracaoDe } from "@/lib/apuracao";
import { PLATFORM_DEFAULT_POLICIES } from "@/lib/tenant";
import type { Doc } from "@/lib/db/repository";
import type { ExpenseDoc, OtherIncomeDoc } from "@/lib/domain";
import {
  alcance,
  aVencer,
  baseDaDescricao,
  dataCurta,
  dataDaParcela,
  descricaoDaParcela,
  dividirEmCentavos,
  idDaParcela,
  parcelasComCentavo,
  parcelasDoGrupo,
  parcelasValidas,
  planejarParcelas,
  planoDeEdicaoDoGrupo,
  planoDeExclusao,
  planoDeNovoValor,
  previaDoParcelamento,
} from "@/lib/parcelamento";

const brl = (v: number) => `R$ ${v.toFixed(2).replace(".", ",")}`;
const soma = (vs: number[]) => Math.round(vs.reduce((s, v) => s + v * 100, 0)) / 100;

describe("dividir em centavos — a soma fecha com o total", () => {
  it("1000 em 3: a sobra vai na primeira (333,34 + 333,33 + 333,33)", () => {
    expect(dividirEmCentavos(1000, 3)).toEqual([333.34, 333.33, 333.33]);
  });

  it("divisão exata não inventa sobra", () => {
    expect(dividirEmCentavos(3000, 10)).toEqual(Array(10).fill(300));
  });

  it("nenhum total perde ou ganha centavo, em nenhum número de parcelas", () => {
    for (const total of [0.05, 99.99, 1234.56, 3000, 7777.77]) {
      for (let n = 2; n <= 48; n++) {
        const partes = dividirEmCentavos(total, n);
        expect(partes).toHaveLength(n);
        expect(soma(partes), `${total} / ${n}`).toBe(total);
        // a primeira é a maior, e as demais são iguais
        expect(partes[0]).toBeGreaterThanOrEqual(partes[1]);
        expect(new Set(partes.slice(1)).size).toBe(1);
      }
    }
  });

  it("não sofre do erro de ponto flutuante de 0,1 + 0,2", () => {
    expect(soma(dividirEmCentavos(0.3, 3))).toBe(0.3);
  });
});

describe("datas das parcelas", () => {
  it("mesmo dia nos meses seguintes", () => {
    expect(dataDaParcela("2026-10-09", 0)).toBe("2026-10-09");
    expect(dataDaParcela("2026-10-09", 9)).toBe("2027-07-09");
  });

  it("dia 31 vira o último dia do mês — e volta ao 31 quando o mês tem", () => {
    const datas = [0, 1, 2, 3].map((i) => dataDaParcela("2026-01-31", i));
    expect(datas).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });

  it("fevereiro bissexto", () => {
    expect(dataDaParcela("2028-01-31", 1)).toBe("2028-02-29");
    expect(dataDaParcela("2028-01-30", 1)).toBe("2028-02-29");
  });

  it("vira o ano", () => {
    expect(dataDaParcela("2026-11-15", 2)).toBe("2027-01-15");
    expect(dataDaParcela("2026-12-31", 1)).toBe("2027-01-31");
    expect(dataDaParcela("2026-12-31", 14)).toBe("2028-02-29");
  });

  it("atravessa 48 meses sem pular nem repetir mês", () => {
    const meses = Array.from({ length: 48 }, (_, i) => dataDaParcela("2026-01-31", i).slice(0, 7));
    expect(new Set(meses).size).toBe(48);
    expect(meses[47]).toBe("2029-12");
  });
});

describe("plano de parcelas", () => {
  it("modo total divide; modo parcela repete", () => {
    const a = planejarParcelas({ modo: "total", valor: 3000, n: 10, primeira: "2026-10-09" });
    expect(a.valores).toEqual(Array(10).fill(300));
    expect(a.total).toBe(3000);

    const b = planejarParcelas({ modo: "parcela", valor: 333.33, n: 3, primeira: "2026-10-09" });
    expect(b.valores).toEqual([333.33, 333.33, 333.33]);
    expect(b.total).toBe(999.99);
  });

  it("a prévia diz o que vai acontecer, com a sobra à vista", () => {
    const exato = planejarParcelas({ modo: "total", valor: 3000, n: 10, primeira: "2026-10-09" });
    expect(previaDoParcelamento(exato, brl)).toBe(
      "10x de R$ 300,00 · de 09/10/2026 a 09/07/2027 · total R$ 3000,00"
    );
    const sobra = planejarParcelas({ modo: "total", valor: 1000, n: 3, primeira: "2026-10-09" });
    expect(previaDoParcelamento(sobra, brl)).toContain("1ª de R$ 333,34 e 2x de R$ 333,33");
  });

  it("limites de 2 a 48", () => {
    expect([1, 2, 48, 49, 2.5, NaN].map(parcelasValidas)).toEqual([false, true, true, false, false, false]);
  });

  it("descrição e id são determinísticos (repetir o lote não duplica)", () => {
    expect(descricaoDaParcela("Máquina Wahl", 3, 10)).toBe("Máquina Wahl · 3/10");
    expect(baseDaDescricao("Máquina Wahl · 3/10")).toBe("Máquina Wahl");
    expect(baseDaDescricao("Contador 2/3 do mês")).toBe("Contador 2/3 do mês");
    expect(idDaParcela("abc", 3)).toBe("abc_03");
    expect(dataCurta("2026-10-09")).toBe("09/10/2026");
  });

  it("a parcela é 'a vencer' pela data, nunca 'paga'", () => {
    expect(aVencer("2026-10-10", "2026-10-09")).toBe(true);
    expect(aVencer("2026-10-09", "2026-10-09")).toBe(false);
  });
});

/* ------------------------------------------------------------------ */

const grupo = (n = 4) =>
  Array.from({ length: n }, (_, i) => ({
    id: idDaParcela("g", i + 1),
    date: dataDaParcela("2026-07-15", i),
    description: descricaoDaParcela("Máquina", i + 1, n),
    category: "Manutenção de equipamentos",
    value: 100,
    parcela: { numero: i + 1, total: n, grupoId: "g" },
  }));

describe("ações sobre o grupo", () => {
  it("separa o grupo certo, em ordem", () => {
    const outro = { ...grupo(2)[0], id: "x_01", parcela: { numero: 1, total: 2, grupoId: "outro" } };
    const g = parcelasDoGrupo([outro, ...grupo(4).reverse()], "g");
    expect(g.map((p) => p.parcela.numero)).toEqual([1, 2, 3, 4]);
  });

  it("alcance: só esta, esta e as próximas, todas", () => {
    const g = grupo(4);
    expect(alcance(g, 2, "so_esta").map((p) => p.parcela.numero)).toEqual([2]);
    expect(alcance(g, 2, "esta_e_proximas").map((p) => p.parcela.numero)).toEqual([2, 3, 4]);
    expect(alcance(g, 2, "todas")).toHaveLength(4);
  });

  it("excluir só esta deixa o buraco na numeração", () => {
    const p = planoDeExclusao(grupo(4), 2, "so_esta");
    expect(p.excluir).toEqual(["g_02"]);
    expect(p.atualizar).toEqual([]);
  });

  it("excluir esta e as próximas encerra o parcelamento: as que ficam mudam de total", () => {
    const p = planoDeExclusao(grupo(4), 3, "esta_e_proximas");
    expect(p.excluir.sort()).toEqual(["g_03", "g_04"]);
    expect(p.atualizar.map((a) => a.id)).toEqual(["g_01", "g_02"]);
    expect(p.atualizar[0].dados.description).toBe("Máquina · 1/2");
    expect(p.atualizar[1].dados.parcela).toEqual({ numero: 2, total: 2, grupoId: "g" });
  });

  it("excluir todas não deixa nada para atualizar", () => {
    const p = planoDeExclusao(grupo(4), 1, "todas");
    expect(p.excluir).toHaveLength(4);
    expect(p.atualizar).toEqual([]);
  });

  it("novo valor vale para esta e as próximas, e as anteriores não mudam", () => {
    const p = planoDeNovoValor(grupo(4), 3, 150.5);
    expect(p.map((a) => a.id)).toEqual(["g_03", "g_04"]);
    expect(p.every((a) => a.dados.value === 150.5)).toBe(true);
  });

  it("editar o grupo troca descrição-base e categoria sem perder o 'n/N'", () => {
    const p = planoDeEdicaoDoGrupo(grupo(3), { descricaoBase: "Cadeira nova", categoria: "Outras despesas" });
    expect(p.map((a) => a.dados.description)).toEqual([
      "Cadeira nova · 1/3",
      "Cadeira nova · 2/3",
      "Cadeira nova · 3/3",
    ]);
    expect(p.every((a) => a.dados.category === "Outras despesas")).toBe(true);
    // só a categoria: não toca a descrição
    expect(planoDeEdicaoDoGrupo(grupo(2), { categoria: "X" })[0].dados).toEqual({ category: "X" });
  });
});

/* ------------------------------------------------------------------ */
/* DRE, caixa e projeção                                               */
/* ------------------------------------------------------------------ */

const P = mesPeriodo("2026-08");

const parcelasDeDespesa = (
  total: number,
  n: number,
  primeira: string
): Doc<ExpenseDoc>[] => {
  const plano = planejarParcelas({ modo: "total", valor: total, n, primeira });
  return plano.valores.map((v, i) => ({
    id: idDaParcela("gx", i + 1),
    category: "Manutenção de equipamentos",
    description: descricaoDaParcela("Máquina Wahl", i + 1, n),
    supplier: "—",
    value: v,
    date: plano.datas[i],
    payment: "Pix" as const,
    recurring: false,
    parcela: { numero: i + 1, total: n, grupoId: "gx" },
  }));
};

const receitaVazia = () => receitaDoMes({ bookings: [], movements: [], subscribers: [], periodo: P });
const dre = (expenses: Doc<ExpenseDoc>[], otherIncomes: Doc<OtherIncomeDoc>[] = [], periodo = P) =>
  resultadoDoMes({
    receita: receitaDoMes({ bookings: [], movements: [], subscribers: [], periodo }),
    expenses,
    otherIncomes,
    movements: [],
    periodo,
    policies: PLATFORM_DEFAULT_POLICIES,
  });

describe("DRE: cada parcela pesa no mês do seu vencimento", () => {
  const maquina = parcelasDeDespesa(3000, 10, "2026-07-20"); // jul/26 .. abr/27

  it("agosto leva a parcela 2/10 — e só ela", () => {
    const r = dre(maquina);
    expect(r.variableOperatingExpenses).toBe(300);
    expect(r.fixedExpenses).toBe(0);
    expect(r.result).toBe(-300);
  });

  it("o total do parcelamento não cai inteiro em nenhum mês", () => {
    const meses = ["2026-07", "2026-08", "2026-09", "2027-04", "2027-05"];
    const por = meses.map((m) => dre(maquina, [], mesPeriodo(m)).variableOperatingExpenses);
    expect(por).toEqual([300, 300, 300, 300, 0]);
  });

  it("a soma dos meses fecha com o total pago (com a sobra na primeira)", () => {
    const g = parcelasDeDespesa(1000, 3, "2026-07-20");
    const por = ["2026-07", "2026-08", "2026-09"].map((m) => dre(g, [], mesPeriodo(m)).variableOperatingExpenses);
    expect(por).toEqual([333.34, 333.33, 333.33]);
  });

  it("documento antigo, sem `parcela`, continua igual", () => {
    const antiga: Doc<ExpenseDoc> = {
      id: "a", category: "Aluguel", description: "Aluguel", supplier: "—", value: 1800,
      date: "2026-08-05", payment: "Pix", recurring: true,
    };
    expect(dre([antiga, ...maquina]).fixedExpenses).toBe(1800);
  });
});

describe("DRE: Outras receitas", () => {
  const rec = (id: string, value: number, date: string): Doc<OtherIncomeDoc> => ({
    id, category: "Venda de equipamento", description: "Cadeira", payer: "—", value, date, payment: "Pix",
  });

  it("soma ao resultado, mas fica fora da receita bruta e do imposto", () => {
    const r = dre([], [rec("1", 500, "2026-08-10")]);
    expect(r.outrasReceitas).toBe(500);
    expect(r.grossRevenue).toBe(0);
    expect(r.tax).toBe(0);
    expect(r.resultBeforeTax).toBe(500);
    expect(r.result).toBe(500);
  });

  it("só o mês da parcela conta", () => {
    const parcelas = [rec("1", 250, "2026-08-10"), rec("2", 250, "2026-09-10")];
    expect(dre([], parcelas).outrasReceitas).toBe(250);
    expect(dre([], parcelas, mesPeriodo("2026-09")).outrasReceitas).toBe(250);
    expect(dre([], parcelas, mesPeriodo("2026-10")).outrasReceitas).toBe(0);
  });

  it("sem receitas avulsas o resultado é o de antes", () => {
    const sem = dre([]);
    expect(sem.outrasReceitas).toBe(0);
    expect(sem.result).toBe(sem.grossRevenue - sem.totalCost);
  });

  it("o cenário a 0% reproduz o mês, com outras receitas", () => {
    const r = dre(parcelasDeDespesa(3000, 10, "2026-07-20"), [rec("1", 500, "2026-08-10")]);
    const c = cenarioDeCrescimento({
      grossRevenue: r.grossRevenue,
      variableCost: r.variableCost,
      fixedCost: r.fixedCost,
      outrasReceitas: r.outrasReceitas,
      taxRatePct: PLATFORM_DEFAULT_POLICIES.taxRatePct,
      variacaoPct: 0,
    });
    expect(c.result).toBe(r.result);
  });

  it("margem e equilíbrio contam as outras receitas, sem contradizer o 'no verde'", () => {
    const r = dre([], [rec("1", 500, "2026-08-10")]);
    expect(r.marginPct).toBe(100); // 500 de resultado sobre 500 de base
    expect(r.breakEvenDay).toBe(1); // sem custo a cobrir
    const cobre = dre(parcelasDeDespesa(3000, 10, "2026-07-20"), [rec("1", 500, "2026-08-10")]);
    expect(cobre.result).toBe(200);
    expect(cobre.breakEvenDay).toBe(1);
    const nao = dre(parcelasDeDespesa(3000, 10, "2026-07-20"), [rec("1", 100, "2026-08-10")]);
    expect(nao.result).toBe(-200);
    expect(nao.breakEvenDay).toBeNull();
  });

  it("parcela mínima de 1 centavo", () => {
    expect(parcelasComCentavo(planejarParcelas({ modo: "total", valor: 0.05, n: 10, primeira: "2026-10-09" }))).toBe(false);
    expect(parcelasComCentavo(planejarParcelas({ modo: "total", valor: 0.1, n: 10, primeira: "2026-10-09" }))).toBe(true);
  });

  it("ilegível a coleção, o custo total continua apurado; o resultado não", () => {
    const a = apuracaoDe(["otherIncomes"]);
    expect(a.ok("custoTotal")).toBe(true);
    expect(a.ok("resultado")).toBe(false);
    expect(a.ok("outrasReceitas")).toBe(false);
    expect(a.ok("cmv")).toBe(true);
  });
});

describe("fluxo de caixa: parcela entra na própria data", () => {
  const maquina = parcelasDeDespesa(3000, 10, "2026-07-20");
  const base = { payments: [], refunds: [], movements: [], cashEntries: [] };

  it("só a parcela do mês sai do caixa do mês", () => {
    const m = movimentosDeCaixa({ ...base, expenses: maquina, periodo: P });
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ origem: "despesa", direcao: "saida", valor: 300, date: "2026-08-20" });
  });

  it("parcela que ainda não venceu não é saída — nem entrada", () => {
    const receitas: Doc<OtherIncomeDoc>[] = [
      { id: "r1", category: "Aluguel de cadeira", description: "Cadeira 3 · 1/2", payer: "—", value: 400, date: "2026-08-05", payment: "Pix", parcela: { numero: 1, total: 2, grupoId: "r" } },
      { id: "r2", category: "Aluguel de cadeira", description: "Cadeira 3 · 2/2", payer: "—", value: 400, date: "2026-08-25", payment: "Pix", parcela: { numero: 2, total: 2, grupoId: "r" } },
    ];
    const hoje = "2026-08-10";
    const m = movimentosDeCaixa({ ...base, expenses: maquina, otherIncomes: receitas, periodo: P, hoje });
    // 20/08 (despesa) e 25/08 (receita) ainda não aconteceram
    expect(m.map((x) => x.date)).toEqual(["2026-08-05"]);
    const r = resumoDoFluxo(m);
    expect(r.porOrigem.receita_avulsa).toBe(400);
    expect(r.porOrigem.despesa).toBe(0);
    expect(r.saldo).toBe(400);
  });

  it("receita avulsa ÚNICA com data futura também não entra até a data", () => {
    const unica: Doc<OtherIncomeDoc> = {
      id: "u", category: "Venda de equipamento", description: "Cadeira", payer: "—", value: 700,
      date: "2026-08-25", payment: "Pix",
    };
    const antes = movimentosDeCaixa({ ...base, expenses: [], otherIncomes: [unica], periodo: P, hoje: "2026-08-10" });
    expect(antes).toHaveLength(0);
    const depois = movimentosDeCaixa({ ...base, expenses: [], otherIncomes: [unica], periodo: P, hoje: "2026-08-25" });
    expect(depois).toHaveLength(1);
  });

  it("despesa sem `parcela` e futura continua valendo pela data lançada", () => {
    const futura: Doc<ExpenseDoc> = {
      id: "f", category: "Aluguel", description: "Adiantamento", supplier: "—", value: 50,
      date: "2026-08-30", payment: "Pix", recurring: false,
    };
    const m = movimentosDeCaixa({ ...base, expenses: [futura], periodo: P, hoje: "2026-08-10" });
    expect(m).toHaveLength(1);
  });

  it("a soma das origens continua sendo o saldo", () => {
    const receita: Doc<OtherIncomeDoc> = { id: "r", category: "Venda de equipamento", description: "Cadeira", payer: "—", value: 900, date: "2026-08-02", payment: "Boleto" };
    const r = resumoDoFluxo(movimentosDeCaixa({ ...base, expenses: maquina, otherIncomes: [receita], periodo: P }));
    const somaOrigens = Object.values(r.porOrigem).reduce((s, v) => s + v, 0);
    expect(somaOrigens).toBe(r.saldo);
    expect(r.saldo).toBe(600);
  });
});

describe("projeção: parcelas futuras nos meses certos", () => {
  const params = {
    bookings: [], subscribers: [], historico: [], openWeekdays: [0, 1, 2, 3, 4, 5, 6],
    inicio: new Date("2026-10-09T00:00:00"),
  };

  it("as parcelas a pagar caem nos dias delas, e as passadas ficam de fora", () => {
    const maquina = parcelasDeDespesa(3000, 10, "2026-07-20"); // 20/10 em diante conta
    const p = projecaoDeCaixa({ ...params, expenses: maquina, dias: 90 });
    const dias = p.filter((d) => d.parcelaAPagar > 0).map((d) => [d.date, d.parcelaAPagar]);
    expect(dias).toEqual([["2026-10-20", 300], ["2026-11-20", 300], ["2026-12-20", 300]]);
    expect(p.find((d) => d.date === "2026-10-20")?.net).toBe(-300);
    expect(p.reduce((s, d) => s + d.fixedExpense, 0)).toBe(0);
  });

  it("parcelas a receber somam ao saldo", () => {
    const receitas: Doc<OtherIncomeDoc>[] = [1, 2, 3].map((n) => ({
      id: `r${n}`, category: "Venda de equipamento", description: `Cadeira · ${n}/3`, payer: "—", value: 200,
      date: `2026-1${n - 1}-15`, payment: "Pix" as const, parcela: { numero: n, total: 3, grupoId: "r" },
    }));
    const p = projecaoDeCaixa({ ...params, expenses: [], otherIncomes: receitas, dias: 90 });
    expect(p.filter((d) => d.parcelaAReceber > 0).map((d) => d.date)).toEqual(["2026-10-15", "2026-11-15", "2026-12-15"]);
    expect(p.at(-1)?.cumulative).toBe(600);
  });

  it("despesa e receita avulsas SEM parcela não entram na projeção", () => {
    const unica: Doc<ExpenseDoc> = {
      id: "u", category: "Aluguel", description: "Conserto", supplier: "—", value: 80,
      date: "2026-10-12", payment: "Pix", recurring: false,
    };
    const p = projecaoDeCaixa({ ...params, expenses: [unica], dias: 10 });
    expect(p.every((d) => d.parcelaAPagar === 0 && d.net === 0)).toBe(true);
  });

  it("recorrente continua projetada como antes, ao lado das parcelas", () => {
    const aluguel: Doc<ExpenseDoc> = {
      id: "al", category: "Aluguel", description: "Aluguel", supplier: "—", value: 2000,
      date: "2026-09-05", payment: "Pix", recurring: true,
    };
    const p = projecaoDeCaixa({ ...params, expenses: [aluguel, ...parcelasDeDespesa(3000, 10, "2026-07-20")], dias: 40 });
    expect(p.find((d) => d.date === "2026-11-05")?.fixedExpense).toBe(2000);
    expect(p.find((d) => d.date === "2026-10-20")?.parcelaAPagar).toBe(300);
  });

  it("agrupa por mês com as parcelas", () => {
    const p = projecaoDeCaixa({ ...params, expenses: parcelasDeDespesa(3000, 10, "2026-07-20"), dias: 90 });
    const meses = agruparProjecaoPorMes(p);
    expect(meses.map((m) => [m.mes, m.parcelaAPagar])).toEqual([
      ["2026-10", 300], ["2026-11", 300], ["2026-12", 300], ["2027-01", 0],
    ]);
  });
});

describe("sanidade do helper", () => {
  it("receitaVazia existe", () => {
    expect(receitaVazia().bruta).toBe(0);
  });
});
