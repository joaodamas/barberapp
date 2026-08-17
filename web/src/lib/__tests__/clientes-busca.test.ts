import { describe, expect, it } from "vitest";
import { combinaComBusca, filtrarClientes } from "@/lib/clientes-busca";

/**
 * G3 · a busca que impede o cadastro duplicado.
 *
 * Escrito depois de o defeito aparecer **na tela**, não em revisão de código: a
 * primeira versão usava `normalizarWhatsapp` — a função de gravar — para
 * comparar, e todo fragmento de número virava string vazia. Com o Seu Zé
 * cadastrado como "(11) 97777-6666", buscar "97777" devolvia nada.
 *
 * O dono não acha, clica em "Cliente novo", e nasce o segundo cadastro da mesma
 * pessoa — exatamente o que G3 existe para evitar, por uma função de duas
 * linhas usada no lugar errado.
 */

const ze = { name: "Seu Zé da Esquina", whatsapp: "5511977776666", active: true };
const ana = { name: "Ana Paula", whatsapp: "5511955554444", active: true };
const fundido = { name: "Zé antigo", whatsapp: "5511900001111", active: false };

describe("G3 · busca de cliente por número", () => {
  it("acha pelo FINAL do celular — é como o dono procura", () => {
    /* Ele pergunta "qual o final?" e digita quatro ou cinco dígitos. Exigir o
     * número inteiro transforma a busca em digitação, e digitação com cliente
     * esperando em pé é o que faz pular para "Cliente novo". */
    expect(combinaComBusca(ze, "97777")).toBe(true);
    expect(combinaComBusca(ze, "6666")).toBe(true);
    expect(combinaComBusca(ze, "7776666")).toBe(true);
  });

  it("acha pelo número inteiro, com ou sem DDI", () => {
    expect(combinaComBusca(ze, "11977776666")).toBe(true);
    expect(combinaComBusca(ze, "5511977776666")).toBe(true);
  });

  it("acha com o número formatado como a pessoa escreve", () => {
    expect(combinaComBusca(ze, "(11) 97777-6666")).toBe(true);
    expect(combinaComBusca(ze, "11 97777 6666")).toBe(true);
  });

  it("não confunde com o número de outra pessoa", () => {
    expect(combinaComBusca(ana, "97777")).toBe(false);
  });

  it("menos de três dígitos não é busca, é ruído", () => {
    /* "1" casaria com quase todo mundo e esconderia o cliente certo no meio da
     * lista — pior que não achar, porque o dono acha que procurou. */
    expect(combinaComBusca(ze, "1")).toBe(false);
    expect(combinaComBusca(ze, "55")).toBe(false);
  });
});

describe("G3 · busca de cliente por nome", () => {
  it("acha por trecho, sem ligar para maiúscula", () => {
    expect(combinaComBusca(ze, "zé")).toBe(true);
    expect(combinaComBusca(ze, "ZÉ")).toBe(true);
    expect(combinaComBusca(ze, "esquina")).toBe(true);
  });

  it("não acha quem não tem o trecho", () => {
    expect(combinaComBusca(ana, "esquina")).toBe(false);
  });

  it("busca vazia devolve todo mundo", () => {
    expect(combinaComBusca(ze, "")).toBe(true);
    expect(combinaComBusca(ze, "   ")).toBe(true);
  });
});

describe("G3 · a lista que o dono vê", () => {
  it("cadastro fundido fica de fora", () => {
    /* Marcar reserva num cadastro inativo criaria histórico num registro já
     * substituído, e o atendimento sumiria da ficha para onde a pessoa migrou. */
    const r = filtrarClientes([ze, ana, fundido], "zé");
    expect(r.map((c) => c.name)).toEqual(["Seu Zé da Esquina"]);
  });

  it("limita a lista para o dono não rolar a carteira inteira", () => {
    const muitos = Array.from({ length: 30 }, (_, i) => ({
      name: `Cliente ${i}`,
      whatsapp: `551199999${String(i).padStart(4, "0")}`,
      active: true,
    }));
    expect(filtrarClientes(muitos, "")).toHaveLength(8);
  });

  it("cliente sem WhatsApp não quebra a busca por número", () => {
    /* O número é opcional no balcão: a pessoa pode não querer dar. */
    const semNumero = { name: "Anônimo", whatsapp: "", active: true };
    expect(combinaComBusca(semNumero, "97777")).toBe(false);
    expect(combinaComBusca(semNumero, "anôn")).toBe(true);
  });
});
