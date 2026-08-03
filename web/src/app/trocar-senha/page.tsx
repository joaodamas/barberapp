"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { Check, Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { auth, callFunction } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { useTenant } from "@/lib/tenant-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/**
 * Troca da senha provisória.
 *
 * Fica FORA dos layouts logados de propósito: quem cai aqui ainda não tem
 * acesso a nada, e enfiar a tela dentro do `AuthGuard` criaria o laço de
 * "guarda manda para cá, tela precisa da guarda".
 *
 * Como toda página fora daqueles layouts, precisa do próprio `overflow-y-auto`:
 * o `<body>` trava a rolagem em telas grandes para a sidebar funcionar.
 */

/** As mesmas regras do servidor, ditas de um jeito que dá para conferir na tela. */
function regras(senha: string) {
  return [
    { ok: senha.length >= 8, texto: "Pelo menos 8 caracteres" },
    { ok: /[a-zA-Z]/.test(senha), texto: "Pelo menos uma letra" },
  ];
}

export default function TrocarSenhaPage() {
  const router = useRouter();
  const { user, claims, loading } = useAuth();
  const { brand } = useTenant();

  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [mostrar, setMostrar] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  /* Depois de trocar, o claim some — e sem esta trava o efeito abaixo
   * entenderia "não precisa trocar" e mandaria embora antes do redirecionamento
   * certo, com a tela piscando no caminho. */
  const [concluido, setConcluido] = useState(false);

  useEffect(() => {
    if (loading || concluido) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (claims.mustChangePassword !== true) router.replace("/");
  }, [loading, user, claims.mustChangePassword, concluido, router]);

  const pendencias = regras(senha).filter((r) => !r.ok);
  const confere = senha.length > 0 && senha === confirmacao;
  const podeSalvar = pendencias.length === 0 && confere && !salvando;

  async function salvar() {
    if (!podeSalvar) return;
    setSalvando(true);
    setErro(null);
    try {
      await callFunction("changeInitialPassword", { newPassword: senha });
      setConcluido(true);

      /* A senha mudou e as sessões antigas foram derrubadas. Entrar de novo
       * aqui mesmo, com a senha que ele acabou de digitar, é o que traz o token
       * já sem o claim — e poupa o dono de uma tela de login logo depois de
       * provar quem é. */
      const email = user?.email;
      if (email) {
        await signInWithEmailAndPassword(auth, email, senha);
        router.replace("/painel");
        return;
      }
      await signOut(auth);
      router.replace("/login");
    } catch (err) {
      const mensagem =
        (err as { message?: string })?.message ??
        "Não foi possível salvar. Tente de novo.";
      console.error("[trocar-senha]", err);
      setErro(mensagem);
      setSalvando(false);
      setConcluido(false);
    }
  }

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center overflow-y-auto bg-bg md:h-full">
        <Loader2 className="h-8 w-8 animate-spin text-gold-light" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 overflow-y-auto bg-bg px-4 py-10 md:h-full">
      <div className="flex flex-col items-center gap-2 text-center">
        <Image src={brand.logo} alt="" width={56} height={56} priority />
        <h1 className="font-display text-xl text-ivory">Crie sua senha</h1>
        <p className="max-w-sm text-sm text-ivory-muted">
          A senha que te enviamos era temporária e some agora. Escolha uma que só
          você saiba — é com ela que você entra daqui pra frente.
        </p>
      </div>

      <Card className="flex w-full max-w-sm flex-col gap-4 p-6">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            salvar();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <label htmlFor="nova-senha" className="text-xs font-medium text-ivory-muted">
              Nova senha
            </label>
            <div className="relative">
              <input
                id="nova-senha"
                name="new-password"
                autoComplete="new-password"
                type={mostrar ? "text" : "password"}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                autoFocus
                className="w-full rounded-xl border border-border bg-surface px-4 py-3 pr-12 text-sm text-ivory outline-none focus-visible:ring-2 focus-visible:ring-gold"
              />
              <button
                type="button"
                onClick={() => setMostrar((m) => !m)}
                aria-label={mostrar ? "Esconder senha" : "Mostrar senha"}
                className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-xl text-ivory-muted transition-colors hover:text-ivory"
              >
                {mostrar ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="confirmar-senha" className="text-xs font-medium text-ivory-muted">
              Repita a nova senha
            </label>
            <input
              id="confirmar-senha"
              name="confirm-password"
              autoComplete="new-password"
              type={mostrar ? "text" : "password"}
              value={confirmacao}
              onChange={(e) => setConfirmacao(e.target.value)}
              className="rounded-xl border border-border bg-surface px-4 py-3 text-sm text-ivory outline-none focus-visible:ring-2 focus-visible:ring-gold"
            />
          </div>

          <ul className="flex flex-col gap-1 text-xs">
            {regras(senha).map((r) => (
              <li
                key={r.texto}
                className={r.ok ? "flex items-center gap-1.5 text-success" : "flex items-center gap-1.5 text-ivory-muted"}
              >
                <Check size={12} className={r.ok ? "opacity-100" : "opacity-30"} />
                {r.texto}
              </li>
            ))}
            {confirmacao.length > 0 && (
              <li
                className={confere ? "flex items-center gap-1.5 text-success" : "flex items-center gap-1.5 text-danger"}
              >
                <Check size={12} className={confere ? "opacity-100" : "opacity-30"} />
                {confere ? "As duas conferem" : "As duas senhas estão diferentes"}
              </li>
            )}
          </ul>

          <Button type="submit" disabled={!podeSalvar}>
            {salvando ? "Salvando…" : "Salvar e continuar"}
          </Button>
        </form>

        {erro && (
          <p role="alert" className="text-xs text-danger">
            {erro}
          </p>
        )}

        <p className="flex items-start gap-2 text-xs text-ivory-muted">
          <ShieldCheck size={14} className="mt-0.5 shrink-0 text-gold-light" />
          Ninguém da nossa equipe consegue ver essa senha. Se esquecer, use
          &quot;Esqueci a senha&quot; na tela de entrada.
        </p>
      </Card>
    </div>
  );
}
