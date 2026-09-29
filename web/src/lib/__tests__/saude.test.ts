/**
 * Saúde — o contrato que o JP Projects Hub lê a cada 5 minutos.
 *
 * O que não pode regredir: `ok` só é true se TODA verificação passou (um
 * "ok: true" com o banco fora faria o monitor dizer que está tudo bem), e o
 * julgamento do status do Firestore — 404 é "respondeu", 403 é problema.
 */
import { describe, expect, it } from "vitest";
import { julgarFirestore, montarSaude } from "@/lib/saude";

describe("saúde", () => {
  it("ok só quando todas as verificações passam", () => {
    expect(montarSaude({ checks: { firestore: { ok: true, ms: 40 } }, projectId: "p" }).ok).toBe(true);
    const ruim = montarSaude({ checks: { firestore: { ok: false, ms: 8000, erro: "sem resposta em 8s" } }, projectId: "p" });
    expect(ruim.ok).toBe(false);
    expect(ruim.error).toMatch(/firestore: sem resposta/);
  });

  it("segue o contrato do Hub", () => {
    const s = montarSaude({ checks: { firestore: { ok: true, ms: 1 } }, projectId: "axon-barber", agora: new Date("2026-09-29T12:00:00Z") });
    expect(typeof s.ok).toBe("boolean");
    expect(s.product).toBe("topete");
    expect(s.projectId).toBe("axon-barber");
    expect(s.time).toBe("2026-09-29T12:00:00.000Z");
    expect(s.version).toBeTruthy();
  });

  it("status do Firestore: 200/404 respondeu; 403 e 5xx são problema", () => {
    expect(julgarFirestore(200).ok).toBe(true);
    expect(julgarFirestore(404).ok).toBe(true);
    expect(julgarFirestore(403)).toEqual({ ok: false, erro: "leitura pública de slugs recusada (403)" });
    expect(julgarFirestore(503).ok).toBe(false);
  });
});
