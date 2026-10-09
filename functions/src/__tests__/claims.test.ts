import { describe, expect, it } from "vitest";
import { HttpsError } from "firebase-functions/v2/https";
import { LIMITE_DE_CLAIMS_BYTES, mutarClaims, papelNaBarbearia, tamanhoDosClaims, type Claims } from "../claims";

/**
 * O Auth aceita 1000 bytes de claims. Estourar não dá erro de domínio, dá
 * `auth/claims-too-large` no meio de uma operação que já gravou outras coisas.
 * `mutarClaims` mede antes e recusa com mensagem clara.
 */

function authFalso(inicial: Claims) {
  const gravados: Claims[] = [];
  return {
    gravados,
    auth: {
      getUser: async () => ({ customClaims: inicial }),
      setCustomUserClaims: async (_uid: string, c: Claims | null) => {
        gravados.push(c as Claims);
      },
    } as never,
  };
}

/** N barbearias com ids do tamanho dos reais (20 caracteres). */
function barbearias(n: number): Record<string, string> {
  const m: Record<string, string> = {};
  for (let i = 0; i < n; i++) m[`loja${String(i).padStart(16, "0")}`] = "owner";
  return m;
}

describe("tamanho dos claims", () => {
  it("conta bytes UTF-8, não caracteres", () => {
    expect(tamanhoDosClaims({ a: "é" })).toBe(Buffer.byteLength('{"a":"é"}'));
    expect(tamanhoDosClaims({ a: "é" })).toBe(10);
  });
});

describe("mutarClaims", () => {
  it("grava a alteração mantendo o resto dos claims", async () => {
    const { auth, gravados } = authFalso({ platformAdmin: true, barbershops: { a: "owner" } });
    const r = await mutarClaims(
      "u1",
      (c) => {
        c.barbershops = { ...(c.barbershops as object), b: "staff" };
      },
      auth
    );
    expect(gravados).toHaveLength(1);
    expect(gravados[0]).toEqual({ platformAdmin: true, barbershops: { a: "owner", b: "staff" } });
    expect(r).toEqual(gravados[0]);
  });

  it("aceita devolver um objeto novo em vez de mutar", async () => {
    const { auth, gravados } = authFalso({ x: 1 });
    await mutarClaims("u1", () => ({ y: 2 }), auth);
    expect(gravados[0]).toEqual({ y: 2 });
  });

  it("não altera o objeto original lido do Auth", async () => {
    const original = { barbershops: { a: "owner" } };
    const { auth } = authFalso(original);
    await mutarClaims("u1", (c) => {
      c.extra = true;
    }, auth);
    expect(original).toEqual({ barbershops: { a: "owner" } });
  });

  it("recusa, sem gravar, quando passa de 900 bytes", async () => {
    const { auth, gravados } = authFalso({ barbershops: barbearias(5) });
    const erro = await mutarClaims(
      "u1",
      (c) => {
        c.barbershops = barbearias(40);
      },
      auth
    ).catch((e) => e);
    expect(erro).toBeInstanceOf(HttpsError);
    expect((erro as HttpsError).code).toBe("resource-exhausted");
    expect((erro as HttpsError).message).toMatch(/acessos demais/);
    expect(gravados).toHaveLength(0);
  });

  it("aceita até o limite", async () => {
    // Procura o maior N que cabe e confere que ele passa e N+1 não.
    let n = 1;
    while (tamanhoDosClaims({ barbershops: barbearias(n + 1) }) <= LIMITE_DE_CLAIMS_BYTES) n++;
    const { auth, gravados } = authFalso({});
    await mutarClaims("u1", (c) => {
      c.barbershops = barbearias(n);
    }, auth);
    expect(gravados).toHaveLength(1);
    await expect(
      mutarClaims("u1", (c) => {
        c.barbershops = barbearias(n + 1);
      }, auth)
    ).rejects.toThrow(/acessos demais/);
  });

  it("deixa encolher uma conta que já estava acima do limite", async () => {
    const { auth, gravados } = authFalso({ barbershops: barbearias(40) });
    await mutarClaims("u1", (c) => {
      c.barbershops = barbearias(35);
    }, auth);
    expect(gravados).toHaveLength(1);
  });

  it("recusa crescer uma conta que já estava acima do limite", async () => {
    const { auth, gravados } = authFalso({ barbershops: barbearias(40) });
    await expect(
      mutarClaims("u1", (c) => {
        c.barbershops = barbearias(41);
      }, auth)
    ).rejects.toBeInstanceOf(HttpsError);
    expect(gravados).toHaveLength(0);
  });
});

describe("papelNaBarbearia", () => {
  it("devolve o papel do token e null sem vínculo", () => {
    const req = { auth: { token: { barbershops: { a: "owner", b: "staff" } } } };
    expect(papelNaBarbearia(req, "a")).toBe("owner");
    expect(papelNaBarbearia(req, "b")).toBe("staff");
    expect(papelNaBarbearia(req, "c")).toBeNull();
    expect(papelNaBarbearia({ auth: null }, "a")).toBeNull();
  });

  it("conta com senha provisória não tem papel", () => {
    const req = { auth: { token: { mustChangePassword: true, barbershops: { a: "owner" } } } };
    expect(papelNaBarbearia(req, "a")).toBeNull();
  });
});
