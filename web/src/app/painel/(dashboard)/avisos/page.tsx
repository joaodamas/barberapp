"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { useShopCollection } from "@/lib/db/use-collection";
import { useStaff } from "@/lib/db/use-shop-data";
import { mensagemDoErro } from "@/lib/direitos-do-titular";
import { useTenant } from "@/lib/tenant-context";
import {
  ativarNotificacao,
  desativarNotificacao,
  estadoDaNotificacao,
  type EstadoDaNotificacao,
} from "@/lib/notificacoes";

/**
 * Avisos no Telegram (01/10).
 *
 * O dono liga o Telegram dele e o de cada barbeiro. A partir daí chegam lá:
 * pedido de encaixe com botão de aprovar, cliente que cancelou, agendamento
 * novo pelo link, a agenda do dia às 7h e — só para o dono — o fechamento às
 * 21h. Grátis: é a API de bots do Telegram, sem custo por mensagem.
 *
 * O barbeiro não precisa de conta no Topete: o dono gera o convite em nome
 * dele e manda pelo WhatsApp. O convite vale 15 minutos e uma vez só.
 */

type Tipo = "encaixe" | "cancelamento" | "novo" | "agenda" | "fechamento";
type Contato = {
  chatId: string;
  alvo: "dono" | "barbeiro";
  staffId: string | null;
  nome: string;
  ativo: boolean;
  avisos?: Partial<Record<Tipo, boolean>>;
};
type Convite = { configurado: false } | { configurado: true; link: string; nome: string };

const ROTULOS: Record<Tipo, string> = {
  encaixe: "Pedido de encaixe",
  cancelamento: "Cliente cancelou",
  novo: "Novo agendamento",
  agenda: "Agenda do dia (7h)",
  fechamento: "Fechamento do dia (21h)",
};

export default function AvisosPage() {
  const tenant = useTenant();
  const { items: contatos, status } = useShopCollection<Contato>("telegramContatos");
  const { items: equipe } = useStaff();
  const barbeiros = useMemo(() => equipe.filter((s) => s.active !== false), [equipe]);

  const [convite, setConvite] = useState<(Convite & { para: string }) | null>(null);
  const [gerando, setGerando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  async function gerar(alvo: "dono" | "barbeiro", staffId?: string, rotulo = "você") {
    setGerando(staffId ?? "dono");
    setErro(null);
    setCopiado(false);
    try {
      const { callFunction } = await import("@/lib/firebase");
      const r = await callFunction<{ barbershopId: string; alvo: string; staffId?: string }, Convite>(
        "criarConviteTelegram",
        { barbershopId: tenant.id, alvo, staffId }
      );
      setConvite({ ...r, para: rotulo });
      if (r.configurado && alvo === "dono") window.open(r.link, "_blank");
    } catch (e) {
      setErro(mensagemDoErro(e));
    } finally {
      setGerando(null);
    }
  }

  async function chamar(nome: string, dados: Record<string, unknown>) {
    setErro(null);
    try {
      const { callFunction } = await import("@/lib/firebase");
      await callFunction(nome, { barbershopId: tenant.id, ...dados });
    } catch (e) {
      setErro(mensagemDoErro(e));
    }
  }

  const ativos = contatos.filter((c) => c.ativo);

  return (
    <div className="flex flex-col gap-6 pt-1 md:gap-8 md:pt-2">
      <header className="flex flex-col gap-1">
        <p className="text-sm text-ink-muted">Ajustes</p>
        <h1 className="font-display text-3xl text-ink md:text-4xl">Avisos</h1>
        <p className="max-w-2xl text-sm text-ink-muted">
          Saiba na hora quando chega pedido de encaixe, quando um cliente cancela ou marca pelo link — no
          celular ou no Telegram. Os dois são grátis.
        </p>
      </header>

      <NesteCelular barbershopId={tenant.id} />

      <Card className="flex flex-col gap-4 md:p-6">
        <div>
          <h2 className="text-sm font-semibold text-ink md:text-base">Telegram</h2>
          <p className="mt-1 text-xs text-ink-muted md:text-sm">
            O encaixe chega com botão de <b>Aprovar</b>, sem abrir o painel, e de manhã vem a agenda do dia. Abre o
            Telegram no bot do Topete — é só tocar em <b>Iniciar</b>. Para um barbeiro, gere o convite e mande para
            ele: o convite vale 15 minutos.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => gerar("dono")} disabled={!!gerando}>
            <Send size={16} /> {gerando === "dono" ? "Abrindo…" : "Conectar meu Telegram"}
          </Button>
          {barbeiros.map((b) => (
            <Button
              key={b.id}
              variant="secondary"
              disabled={!!gerando}
              onClick={() => gerar("barbeiro", b.id, b.name)}
            >
              {gerando === b.id ? "Gerando…" : `Convite para ${b.name}`}
            </Button>
          ))}
        </div>

        {convite && !convite.configurado && (
          <p role="status" className="text-sm text-ink-muted">
            O bot do Topete ainda está sendo configurado. Assim que ficar pronto, este botão funciona.
          </p>
        )}
        {convite?.configurado && (
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-raised p-3">
            <p className="text-sm text-ink">
              Convite para <b>{convite.para}</b> — vale 15 minutos:
            </p>
            <p className="break-all font-mono text-xs text-ink">{convite.link}</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => window.open(convite.link, "_blank")}>
                <Send size={14} /> Abrir no Telegram
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(convite.link);
                    setCopiado(true);
                  } catch {
                    setCopiado(false);
                  }
                }}
              >
                <Copy size={14} /> {copiado ? "Copiado" : "Copiar"}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  window.open(
                    `https://wa.me/?text=${encodeURIComponent(
                      `Toca aqui para receber os avisos da ${tenant.brand.name} no Telegram (encaixe, cancelamento e a agenda do dia): ${convite.link}`
                    )}`,
                    "_blank"
                  )
                }
              >
                Mandar pelo WhatsApp
              </Button>
            </div>
          </div>
        )}
        {erro && (
          <p role="alert" className="text-sm text-danger">
            {erro}
          </p>
        )}
      </Card>

      <Card className="flex flex-col gap-3 md:p-6">
        <h2 className="text-sm font-semibold text-ink md:text-base">Quem recebe no Telegram</h2>
        {status === "carregando" && <p className="text-sm text-ink-muted">Carregando…</p>}
        {status !== "carregando" && ativos.length === 0 && (
          <p className="text-sm text-ink-muted">Ninguém conectado ainda.</p>
        )}
        <ul className="flex flex-col divide-y divide-border/60">
          {ativos.map((c) => {
            const tipos = (Object.keys(ROTULOS) as Tipo[]).filter((t) => c.alvo === "dono" || t !== "fechamento");
            return (
              <li key={c.chatId} className="flex flex-col gap-2 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="flex items-center gap-2 text-sm text-ink">
                    {c.nome}
                    <Pill tone={c.alvo === "dono" ? "gold" : "neutral"}>
                      {c.alvo === "dono" ? "Tudo da barbearia" : "Só a cadeira dele"}
                    </Pill>
                  </p>
                  <Button variant="ghost" size="sm" onClick={() => chamar("desligarTelegram", { chatId: c.chatId })}>
                    Desconectar
                  </Button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {tipos.map((t) => {
                    const on = c.avisos?.[t] !== false;
                    return (
                      <button
                        key={t}
                        type="button"
                        aria-pressed={on}
                        onClick={() => chamar("ajustarAvisosTelegram", { chatId: c.chatId, avisos: { [t]: !on } })}
                        className={
                          "min-h-9 rounded-full border px-3 text-xs " +
                          (on ? "border-gold bg-gold/15 text-gold-strong" : "border-border text-ink-muted line-through")
                        }
                      >
                        {ROTULOS[t]}
                      </button>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}

/**
 * Notificação neste aparelho, pelo app instalado. Cada aparelho liga o seu:
 * o dono no celular dele, o barbeiro no dele.
 */
function NesteCelular({ barbershopId }: { barbershopId: string }) {
  const [estado, setEstado] = useState<EstadoDaNotificacao>("carregando");
  const [trabalhando, setTrabalhando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    estadoDaNotificacao(barbershopId)
      .then((e) => vivo && setEstado(e))
      .catch(() => vivo && setEstado("indisponivel"));
    return () => {
      vivo = false;
    };
  }, [barbershopId]);

  async function alternar() {
    setTrabalhando(true);
    setErro(null);
    try {
      setEstado(estado === "ligado" ? await desativarNotificacao(barbershopId) : await ativarNotificacao(barbershopId));
    } catch (e) {
      setErro(mensagemDoErro(e));
    } finally {
      setTrabalhando(false);
    }
  }

  return (
    <Card className="flex flex-col gap-3 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-ink md:text-base">Neste celular</h2>
        {estado === "ligado" && <Pill tone="success">Notificações ligadas</Pill>}
      </div>
      <p className="text-xs text-ink-muted md:text-sm">
        Encaixe, cancelamento e agendamento novo aparecem como notificação, igual a qualquer app. Tocar abre a agenda.
      </p>
      {estado === "precisa-tela-inicio" && (
        <p className="rounded-lg bg-surface-raised p-3 text-sm text-ink">
          No iPhone, a notificação só funciona com o app na tela de início: toque em <b>Compartilhar</b> →{" "}
          <b>Adicionar à Tela de Início</b>, abra pelo ícone e volte aqui.
        </p>
      )}
      {estado === "bloqueado" && (
        <p className="rounded-lg bg-surface-raised p-3 text-sm text-ink">
          As notificações estão bloqueadas para este site. Libere nas configurações do navegador (ícone de cadeado ao
          lado do endereço) e volte aqui.
        </p>
      )}
      {estado === "indisponivel" && (
        <p className="text-sm text-ink-muted">Este navegador não recebe notificações. Use o Telegram abaixo.</p>
      )}
      {(estado === "desligado" || estado === "ligado") && (
        <Button
          variant={estado === "ligado" ? "secondary" : "primary"}
          className="self-start"
          disabled={trabalhando}
          onClick={() => void alternar()}
        >
          {trabalhando ? "Um instante…" : estado === "ligado" ? "Desligar neste celular" : "Ativar notificações"}
        </Button>
      )}
      {erro && (
        <p role="alert" className="text-sm text-danger">
          {erro}
        </p>
      )}
    </Card>
  );
}
