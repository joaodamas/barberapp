"use client";

import { useState } from "react";
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
import { barbershop, bookingHistory, loyalty, nextBooking } from "@/lib/mock-data";

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
  const [openMenu, setOpenMenu] = useState<MenuKey | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saved, setSaved] = useState(false);

  const [notifications, setNotifications] = useState({
    confirmacao: true,
    lembrete: true,
    promocoes: false,
    fidelidade: true,
  });

  const totalVisits = bookingHistory.length + 1;
  const totalSpent =
    bookingHistory.reduce((s, b) => s + b.value, 0) + nextBooking.value;

  function saveProfile() {
    setSaved(true);
    setTimeout(() => {
      setSaved(false);
      setOpenMenu(null);
    }, 900);
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
                  Você ainda não é mensalista
                </p>
                <p className="text-xs text-ivory-muted md:text-sm">
                  Planos a partir de R$ 149/mês
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
              <Button onClick={saveProfile}>{saved ? "Salvo!" : "Salvar"}</Button>
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
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
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
          </div>
        )}

        {openMenu === "plano" && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-raised px-4 py-3">
              <Sparkles size={18} className="shrink-0 text-gold-light" />
              <div>
                <p className="text-sm text-ivory">Você ainda não é mensalista</p>
                <p className="text-xs text-ivory-muted">
                  Hoje você paga por atendimento avulso.
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
          <div className="flex flex-col gap-1">
            {(
              [
                ["confirmacao", "Confirmação de reserva", "Assim que o horário é marcado"],
                ["lembrete", "Lembrete do atendimento", "No dia, algumas horas antes"],
                ["fidelidade", "Fidelidade e recompensas", "Quando você ganha carimbos"],
                ["promocoes", "Promoções e novidades", "Ofertas pontuais da barbearia"],
              ] as const
            ).map(([key, label, hint]) => (
              <label
                key={key}
                className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-surface-raised"
              >
                <input
                  type="checkbox"
                  checked={notifications[key]}
                  onChange={(e) =>
                    setNotifications((n) => ({ ...n, [key]: e.target.checked }))
                  }
                  className="h-4 w-4 rounded border-border accent-gold"
                />
                <div className="flex-1">
                  <p className="text-sm text-ivory">{label}</p>
                  <p className="text-xs text-ivory-muted">{hint}</p>
                </div>
              </label>
            ))}
            <p className="mt-2 text-xs text-ivory-muted">
              As mensagens chegam no WhatsApp cadastrado na sua conta.
            </p>
          </div>
        )}

        {openMenu === "politica" && (
          <div className="flex flex-col gap-3 text-sm text-ivory-muted">
            <p>
              <strong className="text-ivory">Até 24h antes:</strong> cancelamento com 100%
              de devolução do valor pago.
            </p>
            <p>
              <strong className="text-ivory">Entre 24h e 6h antes:</strong> aplicamos a taxa
              de cancelamento e devolvemos metade do valor.
            </p>
            <p>
              <strong className="text-ivory">Menos de 6h antes:</strong> não há devolução —
              o horário dificilmente é reocupado em cima da hora.
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
