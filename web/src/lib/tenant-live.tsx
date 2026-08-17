"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import { TenantProvider } from "@/lib/tenant-context";
import { toTenant } from "@/lib/tenant-shape";
import { acessoDaBarbearia, type Tenant } from "@/lib/tenant";
import { definirTravaDeEscrita } from "@/lib/db/trava-de-escrita";

/**
 * A ficha da barbearia em tempo real, **dentro do painel**.
 *
 * O tenant que vem do servidor é cacheado por 300s (`tenant-server.ts`), e a
 * premissa desse cache era que a ficha "muda quando o dono edita a marca". Ela
 * caiu no dia em que Configurações virou tela de escrita nesse mesmo
 * documento: o dono salvava a taxa ou a tolerância, recarregava, e a tela
 * mostrava o valor antigo por até cinco minutos. A gravação estava certa e a
 * interface mentia sobre o estado salvo — que é pior do que falhar, porque ele
 * salva de novo e perde a confiança na tela.
 *
 * Aqui a fonte é o Firestore direto, com `onSnapshot`: o que ele salva aparece
 * na hora, em todas as abas abertas.
 *
 * **Só no painel.** A vitrine pública continua com os 300s de cache — é lá que
 * ele importa, porque o render é uma vez por barbearia em vez de uma por
 * visita, e ninguém está editando enquanto olha.
 *
 * O valor do servidor entra como estado inicial, e não como "carregando": a
 * tela pinta no primeiro byte com a marca certa, e o snapshot só substitui
 * quando chega. Sem isso, o painel voltaria a piscar a marca da plataforma
 * antes da do cliente, que é o sintoma que resolver no servidor evitou.
 */
export function TenantLive({
  inicial,
  children,
}: {
  inicial: Tenant;
  children: React.ReactNode;
}) {
  const [tenant, setTenant] = useState<Tenant>(inicial);

  /* A trava de escrita acompanha a ficha, e não só o primeiro render.
   *
   * É aqui porque este componente envolve o painel inteiro — o único lugar do
   * produto onde alguém edita — e porque a ficha chega ao vivo: o trial que
   * vence com o painel aberto passa a travar sem exigir recarregar. O app do
   * cliente não passa por aqui e continua livre, que é a decisão de produto
   * registrada: quem marcou corte na sexta não tem culpa da mensalidade do dono.
   *
   * `motivo` é nulo quando a conta está em dia, e aí a trava é desligada — o
   * caminho de volta importa tanto quanto o de ida: contratar um plano precisa
   * devolver a edição na hora. */
  useEffect(() => {
    definirTravaDeEscrita(acessoDaBarbearia(tenant).motivo);
    return () => definirTravaDeEscrita(null);
  }, [tenant]);

  useEffect(() => {
    /* `getDb` é assíncrono — o Firestore entra por import dinâmico para não
     * pesar no primeiro carregamento. Se o painel desmontar antes de ele
     * chegar, `cancelado` impede uma assinatura órfã que ninguém mais fecha. */
    let cancelado = false;
    let parar = () => {};

    getDb()
      .then((db) => {
        if (cancelado) return;
        parar = onSnapshot(
          doc(db, "barbershops", inicial.id),
          (snap) => {
            const data = snap.data();
            if (!data) return;
            setTenant(toTenant(snap.id, data));
          },
          (erro) => {
            /* Degrada para o valor do servidor em vez de derrubar o painel:
             * sem rede, a ficha de cinco minutos atrás é melhor que tela
             * nenhuma. */
            console.error("[tenant-live] falha ao escutar a barbearia", erro);
          }
        );
      })
      .catch((erro) => console.error("[tenant-live] Firestore indisponível", erro));

    return () => {
      cancelado = true;
      parar();
    };
  }, [inicial.id]);

  /* O tenant do servidor é reprovido pelo layout raiz; este Provider mais
   * interno vence para tudo que estiver abaixo dele. */
  return <TenantProvider tenant={tenant}>{children}</TenantProvider>;
}
