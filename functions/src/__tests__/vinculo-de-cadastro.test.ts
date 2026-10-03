import { describe, expect, it } from "vitest";
import { decidirVinculo, digitosNacionais, formasDoTelefone, mesmoTelefone } from "../vinculo-de-cadastro";

/**
 * 02/10 — vincular o cadastro de balcão à conta. As decisões puras: o que é o
 * mesmo telefone e quando o vínculo é proibido. A movimentação de verdade está
 * em `clients-transacao.test.ts` (emulador, no CI).
 */

describe("telefone em dígitos nacionais", () => {
  it("E.164 do token vira o formato do cadastro", () => {
    expect(digitosNacionais("+5511988887777")).toBe("11988887777");
    expect(digitosNacionais("5511988887777")).toBe("11988887777");
    expect(digitosNacionais("(11) 98888-7777")).toBe("11988887777");
    expect(digitosNacionais("1133334444")).toBe("1133334444");
  });
  it("incompleto ou vazio não é telefone", () => {
    expect(digitosNacionais("988887777")).toBeNull();
    expect(digitosNacionais(undefined)).toBeNull();
    expect(digitosNacionais("")).toBeNull();
  });
});

describe("mesmo telefone", () => {
  it("com e sem +55 e máscara", () => {
    expect(mesmoTelefone("+5511988887777", "11988887777")).toBe(true);
    expect(mesmoTelefone("(11) 98888-7777", "5511988887777")).toBe(true);
  });
  it("celular antigo sem o nono dígito é a mesma linha", () => {
    expect(mesmoTelefone("1188887777", "11988887777")).toBe(true);
  });
  it("fixo NÃO vira celular acrescentando o 9", () => {
    expect(mesmoTelefone("1133334444", "11933334444")).toBe(false);
  });
  it("DDD diferente é outra pessoa", () => {
    expect(mesmoTelefone("21988887777", "11988887777")).toBe(false);
  });
  it("número incompleto nunca casa", () => {
    expect(mesmoTelefone("988887777", "988887777")).toBe(false);
  });
});

describe("formas do telefone para a consulta", () => {
  it("inclui sem 9, com 9 e com 55", () => {
    expect(formasDoTelefone("+5511988887777").sort()).toEqual(
      ["1188887777", "11988887777", "551188887777", "5511988887777"].sort()
    );
  });
  it("fixo não ganha variante de celular", () => {
    expect(formasDoTelefone("1133334444").sort()).toEqual(["1133334444", "551133334444"].sort());
  });
});

describe("quando vincular", () => {
  const balcao = { uid: null, name: "Bruno Teste", whatsapp: "11988887777", active: true, mergedInto: null };
  const conta = { uid: "conta-1", name: "Bruno", whatsapp: "11988887777", active: true, mergedInto: null };

  it("balcão livre em conta: vincula", () => {
    expect(decidirVinculo({ deId: "b1", de: balcao, paraId: "conta-1", para: conta })).toEqual({ vincular: true });
  });
  it("conta que ainda não tem cadastro (entrou por SMS e nunca marcou): vincula", () => {
    expect(decidirVinculo({ deId: "b1", de: balcao, paraId: "conta-1", para: null })).toEqual({ vincular: true });
  });
  it("de novo, no mesmo destino: idempotente", () => {
    const r = decidirVinculo({ deId: "b1", de: { ...balcao, mergedInto: "conta-1" }, paraId: "conta-1", para: conta });
    expect(r).toMatchObject({ vincular: false, jaVinculado: true });
  });
  it("🔒 balcão já vinculado a OUTRA conta: não", () => {
    const r = decidirVinculo({ deId: "b1", de: { ...balcao, mergedInto: "conta-2" }, paraId: "conta-1", para: conta });
    expect(r).toMatchObject({ vincular: false, jaVinculado: false });
  });
  it("🔒 origem que já é conta: seriam duas pessoas", () => {
    const r = decidirVinculo({ deId: "b1", de: { ...balcao, uid: "outra" }, paraId: "conta-1", para: conta });
    expect(r.vincular).toBe(false);
  });
  it("🔒 destino que não é conta (outro balcão): não", () => {
    const r = decidirVinculo({ deId: "b1", de: balcao, paraId: "b2", para: { ...balcao } });
    expect(r.vincular).toBe(false);
  });
  it("origem inexistente ou igual ao destino: não", () => {
    expect(decidirVinculo({ deId: "b1", de: null, paraId: "conta-1", para: conta }).vincular).toBe(false);
    expect(decidirVinculo({ deId: "conta-1", de: balcao, paraId: "conta-1", para: conta }).vincular).toBe(false);
  });
});
