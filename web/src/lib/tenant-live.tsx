"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { doc, getDocFromServer, onSnapshot } from "firebase/firestore";
import { getDb } from "@/lib/firebase";
import { TenantProvider } from "@/lib/tenant-context";
import { toTenant } from "@/lib/tenant-shape";
import { acessoDaBarbearia, type Tenant } from "@/lib/tenant";
import { definirTravaDeEscrita } from "@/lib/db/trava-de-escrita";
import { ErroAoCarregar } from "@/components/ui/erro-ao-carregar";

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
/**
 * O financeiro (taxas, formas, comissão) já foi CONFIRMADO pelo servidor? (02/10)
 *
 * Com o cache persistente do Firestore, o navegador do dono do Siqueira ficou
 * com `barbershops/{id}` e `private/financeiro` marcados como INEXISTENTES no
 * cache local — enquanto existiam no servidor, com nove formas e taxas. O
 * painel caiu nos padrões (0%) e afirmou "Suas taxas de maquininha ainda não
 * foram informadas". Pior: a tela de Ajustes abria editável, e um Salvar
 * gravaria os zeros por cima das taxas verdadeiras.
 *
 * Regra: "não existe" vindo do CACHE não é resposta — só o servidor diz que o
 * documento não existe. Até ele responder, quem afirmar algo sobre taxas ou
 * comissão (ou deixar editar) espera.
 *
 * Fora do painel (sem TenantLive) não há o que confirmar: o valor padrão é
 * "confirmado", e nada muda para quem não lê o financeiro.
 */
export type EstadoDoFinanceiro = "carregando" | "confirmado" | "erro";
const FinanceiroConfirmadoContext = createContext<EstadoDoFinanceiro>("confirmado");
export function useEstadoDoFinanceiro(): EstadoDoFinanceiro {
  return useContext(FinanceiroConfirmadoContext);
}

export function TenantLive({
  inicial,
  indisponivel = false,
  children,
}: {
  inicial: Tenant;
  /**
   * A ficha da barbearia não pôde ser LIDA — D30.
   *
   * Diferente de "esta barbearia não existe": aqui o Firestore não respondeu, e
   * `inicial` é o substituto (`DEFAULT_TENANT`), não a barbearia do dono. Quem
   * decide isso é `resolverTenant()`, que separa 5xx e falha de rede do 404.
   *
   * Precisa ser tratado ACIMA do `AuthGuard`, e por isso mora aqui: o painel
   * monta `<TenantLive><AuthGuard requireOwner>`, e o `AuthGuard` autoriza
   * comparando `claims.barbershops[tenant.id]`. Com o id substituído, o dono
   * não bate com nada, `isOwner` vira `false` e ele é mandado para a vitrine —
   * a mesma tela de quem nunca teve conta. O defeito não é o `AuthGuard` estar
   * errado; é ele ser CONSULTADO sobre uma barbearia que não chegou a carregar.
   *
   * Falso por padrão: sem ninguém passar a prop, o comportamento é o de hoje.
   */
  indisponivel?: boolean;
  children: React.ReactNode;
}) {
  const [ficha, setFicha] = useState<{ id: string; data: Record<string, unknown> } | null>(null);
  /* Taxas, formas e comissão moram em `private/financeiro` desde 28/09 — a
   * ficha pública era legível sem login. O painel junta as duas: o privado por
   * cima do público, que é a mesma regra do servidor (`politicasDe`). */
  const [financeiro, setFinanceiro] = useState<Record<string, unknown> | null>(null);
  const [estadoDoFinanceiro, setEstadoDoFinanceiro] = useState<EstadoDoFinanceiro>("carregando");
  const tenant = useMemo<Tenant>(() => {
    if (!ficha) return inicial;
    const policies = (ficha.data.policies ?? {}) as Record<string, unknown>;
    const juntas = { ...policies };
    for (const campo of ["paymentFees", "paymentForms", "commissionSplit"]) {
      if (financeiro?.[campo] !== undefined) juntas[campo] = financeiro[campo];
    }
    return toTenant(ficha.id, { ...ficha.data, policies: juntas });
  }, [ficha, financeiro, inicial]);

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

    /* Sem ficha resolvida, `inicial.id` é o do substituto. Escutar
     * `barbershops/cortehub` acompanharia um documento que não é o do dono —
     * e um snapshot vindo dali entraria como se fosse a barbearia dele. */
    if (indisponivel) return;

    getDb()
      .then((db) => {
        if (cancelado) return;
        const ref = doc(db, "barbershops", inicial.id);
        let conferiu = false;
        parar = onSnapshot(
          ref,
          { includeMetadataChanges: true },
          (snap) => {
            const data = snap.data();
            if (data) {
              setFicha({ id: snap.id, data });
              return;
            }
            /* Sem dados: pergunta ao servidor uma vez, venha o "não existe" do
             * cache OU da escuta (02/10). Com o cache local corrompido, a escuta
             * retoma pelo token de retomada, o servidor responde "nada mudou" e
             * o snapshot chega SEM `fromCache`, afirmando que a barbearia não
             * existe. `getDocFromServer` ignora o cache, traz a verdade e a
             * grava no cache — o que também cura a escuta. */
            if (!conferiu) {
              conferiu = true;
              getDocFromServer(ref)
                .then((s) => {
                  const d = s.data();
                  if (!cancelado && d) setFicha({ id: s.id, data: d });
                })
                .catch((erro) => console.error("[tenant-live] servidor não confirmou a barbearia", erro));
            }
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
  }, [inicial.id, indisponivel]);

  useEffect(() => {
    let cancelado = false;
    let parar = () => {};
    if (indisponivel) return;
    getDb()
      .then((db) => {
        if (cancelado) return;
        const ref = doc(db, "barbershops", inicial.id, "private", "financeiro");
        let conferiu = false;
        parar = onSnapshot(
          ref,
          { includeMetadataChanges: true },
          (snap) => {
            const data = snap.data();
            if (data) {
              setFinanceiro(data);
              /* Dado do cache pode estar velho; só o servidor CONFIRMA. */
              if (!snap.metadata.fromCache) setEstadoDoFinanceiro("confirmado");
              return;
            }
            /* "Não existe" nunca é aceito de primeira (02/10): nem do cache,
             * nem da escuta — com o cache local corrompido, a escuta retomada
             * chega SEM `fromCache` e ainda assim mente. Quem afirma "não
             * existe" é só `getDocFromServer`, que ignora o cache. */
            if (!conferiu) {
              conferiu = true;
              getDocFromServer(ref)
                .then((s) => {
                  if (cancelado) return;
                  setFinanceiro(s.data() ?? {});
                  setEstadoDoFinanceiro("confirmado");
                })
                .catch((erro) => {
                  console.error("[tenant-live] servidor não confirmou o financeiro", erro);
                  if (!cancelado) setEstadoDoFinanceiro("erro");
                });
            }
          },
          /* Sem permissão ou sem rede: ninguém afirma nada sobre taxas — a
           * tela de Ajustes mostra o erro e não deixa salvar padrões. O
           * servidor, que é quem calcula dinheiro, lê o privado por conta
           * própria. */
          (erro) => {
            console.error("[tenant-live] falha ao ler o financeiro", erro);
            setEstadoDoFinanceiro("erro");
          }
        );
      })
      .catch(() => undefined);
    return () => {
      cancelado = true;
      parar();
    };
  }, [inicial.id, indisponivel]);

  /* Sem ficha, o painel não abre — mas o dono continua DENTRO do produto.
   *
   * A diferença que o D30 pede: uma frase que diz o que aconteceu e um botão
   * para tentar de novo, no lugar de um redirecionamento silencioso para fora.
   * `ErroAoCarregar` é o componente que a UX-04 já criou para o D27 — a mesma
   * distinção ("não consegui ler" ≠ "não há nada"), um nível acima: lá era uma
   * coleção dentro de uma tela, aqui é o painel inteiro.
   *
   * Nada de `router.replace`: quem foi expulso perde a URL em que estava. */
  if (indisponivel) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
        <ErroAoCarregar oQue="o painel da sua barbearia" className="max-w-sm" />
      </div>
    );
  }

  /* O tenant do servidor é reprovido pelo layout raiz; este Provider mais
   * interno vence para tudo que estiver abaixo dele. */
  return (
    <FinanceiroConfirmadoContext.Provider value={estadoDoFinanceiro}>
      <TenantProvider tenant={tenant}>{children}</TenantProvider>
    </FinanceiroConfirmadoContext.Provider>
  );
}
