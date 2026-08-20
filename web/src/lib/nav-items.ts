import {
  BarChart3,
  CalendarClock,
  CalendarPlus,
  Home,
  Settings,
  Sparkles,
  Store,
  Users,
  Sun,
  Ticket,
  User,
  Wallet,
  type LucideIcon,
} from "lucide-react";

/** Recurso de plano que uma tela exige. */
export type RecursoDePlano =
  | "subscriptions"
  | "store"
  | "loyalty"
  | "whatsapp"
  | "advancedFinance";

export type NavChild = {
  href: string;
  label: string;
  /**
   * Recurso de plano que o FILHO exige.
   *
   * Existia só no item de primeiro nível, e isso mentia por omissão: quatro das
   * cinco telas de Financeiro exigem `advancedFinance` (`BloqueioPlano` em
   * dre, fluxo-caixa, despesas e projecao), enquanto o Resumo é livre. O menu
   * mostrava as cinco iguais, sem cadeado, e o dono só descobria o bloqueio
   * depois de abrir. A decisão de produto já estava escrita no item-pai — "o
   * item continua no menu com cadeado, sumir não vende nada" — e os filhos
   * simplesmente não sabiam expressá-la.
   */
  feature?: RecursoDePlano;
};

export type NavItem = {
  href: string;
  label: string;
  /**
   * Rótulo do menu inferior, quando o completo não cabe.
   *
   * O menu divide a largura igualmente entre os itens: num aparelho de 360px
   * com muitos itens sobram ~50px cada, e "Financeiro" a 11px estoura e quebra
   * em duas linhas, desalinhando a barra inteira.
   */
  shortLabel?: string;
  /**
   * Recurso de plano que a tela exige.
   *
   * O item continua no menu quando não está contratado, com cadeado: sumir não
   * vende nada, e a tela bloqueada é onde o dono descobre que existe algo a
   * mais. Sem esta marca, o item é sempre livre.
   */
  feature?: RecursoDePlano;
  icon: LucideIcon;
  children?: NavChild[];
};

export const clienteNavItems: NavItem[] = [
  { href: "/", label: "Início", icon: Home },
  { href: "/agendar", label: "Agendar", icon: CalendarPlus },
  { href: "/planos", label: "Planos", icon: Sparkles },
  { href: "/reservas", label: "Reservas", icon: Ticket },
  { href: "/perfil", label: "Perfil", icon: User },
];

/**
 * O menu do painel — só o dono chega aqui.
 *
 * `AuthGuard requireOwner` cobre a rota inteira: barbeiro e cliente nunca veem
 * este menu. Não há, portanto, item que precise se esconder por papel — o que
 * varia é só o PLANO, e isso o cadeado resolve.
 *
 * ## A régua que decide o que entra
 *
 * "A interface não deve mostrar tudo que o sistema sabe; deve mostrar o que o
 * dono precisa decidir" (`docs/UI-UX-GUIDELINES.md` §2). O menu tinha NOVE
 * itens de primeiro nível para uma operação que muitas vezes é de um barbeiro
 * só, e três deles — Serviços, Equipe, Ajustes — não respondem "o que eu faço
 * agora", e sim "como minha barbearia está montada". São cadastro, mexidos no
 * onboarding e depois quase nunca. Ocupavam a mesma faixa que Hoje e
 * Financeiro, e empurravam a Loja — tela de balcão, usada com o cliente na
 * frente — para dentro do menu "Mais" do celular.
 *
 * Agora são SETE, e os três de cadastro moram sob Ajustes. Ver
 * `docs/ARQUITETURA-DE-NAVEGACAO.md` para o mapa antes/depois.
 *
 * ## Ordem
 *
 * Por frequência de uso real, não por importância abstrata: os quatro
 * primeiros são os únicos que cabem na barra do celular (`menuDoCelular`), e é
 * lá que o dono opera em pé.
 */
export const painelNavItems: NavItem[] = [
  { href: "/painel", label: "Hoje", icon: Sun },
  {
    href: "/painel/financeiro",
    label: "Financeiro",
    shortLabel: "Finanças",
    icon: Wallet,
    /* Cinco filhos, mas não cinco perguntas: são TRÊS perguntas e UMA entrada
     * de dado.
     *
     *   Resumo + Quanto sobrou   →  "quanto sobrou este mês"  (visão e detalhe)
     *   Fluxo + Projeção         →  "quanto entra e sai"      (passado e futuro)
     *   Despesas                 →  não responde nada: é onde o dono DIGITA
     *
     * Por isso a ordem mudou. Antes: Resumo · DRE · Fluxo · Despesas ·
     * Projeção — com a entrada de dado no meio, separando Fluxo de Projeção,
     * que são o mesmo eixo em dois tempos. Agora as três perguntas vêm em
     * ordem de tempo (o mês fechado → o que passou na conta → o que vem) e o
     * lançamento fica por último, que é quando ele acontece: o dono vem aqui
     * para LER, e só cai em Despesas quando um relatório aponta que falta
     * lançar — os estados vazios de Resumo e de Projeção mandam justamente
     * para lá.
     *
     * Fluxo e Projeção NÃO foram fundidos, e isso é deliberado: fundir exige
     * mover rota, que não é decisão desta equipe. Ficaram adjacentes e com
     * nomes que se pareiam.
     *
     * "Fluxo de caixa" ficou. É a única coisa aqui que soa técnica, mas é
     * vocabulário que o dono de pequeno negócio de fato usa — diferente de
     * "DRE", que é do contador dele. E `lib/fluxo-de-caixa.ts` está sendo
     * escrito com esse nome AGORA: renomear no menu criaria dois nomes para o
     * mesmo contrato no mesmo dia. */
    children: [
      { href: "/painel/financeiro", label: "Resumo" },
      /* "DRE Gerencial" era o defeito mais citado do menu: linguagem de
       * contador numa tela que o dono abre para saber uma coisa só — quanto
       * sobrou. É o exemplo que `docs/UI-UX-GUIDELINES.md` §8 usa para definir
       * "nome de negócio, não de sistema", e são as palavras do próprio dono.
       * Não virou "Resultado do mês" porque "resultado" é a tradução educada
       * do mesmo termo contábil, e porque colidiria com "Resumo" logo acima. */
      { href: "/painel/financeiro/dre", label: "Quanto sobrou", feature: "advancedFinance" },
      { href: "/painel/financeiro/fluxo-caixa", label: "Fluxo de caixa", feature: "advancedFinance" },
      /* Era só "Projeção" — projeção do quê. O par com a linha de cima é o que
       * ensina a diferença: fluxo é o caixa que já aconteceu, projeção é o
       * mesmo caixa à frente. E é o título que a própria tela já usa. */
      { href: "/painel/financeiro/projecao", label: "Projeção de caixa", feature: "advancedFinance" },
      { href: "/painel/financeiro/despesas", label: "Despesas", feature: "advancedFinance" },
    ],
  },
  /* D26 · Clientes é área de primeira classe.
     G3 criou a entidade e ela só existia dentro de modais — o dono não tinha
     onde ver quem são seus clientes nem quem não volta há dois meses.
     O comentário anterior dizia "fica logo depois de Hoje" e o item era o
     TERCEIRO desde que nasceu: a nota descrevia uma intenção, não o código.
     Continua em terceiro, agora dito de forma verdadeira — o que a intenção
     exigia era estar na primeira faixa, e está. */
  { href: "/painel/clientes", label: "Clientes", icon: Users },
  /* Subiu de oitavo para quarto — o único item que mudou de faixa.
     É tela de balcão: o dono a abre com o cliente parado na frente dele, para
     vender um produto ou conferir estoque. Estava atrás do menu "Mais" do
     celular, a dois toques, enquanto Números — que ele lê uma vez por mês,
     sentado — estava a um. A ordem media importância declarada; agora mede
     frequência de uso. */
  { href: "/painel/loja", label: "Loja", icon: Store, feature: "store" },
  /* "Mensal" é adjetivo sem substantivo — mensal o quê. E colidia com o
     "fechamento do mês" do Financeiro, que é outra coisa. O produto inteiro já
     dizia "mensalistas": o cabeçalho da própria tela, o componente
     `GerirMensalistas`, o texto da landing. O menu era o único lugar que não. */
  { href: "/painel/mensal", label: "Mensalistas", icon: CalendarClock, feature: "subscriptions" },
  /* "Números" ficou de propósito. Parece nome de sistema, mas "vamos ver os
     números do mês" é fala de dono, não de programador — e nenhum candidato
     sobreviveu ao teste: "Movimento" colide com `MovimentoDeCaixa` e com os
     `movements` de estoque, e "Desempenho" é mais corporativo que o atual.
     Renomear sem nome melhor é troca por troca. */
  { href: "/painel/numeros", label: "Números", icon: BarChart3 },
  /* Ajustes virou a casa do CADASTRO, e não só das preferências.
     Serviços e Equipe eram itens de primeiro nível: os dois são telas de
     montar a barbearia — o que eu vendo, quem atende — e nenhum responde a uma
     decisão do dia. Juntos com taxas e tolerância, formam um grupo só: "como
     minha barbearia está montada". Nenhuma rota mudou de lugar; mudou onde o
     menu as pendura.
     Atenção: os filhos NÃO compartilham o prefixo do pai, então a marcação de
     ativo não pode ser por `startsWith` do href do pai — ver `itemAtivo`. */
  {
    href: "/painel/configuracoes",
    label: "Ajustes",
    icon: Settings,
    children: [
      { href: "/painel/configuracoes", label: "Taxas e regras" },
      { href: "/painel/horarios", label: "Horários" },
      { href: "/painel/meu-link", label: "Meu link" },
      { href: "/painel/servicos", label: "Serviços" },
      { href: "/painel/equipe", label: "Equipe" },
    ],
  },
];

/**
 * A rota `href` está sendo exibida em `pathname`?
 *
 * `exato` existe porque um item que é a RAIZ da área não pode casar por
 * prefixo: "/" é prefixo de toda tela do app do cliente, e "/painel" de toda
 * tela do painel. Sem isso, "Início" e "Hoje" ficam acesos o tempo todo — e o
 * menu deixa de responder "onde eu estou", que é a única coisa que o realce
 * faz. A barra lateral do painel se protegia com um `item.href !== "/painel"`
 * escrito à mão; a barra do celular NÃO tinha essa guarda, e lá "Hoje" de fato
 * acendia em Loja, em Clientes e em Financeiro. Duas navegações, duas
 * respostas para "onde estou".
 */
export function rotaAtiva(href: string, pathname: string, exato = false): boolean {
  if (exato || href === "/") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * `item` é a raiz da área — ou seja, existe outro item de menu morando dentro
 * dele?
 *
 * Derivado da própria lista em vez de marcado à mão: quem adicionar amanhã uma
 * rota sob `/painel` não precisa lembrar de marcar `/painel` como exato, e não
 * tem como esquecer. A guarda antiga era um literal `"/painel"` no meio de um
 * componente, que só valia enquanto alguém a repetisse em cada navegação.
 */
function ehRaizDaArea(item: NavItem, items: NavItem[]): boolean {
  return items.some((outro) => outro.href !== item.href && outro.href.startsWith(`${item.href}/`));
}

/**
 * O item de menu está aceso?
 *
 * Considera os filhos, e não só o prefixo do próprio href. Enquanto todo filho
 * morava debaixo do pai (`/painel/financeiro/*`), o prefixo bastava por
 * coincidência. Ajustes quebrou essa coincidência: `/painel/servicos` não
 * começa com `/painel/configuracoes`, e sem esta regra o dono abriria Serviços
 * e veria a barra lateral inteira apagada, sem submenu e sem pista de onde
 * está.
 */
export function itemAtivo(item: NavItem, pathname: string, items: NavItem[]): boolean {
  if (rotaAtiva(item.href, pathname, ehRaizDaArea(item, items))) return true;
  /* Filho casa por igualdade: são folhas. Por prefixo, "Resumo"
     (`/painel/financeiro`) ficaria aceso enquanto o dono lê "Quanto sobrou". */
  return (item.children ?? []).some((filho) => filho.href === pathname);
}

/** Um destino do menu "Mais" do celular — item de primeiro nível ou filho. */
export type DestinoDeMenu = {
  href: string;
  label: string;
  feature?: RecursoDePlano;
  /** Só os de primeiro nível têm ícone; o filho é identificado pelo recuo. */
  icon?: LucideIcon;
  filho: boolean;
  /** Como comparar com a rota atual — ver `rotaAtiva`. */
  exato: boolean;
};

/**
 * Divide o menu do celular entre a barra fixa e a folha "Mais".
 *
 * A barra divide a largura igualmente, então cada item a mais encolhe todos:
 * num aparelho de 360px, sete itens deixam ~51px cada e o rótulo transborda.
 *
 * O que esta função conserta além do corte: **os filhos não tinham como ser
 * alcançados no celular.** A barra nunca desenhou submenu, e a lateral só
 * existe no desktop — logo DRE, Fluxo, Despesas e Projeção só chegavam pelos
 * cartões "Relatórios detalhados" dentro do Financeiro, e Serviços e Equipe
 * ficariam inalcançáveis assim que virassem filhos de Ajustes. Um item de menu
 * que não pode ser tocado no aparelho onde o dono trabalha não está no menu.
 *
 * A regra passa a ser uma só e verificável: **"Mais" contém todo destino que a
 * barra não alcança** — os filhos dos itens que estão na barra, e os itens de
 * fora com os filhos deles.
 */
export function menuDoCelular(
  items: NavItem[],
  maxVisivel: number
): { barra: NavItem[]; mais: DestinoDeMenu[] } {
  const temFilhos = items.some((i) => i.children?.length);

  /* Sem filhos e cabendo tudo, não existe "Mais" e a barra não gasta um slot
   * com ele — é o caso do menu do cliente, cinco itens rasos. */
  if (items.length <= maxVisivel && !temFilhos) {
    return { barra: items, mais: [] };
  }

  const barra = items.slice(0, maxVisivel - 1);
  const naBarra = new Set(barra.map((i) => i.href));

  const mais: DestinoDeMenu[] = [];
  for (const item of items) {
    if (!naBarra.has(item.href)) {
      mais.push({
        href: item.href,
        label: item.label,
        feature: item.feature,
        icon: item.icon,
        filho: false,
        exato: ehRaizDaArea(item, items),
      });
    }
    for (const filho of item.children ?? []) {
      /* O filho que aponta para o próprio pai (Resumo → /painel/financeiro,
       * Taxas e regras → /painel/configuracoes) é a mesma tela com outro nome.
       * Repetir na folha ensinaria que são dois lugares. */
      if (filho.href === item.href) continue;
      mais.push({
        href: filho.href,
        label: filho.label,
        feature: filho.feature,
        filho: true,
        exato: true,
      });
    }
  }

  return { barra, mais };
}
