"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { BottomNav } from "@/components/bottom-nav";
import { MarcarNoBalcao } from "@/components/marcar-no-balcao";
import { painelNavItems } from "@/lib/nav-items";
import { useAcesso } from "@/lib/tenant-context";

/**
 * O "+" no centro da barra abre o "Marcar atendimento" de QUALQUER tela.
 *
 * É a ação que o dono mais repete, em pé no balcão, com o cliente na frente ou
 * no telefone — e ela morava no meio da tela Hoje, abaixo do caixa e dos
 * avisos, só alcançável estando lá (pedido do dono, 24/09). Em modo leitura
 * o "+" não aparece: marcar é editar.
 */
export function PainelBottomNav() {
  const { podeEditar } = useAcesso();
  const [marcando, setMarcando] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  return (
    <>
      <BottomNav
        items={painelNavItems}
        acao={
          podeEditar
            ? { rotulo: "Marcar atendimento", icone: Plus, aoTocar: () => setMarcando(true) }
            : undefined
        }
      />
      {marcando && (
        <MarcarNoBalcao
          open
          onClose={() => setMarcando(false)}
          aoVerNaAgenda={() => {
            if (pathname !== "/painel") router.push("/painel");
          }}
        />
      )}
    </>
  );
}
