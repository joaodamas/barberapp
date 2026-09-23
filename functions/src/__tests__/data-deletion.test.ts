import { describe, expect, it } from "vitest";
import {
  alvosDoExpurgo,
  ANOS_DE_RETENCAO_FISCAL,
  COLECOES_FISCAIS,
  destinoDaConta,
  DIAS_ATE_O_EXPURGO,
  statusAoReabrir,
  venceuAJanela,
} from "../data-deletion";

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

  it("cuida das contas de dono e equipe, lendo `members` da própria barbearia", () => {
    /* Este caso afirmava o alvo `grupo memberships` — uma coleção que nada
     * escreve, varrida na plataforma inteira para apagar zero documentos. Era
     * teste codificando o defeito. O vínculo vive no claim e em `members/`. */
    expect(alvos).toContainEqual({ tipo: "contas", membros: "barbershops/shop1/members" });
    expect(caminhos).not.toContain("memberships");
  });

  it("alcança o Storage da barbearia, e só o dela", () => {
    expect(alvos).toContainEqual({ tipo: "storage", prefixo: "barbershops/shop1/" });
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
    }
  });
});

describe("a ordem do expurgo — P0-5", () => {
  const alvos = alvosDoExpurgo("shop1", "osiqueira");
  const posicao = (tipo: string) => alvos.findIndex((a) => a.tipo === tipo);

  it("a árvore da barbearia é o ÚLTIMO alvo", () => {
    /* A rotina reencontra a conta pelo documento da barbearia. Com a árvore
     * primeiro, qualquer falha depois deixava slug e telefones órfãos para
     * sempre — a próxima execução não achava mais a conta. */
    expect(alvos[alvos.length - 1]).toEqual({ tipo: "arvore", caminho: "barbershops/shop1" });
    expect(alvos.filter((a) => a.tipo === "arvore")).toHaveLength(1);
  });

  it("o selo vem primeiro, e o arquivo fiscal antes de qualquer exclusão", () => {
    expect(posicao("marcar")).toBe(0);
    expect(posicao("arquivar")).toBe(1);
    for (const destrutivo of ["consulta", "storage", "contas", "documento", "arvore"]) {
      expect(posicao(destrutivo)).toBeGreaterThan(posicao("arquivar"));
    }
  });

  it("as contas são tratadas antes da árvore, que é onde `members` mora", () => {
    expect(posicao("contas")).toBeLessThan(posicao("arvore"));
  });
});

describe("retenção fiscal — o que a Política §6 promete", () => {
  it("retém pagamentos, estornos, comissões, caixa, despesas, faturas e auditoria", () => {
    for (const c of [
      "payments",
      "refunds",
      "commissions",
      "cash_entries",
      "expenses",
      "subscription_invoices",
      "audit_log",
    ]) {
      expect(COLECOES_FISCAIS).toContain(c);
    }
  });

  it("não retém cadastro nem agenda — isso é dado pessoal, e sai", () => {
    for (const c of ["clients", "bookings", "whatsapp_messages", "members", "staff"]) {
      expect(COLECOES_FISCAIS as readonly string[]).not.toContain(c);
    }
  });

  it("o arquivo vai para fora da árvore, e o prazo é o declarado", () => {
    const arquivar = alvosDoExpurgo("shop1", null).find((a) => a.tipo === "arquivar");
    expect(arquivar).toMatchObject({ destino: "arquivo_fiscal/shop1" });
    expect(ANOS_DE_RETENCAO_FISCAL).toBe(5);
  });
});

describe("o destino da conta de quem trabalhava na barbearia", () => {
  const base = { outrasBarbearias: 0, operadorDaPlataforma: false, clienteEmOutraBarbearia: false };

  it("só desta barbearia, e de mais nada: apaga", () => {
    expect(destinoDaConta(base)).toBe("apagar");
  });

  it("barbeiro que trabalha em outra casa perde só o vínculo", () => {
    expect(destinoDaConta({ ...base, outrasBarbearias: 1 })).toBe("so_vinculo");
  });

  it("dono que corta em outra barbearia perde só o vínculo", () => {
    expect(destinoDaConta({ ...base, clienteEmOutraBarbearia: true })).toBe("so_vinculo");
  });

  it("🔒 o operador da plataforma nunca é apagado por uma barbearia fechar", () => {
    expect(destinoDaConta({ ...base, operadorDaPlataforma: true })).toBe("so_vinculo");
  });
});

describe("reabrir devolve o que era", () => {
  it("ativa volta ativa — não suspensa", () => {
    /* `reabrirConta` gravava sempre `suspenso`: a barbearia pagante que se
     * arrependesse voltava bloqueada. */
    expect(statusAoReabrir("ativo")).toBe("ativo");
  });

  it("em teste volta em teste", () => {
    expect(statusAoReabrir("trial")).toBe("trial");
  });

  it("sem o dado, o mínimo — nunca o generoso", () => {
    expect(statusAoReabrir(undefined)).toBe("suspenso");
    expect(statusAoReabrir(null)).toBe("suspenso");
    expect(statusAoReabrir("encerrada")).toBe("suspenso");
    expect(statusAoReabrir("qualquer")).toBe("suspenso");
  });
});
