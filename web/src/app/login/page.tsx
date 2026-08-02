"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  RecaptchaVerifier,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPhoneNumber,
  signInWithPopup,
  type ConfirmationResult,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { useTenant } from "@/lib/tenant-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type Method = "phone" | "email";
type PhoneStep = "phone" | "code";
type EmailMode = "entrar" | "criar";

/**
 * Mensagem por código do Firebase.
 * Antes tudo caía num `catch {}` com texto genérico: impossível distinguir
 * senha errada de excesso de tentativas ou de falha de rede, e nada era
 * registrado para diagnóstico.
 */
const AUTH_MESSAGES: Record<string, string> = {
  "auth/invalid-credential": "E-mail ou senha incorretos.",
  "auth/invalid-email": "E-mail inválido.",
  "auth/user-not-found": "Não encontramos uma conta com esse e-mail.",
  "auth/wrong-password": "Senha incorreta.",
  "auth/email-already-in-use": "Já existe uma conta com esse e-mail. Tente entrar.",
  "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.",
  "auth/too-many-requests": "Muitas tentativas. Aguarde alguns minutos e tente de novo.",
  "auth/network-request-failed": "Sem conexão. Verifique a internet e tente de novo.",
  "auth/popup-closed-by-user": "A janela do Google foi fechada antes de concluir.",
  "auth/popup-blocked": "O navegador bloqueou a janela do Google. Libere os pop-ups.",
  "auth/invalid-phone-number": "Número inválido. Use DDD + número.",
  "auth/invalid-verification-code": "Código inválido.",
  "auth/code-expired": "O código expirou. Peça um novo.",
  "auth/operation-not-allowed":
    "Login por SMS ainda não está habilitado no projeto. Use e-mail ou Google.",
};

function messageFor(error: unknown, fallback: string) {
  const code = (error as { code?: string })?.code;
  if (process.env.NODE_ENV !== "production") console.error("[auth]", code, error);
  return (code && AUTH_MESSAGES[code]) || fallback;
}

export default function LoginPage() {
  const router = useRouter();
  const { user, claims, loading } = useAuth();
  const { brand } = useTenant();
  const [method, setMethod] = useState<Method>("phone");

  const [phoneStep, setPhoneStep] = useState<PhoneStep>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null);
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);

  const [emailMode, setEmailMode] = useState<EmailMode>("entrar");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Dono cai no painel, cliente cai no app — a conta decide, não a porta.
  useEffect(() => {
    if (loading || !user) return;
    router.replace(claims.role === "owner" ? "/painel" : "/");
  }, [loading, user, claims.role, router]);

  /* O verificador só é criado quando a aba "Celular" está aberta, e é
   * destruído ao sair: um RecaptchaVerifier consumido precisa de clear()
   * antes de ser reusado, senão a segunda tentativa falha depois de um erro. */
  useEffect(() => {
    if (method !== "phone") return;
    recaptchaRef.current = new RecaptchaVerifier(auth, "recaptcha-container", {
      size: "invisible",
    });
    return () => {
      recaptchaRef.current?.clear();
      recaptchaRef.current = null;
    };
  }, [method]);

  async function handleGoogle() {
    setError(null);
    setBusy(true);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (err) {
      setError(messageFor(err, "Não foi possível entrar com Google. Tente novamente."));
    } finally {
      setBusy(false);
    }
  }

  async function handleSendCode() {
    setError(null);
    setBusy(true);
    try {
      const formatted = phone.startsWith("+")
        ? phone
        : `+55${phone.replace(/\D/g, "")}`;
      if (!recaptchaRef.current) throw new Error("reCAPTCHA não inicializado");
      const result = await signInWithPhoneNumber(auth, formatted, recaptchaRef.current);
      setConfirmation(result);
      setPhoneStep("code");
    } catch (err) {
      setError(messageFor(err, "Não conseguimos enviar o código. Confira o número e tente de novo."));
      // Verificador consumido: recria para permitir nova tentativa.
      recaptchaRef.current?.clear();
      recaptchaRef.current = new RecaptchaVerifier(auth, "recaptcha-container", {
        size: "invisible",
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyCode() {
    if (!confirmation) return;
    setError(null);
    setBusy(true);
    try {
      await confirmation.confirm(code);
    } catch (err) {
      setError(messageFor(err, "Código inválido."));
    } finally {
      setBusy(false);
    }
  }

  async function handleEmailSubmit() {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (emailMode === "criar") {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      setError(
        messageFor(
          err,
          emailMode === "criar"
            ? "Não foi possível criar a conta."
            : "E-mail ou senha incorretos."
        )
      );
    } finally {
      setBusy(false);
    }
  }

  /* Não havia como criar conta por e-mail nem recuperar senha: quem escolhesse
   * a aba "E-mail" sem conta prévia ficava sem saída. */
  async function handlePasswordReset() {
    if (!email) {
      setError("Informe o e-mail para receber o link de redefinição.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setNotice("Enviamos um link de redefinição para o seu e-mail.");
    } catch (err) {
      setError(messageFor(err, "Não foi possível enviar o link de redefinição."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-bg px-4 py-10">
      <div className="flex flex-col items-center gap-2 text-center">
        <Image src={brand.logo} alt="" width={56} height={56} priority />
        <h1 className="font-display text-xl text-ivory">{brand.name}</h1>
        <p className="text-sm text-ivory-muted">Entre com sua conta</p>
      </div>

      <Card className="flex w-full max-w-sm flex-col gap-4 p-6">
        <div className="flex gap-2 rounded-xl border border-border bg-surface p-1">
          {(["phone", "email"] as Method[]).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={method === m}
              onClick={() => {
                setMethod(m);
                setError(null);
                setNotice(null);
              }}
              className={
                "flex-1 rounded-lg py-2 text-sm font-medium transition-colors " +
                (method === m
                  ? "bg-gold text-ivory"
                  : "text-ivory-muted hover:text-ivory")
              }
            >
              {m === "phone" ? "Celular" : "E-mail"}
            </button>
          ))}
        </div>

        {method === "phone" ? (
          phoneStep === "phone" ? (
            <form
              className="flex flex-col gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                handleSendCode();
              }}
            >
              <label htmlFor="login-phone" className="text-xs font-medium text-ivory-muted">
                Celular com WhatsApp
              </label>
              <input
                id="login-phone"
                name="tel"
                autoComplete="tel"
                type="tel"
                inputMode="numeric"
                placeholder="(11) 99999-9999"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="rounded-xl border border-border bg-surface px-4 py-3 text-sm text-ivory outline-none focus-visible:ring-2 focus-visible:ring-gold"
              />
              <Button
                type="submit"
                className="mt-1"
                disabled={busy || phone.replace(/\D/g, "").length < 10}
              >
                Enviar código
              </Button>
            </form>
          ) : (
            <form
              className="flex flex-col gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                handleVerifyCode();
              }}
            >
              <label htmlFor="login-code" className="text-xs font-medium text-ivory-muted">
                Código recebido por SMS
              </label>
              <input
                id="login-code"
                name="one-time-code"
                autoComplete="one-time-code"
                type="text"
                inputMode="numeric"
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="rounded-xl border border-border bg-surface px-4 py-3 text-center text-lg tracking-[0.5em] text-ivory outline-none focus-visible:ring-2 focus-visible:ring-gold"
              />
              <Button type="submit" className="mt-1" disabled={busy || code.length < 6}>
                Confirmar
              </Button>
              <button
                type="button"
                onClick={() => {
                  setPhoneStep("phone");
                  setError(null);
                }}
                className="text-xs text-ivory-muted transition-colors hover:text-ivory"
              >
                Usar outro número
              </button>
            </form>
          )
        ) : (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              handleEmailSubmit();
            }}
          >
            <div className="flex flex-col gap-1.5">
              <label htmlFor="login-email" className="text-xs font-medium text-ivory-muted">
                E-mail
              </label>
              <input
                id="login-email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="voce@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-xl border border-border bg-surface px-4 py-3 text-sm text-ivory outline-none focus-visible:ring-2 focus-visible:ring-gold"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="login-password" className="text-xs font-medium text-ivory-muted">
                Senha
              </label>
              <input
                id="login-password"
                name="password"
                type="password"
                autoComplete={emailMode === "criar" ? "new-password" : "current-password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded-xl border border-border bg-surface px-4 py-3 text-sm text-ivory outline-none focus-visible:ring-2 focus-visible:ring-gold"
              />
            </div>
            <Button type="submit" disabled={busy || !email || password.length < 6}>
              {emailMode === "criar" ? "Criar conta" : "Entrar"}
            </Button>
            <div className="flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={() => {
                  setEmailMode((m) => (m === "entrar" ? "criar" : "entrar"));
                  setError(null);
                  setNotice(null);
                }}
                className="text-gold-light transition-opacity hover:opacity-80"
              >
                {emailMode === "criar" ? "Já tenho conta" : "Criar uma conta"}
              </button>
              {emailMode === "entrar" && (
                <button
                  type="button"
                  onClick={handlePasswordReset}
                  disabled={busy}
                  className="text-ivory-muted transition-colors hover:text-ivory disabled:opacity-40"
                >
                  Esqueci a senha
                </button>
              )}
            </div>
          </form>
        )}

        {error && (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="text-xs text-success">
            {notice}
          </p>
        )}

        <div className="flex items-center gap-3 text-xs text-ivory-muted">
          <div className="h-px flex-1 bg-border" />
          ou
          <div className="h-px flex-1 bg-border" />
        </div>

        <Button variant="secondary" onClick={handleGoogle} disabled={busy}>
          Continuar com Google
        </Button>
      </Card>

      <div id="recaptcha-container" />
    </div>
  );
}
