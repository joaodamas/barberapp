import { describe, expect, it } from "vitest";
import {
  clienteNavItems,
  itemAtivo,
  menuDoCelular,
  painelNavItems,
  rotaAtiva,
  type NavItem,
} from "@/lib/nav-items";

/**
 * Arquitetura de navegação — UX-01.
 *
 * O menu é contrato de produto tanto quanto uma fórmula financeira: decide o
 * que o dono alcança e o que ele nunca vai descobrir que existe. Estes testes
 * provam as três regras que antes só tinham prova visual — e cada uma delas
 * nasceu de um defeito concreto, nomeado no teste.
 *
 * Ver `docs/ARQUITETURA-DE-NAVEGACAO.md`.
 */

const rotasDoPainel = [
  "/painel",
  "/painel/clientes",
  "/painel/configuracoes",
  "/painel/equipe",
  "/painel/financeiro",
  "/painel/financeiro/despesas",
  "/painel/financeiro/dre",
  "/painel/financeiro/fluxo-caixa",
  "/painel/financeiro/projecao",
  "/painel/horarios",
  "/painel/loja",
  "/painel/meu-link",
  "/painel/mensal",
  "/painel/numeros",
  "/painel/servicos",
];

function todosOsDestinos(items: NavItem[]): string[] {
  return items.flatMap((i) => [i.href, ...(i.children ?? []).map((c) => c.href)]);
}

describe("cobertura — nenhuma tela órfã, nenhum link morto", () => {
  it("toda rota do painel é alcançável pelo menu", () => {
    const alcancaveis = new Set(todosOsDestinos(painelNavItems));
    for (const rota of rotasDoPainel) {
      expect(alcancaveis.has(rota), `${rota} não está no menu`).toBe(true);
    }
  });

  it("nenhum item do menu aponta para rota que não existe", () => {
    const existentes = new Set(rotasDoPainel);
    for (const href of todosOsDestinos(painelNavItems)) {
      expect(existentes.has(href), `${href} não corresponde a uma tela`).toBe(true);
    }
  });

  /* A régua do produto: "a interface não deve mostrar tudo que o sistema sabe;
     deve mostrar o que o dono precisa decidir". Eram nove itens de primeiro
     nível numa operação que costuma ser de um barbeiro só. O teto existe para
     que voltar a crescer seja uma decisão, e não um acidente. */
  it("o primeiro nível não passa de sete itens", () => {
    expect(painelNavItems.length).toBeLessThanOrEqual(7);
  });
});

describe("vocabulário — nome de negócio, não de sistema", () => {
  /* `docs/UI-UX-GUIDELINES.md` §8 usa exatamente este caso para definir a
     regra: "DRE Gerencial" é linguagem do contador do dono, não dele. */
  it("nenhum rótulo do menu usa jargão contábil", () => {
    const jargao = [/\bDRE\b/i, /\bMRR\b/i, /demonstra(ç|c)(ã|a)o/i];
    for (const label of painelNavItems.flatMap((i) => [
      i.label,
      i.shortLabel ?? "",
      ...(i.children ?? []).map((c) => c.label),
    ])) {
      for (const termo of jargao) {
        expect(termo.test(label), `"${label}" usa jargão`).toBe(false);
      }
    }
  });

  it("a tela do DRE é alcançada pela pergunta que o dono faz", () => {
    const financeiro = painelNavItems.find((i) => i.href === "/painel/financeiro");
    const dre = financeiro?.children?.find((c) => c.href === "/painel/financeiro/dre");
    expect(dre?.label).toBe("Quanto sobrou");
  });

  /* "Mensal" era adjetivo sem substantivo, e colidia com o fechamento mensal
     do Financeiro. O resto do produto já dizia "mensalistas". */
  it("o menu chama mensalista de mensalista", () => {
    expect(painelNavItems.find((i) => i.href === "/painel/mensal")?.label).toBe("Mensalistas");
  });
});

describe("cadeado — o menu não promete o que a tela nega", () => {
  /* Quatro das cinco telas de Financeiro chamam `BloqueioPlano` com
     `advancedFinance`; só o Resumo é livre. O menu mostrava as cinco iguais. */
  it("as telas de financeiro avançado estão marcadas, e o Resumo não", () => {
    const filhos = painelNavItems.find((i) => i.href === "/painel/financeiro")?.children ?? [];
    const porRota = Object.fromEntries(filhos.map((c) => [c.href, c.feature]));

    expect(porRota["/painel/financeiro"]).toBeUndefined();
    expect(porRota["/painel/financeiro/dre"]).toBe("advancedFinance");
    expect(porRota["/painel/financeiro/fluxo-caixa"]).toBe("advancedFinance");
    expect(porRota["/painel/financeiro/projecao"]).toBe("advancedFinance");
    expect(porRota["/painel/financeiro/despesas"]).toBe("advancedFinance");
  });

  it("Loja e Mensalistas continuam marcadas pelo recurso que exigem", () => {
    expect(painelNavItems.find((i) => i.href === "/painel/loja")?.feature).toBe("store");
    expect(painelNavItems.find((i) => i.href === "/painel/mensal")?.feature).toBe("subscriptions");
  });
});

describe("rotaAtiva — o realce responde 'onde eu estou'", () => {
  it("casa a própria rota e as subrotas", () => {
    expect(rotaAtiva("/painel/financeiro", "/painel/financeiro")).toBe(true);
    expect(rotaAtiva("/painel/financeiro", "/painel/financeiro/dre")).toBe(true);
  });

  /* O prefixo não pode vazar para irmãos com o mesmo começo. */
  it("não casa rota que apenas começa igual", () => {
    expect(rotaAtiva("/painel/mensal", "/painel/mensalistas")).toBe(false);
  });

  /* A raiz do app do cliente: por prefixo, "Início" ficaria aceso em toda tela
     do produto. */
  it('"/" casa só com "/"', () => {
    expect(rotaAtiva("/", "/")).toBe(true);
    expect(rotaAtiva("/", "/agendar")).toBe(false);
  });

  it("exato desliga o casamento por prefixo", () => {
    expect(rotaAtiva("/painel/financeiro", "/painel/financeiro/dre", true)).toBe(false);
  });
});

describe("itemAtivo — o defeito que a barra do celular tinha", () => {
  /* A lateral se protegia com um `item.href !== "/painel"` escrito à mão; a
     barra de baixo não tinha essa guarda, e "Hoje" acendia em Loja, Clientes e
     Financeiro. Agora a exceção é derivada da lista, e vale para as duas. */
  it('"Hoje" acende só em /painel', () => {
    const hoje = painelNavItems[0];
    expect(hoje.href).toBe("/painel");
    expect(itemAtivo(hoje, "/painel", painelNavItems)).toBe(true);
    for (const rota of rotasDoPainel.filter((r) => r !== "/painel")) {
      expect(itemAtivo(hoje, rota, painelNavItems), `Hoje acendeu em ${rota}`).toBe(false);
    }
  });

  it("Financeiro acende nas suas cinco telas", () => {
    const financeiro = painelNavItems.find((i) => i.href === "/painel/financeiro")!;
    for (const filho of financeiro.children ?? []) {
      expect(itemAtivo(financeiro, filho.href, painelNavItems)).toBe(true);
    }
  });

  /* Serviços e Equipe viraram filhos de Ajustes sem mudar de rota, e não
     compartilham o prefixo do pai. Sem olhar os filhos, o dono abriria
     Serviços e veria o menu inteiro apagado, sem submenu e sem saber onde
     está. */
  it("Ajustes acende em Serviços e em Equipe, que moram fora do seu prefixo", () => {
    const ajustes = painelNavItems.find((i) => i.href === "/painel/configuracoes")!;
    expect(itemAtivo(ajustes, "/painel/servicos", painelNavItems)).toBe(true);
    expect(itemAtivo(ajustes, "/painel/equipe", painelNavItems)).toBe(true);
    expect(itemAtivo(ajustes, "/painel/configuracoes", painelNavItems)).toBe(true);
  });

  it("em qualquer rota do painel, exatamente um item de primeiro nível acende", () => {
    for (const rota of rotasDoPainel) {
      const acesos = painelNavItems.filter((i) => itemAtivo(i, rota, painelNavItems));
      expect(acesos.map((i) => i.label), `em ${rota}`).toHaveLength(1);
    }
  });
});

describe("menuDoCelular — o que o dono alcança em pé, no balcão", () => {
  const { barra, mais } = menuDoCelular(painelNavItems, 5);

  it("a barra fica com quatro itens e sobra um slot para 'Mais'", () => {
    expect(barra).toHaveLength(4);
  });

  /* A ordem passou a medir frequência de uso: Loja é tela de balcão, aberta
     com o cliente na frente, e estava atrás do "Mais" enquanto Números — lido
     uma vez por mês — estava na barra. */
  it("a barra é Hoje · Financeiro · Clientes · Loja", () => {
    expect(barra.map((i) => i.label)).toEqual(["Hoje", "Financeiro", "Clientes", "Loja"]);
  });

  /* O defeito central do celular: a barra nunca desenhou submenu e a lateral
     só existe no desktop, então DRE, Fluxo, Despesas e Projeção só chegavam
     pelos cartões dentro do Financeiro — e Serviços e Equipe ficariam
     inalcançáveis ao virar filhos de Ajustes. */
  it("toda rota do painel é alcançável pelo celular em no máximo dois toques", () => {
    const umToque = new Set(barra.map((i) => i.href));
    const doisToques = new Set(mais.map((d) => d.href));
    for (const rota of rotasDoPainel) {
      expect(umToque.has(rota) || doisToques.has(rota), `${rota} é inalcançável`).toBe(true);
    }
  });

  it("a folha não repete o que a barra já alcança", () => {
    const naBarra = new Set(barra.map((i) => i.href));
    for (const destino of mais.filter((d) => !d.filho)) {
      expect(naBarra.has(destino.href)).toBe(false);
    }
  });

  /* "Resumo" aponta para a mesma rota do pai. Listar os dois ensinaria que são
     dois lugares diferentes. */
  it("o filho que repete a rota do pai não aparece duas vezes", () => {
    const hrefs = mais.map((d) => d.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(hrefs).not.toContain("/painel/financeiro");
  });

  it("o cadeado do filho viaja para a folha", () => {
    expect(mais.find((d) => d.href === "/painel/financeiro/dre")?.feature).toBe("advancedFinance");
  });

  /* O menu do cliente tem cinco itens rasos: gastar um slot com "Mais" para
     não mostrar nada seria perder 20% da barra. */
  it("o menu do cliente cabe inteiro e não cria 'Mais'", () => {
    const cliente = menuDoCelular(clienteNavItems, 5);
    expect(cliente.barra).toHaveLength(clienteNavItems.length);
    expect(cliente.mais).toHaveLength(0);
  });
});
