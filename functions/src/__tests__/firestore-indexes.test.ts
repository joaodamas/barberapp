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
