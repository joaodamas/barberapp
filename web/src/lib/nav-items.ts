import {
  BarChart3,
  CalendarClock,
  CalendarPlus,
  Home,
  Scissors,
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

export type NavChild = {
  href: string;
  label: string;
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
  feature?: "subscriptions" | "store" | "loyalty" | "whatsapp" | "advancedFinance";
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

export const painelNavItems: NavItem[] = [
  { href: "/painel", label: "Hoje", icon: Sun },
  {
    href: "/painel/financeiro",
    label: "Financeiro",
    shortLabel: "Finanças",
    icon: Wallet,
    children: [
      { href: "/painel/financeiro", label: "Resumo" },
      { href: "/painel/financeiro/dre", label: "DRE Gerencial" },
      { href: "/painel/financeiro/fluxo-caixa", label: "Fluxo de Caixa" },
      { href: "/painel/financeiro/despesas", label: "Despesas" },
      { href: "/painel/financeiro/projecao", label: "Projeção" },
    ],
  },
  { href: "/painel/numeros", label: "Números", icon: BarChart3 },
  { href: "/painel/servicos", label: "Serviços", icon: Scissors },
  { href: "/painel/mensal", label: "Mensal", icon: CalendarClock, feature: "subscriptions" },
  { href: "/painel/equipe", label: "Equipe", icon: Users },
  { href: "/painel/loja", label: "Loja", icon: Store, feature: "store" },
  { href: "/painel/configuracoes", label: "Ajustes", icon: Settings },
];
