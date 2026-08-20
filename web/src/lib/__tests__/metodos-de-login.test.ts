import { describe, expect, it } from "vitest";
import {
  metodoPadrao,
  metodosDisponiveis,
  mostrarSeletor,
  SMS_HABILITADO,
} from "@/lib/metodos-de-login";

/**
 * P1-15 — o primeiro caminho de login precisa funcionar.
 *
 * O defeito não era a aba estar errada: era o padrão apontar para um método
 * que o projeto não tem habilitado. Corrigir o visual e deixar a regra no JSX
 * deixaria o mesmo erro voltar na próxima vez que alguém mexesse na ordem.
 */
describe("P1-15 · métodos de login", () => {
  it("O PADRÃO ESTÁ ENTRE OS DISPONÍVEIS — a invariante que faltava", () => {
    /* Era exatamente isto que estava quebrado: o padrão era `phone` e `phone`
     * não estava disponível. Vale para os dois estados da chave, hoje e depois
     * de o provider entrar. */
    for (const sms of [false, true]) {
      expect(metodosDisponiveis(sms)).toContain(metodoPadrao(sms));
    }
  });

  it("sem provider de SMS, o e-mail abre", () => {
    expect(metodoPadrao(false)).toBe("email");
    expect(metodosDisponiveis(false)).toEqual(["email"]);
  });

  it("sem provider de SMS, a escolha nem é oferecida", () => {
    /* Mostrar uma aba que não funciona é pior do que não mostrar aba: a pessoa
     * escolhe, digita o número, pede o código e leva um erro que fala de
     * "projeto". */
    expect(mostrarSeletor(false)).toBe(false);
  });

  it("com o provider ligado, a aba volta — e o celular volta a ser o padrão", () => {
    /* A chave é o caminho de volta, não uma remoção. Se ligar o provider não
     * restaurasse o comportamento, a correção teria apagado um recurso em vez
     * de desligá-lo. */
    expect(mostrarSeletor(true)).toBe(true);
    expect(metodosDisponiveis(true)).toEqual(["phone", "email"]);
    expect(metodoPadrao(true)).toBe("phone");
  });

  it("a chave reflete o estado real do projeto", () => {
    /* Se o provider Phone for habilitado no Firebase Auth, esta linha muda e o
     * teste acima é quem garante que o resto acompanha. */
    expect(SMS_HABILITADO).toBe(false);
    expect(metodoPadrao()).toBe("email");
    expect(mostrarSeletor()).toBe(false);
  });
});
