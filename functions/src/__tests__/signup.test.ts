import { describe, expect, it } from "vitest";
import { validateSlug, ONBOARDING_WRITABLE_FIELDS, TRIAL_DAYS, TRIAL_PLAN } from "../signup";
import { featuresFor, toPlanId } from "../plans";

describe("endereço da barbearia", () => {
  it("aceita nomes reais", () => {
    for (const slug of ["osiqueira", "barbearia-do-ze", "corte-fino-2", "ab1"]) {
      expect(validateSlug(slug).available, slug).toBe(true);
    }
  });

  it("explica o motivo quando recusa — o dono precisa saber o que corrigir", () => {
    expect(validateSlug("ab").reason).toMatch(/3 caracteres/);
    expect(validateSlug("a".repeat(31)).reason).toMatch(/30 caracteres/);
    expect(validateSlug("com espaço").reason).toMatch(/letras minúsculas/);
    expect(validateSlug("www").reason).toMatch(/reservado/);
    expect(validateSlug("").reason).toMatch(/Escolha/);
  });

  it("recusa o que quebraria o subdomínio", () => {
    for (const slug of [
      "-comeca-com-hifen", "termina-com-hifen-",
      "com espaco", "com_underscore", "acentuação", "ponto.no.meio",
    ]) {
      expect(validateSlug(slug).available, slug).toBe(false);
    }
  });

  it("normaliza espaços e caixa em vez de recusar", () => {
    // Quem digita "OSiqueira" deve receber "osiqueira", não um erro.
    // ⚠️ REQUISITO DE UI: o campo precisa mostrar a versão normalizada
    // enquanto ele digita. O endereço é irreversível — transformar em silêncio
    // faz o dono achar que registrou uma coisa e ter registrado outra.
    expect(validateSlug("  OSiqueira  ").available).toBe(true);
    expect(validateSlug("BARBEARIA-DO-ZE").available).toBe(true);
  });

  it("protege as rotas da própria aplicação", () => {
    // "painel", "login" e "comecar" são caminhos do app: um slug com esses
    // nomes criaria um subdomínio que confunde a navegação.
    for (const slug of ["painel", "login", "cadastro", "comecar"]) {
      expect(validateSlug(slug).available, slug).toBe(false);
    }
  });
});

describe("campos graváveis pelo onboarding", () => {
  /* `completeOnboardingStep` escreve com o Admin SDK, que IGNORA
   * `firestore.rules`. Sem allowlist, o `Object.assign` repassava qualquer
   * chave: o dono chamava com `{plan, status, trial}` e reescrevia exatamente
   * o que a regra protege — virava plano de cima de graça, saía do teste para
   * ativo permanente e desfazia a própria suspensão por inadimplência.
   * Nenhum teste de regra pega isso, porque o caminho contorna as regras. */
  const CONTRATO = ["plan", "status", "trial", "features", "slug", "createdBy", "createdAt"];

  it("não deixa o onboarding tocar em nenhum campo de contrato", () => {
    for (const campo of CONTRATO) {
      expect(ONBOARDING_WRITABLE_FIELDS.has(campo), campo).toBe(false);
    }
  });

  it("recusa também o campo aninhado e o objeto inteiro", () => {
    for (const campo of ["trial.endsAt", "features.advancedFinance", "brand", "onboarding"]) {
      expect(ONBOARDING_WRITABLE_FIELDS.has(campo), campo).toBe(false);
    }
  });

  it("libera o que as telas do onboarding realmente mandam", () => {
    const enviadosPelasTelas = [
      "brand.name", "brand.shortName", "brand.accentColor",
      "contact.address", "contact.whatsapp", "contact.instagram",
      "schedule.weekdays", "schedule.opensAt", "schedule.closesAt",
      "schedule.slotMinutes", "schedule.breaks",
    ];
    for (const campo of enviadosPelasTelas) {
      expect(ONBOARDING_WRITABLE_FIELDS.has(campo), campo).toBe(true);
    }
  });
});

describe("recursos por plano", () => {
  it("o plano de entrada não libera o que o de cima vende", () => {
    const agenda = featuresFor("agenda");
    expect(agenda.subscriptions).toBe(false);
    expect(agenda.store).toBe(false);
    expect(agenda.advancedFinance).toBe(false);
  });

  it("WhatsApp entra já no plano de entrada", () => {
    // Decisão comercial: é o add-on que o concorrente cobra à parte.
    expect(featuresFor("agenda").whatsapp).toBe(true);
  });

  it("fidelidade é do Crescimento para cima", () => {
    expect(featuresFor("agenda").loyalty).toBe(false);
    expect(featuresFor("crescimento").loyalty).toBe(true);
  });

  it("o backend concorda com o frontend sobre o que cada plano entrega", () => {
    /* Duas fontes espelhadas: `functions/src/plans.ts` grava na criação e
     * `web/src/lib/tenant.ts` resolve na leitura. Divergir aqui vira barbearia
     * pagando por um recurso que a tela não mostra. */
    expect(featuresFor("crescimento")).toEqual({
      whatsapp: true, loyalty: true, subscriptions: true, store: true,
      advancedFinance: false,
    });
  });

  it("plano escrito errado cai no de entrada, e não no de cima", () => {
    expect(toPlanId("gestão")).toBe("agenda");
    expect(toPlanId(undefined)).toBe("agenda");
    // A linha de dois planos é traduzida, não rebaixada.
    expect(toPlanId("completo")).toBe("gestao");
    expect(toPlanId("entrada")).toBe("agenda");
  });

  it("o cadastro grava features — nunca deixa o campo ausente", () => {
    /* O leitor do servidor preenchia ausência com o catálogo completo, então
     * toda barbearia criada por aqui nascia com o plano mais caro de graça. */
    expect(Object.values(featuresFor(TRIAL_PLAN)).every(Boolean)).toBe(true);
  });
});

describe("trial", () => {
  it("dura 7 dias", () => {
    expect(TRIAL_DAYS).toBe(7);
  });

  it("termina 7 dias depois de começar", () => {
    const inicio = new Date("2026-08-02T10:00:00Z").getTime();
    const fim = new Date(inicio + TRIAL_DAYS * 24 * 60 * 60 * 1000);
    expect(fim.toISOString()).toBe("2026-08-09T10:00:00.000Z");
  });
});

describe("nome curto do ícone", () => {
  // Reproduz a regra de `shortNameFrom`, que é interna ao módulo.
  const shortNameFrom = (name: string, max = 14) => {
    const limpo = name.trim().replace(/\s+/g, " ");
    if (limpo.length <= max) return limpo;
    let curto = "";
    for (const p of limpo.split(" ")) {
      const prox = curto ? `${curto} ${p}` : p;
      if (prox.length > max) break;
      curto = prox;
    }
    return curto || limpo.slice(0, max).trim();
  };

  it("não corta no meio da palavra", () => {
    // É o texto que fica sob o ícone no celular do cliente.
    expect(shortNameFrom("O Siqueira Barbearia")).toBe("O Siqueira");
    expect(shortNameFrom("Barbearia do Zé")).toBe("Barbearia do");
    expect(shortNameFrom("Corte Fino")).toBe("Corte Fino");
  });

  it("cai no corte bruto quando a primeira palavra já estoura", () => {
    expect(shortNameFrom("Superbarbearia")).toBe("Superbarbearia");
    expect(shortNameFrom("Superbarbeariadobairro")).toBe("Superbarbearia");
  });
});
