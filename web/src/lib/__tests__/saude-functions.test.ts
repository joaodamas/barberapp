/**
 * O `/api/health` também prova que as functions respondem: o callable
 * `healthcheck` pelo HTTPS do protocolo callable. O que não pode regredir é o
 * julgamento (200 sem `result.ok` não é saúde) e que `ok` geral exija os dois.
 */
import { describe, expect, it } from "vitest";
import { julgarFunctions, montarSaude, urlDoHealthcheck } from "@/lib/saude";

describe("saúde das functions", () => {
  it("monta o endereço do callable por projeto e por emulador", () => {
    expect(urlDoHealthcheck("axon-barber")).toBe("https://southamerica-east1-axon-barber.cloudfunctions.net/healthcheck");
    expect(urlDoHealthcheck("demo", true)).toBe("http://127.0.0.1:5001/demo/southamerica-east1/healthcheck");
  });

  it("só 200 com result.ok conta", () => {
    expect(julgarFunctions(200, { result: { ok: true, region: "southamerica-east1" } })).toEqual({ ok: true });
    expect(julgarFunctions(200, { result: { ok: false } }).ok).toBe(false);
    expect(julgarFunctions(200, null).ok).toBe(false);
    expect(julgarFunctions(200, { error: { status: "INTERNAL" } }).ok).toBe(false);
    expect(julgarFunctions(500, { result: { ok: true } }).erro).toContain("500");
  });

  it("ok geral exige Firestore E functions", () => {
    const bom = { ok: true, ms: 10 };
    expect(montarSaude({ checks: { firestore: bom, functions: bom }, projectId: "p" }).ok).toBe(true);
    const sem = montarSaude({ checks: { firestore: bom, functions: { ok: false, ms: 6000, erro: "sem resposta em 6s" } }, projectId: "p" });
    expect(sem.ok).toBe(false);
    expect(sem.error).toContain("functions: sem resposta em 6s");
  });
});
