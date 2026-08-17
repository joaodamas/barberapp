"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Bell,
  ChevronRight,
  CircleHelp,
  FileText,
  Sparkles,
  User,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { SignOutButton } from "@/components/sign-out-button";
import { ProfileIdentity } from "@/components/profile-identity";
import { OwnerPanelLink } from "@/components/owner-panel-link";
import { useAuth } from "@/lib/auth-context";
import { formatBRL } from "@/lib/format";
import { useTenant, usePolicies } from "@/lib/tenant-context";
import { lerPerfil, mascararWhatsapp, salvarPerfil, whatsappValido } from "@/lib/db/perfil";
import { useLoyalty, useMyBookings } from "@/lib/db/use-shop-data";

type MenuKey = "dados" | "plano" | "notificacoes" | "politica" | "ajuda";

const menuItems: { key: MenuKey; icon: LucideIcon; label: string }[] = [
  { key: "dados", icon: User, label: "Meus dados" },
  { key: "plano", icon: Sparkles, label: "Meu plano" },
  { key: "notificacoes", icon: Bell, label: "Notificações" },
  { key: "politica", icon: FileText, label: "Política de cancelamento" },
  { key: "ajuda", icon: CircleHelp, label: "Ajuda" },
];

const MODAL_TITLE: Record<MenuKey, string> = {
  dados: "Meus dados",
  plano: "Meu plano",
  notificacoes: "Notificações",
  politica: "Política de cancelamento",
  ajuda: "Ajuda",
};

export default function PerfilPage() {
  const { user } = useAuth();
  const tenant = useTenant();
  const { items: minhas } = useMyBookings(user?.uid);
  const politica = usePolicies().cancellation;

  const bookingHistory = minhas.filter((b) => b.status === "completed");
  const loyalty = useLoyalty(user?.uid);
  const barbershop = {
    name: tenant.brand.name,
    address: tenant.contact.address,
    whatsapp: tenant.contact.whatsapp,
    instagram: tenant.contact.instagram ?? "",
  };
  const [openMenu, setOpenMenu] = useState<MenuKey | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saved, setSaved] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erroPerfil, setErroPerfil] = useState<string | null>(null);

  /* Carrega o que já está gravado, para o formulário mostrar o estado real em
   * vez de campos vazios que sugerem "nada cadastrado". */
  useEffect(() => {
    if (!user?.uid) return;
    let cancelado = false;
    lerPerfil(user.uid)
      .then((perfil) => {
        if (cancelado || !perfil) return;
        setName((atual) => atual || perfil.name);
        setPhone((atual) => atual || mascararWhatsapp(perfil.whatsapp));
      })
      .catch(() => undefined);
    return () => {
      cancelado = true;
    };
  }, [user?.uid]);

  /* Só atendimento concluído conta — a reserva futura (possivelmente "a pagar
   * no salão") era somada como visita realizada e dinheiro gasto. */
  const totalVisits = bookingHistory.length;
  const totalSpent = bookingHistory.reduce((s, b) => s + b.value, 0);

  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (savedTimer.current) clearTimeout(savedTimer.current);
  }, []);

  /**
   * Grava de verdade.
   *
   * Isto fazia `setSaved(true)` e fechava o modal com "Salvo!" — sem tocar em
   * banco nenhum. O cliente digitava nome e celular, lia a confirmação, e nada
   * era persistido. E o campo perdido era justamente o WhatsApp: o dado de que
   * o produto inteiro depende para confirmar horário, lembrar e avisar de
   * cancelamento.
   *
   * O selo "Salvo!" só aparece DEPOIS de a escrita voltar, e o erro aparece
   * onde a ação foi disparada — não no console.
   */
  async function saveProfile() {
    if (!user?.uid) return;

    if (phone.trim() && !whatsappValido(phone)) {
      setErroPerfil("Informe um WhatsApp válido com DDD, ou deixe em branco.");
      return;
    }

    setSalvando(true);
    setErroPerfil(null);
    try {
      await salvarPerfil(user.uid, { name, whatsapp: phone });
      setSaved(true);
      savedTimer.current = setTimeout(() => {
        setSaved(false);
        setOpenMenu(null);
      }, 900);
    } catch {
      setErroPerfil("Não foi possível salvar agora. Nada foi alterado — tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-5 pt-1 md:grid-cols-[1fr_360px] md:items-start md:gap-x-10 md:gap-y-8 md:pt-4">
      <div className="flex flex-col gap-5 md:col-start-1 md:row-start-1 md:gap-7">
        <ProfileIdentity />

        <Card className="flex flex-col divide-y divide-border p-0">
          {menuItems.map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              onClick={() => setOpenMenu(key)}
              className="flex items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface-raised md:px-6 md:py-4"
            >
              <Icon size={18} className="text-gold-light" />
              <span className="flex-1 text-sm text-ivory md:text-base">{label}</span>
              <ChevronRight size={16} className="text-ivory-muted" />
            </button>
          ))}
        </Card>

        <OwnerPanelLink className="md:hidden" />

        <SignOutButton className="self-start" />
      </div>

      <div className="hidden md:col-start-2 md:row-start-1 md:flex md:flex-col md:gap-6">
        <section aria-labelledby="resumo-cliente">
          <h2
            id="resumo-cliente"
            className="mb-2 text-xs font-semibold uppercase tracking-wider text-ivory-muted md:text-sm"
          >
            Seu histórico
          </h2>
          <Card className="grid grid-cols-2 gap-3 md:p-6">
            <div className="flex flex-col gap-0.5">
              <p className="font-display text-2xl font-semibold text-ivory">{totalVisits}</p>
              <p className="text-xs text-ivory-muted">atendimentos no total</p>
            </div>
            <div className="flex flex-col gap-0.5">
              <p className="font-display text-2xl font-semibold text-gold-light">
                {formatBRL(totalSpent)}
              </p>
              <p className="text-xs text-ivory-muted">investido na barbearia</p>
            </div>
          </Card>
        </section>

        <section aria-labelledby="meu-plano">
          <h2
            id="meu-plano"
            className="mb-2 text-xs font-semibold uppercase tracking-wider text-ivory-muted md:text-sm"
          >
            Meu plano
          </h2>
          <Card className="flex flex-col gap-3 border-gold/30 bg-gradient-to-br from-surface to-surface-raised md:p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold/15 text-gold-light">
                <Sparkles size={18} />
              </div>
              <div>
                <p className="text-sm font-medium text-ivory md:text-base">
                  Planos de mensalista
                </p>
                {/* O preço saiu daqui: era "a partir de R$ 149/mês" cravado no
                    código, e a barbearia com plano de R$ 89 — ou sem plano
                    nenhum — anunciava 149 ao cliente. Quem sabe o preço é a
                    tela de Planos, que lê o catálogo. */}
                <p className="text-xs text-ivory-muted md:text-sm">
                  Corte quantas vezes quiser por um valor fixo no mês.
                </p>
              </div>
            </div>
            <Link href="/planos">
              <Button variant="secondary" className="w-full">
                Ver planos
              </Button>
            </Link>
          </Card>
        </section>
      </div>

      <Modal
        open={openMenu !== null}
        onClose={() => setOpenMenu(null)}
        title={openMenu ? MODAL_TITLE[openMenu] : ""}
        className="max-w-md"
        footer={
          openMenu === "dados" ? (
            <>
              <Button variant="ghost" onClick={() => setOpenMenu(null)}>
                Cancelar
              </Button>
              <Button onClick={() => void saveProfile()} disabled={salvando}>
                {salvando ? "Salvando…" : saved ? "Salvo!" : "Salvar"}
              </Button>
            </>
          ) : openMenu === "plano" ? (
            <Link href="/planos">
              <Button>Ver planos</Button>
            </Link>
          ) : (
            <Button onClick={() => setOpenMenu(null)}>Fechar</Button>
          )
        }
      >
        {openMenu === "dados" && (
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-xs text-ivory-muted">
              Nome
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={user?.displayName ?? "Seu nome"}
                className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-ivory"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-ivory-muted">
              Celular com WhatsApp
              <input
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(mascararWhatsapp(e.target.value))}
                placeholder="(11) 99999-9999"
                className="rounded-lg border border-border bg-surface-raised px-3 py-2 text-sm text-ivory"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-ivory-muted">
              E-mail
              <input
                value={user?.email ?? ""}
                disabled
                className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ivory-muted"
              />
            </label>
            <p className="text-xs text-ivory-muted">
              O e-mail é o identificador da sua conta e não pode ser alterado por aqui.
            </p>
            {erroPerfil && (
              <p role="alert" className="text-xs text-danger">
                {erroPerfil}
              </p>
            )}
          </div>
        )}

        {openMenu === "plano" && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-raised px-4 py-3">
              <Sparkles size={18} className="shrink-0 text-gold-light" />
              <div>
                <p className="text-sm text-ivory">Planos de mensalista</p>
                <p className="text-xs text-ivory-muted">
                  Hoje você paga por atendimento avulso. A assinatura é
                  combinada direto com a barbearia.
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-1 rounded-xl border border-border px-4 py-3 text-sm">
              <div className="flex justify-between">
                <span className="text-ivory-muted">Você já investiu</span>
                <span className="text-ivory">{formatBRL(totalSpent)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ivory-muted">Em</span>
                <span className="text-ivory">{totalVisits} atendimentos</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ivory-muted">Fidelidade</span>
                <span className="text-ivory">
                  {loyalty.stamps}/{loyalty.goal} carimbos
                </span>
              </div>
            </div>
          </div>
        )}

        {openMenu === "notificacoes" && (
          /* As quatro chaves viviam num `useState` que nada gravava, sob a
             legenda "as mensagens chegam no WhatsApp cadastrado na sua conta"
             — e não havia WhatsApp cadastrado nem envio. Preferência que não
             persiste é pior que preferência ausente: a pessoa desliga
             "promoções", continua recebendo, e deixa de confiar no resto. */
          <div className="flex flex-col gap-3 text-sm text-ivory-muted">
            <p>
              Hoje a {barbershop.name} fala com você pelo WhatsApp que está no
              seu cadastro — confirmação do horário e avisos sobre o
              atendimento.
            </p>
            <p>
              Para não receber mais, é só pedir a ela na conversa. Quando as
              preferências entrarem aqui, elas aparecem nesta tela.
            </p>
          </div>
        )}

        {openMenu === "politica" && (
          <div className="flex flex-col gap-3 text-sm text-ivory-muted">
            <p>
              <strong className="text-ivory">
                Até {politica.fullRefundHours}h antes:
              </strong>{" "}
              cancelamento com 100% de devolução do valor pago.
            </p>
            <p>
              <strong className="text-ivory">
                Entre {politica.fullRefundHours}h e{" "}
                {politica.partialRefundHours}h antes:
              </strong>{" "}
              retemos {politica.cancellationFeePct}% de taxa de cancelamento e
              devolvemos o restante.
            </p>
            <p>
              <strong className="text-ivory">
                Menos de {politica.partialRefundHours}h antes:
              </strong>{" "}
              não há devolução — o horário dificilmente é reocupado em cima da hora.
            </p>
            <p>
              Reservas com pagamento no salão não têm valor a devolver, mas faltas repetidas
              passam a exigir pagamento antecipado nas próximas reservas.
            </p>
            <p>
              Se a barbearia precisar cancelar, você recebe 100% de volta e prioridade no
              reagendamento.
            </p>
          </div>
        )}

        {openMenu === "ajuda" && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-ivory-muted">
              Precisa resolver algo que o app não cobre? Fale direto com a barbearia.
            </p>
            <a
              href={`https://wa.me/${barbershop.whatsapp}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button className="w-full">Chamar no WhatsApp</Button>
            </a>
            <a href={`tel:+${barbershop.whatsapp}`}>
              <Button variant="secondary" className="w-full">
                Ligar para a barbearia
              </Button>
            </a>
            <div className="rounded-xl border border-border px-4 py-3 text-xs text-ivory-muted">
              <p className="text-ivory">{barbershop.name}</p>
              <p>{barbershop.address}</p>
              <p>{barbershop.instagram}</p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
