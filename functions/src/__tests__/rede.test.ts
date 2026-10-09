import { describe, expect, it } from "vitest";
import { HttpsError } from "firebase-functions/v2/https";
import { aplicarAcessoDaRede, maxUnidadesValido, MAX_UNIDADES_ABSOLUTO, MAX_UNIDADES_PADRAO } from "../rede";
import { LIMITE_DE_CLAIMS_BYTES, tamanhoDosClaims } from "../claims";

/**
 * A parte pura da rede: o que muda nos claims de uma conta, e o teto de
 * unidades que o tamanho dos claims impõe (58 + 31·N bytes ≤ 1000).
 */
describe("aplicarAcessoDaRede", () => {
  it("dono ganha redes[r] e owner em cada unidade, sem perder o resto", () => {
    const antes = { platformAdmin: true, barbershops: { propria: "owner" } };
    const depois = aplicarAcessoDaRede(antes, { redeId: "r1", dono: true, conceder: ["a", "b"], retirar: [] });
    expect(depois).toEqual({
      platformAdmin: true,
      redes: { r1: "dono" },
      barbershops: { propria: "owner", a: "owner", b: "owner" },
    });
    expect(antes).toEqual({ platformAdmin: true, barbershops: { propria: "owner" } }); // não muta
  });

  it("é idempotente", () => {
    const params = { redeId: "r1", dono: true, conceder: ["a", "b"], retirar: [] };
    const uma = aplicarAcessoDaRede({}, params);
    expect(aplicarAcessoDaRede(uma, params)).toEqual(uma);
  });

  it("retirar tira só o owner da unidade; staff fica", () => {
    const antes = { redes: { r1: "dono" }, barbershops: { a: "owner", b: "staff", c: "owner" } };
    const depois = aplicarAcessoDaRede(antes, { redeId: "r1", dono: true, conceder: ["c"], retirar: ["a", "b"] });
    expect(depois.barbershops).toEqual({ b: "staff", c: "owner" });
  });

  it("deixar de ser dono apaga redes[r] e, vazio, o objeto inteiro; outras redes ficam", () => {
    const sozinho = aplicarAcessoDaRede({ redes: { r1: "dono" } }, { redeId: "r1", dono: false, conceder: [], retirar: [] });
    expect("redes" in sozinho).toBe(false);
    const duas = aplicarAcessoDaRede(
      { redes: { r1: "dono", r2: "dono" } },
      { redeId: "r1", dono: false, conceder: [], retirar: [] }
    );
    expect(duas.redes).toEqual({ r2: "dono" });
  });
});

describe("teto de unidades pelo tamanho dos claims", () => {
  const idReal = (i: number) => `u${String(i).padStart(19, "0")}`; // 20 caracteres, como o id do Firestore
  const redeId = "r".repeat(20);

  it("20 unidades de dono da rede cabem nos 900 bytes", () => {
    const unidades = Array.from({ length: MAX_UNIDADES_ABSOLUTO }, (_, i) => idReal(i));
    const claims = aplicarAcessoDaRede({}, { redeId, dono: true, conceder: unidades, retirar: [] });
    expect(tamanhoDosClaims(claims)).toBeLessThanOrEqual(LIMITE_DE_CLAIMS_BYTES);
  });

  it("o teto padrão é o absoluto: 20", () => {
    expect(MAX_UNIDADES_PADRAO).toBe(20);
    expect(MAX_UNIDADES_ABSOLUTO).toBe(20);
  });
});

describe("maxUnidadesValido", () => {
  it("ausente vale o padrão; 1 a 20 passa", () => {
    expect(maxUnidadesValido(undefined)).toBe(20);
    expect(maxUnidadesValido(null)).toBe(20);
    expect(maxUnidadesValido(1)).toBe(1);
    expect(maxUnidadesValido("8")).toBe(8);
  });

  it("recusa 0, 21, fração e lixo", () => {
    for (const ruim of [0, 21, 2.5, "abc", -1]) {
      expect(() => maxUnidadesValido(ruim)).toThrow(HttpsError);
    }
  });
});
