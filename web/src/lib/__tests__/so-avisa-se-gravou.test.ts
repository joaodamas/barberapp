import { describe, expect, it, vi } from "vitest";
import { soAvisaSeGravou } from "@/lib/so-avisa-se-gravou";

/**
 * O teste que o defeito pediu.
 *
 * Aprovar um encaixe abria o WhatsApp do cliente com "seu encaixe foi
 * confirmado" **antes** de saber se a reserva tinha sido gravada. Com a rede
 * caindo, o dono confirmava a um terceiro algo que não existia.
 *
 * Uma validação com internet boa passa por cima disso sem notar — o defeito só
 * existe na condição de falha.
 */
describe("gravação rejeitada", () => {
  it("NÃO avisa ninguém", async () => {
    const avisar = vi.fn();
    const r = await soAvisaSeGravou({
      gravar: () => Promise.reject(new Error("FirebaseError: unavailable")),
      avisar,
    });

    expect(avisar).not.toHaveBeenCalled();
    expect(r.ok).toBe(false);
  });

  it("devolve uma frase para quem está no balcão, não o erro do SDK", async () => {
    const semRede = await soAvisaSeGravou({
      gravar: () => Promise.reject(new Error("FirebaseError: client is offline")),
    });
    const semPermissao = await soAvisaSeGravou({
      gravar: () => Promise.reject(new Error("Missing or insufficient permissions")),
    });

    expect(semRede.ok).toBe(false);
    expect(semPermissao.ok).toBe(false);
    if (!semRede.ok) {
      expect(semRede.erro).toMatch(/conex[ãa]o/i);
      // O que importa para quem está com um cliente esperando.
      expect(semRede.erro).toMatch(/nada foi salvo/i);
      expect(semRede.erro).not.toMatch(/FirebaseError/);
    }
    if (!semPermissao.ok) expect(semPermissao.erro).toMatch(/permiss[ãa]o/i);
  });

  it("erro que não se reconhece ainda diz que nada mudou", async () => {
    const r = await soAvisaSeGravou({ gravar: () => Promise.reject(new Error("???")) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toMatch(/nada foi alterado/i);
  });
});

describe("gravação aceita", () => {
  it("avisa, e só depois de a escrita ter resolvido", async () => {
    const ordem: string[] = [];
    const r = await soAvisaSeGravou({
      gravar: async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        ordem.push("gravou");
      },
      avisar: () => ordem.push("avisou"),
    });

    expect(r.ok).toBe(true);
    // A ordem É a regra: invertida, o cliente recebe a mensagem antes do fato.
    expect(ordem).toEqual(["gravou", "avisou"]);
  });

  it("ação sem aviso não quebra — nem toda escrita comunica alguém", async () => {
    const r = await soAvisaSeGravou({ gravar: async () => undefined });
    expect(r.ok).toBe(true);
  });
});
