import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Trava a relação entre as consultas do código e os índices declarados.
 *
 * O Firestore indexa sozinho campo único, inclusive com `orderBy` — mas
 * qualquer filtro de igualdade combinado com ordenação por OUTRO campo exige
 * índice composto. Sem ele a consulta funciona no emulador e falha em
 * produção, no primeiro acesso real do cliente.
 *
 * Este teste existe para o erro aparecer aqui, não na frente do dono da
 * barbearia.
 */
type Indice = {
  collectionGroup: string;
  queryScope: string;
  fields: Array<{ fieldPath: string; order: string }>;
};

const arquivo = JSON.parse(
  readFileSync(resolve(__dirname, "../../../firestore.indexes.json"), "utf8")
) as { indexes: Indice[]; fieldOverrides: unknown[] };

/** As consultas compostas que existem hoje, e onde vivem. */
const CONSULTAS_COMPOSTAS = [
  {
    onde: "useMyBookings — app do cliente, aba Reservas e Início",
    collectionGroup: "bookings",
    campos: ["clientId", "date"],
  },
  {
    onde: "agenda por status e data — painel Hoje quando filtrar por período",
    collectionGroup: "bookings",
    campos: ["status", "date"],
  },
  {
    onde: "extrato de fidelidade do cliente, ordenado por data",
    collectionGroup: "loyalty_transactions",
    campos: ["clientId", "at"],
  },
  {
    onde: "despesas recorrentes por data — projeção de caixa",
    collectionGroup: "expenses",
    campos: ["recurring", "date"],
  },
  {
    onde: "régua de cobrança — assinantes por status e vencimento",
    collectionGroup: "subscriptions",
    campos: ["status", "nextCharge"],
  },
];

describe("índices do Firestore", () => {
  it.each(CONSULTAS_COMPOSTAS)(
    "$collectionGroup ($campos) tem índice — $onde",
    ({ collectionGroup, campos }) => {
      const encontrado = arquivo.indexes.find(
        (i) =>
          i.collectionGroup === collectionGroup &&
          i.fields.length === campos.length &&
          i.fields.every((f, n) => f.fieldPath === campos[n])
      );
      expect(encontrado, `índice ausente para ${collectionGroup}(${campos.join(", ")})`).toBeDefined();
    }
  );

  it("não declara índice que ninguém usa", () => {
    // Índice custa escrita e armazenamento em toda gravação da coleção.
    const declarados = arquivo.indexes.map(
      (i) => `${i.collectionGroup}:${i.fields.map((f) => f.fieldPath).join(",")}`
    );
    const usados = CONSULTAS_COMPOSTAS.map((c) => `${c.collectionGroup}:${c.campos.join(",")}`);
    expect(declarados.sort()).toEqual(usados.sort());
  });

  it("usa escopo de coleção — os dados vivem em subcoleções da barbearia", () => {
    for (const indice of arquivo.indexes) {
      expect(["COLLECTION", "COLLECTION_GROUP"]).toContain(indice.queryScope);
    }
  });

  it("toda ordenação é ASCENDING ou DESCENDING", () => {
    for (const indice of arquivo.indexes) {
      for (const campo of indice.fields) {
        expect(["ASCENDING", "DESCENDING"]).toContain(campo.order);
      }
    }
  });
});

/**
 * Consultas de GRUPO por campo único — `excluirMinhaConta` e o expurgo.
 *
 * O Firestore indexa campo único sozinho só no escopo de COLEÇÃO. No escopo de
 * grupo (`collectionGroup("clients").where("uid", "==", …)`) o índice precisa
 * ser declarado como `fieldOverride`, e sem ele a consulta funciona no
 * emulador e falha em produção — no primeiro cliente que pedir para apagar a
 * conta. Ver `titular.ts` e `data-deletion.ts`.
 */
describe("índices de campo com escopo de grupo", () => {
  type Override = {
    collectionGroup: string;
    fieldPath: string;
    indexes: Array<{ order?: string; arrayConfig?: string; queryScope: string }>;
  };
  const overrides = arquivo.fieldOverrides as Override[];

  it.each([
    ["clients", "uid"],
    ["clients", "mergedInto"],
  ])("%s.%s tem índice COLLECTION_GROUP", (grupo, campo) => {
    const o = overrides.find((x) => x.collectionGroup === grupo && x.fieldPath === campo);
    expect(o, `fieldOverride ausente para ${grupo}.${campo}`).toBeDefined();
    expect(o!.indexes.some((i) => i.queryScope === "COLLECTION_GROUP")).toBe(true);
  });

  it("o override não tira o índice de coleção que já existia", () => {
    /* Declarar um override SUBSTITUI os índices automáticos daquele campo.
     * Sem repetir os de coleção, `where("mergedInto", "==", id)` dentro de uma
     * barbearia — que `levantar` usa — passaria a falhar. */
    for (const o of overrides) {
      const escopoColecao = o.indexes.filter((i) => i.queryScope === "COLLECTION");
      expect(escopoColecao.some((i) => i.order === "ASCENDING"), o.fieldPath).toBe(true);
      expect(escopoColecao.some((i) => i.order === "DESCENDING"), o.fieldPath).toBe(true);
    }
  });
});
