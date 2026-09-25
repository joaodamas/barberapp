import { describe, expect, it } from "vitest";
import { alguemFaz, fazTodos, quemFaz } from "@/lib/quem-faz";

const romulo = { id: "romulo", serviceIds: ["barba", "corte-barba"] };
const novato = { id: "novato", serviceIds: [] };
const semCampo: { id: string; serviceIds?: string[] } = { id: "sem-campo" };

describe("quem faz os serviços", () => {
  it("lista vazia ou ausente atende tudo", () => {
    expect(fazTodos(novato, ["corte"])).toBe(true);
    expect(fazTodos(semCampo, ["corte", "barba"])).toBe(true);
  });

  it("lista fechada precisa conter TODOS os escolhidos", () => {
    expect(fazTodos(romulo, ["barba"])).toBe(true);
    expect(fazTodos(romulo, ["barba", "corte"])).toBe(false);
  });

  // O caso do O Siqueira: um barbeiro só, que não faz "corte". Ele NÃO pode
  // ser escolhido sozinho para o corte só por ser o único.
  it("o barbeiro único que não faz o serviço fica de fora", () => {
    expect(quemFaz([romulo], ["corte"])).toEqual([]);
    expect(quemFaz([romulo], ["barba"])).toEqual([romulo]);
  });

  it("serviço que ninguém faz não é oferecido", () => {
    expect(alguemFaz([romulo], "corte")).toBe(false);
    expect(alguemFaz([romulo, novato], "corte")).toBe(true);
  });
});
