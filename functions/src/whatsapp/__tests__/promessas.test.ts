import { describe, expect, it } from "vitest";
import { TEMPLATES, type TemplateDef } from "../templates";

/**
 * D14 — o catálogo não pode prometer o que o produto não faz.
 *
 * O template é o único texto do sistema que chega em quem **não contratou nada
 * com a plataforma**: o cliente da barbearia. Ele não tem painel para conferir,
 * não tem suporte para reclamar, e vai agir com base no que a mensagem disser.
 * Uma frase falsa aqui não é um bug de tela — é uma promessa feita em nome da
 * barbearia, por um sistema que não pode cumpri-la.
 *
 * ## A linha que separa o que fica do que sai
 *
 * > **O produto não move dinheiro. Uma pessoa move.**
 *
 * Texto que descreve um ato humano ("a barbearia devolveu por Pix", "acerte
 * com a gente") é verdadeiro e fica. Texto que promete que o SISTEMA faz
 * ("finalize o pagamento em até 15 minutos", "em até 5 dias úteis na mesma
 * forma de pagamento", "a cobrança automática será processada hoje") é falso e
 * sai — mesmo que o template hoje nunca seja enviado. D14 é latente por
 * definição: ele dispara no dia em que o envio funcionar, e nesse dia ninguém
 * vai reler o catálogo.
 *
 * ## As capacidades que não existem, e a evidência de cada uma
 *
 * Nenhuma foi promovida por leitura de catálogo. Cada uma tem o ponto no
 * código que prova a ausência.
 */
const CAPACIDADES_INEXISTENTES: {
  capacidade: string;
  evidencia: string;
  frases: string[];
}[] = [
  {
    capacidade: "pagamento online",
    evidencia:
      "booking.ts:68 recusa `paymentOrigin` diferente de `in_person` com " +
      '"Pagamento antecipado ainda não está disponível"; :234 grava sempre ' +
      "`in_person`. Nenhuma dependência de gateway no projeto.",
    frases: [
      "finalize o pagamento",
      "pagar pelo link",
      "pague pelo link",
      "pagar pelo app",
      "pagar pelo aplicativo",
      "link de pagamento",
      "regularize pelo link",
      "regularizar em {{",
      "resolve agora pelo link",
      "resolva pelo link",
    ],
  },
  {
    capacidade: "estorno automático",
    evidencia:
      "business-rules.ts `refundAmountFor` devolve `sem_pagamento` sempre que " +
      "`paymentMethod` é nulo — e booking.ts:237 o grava nulo até a conclusão. " +
      "Uma reserva cancelada nunca chegou a `completed`: não há o que estornar.",
    frases: [
      "na mesma forma de pagamento",
      "mesma chave usada no pagamento",
      "100% de devolução",
      "taxa de cancelamento",
      "dias úteis na mesma forma",
    ],
  },
  {
    capacidade: "cobrança recorrente",
    evidencia:
      'subscription.ts:27 — "Não há checkout: a contratação é humana, por ' +
      'WhatsApp". A coleção `subscriptions` não é escrita por nenhum caminho ' +
      "do produto (G2).",
    frases: [
      "cobrança automática",
      "próxima cobrança",
      "cobrança recorrente",
      "tenta de novo automaticamente",
      "cobrança aprovada",
    ],
  },
  {
    capacidade: "pagamento já recebido na confirmação",
    evidencia:
      "booking.ts:237 grava `paymentMethod: null` na criação, e é nesse " +
      "instante que `notifyBookingCreated` dispara. `formaPagamento(null)` " +
      'devolve "pagar no salão" — nenhuma reserva nasce paga.',
    frases: ["pago via", "pago no cartão", "pago no pix"],
  },
  {
    capacidade: "autoatendimento de plano",
    evidencia:
      "`definirPlano` exige operador da plataforma (subscription.ts). O dono " +
      "não escolhe, contrata nem reativa plano sozinho — e `/planos` virou " +
      "vitrine com contato da barbearia quando P0-1 removeu o checkout falso.",
    frases: [
      "escolha um plano em {{",
      "escolhendo um plano em {{",
      "é só reativar em {{",
      "leva dois minutos",
    ],
  },
  {
    capacidade: "avaliação de atendimento",
    evidencia:
      "Não existe nota, estrela nem review em lugar nenhum do produto — nem " +
      "no web, nem nas functions, nem no domínio. O link ia para `/perfil`, " +
      "que mostra carimbos de fidelidade e nada mais.",
    frases: ["avaliar o atendimento", "avalie o atendimento", "deixe sua avaliação"],
  },
];

const todos = Object.entries(TEMPLATES) as [string, TemplateDef][];

/** Tudo que a Meta aprova e que alguém pode ler: corpo, exemplo e botões. */
function textoSubmetido(t: TemplateDef): string {
  return [t.body, ...t.example, ...(t.buttons ?? []).map((b) => b.label)]
    .join("\n")
    .toLowerCase();
}

describe("D14 · o catálogo não promete o que o produto não faz", () => {
  for (const { capacidade, evidencia, frases } of CAPACIDADES_INEXISTENTES) {
    it(`nenhum template promete ${capacidade}`, () => {
      const infratores: string[] = [];
      for (const [chave, template] of todos) {
        const texto = textoSubmetido(template);
        for (const frase of frases) {
          if (texto.includes(frase.toLowerCase())) {
            infratores.push(`${chave} → "${frase}"`);
          }
        }
      }
      expect(infratores, `${capacidade} não existe. ${evidencia}`).toEqual([]);
    });
  }

  it("nenhum parâmetro carrega a promessa no próprio nome", () => {
    /* `linkPagamento` era um endereço que não recebe pagamento nenhum. O nome
     * do parâmetro é documentação: quem for preencher a mensagem vai procurar
     * um link de pagamento que não existe, e colocar ali o que tiver à mão. */
    const proibidos = ["linkPagamento", "linkCobranca", "linkAvaliacao", "proximaCobranca"];
    const infratores = todos.flatMap(([chave, t]) =>
      t.params.filter((p) => proibidos.includes(p)).map((p) => `${chave} → ${p}`)
    );
    expect(infratores).toEqual([]);
  });

  it("o gatilho documentado descreve um evento que o produto produz", () => {
    /* O `trigger` não vai para o cliente, mas é o que orienta quem for ligar o
     * envio. Um gatilho que descreve "cobrança aprovada" faz alguém procurar o
     * webhook do gateway que nunca existiu. */
    const fantasmas = ["cobrança aprovada", "cobrança recorrente", "pagamento aprovado"];
    const infratores = todos.flatMap(([chave, t]) =>
      fantasmas
        .filter((f) => t.trigger.toLowerCase().includes(f))
        .map((f) => `${chave} → "${f}"`)
    );
    expect(infratores).toEqual([]);
  });

  it("o que descreve ato humano continua no catálogo — a correção não é apagar", () => {
    /* Contraprova da régua. Devolver dinheiro em pessoa é possível, e avisar o
     * cliente disso é correto. Se a correção tivesse sido "remover tudo que
     * fala de dinheiro", este teste cairia junto. */
    expect(TEMPLATES).toHaveProperty("reembolso_processado");
    expect(TEMPLATES).toHaveProperty("cancelamento_reserva");
    expect(TEMPLATES).toHaveProperty("mensalidade_aviso");
    expect(TEMPLATES.reembolso_processado.body).toContain("devolvido");
  });

  it("a mensalidade continua sendo cobrada — só não pelo sistema", () => {
    /* D6 vale aqui também: a correção não esconde o valor, coloca o caminho
     * certo. O cliente precisa saber quanto vence e quando. */
    expect(TEMPLATES.mensalidade_aviso.params).toContain("valor");
    expect(TEMPLATES.mensalidade_aviso.params).toContain("vencimento");
    expect(TEMPLATES.mensalidade_aviso.body).toContain("vence em");
  });
});
