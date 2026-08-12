import { describe, expect, it } from "vitest";
import { alvosDoExpurgo, DIAS_ATE_O_EXPURGO, venceuAJanela } from "../data-deletion";

/**
 * A Política de Privacidade promete exclusão em 30 dias após o encerramento.
 * Estes testes existem para que a promessa não vire ficção sem ninguém notar —
 * é o mesmo problema que este projeto já teve, agora com efeito legal.
 */
const DIA = 24 * 60 * 60 * 1000;
const AGORA = new Date("2026-09-15T12:00:00Z").getTime();

describe("janela de exportação", () => {
  it("no trigésimo dia, vence", () => {
    expect(venceuAJanela(AGORA - 30 * DIA, AGORA)).toBe(true);
  });

  it("no vigésimo nono, ainda não", () => {
    expect(venceuAJanela(AGORA - 29 * DIA, AGORA)).toBe(false);
  });

  it("recém-encerrada não é apagada por engano", () => {
    expect(venceuAJanela(AGORA, AGORA)).toBe(false);
  });

  it("sem data de encerramento, nunca vence", () => {
    /* Documento sem `encerradaEmMs` — status gravado à mão no console, ou
     * escrita parcial. O default seguro de uma rotina que APAGA é não apagar:
     * `undefined` virando 0 faria "encerrada em 1970" e expurgo imediato. */
    expect(venceuAJanela(undefined, AGORA)).toBe(false);
    expect(venceuAJanela(null, AGORA)).toBe(false);
    expect(venceuAJanela(NaN, AGORA)).toBe(false);
    expect(venceuAJanela(0, AGORA)).toBe(false);
  });

  it("a janela prometida na política é a que o código usa", () => {
    expect(DIAS_ATE_O_EXPURGO).toBe(30);
  });
});

describe("o que o expurgo alcança", () => {
  const alvos = alvosDoExpurgo("shop1", "osiqueira");
  const caminhos = JSON.stringify(alvos);

  it("apaga a barbearia inteira, e não coleção por coleção", () => {
    /* Enumerar subcoleção à mão é garantir esquecer a próxima que entrar — e
     * a que ficar para trás carrega histórico de atendimento de cliente. */
    expect(alvos).toContainEqual({ tipo: "arvore", caminho: "barbershops/shop1" });
  });

  it("libera o subdomínio", () => {
    // Sem isto o endereço fica preso a uma barbearia que não existe mais.
    expect(alvos).toContainEqual({ tipo: "documento", caminho: "slugs/osiqueira" });
  });

  it("alcança o dado pessoal que mora FORA da árvore da barbearia", () => {
    /* `whatsapp_conversations` usa o TELEFONE DO CLIENTE como id do documento,
     * na raiz do banco. Um recursiveDelete na barbearia deixaria o telefone
     * para trás — e a política afirmando que não deixou. */
    expect(caminhos).toContain("whatsapp_conversations");
    expect(caminhos).toContain("whatsapp_sent");
    expect(caminhos).toContain("whatsapp_numbers");
  });

  it("remove o vínculo da equipe, que vive debaixo de cada usuário", () => {
    expect(alvos).toContainEqual({
      tipo: "grupo",
      colecao: "memberships",
      documento: "shop1",
    });
  });

  it("barbearia sem slug não gera alvo inválido", () => {
    const semSlug = alvosDoExpurgo("shop1", null);
    expect(semSlug.some((a) => "caminho" in a && a.caminho.startsWith("slugs/"))).toBe(false);
  });

  it("nenhum alvo carrega o id de outra barbearia", () => {
    // Apagar uma conta não pode alcançar dado de quem não pediu nada.
    expect(caminhos).not.toContain("shop2");
    for (const alvo of alvos) {
      if (alvo.tipo === "consulta") expect(alvo.valor).toBe("shop1");
      if (alvo.tipo === "grupo") expect(alvo.documento).toBe("shop1");
    }
  });
});
