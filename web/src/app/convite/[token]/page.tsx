"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { mensagemDaFuncao } from "@/lib/mensagem-da-funcao";
import { ConfirmeSeuEmail } from "@/components/confirme-seu-email";

type Leitura =
  | { valido: true; barbearia: string; barbeiro: string; porEmail: boolean }
  | { valido: false; mensagem: string };

/**
 * O convite do barbeiro (05/10).
 *
 * Mostra de qual barbearia é ANTES de pedir conta. Sem conta → entrar ou criar
 * e voltar aqui. Com conta → um toque aceita, o token da conta é renovado (o
 * papel novo vem nele) e o barbeiro cai no painel dele.
 */
export default function ConvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const { user, loading } = useAuth();
  const [leitura, setLeitura] = useState<Leitura | null>(null);
  const [aceitando, setAceitando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [emailConfirmadoAgora, setEmailConfirmadoAgora] = useState(false);

  useEffect(() => {
    let cancelado = false;
    void (async () => {
      try {
        const { callFunction } = await import("@/lib/firebase");
        const r = await callFunction<{ token: string }, Leitura>("lerConviteDeBarbeiro", { token });
        if (!cancelado) setLeitura(r);
      } catch (e) {
        if (!cancelado)
          setLeitura({ valido: false, mensagem: mensagemDaFuncao(e, "Não foi possível abrir o convite. Tente de novo.") });
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [token]);

  async function aceitar() {
    setAceitando(true);
    setErro(null);
    try {
      const { callFunction } = await import("@/lib/firebase");
      await callFunction("aceitarConviteDeBarbeiro", { token });
      /* O papel de barbeiro está no token NOVO: sem renovar, o painel abriria
       * com a conta ainda sem acesso. */
      await auth.currentUser?.getIdToken(true);
      router.replace("/barbeiro");
    } catch (e) {
      setErro(mensagemDaFuncao(e, "Não foi possível aceitar agora. Tente de novo."));
      setAceitando(false);
    }
  }

  const voltarAqui = `/login?next=${encodeURIComponent(`/convite/${token}`)}`;
  /* Convite por e-mail exige o e-mail CONFIRMADO (08/10): sem isso, quem só
   * soubesse o endereço criava uma conta com ele e aceitava. O servidor recusa;
   * aqui a tela pede a confirmação ANTES do toque, e não depois do erro. Conta
   * do Google já chega confirmada. */
  const precisaConfirmarEmail =
    leitura?.valido === true &&
    leitura.porEmail &&
    !!user?.email &&
    !user.emailVerified &&
    !user.providerData.some((p) => p.providerId === "google.com") &&
    !emailConfirmadoAgora;

  return (
    <main className="flex min-h-full flex-1 items-center justify-center overflow-y-auto px-4 py-10">
      <Card className="flex w-full max-w-md flex-col gap-4 p-6">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gold/10 text-gold-strong">
          <KeyRound size={20} />
        </span>

        {!leitura ? (
          <p className="text-sm text-ink-muted">Abrindo o convite…</p>
        ) : !leitura.valido ? (
          <>
            <h1 className="text-xl font-semibold text-ink">Convite indisponível</h1>
            <p className="text-sm text-ink-muted">{leitura.mensagem}</p>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-1">
              <p className="text-xs uppercase tracking-wider text-gold-strong">{leitura.barbearia}</p>
              <h1 className="text-xl font-semibold text-ink">
                {leitura.barbeiro ? `${leitura.barbeiro}, sua agenda está pronta` : "Sua agenda está pronta"}
              </h1>
              <p className="text-sm text-ink-muted">
                Com o acesso você vê seus horários, fecha seus atendimentos e acompanha sua comissão. Você não vê a
                agenda dos colegas nem o caixa da barbearia.
              </p>
            </div>

            {loading ? null : user && precisaConfirmarEmail ? (
              <ConfirmeSeuEmail
                user={user}
                explicacao="O convite foi enviado para um e-mail: confirmar mostra que este e-mail é seu."
                aoConfirmar={() => setEmailConfirmadoAgora(true)}
              />
            ) : user ? (
              <div className="flex flex-col gap-2">
                <Button onClick={aceitar} disabled={aceitando}>
                  {aceitando ? "Ativando…" : "Aceitar e abrir minha agenda"}
                </Button>
                <p className="text-[11px] text-ink-muted">
                  Entrando como {user.email ?? user.phoneNumber ?? "sua conta"}.{" "}
                  {leitura.porEmail && "O convite precisa ser aceito com o e-mail que o recebeu."}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <Link
                  href={voltarAqui}
                  className="flex min-h-11 items-center justify-center rounded-xl bg-gold px-4 text-sm font-semibold text-ink"
                >
                  Entrar ou criar minha conta
                </Link>
                <p className="text-[11px] text-ink-muted">
                  Depois de entrar você volta para esta tela e confirma.
                  {leitura.porEmail && " Use o e-mail que recebeu o convite (ou o Google desse e-mail)."}
                </p>
              </div>
            )}

            {erro && (
              <p role="alert" className="text-sm text-danger">
                {erro}
              </p>
            )}
          </>
        )}
      </Card>
    </main>
  );
}
