import type { Metadata } from "next";
import { PaginaDaPlataforma } from "@/components/landing/pagina";

export const METADATA_DA_PLATAFORMA: Metadata = {
  title: "Topete · o sistema da barbearia que sabe quanto sobrou",
  description:
    "Agenda que o cliente usa sozinho, horário fixo para mensalista, encaixe calculado pelo tempo do serviço e um financeiro que mostra o lucro de verdade.",
};

export const metadata = METADATA_DA_PLATAFORMA;

export default function LandingPage() {
  return <PaginaDaPlataforma />;
}
