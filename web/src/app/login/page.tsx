"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  GoogleAuthProvider,
  RecaptchaVerifier,
  signInWithEmailAndPassword,
  signInWithPhoneNumber,
  signInWithPopup,
  type ConfirmationResult,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type Method = "phone" | "email";
type PhoneStep = "phone" | "code";

export default function LoginPage() {
  const router = useRouter();
  const { user, claims, loading } = useAuth();
  const [method, setMethod] = useState<Method>("phone");

  const [phoneStep, setPhoneStep] = useState<PhoneStep>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null);
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Dono cai no painel, cliente cai no app — a conta decide, não a porta.
  useEffect(() => {
    if (loading || !user) return;
    router.replace(claims.role === "owner" ? "/painel" : "/");
  }, [loading, user, claims.role, router]);

  useEffect(() => {
    if (!recaptchaRef.current) {
      recaptchaRef.current = new RecaptchaVerifier(auth, "recaptcha-container", {
        size: "invisible",
      });
    }
  }, []);

  async function handleGoogle() {
    setError(null);
    setBusy(true);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch {
      setError("Não foi possível entrar com Google. Tente novamente.");
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
      const result = await signInWithPhoneNumber(
        auth,
        formatted,
        recaptchaRef.current!
      );
      setConfirmation(result);
      setPhoneStep("code");
    } catch {
      setError("Não conseguimos enviar o código. Confira o número e tente de novo.");
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
    } catch {
      setError("Código inválido.");
    } finally {
      setBusy(false);
    }
  }

  async function handleEmailLogin() {
    setError(null);
    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch {
      setError("E-mail ou senha incorretos.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-bg px-4 py-10">
      <div className="flex flex-col items-center gap-2 text-center">
        <Image src="/logo.svg" alt="" width={56} height={56} priority />
        <h1 className="font-display text-xl text-ivory">O Siqueira Barbearia</h1>
        <p className="text-sm text-ivory-muted">Entre com sua conta</p>
      </div>

      <Card className="flex w-full max-w-sm flex-col gap-4 p-6">
        <div className="flex gap-2 rounded-xl border border-border bg-surface p-1">
          {(["phone", "email"] as Method[]).map((m) => (
            <button
              key={m}
              onClick={() => {
                setMethod(m);
                setError(null);
              }}
              className={
                "flex-1 rounded-lg py-2 text-sm font-medium transition-colors " +
                (method === m
                  ? "bg-gold text-bg"
                  : "text-ivory-muted hover:text-ivory")
              }
            >
              {m === "phone" ? "Celular" : "E-mail"}
            </button>
          ))}
        </div>

        {method === "phone" ? (
          phoneStep === "phone" ? (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-ivory-muted">
                Celular com WhatsApp
              </label>
              <input
                type="tel"
                inputMode="numeric"
                placeholder="(11) 99999-9999"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="rounded-xl border border-border bg-surface px-4 py-3 text-sm text-ivory outline-none focus-visible:ring-2 focus-visible:ring-gold"
              />
              <Button
                className="mt-1"
                onClick={handleSendCode}
                disabled={busy || phone.replace(/\D/g, "").length < 10}
              >
                Enviar código
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-ivory-muted">
                Código recebido por SMS
              </label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="rounded-xl border border-border bg-surface px-4 py-3 text-center text-lg tracking-[0.5em] text-ivory outline-none focus-visible:ring-2 focus-visible:ring-gold"
              />
              <Button
                className="mt-1"
                onClick={handleVerifyCode}
                disabled={busy || code.length < 6}
              >
                Confirmar
              </Button>
              <button
                onClick={() => {
                  setPhoneStep("phone");
                  setError(null);
                }}
                className="text-xs text-ivory-muted transition-colors hover:text-ivory"
              >
                Usar outro número
              </button>
            </div>
          )
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-ivory-muted">E-mail</label>
              <input
                type="email"
                placeholder="voce@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-xl border border-border bg-surface px-4 py-3 text-sm text-ivory outline-none focus-visible:ring-2 focus-visible:ring-gold"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-ivory-muted">Senha</label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded-xl border border-border bg-surface px-4 py-3 text-sm text-ivory outline-none focus-visible:ring-2 focus-visible:ring-gold"
              />
            </div>
            <Button
              onClick={handleEmailLogin}
              disabled={busy || !email || password.length < 6}
            >
              Entrar
            </Button>
          </div>
        )}

        {error && <p className="text-xs text-danger">{error}</p>}

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
