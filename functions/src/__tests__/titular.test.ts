import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Timestamp } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";
import {
  MARCADOR_ANONIMO,
  motivosParaRecusar,
  paraJson,
  patchDaMensagem,
  patchDeIdentificacao,
  semIdentificacao,
  variantesDoTelefone,
} from "../anonimizacao";

/**
 * Direitos do titular — as regras puras e as guardas das portas.
 *
 * A execução contra o banco (o que muda de fato em cada coleção) está em
 * `titular-transacao.test.ts`, que roda no emulador. Aqui fica o que decide:
 * o que conta como dado identificador, quando recusar, e quem pode chamar.
 */

describe("o que sai de um documento que FICA", () => {
  it("a reserva perde nome e telefone, e mantém o fato", () => {
    const reserva = {
      clientId: "u1",
      clientName: "João da Silva",
      clientWhatsapp: "11988887777",
      staffName: "Pedro",
      value: 50,
      date: "2026-09-01",
      status: "completed",
    };
    expect(patchDeIdentificacao(reserva)).toEqual({
      clientName: MARCADOR_ANONIMO,
      clientWhatsapp: "",
    });
  });

  it("não toca no barbeiro — ele não é o titular que pediu", () => {
    const patch = patchDeIdentificacao({ clientName: "João", staffName: "Pedro" });
    expect(patch).not.toHaveProperty("staffName");
  });

  it("a mensalidade perde os dois campos de nome", () => {
    /* `name` duplica `clientName` em `subscriptions` (mensalistas.ts:431).
     * Limpar só um deixaria o nome na tela Mensal. */
    expect(patchDeIdentificacao({ clientName: "João", name: "João", price: 149 })).toEqual({
      clientName: MARCADOR_ANONIMO,
      name: MARCADOR_ANONIMO,
    });
  });

  it("o cadastro perde nome e WhatsApp", () => {
    expect(
      patchDeIdentificacao({ uid: "u1", name: "João", whatsapp: "11988887777", origin: "app" })
    ).toEqual({ name: MARCADOR_ANONIMO, whatsapp: "" });
  });

  it("idempotente: documento já limpo não gera escrita", () => {
    expect(
      patchDeIdentificacao({ clientName: MARCADOR_ANONIMO, clientWhatsapp: "", value: 50 })
    ).toBeNull();
  });

  it("não inventa campo que o documento não tinha", () => {
    expect(patchDeIdentificacao({ value: 50, date: "2026-09-01" })).toBeNull();
  });

  it("o telefone vira vazio, não o marcador — vazio não casa na deduplicação", () => {
    /* Com um marcador comum a todos, o próximo cadastro de balcão com esse
     * "telefone" reencontraria um anonimizado qualquer. */
    const patch = patchDeIdentificacao({ whatsapp: "11988887777" })!;
    expect(patch.whatsapp).toBe("");
  });
});

describe("a mensagem de WhatsApp", () => {
  it("perde o número e o texto, e mantém que houve mensagem", () => {
    expect(
      patchDaMensagem({ to: "5511988887777", template: "confirmacao_reserva", status: "enviado" })
    ).toEqual({ to: "" });
    expect(patchDaMensagem({ de: "5511988887777", texto: "oi, sou o João", tipo: "text" })).toEqual({
      de: "",
      texto: null,
    });
  });

  it("idempotente", () => {
    expect(patchDaMensagem({ to: "", de: "", texto: null })).toBeNull();
  });
});

describe("as formas do mesmo telefone", () => {
  it("o cadastro guarda sem 55 e o WhatsApp com 55 — procura as duas", () => {
    expect(variantesDoTelefone("11988887777").sort()).toEqual(
      ["11988887777", "5511988887777"].sort()
    );
    expect(variantesDoTelefone("5511988887777").sort()).toEqual(
      ["11988887777", "5511988887777"].sort()
    );
  });

  it("aceita máscara", () => {
    expect(variantesDoTelefone("(11) 98888-7777")).toContain("11988887777");
  });

  it("número incompleto não gera chave — não apaga a conversa de outra pessoa", () => {
    expect(variantesDoTelefone("")).toEqual([]);
    expect(variantesDoTelefone("9888")).toEqual([]);
    expect(variantesDoTelefone(undefined)).toEqual([]);
  });
});

describe("quando recusar", () => {
  const hoje = "2026-09-23";

  it("reserva marcada de hoje em diante trava", () => {
    const m = motivosParaRecusar({
      reservas: [{ status: "confirmed", date: "2026-09-25" }],
      assinaturas: [],
      hoje,
    });
    expect(m).toHaveLength(1);
    expect(m[0]).toMatch(/1 horário/);
  });

  it("reserva de hoje também trava — o barbeiro ainda espera a pessoa", () => {
    expect(
      motivosParaRecusar({ reservas: [{ status: "confirmed", date: hoje }], assinaturas: [], hoje })
    ).toHaveLength(1);
  });

  it("reserva em aberto de dias passados NÃO trava", () => {
    /* É pendência do dono, e o titular não tem como resolvê-la — travar
     * deixaria o direito dele refém de uma tarefa alheia. */
    expect(
      motivosParaRecusar({
        reservas: [{ status: "confirmed", date: "2026-09-01" }],
        assinaturas: [],
        hoje,
      })
    ).toEqual([]);
  });

  it("concluída ou cancelada no futuro não trava", () => {
    expect(
      motivosParaRecusar({
        reservas: [
          { status: "completed", date: "2026-09-30" },
          { status: "cancelled_by_client", date: "2026-09-30" },
        ],
        assinaturas: [],
        hoje,
      })
    ).toEqual([]);
  });

  it("mensalidade ativa trava; cancelada não", () => {
    expect(motivosParaRecusar({ reservas: [], assinaturas: [{ status: "ativo" }], hoje })).toHaveLength(1);
    expect(motivosParaRecusar({ reservas: [], assinaturas: [{ status: "cancelado" }], hoje })).toEqual([]);
  });
});

describe("o arquivo fiscal", () => {
  it("mantém valor, data e ids; tira nome, telefone e e-mail em qualquer profundidade", () => {
    const quando = Timestamp.fromDate(new Date("2026-09-01T12:00:00Z"));
    const limpo = semIdentificacao({
      clientId: "u1",
      grossAmount: 50,
      date: "2026-09-01",
      createdAt: quando,
      clientName: "João",
      detail: { ownerEmail: "dono@x.com", slug: "alfa", itens: [{ staffName: "Pedro", valor: 10 }] },
    });
    expect(limpo).toEqual({
      clientId: "u1",
      grossAmount: 50,
      date: "2026-09-01",
      createdAt: quando,
      detail: { slug: "alfa", itens: [{ valor: 10 }] },
    });
  });

  it("não desmonta o Timestamp — a data do fato é o que precisa ficar", () => {
    const quando = Timestamp.now();
    expect(semIdentificacao({ at: quando }).at).toBe(quando);
  });
});

describe("a exportação é legível", () => {
  it("Timestamp vira ISO 8601", () => {
    const quando = Timestamp.fromDate(new Date("2026-09-01T12:00:00Z"));
    expect(paraJson({ at: quando, lista: [quando], n: 1, s: "x", nulo: null })).toEqual({
      at: "2026-09-01T12:00:00.000Z",
      lista: ["2026-09-01T12:00:00.000Z"],
      n: 1,
      s: "x",
      nulo: null,
    });
  });
});

/* ------------------------------------------------------------------ */
/* As portas — estrutural, no mesmo padrão de autorizacao-functions    */
/* ------------------------------------------------------------------ */

const fonte = readFileSync(resolve(__dirname, "../titular.ts"), "utf8");

function corpoDe(nome: string): string {
  const inicio = fonte.indexOf(`export const ${nome} = onCall`);
  expect(inicio, `${nome} não encontrada`).toBeGreaterThanOrEqual(0);
  const resto = fonte.slice(inicio + 1);
  const fim = resto.search(/\n\/\*\*|\nexport const /);
  return fim === -1 ? resto : resto.slice(0, fim);
}

describe("quem pode chamar", () => {
  it.each(["exportarDadosDoCliente", "anonimizarCliente"])(
    "🔒 %s é só do DONO daquela barbearia — não da equipe",
    (nome) => {
      const corpo = corpoDe(nome);
      expect(corpo).toMatch(/request\.auth/);
      expect(corpo).toMatch(/token\.barbershops/);
      expect(corpo).toMatch(/=== "owner"/);
      expect(corpo).not.toMatch(/"staff"/);
      expect(corpo).toMatch(/permission-denied/);
    }
  );

  it("🔒 a guarda vem ANTES de qualquer leitura ou escrita", () => {
    for (const nome of ["exportarDadosDoCliente", "anonimizarCliente"]) {
      const corpo = corpoDe(nome);
      expect(corpo.indexOf("permission-denied")).toBeLessThan(corpo.indexOf("getFirestore()"));
    }
  });

  it("🔒 excluirMinhaConta age só sobre o próprio uid — não recebe id de ninguém", () => {
    const corpo = corpoDe("excluirMinhaConta");
    expect(corpo).not.toMatch(/request\.data/);
    expect(corpo).toMatch(/uid\s*\}\)/); // excluirContaDoCliente({ ..., uid })
  });

  it("🔒 excluirMinhaConta recusa dono, equipe e operador", () => {
    /* Apagar essa conta deixaria uma barbearia sem dono. */
    const corpo = corpoDe("excluirMinhaConta");
    expect(corpo).toMatch(/token\.barbershops/);
    expect(corpo).toMatch(/platformAdmin/);
  });

  it("🔒 excluirMinhaConta exige login recente", () => {
    const corpo = corpoDe("excluirMinhaConta");
    expect(corpo).toMatch(/auth_time/);
    expect(corpo).toMatch(/LOGIN_RECENTE_SEGUNDOS/);
  });

  it("o Auth é apagado por ÚLTIMO — com ele vivo, a pessoa ainda pode repetir o pedido", () => {
    const nucleo = fonte.slice(fonte.indexOf("export async function excluirContaDoCliente"));
    const posAuth = nucleo.indexOf("auth.deleteUser");
    expect(posAuth).toBeGreaterThan(nucleo.indexOf("anonimizarNaBarbearia("));
    expect(posAuth).toBeGreaterThan(nucleo.indexOf("recursiveDelete(perfilRef)"));
  });

  it("o selo do cadastro e o audit_log são gravados por último, juntos", () => {
    const nucleo = fonte.slice(fonte.indexOf("export async function anonimizarNaBarbearia"));
    const selo = nucleo.indexOf("anonimizadoEm: FieldValue.serverTimestamp()");
    expect(selo).toBeGreaterThan(nucleo.indexOf("for (const pedaco of emPedacos(escritas"));
    expect(nucleo.indexOf('action: "titular.anonimizado"')).toBeGreaterThan(selo);
  });

  it("🔒 o log de anonimização não guarda o nome — só id e contagens", () => {
    const nucleo = fonte.slice(fonte.indexOf('action: "titular.anonimizado"'));
    const detalhe = nucleo.slice(0, nucleo.indexOf("});"));
    expect(detalhe).not.toMatch(/name|whatsapp|telefone/i);
  });
});
