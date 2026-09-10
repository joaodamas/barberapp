import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { COLECOES_DE_MOVIMENTO } from "../comecar-do-zero";

/**
 * A porta que apaga — e o contrato do que ela NÃO pode apagar.
 *
 * > *"como tiro o registro que você fez no mês?"*
 *
 * Não há como testar o apagamento sem emulador, e não é isso que estes casos
 * guardam. O risco desta função não é ela falhar: é ela **funcionar sobre a
 * coleção errada**. Uma linha a mais na lista apaga a equipe, os serviços ou os
 * clientes de uma barbearia real, e nenhum teste de comportamento pegaria isso
 * — a operação teria sido um sucesso.
 *
 * Por isso o que se prova aqui é a LISTA, e as guardas que cercam a chamada.
 */

const FONTE = readFileSync(resolve(__dirname, "../comecar-do-zero.ts"), "utf8");

/** O que é cadastro da barbearia e não pode sumir. */
const CADASTRO = [
  "members",
  "staff",
  "services",
  "plans",
  "products",
  "clients",
  "schedules",
  "private",
];

describe("o que a lista NÃO contém", () => {
  it("🔒 nenhuma coleção de cadastro entra na lista", () => {
    /* O dono está começando a operar, não recomeçando o cadastro. Refazer
     * equipe, serviços e preços é justamente o que faria ele desistir de
     * limpar e conviver com o mês sujo. */
    for (const colecao of CADASTRO) {
      expect(COLECOES_DE_MOVIMENTO).not.toContain(colecao);
    }
  });

  it("🔒 `audit_log` fica inteiro", () => {
    /* Ele passa a descrever fatos que não existem mais, e isso é correto: o
     * rastro é de que a coisa aconteceu, não de que ela continua lá. Apagar o
     * log junto tornaria esta a única operação do produto capaz de acontecer
     * sem ninguém saber depois. */
    expect(COLECOES_DE_MOVIMENTO).not.toContain("audit_log");
  });

  it("🔒 nenhuma coleção fora da barbearia é alcançável", () => {
    /* Todo caminho sai de `shopRef`. Um `db.collection("users")` aqui dentro
     * sairia do tenant, e o Admin SDK ignora as regras que barrariam isso. */
    expect(FONTE).not.toMatch(/db\.collection\(/);
    expect(FONTE.match(/shopRef\.collection\(/g)?.length).toBeGreaterThan(0);
  });
});

describe("o que a lista contém", () => {
  it("cobre o movimento financeiro inteiro", () => {
    /* Se `payments` sair e `bookings` ficar, o dono zera a agenda e continua
     * com a receita do teste no DRE — o pior resultado possível, porque a tela
     * diria que deu certo. */
    for (const colecao of ["bookings", "payments", "commissions", "refunds", "cash_entries"]) {
      expect(COLECOES_DE_MOVIMENTO).toContain(colecao);
    }
  });

  it("não repete coleção", () => {
    expect(new Set(COLECOES_DE_MOVIMENTO).size).toBe(COLECOES_DE_MOVIMENTO.length);
  });
});

describe("as guardas da chamada", () => {
  it("🔒 é dono-only, pelo claim e não pelo parâmetro", () => {
    /* Mesma guarda de `corrigirPagamentoDeAtendimento` e `registrarEstorno`: as
     * regras do Firestore protegem o dado e o Admin SDK as ignora. Sem ela, o
     * dono da Alfa zeraria a Beta com um token válido. */
    expect(FONTE).toContain('request.auth?.token.barbershops');
    expect(FONTE).toMatch(/papel !== "owner"/);
  });

  it("🔒 só a palavra exata executa — qualquer outra coisa apenas conta", () => {
    expect(FONTE).toMatch(/confirmacao !== "ZERAR"/);
    expect(FONTE).toContain('modo: "previa"');
  });

  it("🔒 o registro no `audit_log` vem ANTES da primeira exclusão", () => {
    /* Na ordem inversa, uma função que morre no meio deixa um banco vazio sem
     * uma linha explicando por quê — indistinguível de perda de dados. */
    const log = FONTE.indexOf('collection("audit_log")');
    const apaga = FONTE.indexOf("apagarColecao(db,");
    expect(log).toBeGreaterThan(0);
    expect(apaga).toBeGreaterThan(0);
    expect(log).toBeLessThan(apaga);
  });

  it("🔒 responde quanto SOBROU quando bate no teto", () => {
    /* O teto existe para a função de 60s não morrer no meio. Se ela bateu nele
     * e a tela disser "pronto", o dono acha que limpou e não limpou. */
    expect(FONTE).toContain("sobrou:");
  });

  it("🔒 o estoque acompanha os movimentos que o explicavam", () => {
    /* `products.stock` é o saldo dos movimentos. Mantê-lo com os movimentos
     * apagados deixaria o produto afirmando oito unidades sem uma linha que
     * explique de onde vieram. */
    expect(FONTE).toMatch(/update\(p\.ref, \{ stock: 0 \}\)/);
  });
});
