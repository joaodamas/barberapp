import { describe, expect, it } from "vitest";
import { FieldValue } from "firebase-admin/firestore";
import {
  PRECO_MENSAL,
  comDominioAutorizado,
  desfechoDaResposta,
  diaEmSaoPaulo,
  isentoDeCobranca,
  esperaAntesDaTentativa,
  idDoEvento,
  idDoEventoRecebido,
  isoEmSaoPaulo,
  montarEvento,
  planoDoHub,
  rotaDe,
  tokenConfere,
  tokenDoCabecalho,
  transicaoDoHub,
  validarMudancaDeStatus,
  validarProvisionamento,
} from "../hub/contrato";
import { registroDoAviso } from "../hub/saida";

/**
 * O contrato com o JP Projects Hub (`hub/docs/CONTRATO-PLATAFORMA-BARBER.md`),
 * na parte que decide sem rede: quem entra, o que o corpo precisa ter, o que
 * cada status do Hub faz com a barbearia e o que fazer com cada resposta.
 */

describe("token do Hub", () => {
  it("lê o Bearer do cabeçalho", () => {
    expect(tokenDoCabecalho("Bearer abc123")).toBe("abc123");
    expect(tokenDoCabecalho("bearer   abc123  ")).toBe("abc123");
    expect(tokenDoCabecalho("Basic abc123")).toBe("");
    expect(tokenDoCabecalho(undefined)).toBe("");
  });

  it("aceita só o token igual", () => {
    expect(tokenConfere("s3gredo", "s3gredo")).toBe(true);
    expect(tokenConfere("s3gredo", "s3gredo\n")).toBe(true); // colado no Secret Manager
    expect(tokenConfere("s3gredO", "s3gredo")).toBe(false);
    expect(tokenConfere("s3gredo-mais-longo", "s3gredo")).toBe(false);
  });

  it("🔒 segredo vazio recusa tudo, inclusive token vazio", () => {
    /* `"" === ""` seria verdadeiro: sem esta trava, um deploy sem o segredo
     * abriria a API para qualquer um que mandasse `Bearer ` sem nada. */
    expect(tokenConfere("", "")).toBe(false);
    expect(tokenConfere("qualquer", "")).toBe(false);
    expect(tokenConfere("", "s3gredo")).toBe(false);
  });
});

describe("rotas", () => {
  it("atende o caminho como chega pela URL da função", () => {
    expect(rotaDe("/provisionar")).toBe("provisionar");
    expect(rotaDe("/status")).toBe("status");
    expect(rotaDe("/status/")).toBe("status");
  });
  it("aceita o prefixo /plataforma, para um rewrite futuro", () => {
    expect(rotaDe("/plataforma/provisionar")).toBe("provisionar");
  });
  it("o resto é desconhecido", () => {
    expect(rotaDe("/")).toBeNull();
    expect(rotaDe("/apagar")).toBeNull();
    expect(rotaDe("/plataforma")).toBeNull();
  });
});

describe("corpo de /provisionar", () => {
  const valido = {
    hubTenantId: "barbeariax",
    slug: "barbeariax",
    nome: "Barbearia X",
    ownerEmail: "Dono@X.com",
    ownerNome: "Fulano",
    plano: null,
  };

  it("aceita o exemplo do contrato, com plano nulo virando o de entrada", () => {
    const v = validarProvisionamento(valido);
    expect(v).toEqual({
      ok: true,
      dados: {
        hubTenantId: "barbeariax",
        slug: "barbeariax",
        nome: "Barbearia X",
        ownerEmail: "dono@x.com",
        ownerNome: "Fulano",
        plano: "agenda",
      },
    });
  });

  it("recusa o que quebraria o subdomínio ou a conta", () => {
    for (const [campo, valor] of [
      ["slug", "ab"],
      ["slug", "com espaco"],
      ["slug", "admin"], // reservado
      ["nome", "  "],
      ["ownerEmail", "sem-arroba"],
      ["hubTenantId", ""],
      ["hubTenantId", "com/barra"],
    ] as const) {
      const v = validarProvisionamento({ ...valido, [campo]: valor });
      expect(v.ok, `${campo}=${valor}`).toBe(false);
    }
  });

  it("recusa o que não é objeto", () => {
    expect(validarProvisionamento(null).ok).toBe(false);
    expect(validarProvisionamento("texto").ok).toBe(false);
    expect(validarProvisionamento([valido]).ok).toBe(false);
  });
});

describe("plano que o Hub manda", () => {
  it("nulo ou vazio é o plano de entrada", () => {
    expect(planoDoHub(null)).toBe("agenda");
    expect(planoDoHub(undefined)).toBe("agenda");
    expect(planoDoHub("")).toBe("agenda");
  });
  it("normaliza acento e maiúscula — o erro de digitação mais comum", () => {
    expect(planoDoHub("Gestão")).toBe("gestao");
    expect(planoDoHub("CRESCIMENTO")).toBe("crescimento");
  });
  it("aceita os nomes antigos", () => {
    expect(planoDoHub("entrada")).toBe("agenda");
    expect(planoDoHub("completo")).toBe("gestao");
  });
  it("desconhecido é erro, não rebaixamento silencioso", () => {
    expect(planoDoHub("premium")).toBeNull();
  });
});

describe("corpo de /status", () => {
  const valido = { barbershopId: "abc123", hubTenantId: "barbeariax", status: "suspenso", eventoId: "barbeariax_suspenso_e1" };

  it("aceita o exemplo do contrato", () => {
    expect(validarMudancaDeStatus(valido)).toEqual({ ok: true, dados: valido });
  });
  it("aceita `externoId` no lugar de `barbershopId` (o Hub manda os dois)", () => {
    const { barbershopId: _fora, ...resto } = valido;
    const v = validarMudancaDeStatus({ ...resto, externoId: "abc123" });
    expect(v.ok && v.dados.barbershopId).toBe("abc123");
  });
  it("recusa status fora dos três", () => {
    expect(validarMudancaDeStatus({ ...valido, status: "arquivado" }).ok).toBe(false);
    expect(validarMudancaDeStatus({ ...valido, status: "encerrada" }).ok).toBe(false);
  });
  it("🔒 recusa barbershopId que viraria outro caminho no Firestore", () => {
    expect(validarMudancaDeStatus({ ...valido, barbershopId: "abc/private/hub" }).ok).toBe(false);
  });
  it("exige eventoId, que é a chave da idempotência", () => {
    expect(validarMudancaDeStatus({ ...valido, eventoId: "" }).ok).toBe(false);
  });
  it("o id do documento do evento é estável e seguro", () => {
    expect(idDoEventoRecebido("a_b_c")).toBe(idDoEventoRecebido("a_b_c"));
    expect(idDoEventoRecebido("..")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("status do Hub → barbearia", () => {
  const agora = 1_790_000_000_000;

  it("suspenso suspende, com o motivo", () => {
    const t = transicaoDoHub({ status: "ativo" }, "suspenso", agora);
    expect(t.tipo).toBe("aplicar");
    if (t.tipo !== "aplicar") return;
    expect(t.campos.status).toBe("suspenso");
    expect(t.campos.suspendedReason).toBe("hub");
  });

  it("ativo reativa e limpa a suspensão, sem tocar em plano nem features", () => {
    const t = transicaoDoHub({ status: "suspenso" }, "ativo", agora);
    expect(t.tipo).toBe("aplicar");
    if (t.tipo !== "aplicar") return;
    expect(t.campos.status).toBe("ativo");
    expect(t.campos.suspendedAt).toEqual(FieldValue.delete());
    /* O Hub manda no dinheiro: ativar não é escolher plano. */
    expect(t.campos).not.toHaveProperty("plan");
    expect(t.campos).not.toHaveProperty("features");
  });

  it("ativo a partir do teste encerra o teste", () => {
    const t = transicaoDoHub({ status: "trial" }, "ativo", agora);
    expect(t.tipo === "aplicar" && "trialEncerradoEm" in t.campos).toBe(true);
  });

  it("cancelado encerra com os MESMOS campos de encerrarConta", () => {
    const t = transicaoDoHub({ status: "ativo" }, "cancelado", agora);
    expect(t.tipo).toBe("aplicar");
    if (t.tipo !== "aplicar") return;
    expect(t.para).toBe("encerrada");
    expect(t.campos.status).toBe("encerrada");
    expect(t.campos.encerradaEmMs).toBe(agora); // é o que o expurgo lê
    expect(t.campos.statusAntesDeEncerrar).toBe("ativo"); // é o que reabrir devolve
    expect(t.campos.encerradaPor).toBe("hub");
  });

  it("cancelar de novo não reinicia o relógio do expurgo", () => {
    expect(transicaoDoHub({ status: "encerrada" }, "cancelado", agora).tipo).toBe("nada");
  });

  it("suspender conta encerrada não a tira do encerramento", () => {
    const t = transicaoDoHub({ status: "encerrada" }, "suspenso", agora);
    expect(t).toMatchObject({ tipo: "nada", para: "encerrada" });
  });

  it("ativo reabre a encerrada, se o expurgo não começou", () => {
    const t = transicaoDoHub({ status: "encerrada" }, "ativo", agora);
    expect(t.tipo).toBe("aplicar");
    if (t.tipo !== "aplicar") return;
    expect(t.campos.status).toBe("ativo");
    expect(t.campos.encerradaEmMs).toEqual(FieldValue.delete());
  });

  it("ativo NÃO reabre depois que o expurgo começou", () => {
    const t = transicaoDoHub({ status: "encerrada", expurgo: { iniciadoEmMs: 1 } }, "ativo", agora);
    expect(t.tipo).toBe("conflito");
  });

  it("repetir o status atual não grava nada", () => {
    expect(transicaoDoHub({ status: "ativo" }, "ativo", agora).tipo).toBe("nada");
    expect(transicaoDoHub({ status: "suspenso" }, "suspenso", agora).tipo).toBe("nada");
  });
});

describe("eventos para o Hub", () => {
  const quando = new Date("2026-09-28T17:00:00Z"); // 14h em São Paulo

  it("cadastrada tem o formato do contrato", () => {
    expect(
      montarEvento({
        evento: "cadastrada",
        barbershopId: "ZE8iNGVKp3l7OqZFJbqF",
        slug: "osiqueira",
        nome: "O Siqueira Barbearia",
        ocorridoEm: quando,
      })
    ).toEqual({
      produto: "barber",
      evento: "cadastrada",
      eventoId: "cadastrada:ZE8iNGVKp3l7OqZFJbqF",
      externoId: "ZE8iNGVKp3l7OqZFJbqF",
      slug: "osiqueira",
      nome: "O Siqueira Barbearia",
      ocorridoEm: "2026-09-28T14:00:00-03:00",
    });
  });

  it("plano_escolhido leva plano, valor e ciclo", () => {
    const e = montarEvento({
      evento: "plano_escolhido",
      barbershopId: "abc",
      slug: "barbeariax",
      nome: "X",
      ocorridoEm: quando,
      plano: "crescimento",
    });
    expect(e).toMatchObject({ plano: "crescimento", valor: PRECO_MENSAL.crescimento, ciclo: "mensal" });
    expect(e.eventoId).toBe("plano_escolhido:abc:crescimento:2026-09-28");
  });

  it("plano_escolhido sem plano é defeito de quem chamou", () => {
    expect(() =>
      montarEvento({ evento: "plano_escolhido", barbershopId: "a", slug: "abc", nome: "x", ocorridoEm: quando })
    ).toThrow();
  });

  it("pediu_cancelamento leva o motivo, cortado", () => {
    const e = montarEvento({
      evento: "pediu_cancelamento",
      barbershopId: "a",
      slug: "abc",
      nome: "x",
      ocorridoEm: quando,
      motivo: "x".repeat(400),
    });
    expect(e.motivo).toHaveLength(300);
    expect(e.eventoId).toBe("pediu_cancelamento:a:2026-09-28");
  });

  it("🔒 eventoId passa na validação do Hub: sem barra, sem espaço, até 200", () => {
    const ids = [
      idDoEvento("cadastrada", "ZE8iNGVKp3l7OqZFJbqF"),
      idDoEvento("onboarding_concluido", "ZE8iNGVKp3l7OqZFJbqF"),
      idDoEvento("plano_escolhido", "ZE8iNGVKp3l7OqZFJbqF", { plano: "gestao", dia: "2026-09-28" }),
      idDoEvento("pediu_cancelamento", "ZE8iNGVKp3l7OqZFJbqF", { dia: "2026-09-28" }),
    ];
    for (const id of ids) {
      expect(id.length).toBeLessThanOrEqual(200);
      expect(/[/\s]/.test(id), id).toBe(false);
    }
  });

  it("o mesmo fato gera o mesmo eventoId — a reentrega não duplica no Hub", () => {
    const a = montarEvento({ evento: "cadastrada", barbershopId: "a", slug: "abc", nome: "x", ocorridoEm: quando });
    const b = montarEvento({ evento: "cadastrada", barbershopId: "a", slug: "abc", nome: "x", ocorridoEm: new Date() });
    expect(a.eventoId).toBe(b.eventoId);
  });

  it("o dia é o de São Paulo, não o UTC", () => {
    // 01h UTC do dia 29 ainda é dia 28 em São Paulo.
    expect(diaEmSaoPaulo(new Date("2026-09-29T01:00:00Z"))).toBe("2026-09-28");
    expect(isoEmSaoPaulo(new Date("2026-09-29T01:00:00Z"))).toBe("2026-09-28T22:00:00-03:00");
  });

  it("os preços são os da tabela de planos", () => {
    expect(PRECO_MENSAL).toEqual({ agenda: 97, crescimento: 197, gestao: 247 });
  });

  it("o aviso nasce pendente, e o do Hub pode nascer adiado", () => {
    const corpo = montarEvento({ evento: "cadastrada", barbershopId: "a", slug: "abc", nome: "x", ocorridoEm: quando });
    const r = registroDoAviso(corpo, { agoraMs: 1000, adiarMs: 120_000 });
    expect(r).toMatchObject({ eventoId: corpo.eventoId, estado: "pendente", tentativas: 0, proximaTentativaEmMs: 121_000 });
  });
});

describe("caixa de saída: o que fazer com a resposta", () => {
  it("200 é entregue, inclusive o duplicado", () => {
    expect(desfechoDaResposta(200)).toBe("enviado");
  });
  it("400 e 409 não se repetem: a mesma chamada daria a mesma resposta", () => {
    expect(desfechoDaResposta(400)).toBe("recusado");
    expect(desfechoDaResposta(409)).toBe("recusado");
  });
  it("401, 503, 5xx e falha de rede tentam de novo", () => {
    for (const s of [401, 503, 500, 502, 504, null]) {
      expect(desfechoDaResposta(s), String(s)).toBe("retentar");
    }
  });
  it("a espera dobra e para em 6 horas", () => {
    expect(esperaAntesDaTentativa(0)).toBe(60_000);
    expect(esperaAntesDaTentativa(1)).toBe(120_000);
    expect(esperaAntesDaTentativa(3)).toBe(480_000);
    expect(esperaAntesDaTentativa(50)).toBe(6 * 60 * 60_000);
  });
});

describe("domínios autorizados do Firebase Auth", () => {
  it("acrescenta sem tirar nenhum", () => {
    expect(comDominioAutorizado(["localhost", "osiqueira.jpproject.com.br"], "x.topete.com.br")).toEqual([
      "localhost",
      "osiqueira.jpproject.com.br",
      "x.topete.com.br",
    ]);
  });
  it("não grava de novo o que já está", () => {
    expect(comDominioAutorizado(["X.topete.com.br"], "x.topete.com.br")).toBeNull();
  });
  it("lista ausente vira lista com o domínio", () => {
    expect(comDominioAutorizado(undefined, "x.topete.com.br")).toEqual(["x.topete.com.br"]);
  });
});

describe("barbearia isenta (a fundadora)", () => {
  const agora = 1_790_000_000_000;
  const isento = { ativa: true, motivo: "Barbearia fundadora" };

  it("o Hub não suspende nem cancela", () => {
    expect(transicaoDoHub({ status: "ativo", isento }, "suspenso", agora).tipo).toBe("conflito");
    expect(transicaoDoHub({ status: "ativo", isento }, "cancelado", agora).tipo).toBe("conflito");
  });

  it("mas ativar continua valendo (tirar de uma suspensão antiga, por exemplo)", () => {
    const t = transicaoDoHub({ status: "suspenso", isento }, "ativo", agora);
    expect(t).toMatchObject({ tipo: "aplicar", para: "ativo" });
  });

  it("isenção desligada volta a obedecer o Hub", () => {
    expect(isentoDeCobranca({ isento: { ativa: false } })).toBe(false);
    expect(isentoDeCobranca({})).toBe(false);
    expect(transicaoDoHub({ status: "ativo", isento: { ativa: false } }, "suspenso", agora).tipo).toBe("aplicar");
  });

  it("o cadastro vai ao Hub com o plano, valor zero e a marca de isenção", () => {
    const corpo = montarEvento({
      evento: "cadastrada",
      barbershopId: "ZE8iNGVKp3l7OqZFJbqF",
      slug: "osiqueira",
      nome: "O Siqueira",
      ocorridoEm: new Date(agora),
      plano: "gestao",
      isento: true,
    });
    expect(corpo).toMatchObject({ isento: true, plano: "gestao", valor: 0, ciclo: "mensal" });
    /* O id não muda: a carga inicial continua idempotente. */
    expect(corpo.eventoId).toBe("cadastrada:ZE8iNGVKp3l7OqZFJbqF");
  });

  it("escolher plano isento não manda preço", () => {
    const corpo = montarEvento({
      evento: "plano_escolhido",
      barbershopId: "x",
      slug: "x",
      nome: "x",
      ocorridoEm: new Date(agora),
      plano: "gestao",
      isento: true,
    });
    expect(corpo.valor).toBe(0);
  });

  it("sem isenção, o cadastro segue sem plano nem valor, como no contrato v1", () => {
    const corpo = montarEvento({
      evento: "cadastrada",
      barbershopId: "x",
      slug: "x",
      nome: "x",
      ocorridoEm: new Date(agora),
    });
    expect(corpo).not.toHaveProperty("isento");
    expect(corpo).not.toHaveProperty("valor");
  });
});
