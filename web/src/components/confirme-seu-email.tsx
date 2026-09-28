"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { User } from "firebase/auth";
import { MailCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  linkJaEnviado,
  marcarLinkEnviado,
  mensagemDeFalhaNoEnvio,
} from "@/lib/verificacao-de-email";

/**
 * "Confirme seu e-mail" — o mesmo cartão no cadastro da barbearia e no agendar.
 *
 * Nasceu em `criar-conta` e foi extraído em 28/09, quando agendar também
 * passou a exigir e-mail confirmado (auditoria, achado M2). Duas cópias do
 * mesmo cartão divergiriam no primeiro ajuste de texto.
 *
 * O que ele NÃO faz, de propósito: dizer "enviamos um link" sem ter enviado.
 * A versão anterior afirmava o envio em qualquer caso — e o cliente antigo,
 * que criou a conta antes de o login mandar o link, ficaria esperando um
 * e-mail que ninguém disparou. Aqui o texto acompanha o que de fato aconteceu:
 * enviando, enviado, ou não deu.
 */
type Envio =
  | { fase: "enviando" }
  | { fase: "enviado"; reenviado?: boolean }
  | { fase: "falhou"; mensagem: string };

async function enviarLink(user: User): Promise<void> {
  const { sendEmailVerification } = await import("firebase/auth");
  await sendEmailVerification(user);
  marcarLinkEnviado(user.uid);
}

export function ConfirmeSeuEmail({
  user,
  explicacao,
  aoConfirmar,
  rolarAteAqui = false,
}: {
  user: User;
  /** Por que esta tela pede a confirmação — uma frase, no idioma do contexto. */
  explicacao?: ReactNode;
  /**
   * Chamado quando o e-mail aparece confirmado E o token já foi renovado —
   * ou seja, quando o servidor já vai aceitar. Nunca antes.
   */
  aoConfirmar: () => void;
  /**
   * Traz o cartão para a vista ao aparecer. No agendar ele surge no fim de um
   * passo comprido, depois do toque num botão fixo no rodapé — sem rolar, o
   * cliente tocaria em "Confirmar" e não veria nada acontecer.
   */
  rolarAteAqui?: boolean;
}) {
  const cartao = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (rolarAteAqui) cartao.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [rolarAteAqui]);
  const [envio, setEnvio] = useState<Envio>(() =>
    linkJaEnviado(user.uid) ? { fase: "enviado" } : { fase: "enviando" }
  );
  const [conferindo, setConferindo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  /* Envia sozinho uma vez por sessão, ao aparecer. Quem acabou de criar a
   * conta já recebeu (o login envia e marca a sessão); quem tem conta antiga
   * nunca recebeu link nenhum, e sem isto ficaria esperando por nada. */
  const autoEnvio = useRef(false);
  useEffect(() => {
    if (autoEnvio.current || linkJaEnviado(user.uid)) return;
    autoEnvio.current = true;
    void (async () => {
      try {
        await enviarLink(user);
        setEnvio({ fase: "enviado" });
      } catch (e) {
        console.error("[confirme-seu-email] falha ao enviar verificação", e);
        setEnvio({ fase: "falhou", mensagem: mensagemDeFalhaNoEnvio(e) });
      }
    })();
  }, [user]);

  async function reenviar() {
    setAviso(null);
    setEnvio({ fase: "enviando" });
    try {
      await enviarLink(user);
      setEnvio({ fase: "enviado", reenviado: true });
    } catch (e) {
      console.error("[confirme-seu-email] falha ao reenviar verificação", e);
      setEnvio({ fase: "falhou", mensagem: mensagemDeFalhaNoEnvio(e) });
    }
  }

  /* Recarregar a página não basta: o token em cache continua dizendo
   * `email_verified: false` por até uma hora, e o servidor recusava logo
   * depois de a tela liberar. Por isso `reload` (o que o Firebase sabe da
   * conta) E `getIdToken(true)` (o que o servidor vai ler). */
  async function jaConfirmei() {
    setAviso(null);
    setConferindo(true);
    try {
      await user.reload();
      if (!user.emailVerified) {
        setAviso(
          "Ainda não aparece como confirmado. Abra o link do e-mail, toque para confirmar e volte aqui."
        );
        return;
      }
      await user.getIdToken(true);
      aoConfirmar();
    } catch (e) {
      console.error("[confirme-seu-email] falha ao conferir a verificação", e);
      setAviso("Não conseguimos conferir agora. Confira a internet e tente de novo.");
    } finally {
      setConferindo(false);
    }
  }

  const email = user.email ? <strong>{user.email}</strong> : "o seu e-mail";

  return (
    <Card ref={cartao} className="flex flex-col items-center gap-4 py-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gold/10 text-gold-strong">
        <MailCheck size={22} aria-hidden />
      </div>
      <div className="max-w-sm">
        <p className="text-sm font-medium text-ink">Confirme seu e-mail</p>
        <p className="mt-1 text-xs text-ink-muted" aria-live="polite">
          {envio.fase === "enviando" && <>Enviando o link de confirmação para {email}…</>}
          {envio.fase === "enviado" && (
            <>
              Enviamos um link para {email}. Abra, toque para confirmar e volte
              aqui. Não achou? Confira o spam.
            </>
          )}
          {envio.fase === "falhou" && <>Não conseguimos enviar o link para {email}.</>}
        </p>
        {explicacao && <p className="mt-2 text-xs text-ink-muted">{explicacao}</p>}
      </div>

      {envio.fase === "falhou" && (
        <p role="alert" className="text-xs text-danger">
          {envio.mensagem}
        </p>
      )}
      {envio.fase === "enviado" && envio.reenviado && (
        <p className="text-xs text-success">Link reenviado. Confira sua caixa de entrada.</p>
      )}
      {aviso && (
        <p role="alert" className="text-xs text-danger">
          {aviso}
        </p>
      )}

      <Button
        variant="ghost"
        onClick={reenviar}
        disabled={envio.fase === "enviando" || conferindo}
      >
        {envio.fase === "falhou" ? "Tentar enviar de novo" : "Reenviar o link"}
      </Button>
      <Button onClick={jaConfirmei} disabled={conferindo}>
        {conferindo ? "Conferindo…" : "Já confirmei"}
      </Button>
    </Card>
  );
}
