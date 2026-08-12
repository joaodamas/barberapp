"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, Loader2, MailCheck, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { ROOT_DOMAIN } from "@/lib/tenant";
import { slugSugerido, validateSlug } from "@/lib/slug";

/**
 * Cadastro self-service de uma barbearia.
 *
 * `signUpBarbershop` e `checkSlugAvailability` existiam prontas e testadas
 * desde a fundação do multi-tenant, e NENHUMA tela as chamava: criar uma
 * barbearia exigia rodar a função no terminal. Era o que separava "consultoria
 * com login" de produto — cada cliente novo custava três intervenções manuais.
 *
 * O endereço é irreversível e vira o subdomínio do cliente, então ele é o
 * centro da tela: sugerido a partir do nome, validado enquanto se digita e
 * conferido no servidor antes de enviar.
 */
type Estado = "carregando" | "precisa-entrar" | "precisa-verificar" | "formulario" | "criando";

export default function CriarContaPage() {
  const { user, loading } = useAuth();

  const [nome, setNome] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTocado, setSlugTocado] = useState(false);
  const [ownerName, setOwnerName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [endereco, setEndereco] = useState("");

  const [checando, setChecando] = useState(false);
  /* A resposta guarda o slug que a originou, e a disponibilidade é DERIVADA
   * dele. Sem isso, trocar o endereço deixaria o "disponível" do anterior na
   * tela até a nova resposta chegar — e o dono enviaria confiando num sinal
   * que era de outro nome. */
  const [checagem, setChecagem] = useState<
    { slug: string; available: boolean; reason?: string } | null
  >(null);
  const [erro, setErro] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const [reenviado, setReenviado] = useState(false);

  const formato = validateSlug(slug);

  /* Enquanto o dono não mexeu no endereço, ele acompanha o nome. Depois de
   * tocado, para de mudar sozinho — senão o campo se reescreve embaixo dele. */
  function mudarNome(valor: string) {
    setNome(valor);
    if (!slugTocado) setSlug(slugSugerido(valor));
  }

  const alvo = slug.trim().toLowerCase();

  // Consulta o servidor com folga, para não disparar a cada tecla.
  const ultimaBusca = useRef("");
  useEffect(() => {
    if (!formato.available) return;
    const timer = setTimeout(async () => {
      if (ultimaBusca.current === alvo) return;
      ultimaBusca.current = alvo;
      setChecando(true);
      try {
        const { callFunction } = await import("@/lib/firebase");
        const r = await callFunction<{ slug: string }, { available: boolean; reason?: string }>(
          "checkSlugAvailability",
          { slug: alvo }
        );
        setChecagem({ slug: alvo, available: r.available, reason: r.reason });
      } catch (e) {
        // Falha de rede não é "indisponível": o servidor decide de novo no envio.
        console.error("[criar-conta] falha ao checar endereço", e);
      } finally {
        setChecando(false);
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [alvo, formato.available]);

  const respostaDesteSlug = checagem?.slug === alvo ? checagem : null;
  const disponivel = formato.available ? (respostaDesteSlug?.available ?? null) : null;
  const motivo = respostaDesteSlug?.reason ?? null;

  const estado: Estado = criando
    ? "criando"
    : loading
      ? "carregando"
      : !user
        ? "precisa-entrar"
        : !user.emailVerified
          ? "precisa-verificar"
          : "formulario";

  async function reenviarVerificacao() {
    if (!user) return;
    try {
      const { sendEmailVerification } = await import("firebase/auth");
      await sendEmailVerification(user);
      setReenviado(true);
    } catch (e) {
      console.error("[criar-conta] falha ao reenviar verificação", e);
      setErro("Não foi possível reenviar agora. Tente de novo em alguns minutos.");
    }
  }

  async function criar() {
    setErro(null);
    if (!nome.trim()) return setErro("Informe o nome da barbearia.");
    if (!formato.available) return setErro(formato.reason ?? "Endereço inválido.");
    if (disponivel === false) return setErro(motivo ?? "Esse endereço já está em uso.");

    setCriando(true);
    try {
      const { callFunction } = await import("@/lib/firebase");
      const r = await callFunction<
        Record<string, unknown>,
        { barbershopId: string; slug: string }
      >("signUpBarbershop", {
        slug: slug.trim().toLowerCase(),
        name: nome.trim(),
        ownerName: ownerName.trim() || undefined,
        whatsapp: whatsapp.replace(/\D/g, "") || undefined,
        address: endereco.trim() || undefined,
      });

      /* O claim `barbershops` acabou de ser gravado e o token em uso ainda não
       * o tem — a função revoga o refresh token justamente para forçar a
       * renovação. Recarregar no endereço novo entra já como dono; um
       * `router.push` levaria o token velho e cairia no app do cliente. */
      window.location.href = `https://${r.slug}.${ROOT_DOMAIN}/comecar`;
    } catch (e) {
      console.error("[criar-conta] falha ao criar", e);
      setErro(mensagemDeErro(e));
      setCriando(false);
    }
  }

  if (estado === "carregando") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <Loader2 className="h-8 w-8 animate-spin text-gold-light" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center bg-bg px-4 py-8 md:py-14">
      <div className="flex w-full max-w-lg flex-col gap-6">
        <header className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-2xl text-ivory md:text-3xl">Crie sua barbearia</h1>
          <p className="max-w-md text-sm text-ivory-muted">
            Sete dias para testar tudo, sem cartão. Em poucos minutos seus
            clientes já conseguem agendar pelo link.
          </p>
        </header>

        {estado === "precisa-entrar" && (
          <Card className="flex flex-col items-center gap-4 py-10 text-center">
            <p className="max-w-sm text-sm text-ivory">
              Primeiro entre com sua conta. É ela que vai ser a dona da
              barbearia.
            </p>
            <Link href="/login?next=/criar-conta">
              <Button>Entrar ou criar conta</Button>
            </Link>
          </Card>
        )}

        {estado === "precisa-verificar" && (
          <Card className="flex flex-col items-center gap-4 py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gold/10 text-gold-light">
              <MailCheck size={22} aria-hidden />
            </div>
            <div className="max-w-sm">
              <p className="text-sm font-medium text-ivory">Confirme seu e-mail</p>
              <p className="mt-1 text-xs text-ivory-muted">
                Enviamos um link para <strong>{user?.email}</strong>. O endereço da
                barbearia é definitivo, e a confirmação é o que impede alguém de
                registrar nomes em massa.
              </p>
            </div>
            {reenviado ? (
              <p className="text-xs text-success">Link reenviado. Confira sua caixa de entrada.</p>
            ) : (
              <Button variant="ghost" onClick={reenviarVerificacao}>
                Reenviar o link
              </Button>
            )}
            <Button onClick={() => window.location.reload()}>Já confirmei</Button>
          </Card>
        )}

        {(estado === "formulario" || estado === "criando") && (
          <Card className="flex flex-col gap-5 md:p-7">
            <Campo
              id="nome"
              label="Nome da barbearia"
              dica="Como ela é conhecida. Aparece no topo do app e nas mensagens."
              value={nome}
              onChange={mudarNome}
              placeholder="Barbearia do Zé"
              autoFocus
            />

            <div className="flex flex-col gap-1.5">
              <label htmlFor="slug" className="text-sm text-ivory">
                Endereço do seu app
              </label>
              <div className="flex items-center gap-1.5 rounded-xl border border-border bg-surface-raised px-3 py-2.5">
                <input
                  id="slug"
                  value={slug}
                  onChange={(e) => {
                    setSlugTocado(true);
                    setSlug(e.target.value.toLowerCase().replace(/\s+/g, "-"));
                  }}
                  placeholder="barbearia-do-ze"
                  aria-describedby="slug-ajuda"
                  className="min-w-0 flex-1 bg-transparent text-sm text-ivory outline-none"
                />
                <span className="shrink-0 text-xs text-ivory-muted">.{ROOT_DOMAIN}</span>
                {checando && <Loader2 size={14} className="shrink-0 animate-spin text-ivory-muted" />}
                {!checando && slug && formato.available && disponivel === true && (
                  <Check size={16} className="shrink-0 text-success" aria-label="Disponível" />
                )}
                {!checando && slug && (!formato.available || disponivel === false) && (
                  <X size={16} className="shrink-0 text-danger" aria-label="Indisponível" />
                )}
              </div>
              <p
                id="slug-ajuda"
                className={`text-xs ${
                  slug && (!formato.available || disponivel === false)
                    ? "text-danger"
                    : "text-ivory-muted"
                }`}
              >
                {slug && !formato.available
                  ? formato.reason
                  : disponivel === false
                    ? (motivo ?? "Esse endereço já está em uso.")
                    : disponivel === true
                      ? "Disponível. É por este link que seus clientes vão agendar."
                      : "É o link que você vai divulgar. Não dá para mudar depois."}
              </p>
            </div>

            <Campo
              id="ownerName"
              label="Seu nome"
              dica="Vira o primeiro barbeiro da agenda. Dá para mudar depois."
              value={ownerName}
              onChange={setOwnerName}
              placeholder="Zé"
            />

            <Campo
              id="whatsapp"
              label="WhatsApp (opcional)"
              dica="Como seus clientes falam com você."
              value={whatsapp}
              onChange={setWhatsapp}
              placeholder="(11) 99999-9999"
              inputMode="tel"
            />

            <Campo
              id="endereco"
              label="Endereço (opcional)"
              dica="Aparece na ficha da barbearia para o cliente."
              value={endereco}
              onChange={setEndereco}
              placeholder="Rua das Tesouras, 120 — Centro"
            />

            {erro && (
              <p role="alert" className="text-sm text-danger">
                {erro}
              </p>
            )}

            <Button
              onClick={criar}
              disabled={criando || checando || !nome.trim() || !formato.available || disponivel === false}
            >
              {criando ? <Loader2 size={16} className="animate-spin" /> : null}
              {criando ? "Criando sua barbearia…" : "Criar e começar o teste"}
            </Button>

            <p className="text-center text-xs text-ivory-muted">
              Sem cartão. Ao fim dos 7 dias você escolhe um plano — seus dados
              continuam aqui de qualquer forma.
            </p>
          </Card>
        )}

        <p className="text-center text-xs text-ivory-muted">
          Já tem uma barbearia por aqui?{" "}
          <Link href="/login" className="underline hover:text-ivory">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  );
}

function Campo({
  id, label, dica, value, onChange, placeholder, autoFocus, inputMode,
}: {
  id: string;
  label: string;
  dica: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  inputMode?: "tel" | "text";
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm text-ivory">
        {label}
      </label>
      <input
        id={id}
        value={value}
        inputMode={inputMode}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-describedby={`${id}-dica`}
        className="rounded-xl border border-border bg-surface-raised px-3 py-2.5 text-sm text-ivory"
      />
      <p id={`${id}-dica`} className="text-xs text-ivory-muted">
        {dica}
      </p>
    </div>
  );
}

/**
 * A função devolve `failed-precondition` e `already-exists` para situações bem
 * diferentes, e um "erro ao criar" genérico deixaria o dono sem saber se o
 * problema é dele, do endereço ou da conta.
 */
function mensagemDeErro(e: unknown): string {
  const bruto = e instanceof Error ? e.message : String(e);

  if (/Confirme seu e-mail/i.test(bruto)) {
    return "Confirme seu e-mail antes de criar a barbearia — o link está na sua caixa de entrada.";
  }
  if (/acabou de ser registrado/i.test(bruto)) {
    return "Alguém registrou esse endereço agora há pouco. Escolha outro.";
  }
  if (/já tem uma barbearia/i.test(bruto)) {
    return "Sua conta já tem uma barbearia. Fale com o suporte para abrir outra.";
  }
  if (/unauthenticated|Entre na sua conta/i.test(bruto)) {
    return "Sua sessão expirou. Entre de novo e refaça o cadastro.";
  }
  return "Não foi possível criar agora. Verifique a conexão e tente de novo.";
}
