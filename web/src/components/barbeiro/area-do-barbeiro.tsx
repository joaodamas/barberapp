"use client";

import { createContext, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CalendarDays, LogOut, Wallet, WifiOff } from "lucide-react";
import { auth } from "@/lib/firebase";
import { sairDaConta } from "@/components/sign-out-button";
import { useAuth } from "@/lib/auth-context";
import { useTenant } from "@/lib/tenant-context";
import { useStaff } from "@/lib/db/use-shop-data";
import { mensagemDaFuncao } from "@/lib/mensagem-da-funcao";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { EstadoCentral } from "@/components/ui/estado-central";
import { AvisoDeConexao } from "@/components/aviso-de-conexao";

type Cadeira = { staffId: string; nome: string };
const CadeiraContext = createContext<Cadeira | null>(null);

/** A cadeira de quem está no painel do barbeiro. Só existe dentro da área. */
export function useCadeira(): Cadeira {
  const c = useContext(CadeiraContext);
  if (!c) throw new Error("useCadeira fora da área do barbeiro");
  return c;
}

const ABAS = [
  { href: "/barbeiro", label: "Minha agenda", icon: CalendarDays, exato: true },
  { href: "/barbeiro/comissao", label: "Minha comissão", icon: Wallet, exato: false },
];

/**
 * A área do barbeiro (05/10): porta de entrada, cabeçalho e navegação.
 *
 * Quem entra aqui é `staff` desta barbearia COM a cadeira no token
 * (`equipe[barbershopId]`). Conta ligada antes do convite não tem a cadeira no
 * token: a área pede ao servidor para completar e renova o token sozinha.
 */
export function AreaDoBarbeiro({ children }: { children: React.ReactNode }) {
  const { user, claims, loading, semResposta } = useAuth();
  const tenant = useTenant();
  const router = useRouter();
  const pathname = usePathname();
  const { items: equipe } = useStaff();
  const [erroDaCadeira, setErroDaCadeira] = useState<string | null>(null);

  const papel = claims.barbershops?.[tenant.id];
  const staffId = claims.equipe?.[tenant.id] ?? null;
  const precisaSincronizar = !!user && papel === "staff" && !staffId && !claims.mustChangePassword;

  useEffect(() => {
    /* Sem resposta do Auth não é "sem conta": mandar para o login quem só
     * perdeu a rede era expulsar o barbeiro logado (08/10). */
    if (loading || semResposta) return;
    if (!user) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    else if (claims.mustChangePassword) router.replace("/trocar-senha");
  }, [loading, semResposta, user, claims.mustChangePassword, pathname, router]);

  useEffect(() => {
    if (!precisaSincronizar) return;
    let cancelado = false;
    void (async () => {
      try {
        const { callFunction } = await import("@/lib/firebase");
        await callFunction("sincronizarMeuAcessoDeBarbeiro", { barbershopId: tenant.id });
        await auth.currentUser?.getIdToken(true);
      } catch (e) {
        if (!cancelado) setErroDaCadeira(mensagemDaFuncao(e, "Não foi possível abrir sua agenda agora."));
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [precisaSincronizar, tenant.id]);

  /* O Auth não respondeu (rede caiu, token não veio): o mesmo tratamento do
   * `AuthGuard`. Antes isto caía em "Sua conta não tem acesso de barbeiro" —
   * o token sem claims parece conta sem papel —, e o barbeiro achava que tinha
   * sido tirado do sistema (08/10). */
  if (semResposta) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center px-4 py-16">
        <EstadoCentral
          icon={WifiOff}
          titulo="Não conseguimos confirmar sua conta"
          descricao="A conexão falhou ou demorou demais. Confira a internet e tente de novo — nada do que você fez se perdeu."
          acao={<Button onClick={() => window.location.reload()}>Tentar de novo</Button>}
        />
      </div>
    );
  }

  if (loading || !user || claims.mustChangePassword) {
    return <Centro>Carregando…</Centro>;
  }

  if (papel === "owner") {
    return (
      <Centro>
        <p>Esta é a área do barbeiro. Como dono, você usa o painel completo.</p>
        <Link href="/painel" className="mt-3 inline-block text-gold-strong underline-offset-2 hover:underline">
          Ir para o painel
        </Link>
      </Centro>
    );
  }

  if (papel !== "staff") {
    return (
      <Centro>
        <p>Sua conta não tem acesso de barbeiro nesta barbearia.</p>
        <p className="mt-1 text-xs">Peça ao dono um convite em Equipe → Dar acesso.</p>
        <Link href="/" className="mt-3 inline-block text-gold-strong underline-offset-2 hover:underline">
          Ir para o início
        </Link>
      </Centro>
    );
  }

  if (!staffId) {
    return <Centro>{erroDaCadeira ?? "Preparando sua agenda…"}</Centro>;
  }

  const nome = equipe.find((b) => b.id === staffId)?.name ?? "";

  return (
    <CadeiraContext.Provider value={{ staffId, nome }}>
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-1 flex-col overflow-y-auto md:h-full">
        <AvisoDeConexao recuoDoTopo={false} />
        <header className="safe-top flex items-center justify-between gap-3 px-4 pb-2 pt-4">
          <div className="min-w-0 leading-tight">
            <p className="truncate font-display text-sm uppercase tracking-wider text-ink">{tenant.brand.shortName}</p>
            <p className="truncate text-xs text-ink-muted">{nome ? `${nome} · barbeiro` : "Barbeiro"}</p>
          </div>
          <button
            type="button"
            onClick={() => void sairDaConta(tenant.id).then(() => router.replace("/login"))}
            className="flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-xs text-ink-muted hover:text-ink"
          >
            <LogOut size={14} /> Sair
          </button>
        </header>
        <nav aria-label="Áreas do barbeiro" className="flex gap-1 px-4 pb-3">
          {ABAS.map((a) => {
            const ativo = a.exato ? pathname === a.href : pathname.startsWith(a.href);
            return (
              <Link
                key={a.href}
                href={a.href}
                aria-current={ativo ? "page" : undefined}
                className={cn(
                  "flex min-h-10 items-center gap-1.5 rounded-xl px-3 text-sm transition-colors",
                  ativo ? "bg-gold/15 text-ink" : "text-ink-muted hover:text-ink"
                )}
              >
                <a.icon size={15} /> {a.label}
              </Link>
            );
          })}
        </nav>
        <main id="conteudo" className="flex-1 px-4 pb-10">
          {children}
        </main>
      </div>
    </CadeiraContext.Provider>
  );
}

function Centro({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 items-center justify-center px-6 py-16 text-center text-sm text-ink-muted">
      <div className="max-w-sm">{children}</div>
    </div>
  );
}
