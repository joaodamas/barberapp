import { AreaDoBarbeiro } from "@/components/barbeiro/area-do-barbeiro";
import { resolverTenant } from "@/lib/tenant-server";
import { TenantLive } from "@/lib/tenant-live";

export const metadata = { title: "Minha agenda" };

/**
 * Painel do barbeiro (05/10): só a agenda e a comissão dele.
 *
 * Dentro de `TenantLive`, como o painel do dono (08/10). Sem ele, o barbeiro
 * fechava atendimento com a ficha PÚBLICA da barbearia — onde as formas de
 * pagamento e as taxas não moram desde 28/09 (`private/financeiro`) —, então o
 * modal oferecia as formas padrão e não as da casa. E a trava de escrita do
 * modo leitura, que o `TenantLive` liga, ficava desligada aqui.
 */
export default async function BarbeiroLayout({ children }: { children: React.ReactNode }) {
  const { estado, tenant } = await resolverTenant();
  return (
    <TenantLive inicial={tenant} indisponivel={estado === "indisponivel"}>
      <AreaDoBarbeiro>{children}</AreaDoBarbeiro>
    </TenantLive>
  );
}
