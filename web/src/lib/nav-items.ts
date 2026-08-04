import {
  BarChart3,
  CalendarClock,
  CalendarPlus,
  Home,
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
  { href: "/painel/mensal", label: "Mensal", icon: CalendarClock },
  { href: "/painel/equipe", label: "Equipe", icon: Users },
  { href: "/painel/loja", label: "Loja", icon: Store },
];
