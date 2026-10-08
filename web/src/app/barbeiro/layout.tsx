import { AreaDoBarbeiro } from "@/components/barbeiro/area-do-barbeiro";

export const metadata = { title: "Minha agenda" };

/** Painel do barbeiro (05/10): só a agenda e a comissão dele. */
export default function BarbeiroLayout({ children }: { children: React.ReactNode }) {
  return <AreaDoBarbeiro>{children}</AreaDoBarbeiro>;
}
