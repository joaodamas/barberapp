import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { estadoDosHorarios } from "./estado-dos-horarios";

/**
 * N7 · `/agendar` não afirma "não há horário" antes de perguntar.
 *
 * O defeito que estes testes guardam foi visto na tela em 18/08, com o produto
 * rodando e a base semeada: barbearia com dois barbeiros, cliente no passo 2,
 * nenhum profissional escolhido — e a tela dizendo *"Nenhum horário livre
 * comporta 30 min neste dia"*. Havia horário livre naquele mesmo dia; ele
 * apareceu ao selecionar um profissional, sem nada mudar no banco.
 *
 * O caso do meio (`carregando`) é o mesmo defeito em escala menor e atinge
 * TODA barbearia, inclusive as de um barbeiro só: entre o pedido e a resposta
 * de `availableSlots`, a lista também é `null`, e a tela também afirmava o
 * vazio nesse intervalo.
 */
describe("estadoDosHorarios · null e [] não são a mesma coisa", () => {
  const base = { diaFechado: false, temProfissional: true, horariosLivres: [] as string[] | null };

  it("sem profissional escolhido, PEDE a escolha — não afirma o vazio", () => {
    expect(
      estadoDosHorarios({ ...base, temProfissional: false, horariosLivres: null })
    ).toBe("escolher-profissional");
  });

  /* O `null` aqui é o da resposta que ainda não voltou. Antes, este caso e o
   * de baixo produziam a mesma frase. */
  it("com profissional e resposta a caminho, carrega — não afirma o vazio", () => {
    expect(estadoDosHorarios({ ...base, horariosLivres: null })).toBe("carregando");
  });

  it("com profissional e resposta vazia, aí sim afirma que não há horário", () => {
    expect(estadoDosHorarios({ ...base, horariosLivres: [] })).toBe("sem-horario");
  });

  it("com horário livre, mostra a lista", () => {
    expect(estadoDosHorarios({ ...base, horariosLivres: ["09:00"] })).toBe("com-horario");
  });

  /**
   * A ordem entre os estados é parte da regra: um dia em que a barbearia não
   * abre não vira "escolha o profissional" nem "carregando", porque não há
   * pergunta a fazer. Sem esta precedência a tela pediria uma escolha que não
   * destrava nada.
   */
  it("dia fechado vence tudo, inclusive a falta de profissional", () => {
    expect(
      estadoDosHorarios({ diaFechado: true, temProfissional: false, horariosLivres: null })
    ).toBe("dia-fechado");
    expect(
      estadoDosHorarios({ diaFechado: true, temProfissional: true, horariosLivres: ["09:00"] })
    ).toBe("dia-fechado");
  });

  it("nunca devolve dois estados: cada combinação tem uma resposta só", () => {
    const combinacoes = [false, true].flatMap((diaFechado) =>
      [false, true].flatMap((temProfissional) =>
        [null, [], ["09:00"]].map((horariosLivres) =>
          estadoDosHorarios({ diaFechado, temProfissional, horariosLivres })
        )
      )
    );
    expect(combinacoes).toHaveLength(12);
    expect(combinacoes.every((e) => typeof e === "string" && e.length > 0)).toBe(true);
  });
});

/**
 * A tela consome a regra — senão o arquivo acima vira documentação de algo que
 * ninguém aplica, que é o estado em que o defeito nasceu.
 */
describe("a tela de agendar usa a regra, e não booleano solto", () => {
  const pagina = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

  it("importa estadoDosHorarios", () => {
    expect(pagina).toContain('from "./estado-dos-horarios"');
  });

  it("os cinco ramos do passo 2 saem do estado, não de hasFreeSlot", () => {
    for (const estado of [
      '"dia-fechado"',
      '"escolher-profissional"',
      '"carregando"',
      '"sem-horario"',
      '"com-horario"',
    ]) {
      expect(pagina).toContain(`estadoDaLista === ${estado}`);
    }
    // `hasFreeSlot` era o booleano que colapsava "não perguntei" com "não há".
    expect(pagina).not.toMatch(/const\s+hasFreeSlot/);
  });
});
