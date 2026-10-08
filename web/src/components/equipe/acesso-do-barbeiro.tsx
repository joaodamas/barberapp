"use client";

import { useState } from "react";
import { Copy, KeyRound, Mail, MessageCircle, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Pill } from "@/components/ui/pill";
import { useAuth } from "@/lib/auth-context";
import { useTenant } from "@/lib/tenant-context";
import {
  linkDoConvite,
  linkDoEmail,
  linkDoWhatsApp,
  textoDoConvite,
  whatsappParaConvite,
} from "@/lib/convite-equipe";
import { mensagemDaFuncao } from "@/lib/mensagem-da-funcao";
import type { Doc } from "@/lib/db/repository";
import type { StaffDoc } from "@/lib/domain";

/**
 * O acesso do barbeiro ao sistema, na tela de Equipe (05/10).
 *
 * Três estados, cada um com a ação que cabe:
 * - sem acesso → "Dar acesso" (link pelo WhatsApp ou e-mail);
 * - convite enviado → reenviar ou cancelar;
 * - tem acesso → tirar acesso (a cadeira do próprio dono não tem o botão).
 *
 * A ativação é automática: o barbeiro abre o link, entra ou cria a conta, e já
 * cai no painel dele. O dono não precisa fazer mais nada.
 */
export function AcessoDoBarbeiro({ barbeiro }: { barbeiro: Doc<StaffDoc> }) {
  const tenant = useTenant();
  const { user } = useAuth();
  const [aberto, setAberto] = useState(false);
  const [tirando, setTirando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const ehODono = !!barbeiro.uid && barbeiro.uid === user?.uid;
  /* Relógio fixado na montagem: convite que vence com a tela aberta continua
   * "enviado" até recarregar, e o aceite recusa do mesmo jeito no servidor. */
  const [agoraMs] = useState(() => Date.now());
  const pendente =
    barbeiro.convitePendente && barbeiro.convitePendente.expiraEmMs > agoraMs ? barbeiro.convitePendente : null;

  async function cancelarConvite() {
    setOcupado(true);
    setErro(null);
    try {
      const { callFunction } = await import("@/lib/firebase");
      await callFunction("cancelarConviteDeBarbeiro", { barbershopId: tenant.id, staffId: barbeiro.id });
    } catch (e) {
      setErro(mensagemDaFuncao(e, "Não foi possível cancelar agora. Tente de novo."));
    } finally {
      setOcupado(false);
    }
  }

  async function tirarAcesso() {
    setOcupado(true);
    setErro(null);
    try {
      const { callFunction } = await import("@/lib/firebase");
      await callFunction("revogarAcessoDoBarbeiro", { barbershopId: tenant.id, staffId: barbeiro.id });
      setTirando(false);
    } catch (e) {
      setErro(mensagemDaFuncao(e, "Não foi possível tirar o acesso agora. Tente de novo."));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border/60 pt-3">
      <div className="flex flex-wrap items-center gap-2">
        {barbeiro.uid ? (
          <>
            <Pill tone="success">Tem acesso ao sistema</Pill>
            {ehODono ? (
              <span className="text-xs text-ink-muted">É a sua cadeira.</span>
            ) : (
              <Button variant="ghost" className="min-h-9 px-2 text-xs" onClick={() => setTirando(true)}>
                <UserX size={14} /> Tirar acesso
              </Button>
            )}
          </>
        ) : pendente ? (
          <>
            <Pill tone="gold">Convite enviado</Pill>
            <span className="text-xs text-ink-muted">
              vale até {new Date(pendente.expiraEmMs).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
            </span>
            <Button variant="secondary" className="min-h-9 px-3 text-xs" onClick={() => setAberto(true)}>
              Reenviar
            </Button>
            <Button variant="ghost" className="min-h-9 px-2 text-xs" disabled={ocupado} onClick={cancelarConvite}>
              Cancelar convite
            </Button>
          </>
        ) : (
          <>
            <span className="text-xs text-ink-muted">
              Sem acesso — ele aparece na agenda, mas não entra no sistema.
            </span>
            <Button
              variant="secondary"
              className="min-h-9 px-3 text-xs"
              disabled={!barbeiro.name?.trim()}
              title={!barbeiro.name?.trim() ? "Dê um nome ao barbeiro antes" : undefined}
              onClick={() => setAberto(true)}
            >
              <KeyRound size={14} /> Dar acesso
            </Button>
          </>
        )}
      </div>
      {erro && (
        <p role="alert" className="text-xs text-danger">
          {erro}
        </p>
      )}

      {aberto && <ConviteModal barbeiro={barbeiro} onClose={() => setAberto(false)} />}

      <Modal
        open={tirando}
        onClose={() => setTirando(false)}
        title={`Tirar o acesso de ${barbeiro.name || "barbeiro"}?`}
        description="Ele sai do sistema na hora. Continua na agenda e nos relatórios; os atendimentos e a comissão dele não mudam."
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setTirando(false)}>
              Voltar
            </Button>
            <Button variant="danger" className="flex-1" disabled={ocupado} onClick={tirarAcesso}>
              {ocupado ? "Tirando…" : "Tirar acesso"}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-ink-muted">Para dar acesso de novo, é só mandar outro convite.</p>
      </Modal>
    </div>
  );
}

function ConviteModal({ barbeiro, onClose }: { barbeiro: Doc<StaffDoc>; onClose: () => void }) {
  const tenant = useTenant();
  const [whatsapp, setWhatsapp] = useState("");
  const [email, setEmail] = useState("");
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  const numero = whatsappParaConvite(whatsapp);
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  /* Cada envio gera um link NOVO (o anterior deixa de valer): convite por
   * e-mail fica preso àquele e-mail, e o do WhatsApp serve a quem abrir. */
  async function gerar(porEmail: boolean): Promise<string | null> {
    setGerando(true);
    setErro(null);
    try {
      const { callFunction } = await import("@/lib/firebase");
      const r = await callFunction<
        { barbershopId: string; staffId: string; email: string | null },
        { token: string; expiraEmMs: number }
      >("criarConviteDeBarbeiro", {
        barbershopId: tenant.id,
        staffId: barbeiro.id,
        email: porEmail ? email.trim() : null,
      });
      const l = linkDoConvite(window.location.origin, r.token);
      setLink(l);
      return l;
    } catch (e) {
      setErro(mensagemDaFuncao(e, "Não foi possível gerar o convite agora. Tente de novo."));
      return null;
    } finally {
      setGerando(false);
    }
  }

  async function enviarWhatsApp() {
    if (!numero) return;
    const l = await gerar(false);
    if (!l) return;
    window.open(
      linkDoWhatsApp(numero, textoDoConvite({ barbearia: tenant.brand.name, barbeiro: barbeiro.name, link: l })),
      "_blank",
      "noopener,noreferrer"
    );
  }

  async function enviarEmail() {
    if (!emailOk) return;
    const l = await gerar(true);
    if (!l) return;
    window.location.href = linkDoEmail(
      email.trim(),
      tenant.brand.name,
      textoDoConvite({ barbearia: tenant.brand.name, barbeiro: barbeiro.name, link: l })
    );
  }

  async function copiar() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Dar acesso a ${barbeiro.name}`}
      description="Ele recebe um link, entra com a conta dele e já vê a própria agenda. O link vale 7 dias e só uma vez."
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <label htmlFor="convite-whatsapp" className="text-xs font-medium text-ink-muted">
            Pelo WhatsApp dele
          </label>
          <div className="flex gap-2">
            <input
              id="convite-whatsapp"
              inputMode="tel"
              placeholder="(11) 98888-7777"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              className="min-h-11 flex-1 rounded-xl border border-border bg-surface px-3 text-sm text-ink"
            />
            <Button disabled={!numero || gerando} onClick={enviarWhatsApp}>
              <MessageCircle size={16} /> Enviar
            </Button>
          </div>
          <p className="text-[11px] text-ink-muted">O número não fica salvo; é só para abrir a conversa.</p>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="convite-email" className="text-xs font-medium text-ink-muted">
            Ou pelo e-mail dele
          </label>
          <div className="flex gap-2">
            <input
              id="convite-email"
              type="email"
              placeholder="barbeiro@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="min-h-11 flex-1 rounded-xl border border-border bg-surface px-3 text-sm text-ink"
            />
            <Button variant="secondary" disabled={!emailOk || gerando} onClick={enviarEmail}>
              <Mail size={16} /> Enviar
            </Button>
          </div>
          <p className="text-[11px] text-ink-muted">
            Abre o seu e-mail com a mensagem pronta. Ele precisa entrar com este mesmo e-mail (ou com o Google dele).
          </p>
        </div>

        {link && (
          <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface-raised p-3">
            <p className="text-xs text-ink-muted">Link gerado — se preferir, copie e mande por onde quiser:</p>
            <p className="break-all text-xs text-ink">{link}</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" className="min-h-9 px-3 text-xs" onClick={copiar}>
                <Copy size={14} /> {copiado ? "Copiado" : "Copiar link"}
              </Button>
              {/* O navegador pode barrar a janela aberta depois da espera do
                  servidor; o link direto sempre funciona. */}
              {numero && (
                <a
                  href={linkDoWhatsApp(numero, textoDoConvite({ barbearia: tenant.brand.name, barbeiro: barbeiro.name, link }))}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-9 items-center gap-1 rounded-xl px-3 text-xs text-gold-strong underline-offset-2 hover:underline"
                >
                  <MessageCircle size={14} /> Abrir no WhatsApp
                </a>
              )}
            </div>
          </div>
        )}

        {erro && (
          <p role="alert" className="text-xs text-danger">
            {erro}
          </p>
        )}
      </div>
    </Modal>
  );
}
