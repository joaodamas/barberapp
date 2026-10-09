import { describe, expect, it } from "vitest";
import { filtrarFichas } from "@/lib/filtro-de-clientes";
import type { FichaDoCliente } from "@/lib/ficha-do-cliente";

type Recorte = Pick<FichaDoCliente, "diasSemVir" | "mensalista"> & { nome: string };
const plano = {} as NonNullable<FichaDoCliente["mensalista"]>;

const fichas: Recorte[] = [
  { nome: "veio hoje", diasSemVir: 0, mensalista: null },
  { nome: "no limite", diasSemVir: 30, mensalista: null },
  { nome: "faz tempo", diasSemVir: 75, mensalista: plano },
  { nome: "nunca veio", diasSemVir: null, mensalista: null },
  { nome: "mensalista em dia", diasSemVir: 3, mensalista: plano },
];

describe("filtros da lista de clientes", () => {
  it("todos devolve a lista inteira", () => {
    expect(filtrarFichas(fichas, "todos")).toHaveLength(5);
  });

  it("sumidos: já veio e não volta há 30 dias ou mais", () => {
    expect(filtrarFichas(fichas, "sumidos").map((f) => f.nome)).toEqual(["no limite", "faz tempo"]);
  });

  it("quem nunca foi atendido não é sumido", () => {
    expect(filtrarFichas(fichas, "sumidos").some((f) => f.diasSemVir === null)).toBe(false);
  });

  it("mensalistas: quem tem plano ativo", () => {
    expect(filtrarFichas(fichas, "mensalistas").map((f) => f.nome)).toEqual([
      "faz tempo",
      "mensalista em dia",
    ]);
  });
});
