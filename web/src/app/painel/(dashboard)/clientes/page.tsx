"use client";

import { useMemo, useState } from "react";
import { Search, Users } from "lucide-react";
import { Pill } from "@/components/ui/pill";
import { Modal } from "@/components/ui/modal";
import { EmptyState, LoadingRows } from "@/components/ui/empty-state";
import { ErroAoCarregar } from "@/components/ui/erro-ao-carregar";
import { formatBRL, formatDatePtBR, toISODate } from "@/lib/format";
import { contar } from "@/lib/plural";
import { mascararWhatsapp } from "@/lib/whatsapp-numero";
import { combinaComBusca } from "@/lib/clientes-busca";
import { listaDeClientes, type FichaDoCliente } from "@/lib/ficha-do-cliente";
import {
  useBookings,
  useClients,
  useInventoryMovements,
  useSubscribers,
} from "@/lib/db/use-shop-data";

/**
 * Clientes — D26.
 *
 * ## Por que esta tela existe
 *
 * G3 criou a entidade Cliente e ela só aparecia **dentro de modais**: buscar ao
 * marcar, ao vender, ao contratar mensalista. Não havia como o dono ver quem
 * são seus clientes, conferir um número ou saber quem não volta há dois meses.
 *
 * A arquitetura de navegação já listava Clientes como área de primeira classe.
 * Ela existia como dado e não como lugar.
 *
 * ## O que esta tela NÃO é
 *
 * Não é CRM. Sem segmentação, sem risco de perda calculado, sem campanha. O
 * blueprint coloca isso no Bloco 3; aqui é o mínimo: **ver quem é, achar de
 * novo, e abrir a ficha**.
 *
 * ## Tudo derivado
 *
 * Visitas, última visita, gasto e ticket saem dos fatos — `bookings`,
 * `inventory_movements`, `subscriptions`. Nada disso é gravado no cadastro, e
 * o blueprint §3.2 é explícito quanto a isso: materializar criaria a mesma
 * classe de defeito de `dueStage`, campo que envelhece e ninguém atualiza.
 */
export default function ClientesPage() {
  const { items: clientes, status } = useClients();
  const { items: bookings } = useBookings();
  const { items: movements } = useInventoryMovements();
  const { items: subscribers } = useSubscribers();

  const [busca, setBusca] = useState("");
  const [aberta, setAberta] = useState<FichaDoCliente | null>(null);

  const hoje = new Date();
  const hojeISO = toISODate(hoje);

  const fichas = useMemo(
    () => listaDeClientes({ clientes, bookings, movements, subscribers, hoje, hojeISO }),
    // `hoje` é novo a cada render; `hojeISO` é o que muda de verdade.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clientes, bookings, movements, subscribers, hojeISO]
  );

  const encontrados = useMemo(
    () => fichas.filter((f) => combinaComBusca(f.cliente, busca)),
    [fichas, busca]
  );

  return (
    <div className="flex flex-col gap-6 pt-1 md:gap-8 md:pt-2">
      <div>
        <p className="text-sm text-ivory-muted md:text-base">
          {contar(clientes.length, "cadastrado", "cadastrados")}
        </p>
        <h1 className="text-xl text-ivory md:text-4xl md:tracking-tight">Clientes</h1>
      </div>

      {status === "carregando" && <LoadingRows rows={4} oQue="seus clientes" />}
      {status === "erro" && <ErroAoCarregar oQue="seus clientes" />}

      {status === "pronto" && clientes.length === 0 && (
        <EmptyState
          icon={Users}
          title="Nenhum cliente cadastrado ainda"
          description="O cadastro nasce sozinho quando você marca um atendimento no balcão ou quando alguém agenda pelo app. Você não precisa cadastrar ninguém à mão."
          actionLabel="Marcar atendimento"
          actionHref="/painel"
        />
      )}

      {clientes.length > 0 && (
        <>
          <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3">
            <Search size={16} className="text-ivory-muted" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome ou WhatsApp"
              className="min-h-11 flex-1 bg-transparent text-sm text-ivory placeholder:text-ivory-muted"
            />
          </div>

          {busca && encontrados.length === 0 && (
            <p className="text-sm text-ivory-muted">
              Ninguém com esse nome ou número.
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            {encontrados.map((f) => (
              /* `Card` é um `div`; o clicável é o `button` dentro dele.
                 Um `div` com `onClick` não recebe foco pelo teclado e não
                 dispara com Enter — a lista inteira ficaria inacessível para
                 quem não usa mouse. */
              <button
                key={f.cliente.id}
                type="button"
                onClick={() => setAberta(f)}
                className="card-elevated card-interactive flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-3 text-left transition-colors hover:border-gold/60 md:p-4"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm text-ivory md:text-base">{f.cliente.name}</p>
                    {f.mensalista && (
                      <Pill tone="gold">{f.mensalista.planName}</Pill>
                    )}
                  </div>
                  <p className="truncate text-xs text-ivory-muted">
                    {f.cliente.whatsapp ? mascararWhatsapp(f.cliente.whatsapp) : "sem WhatsApp"}
                    {f.cliente.uid === null && " · balcão"}
                  </p>
                </div>

                <div className="shrink-0 text-right">
                  {/* A informação que faz o dono agir: há quanto tempo não vem.
                      "12 visitas" é vaidade; "há 47 dias" é decisão. */}
                  <p className="text-xs text-ivory-muted">
                    {f.diasSemVir === null
                      ? "nunca veio"
                      : f.diasSemVir === 0
                        ? "veio hoje"
                        : `há ${contar(f.diasSemVir, "dia", "dias")}`}
                  </p>
                  {f.visitas > 0 && (
                    <p className="text-[11px] text-ivory-muted">
                      {contar(f.visitas, "visita", "visitas")}
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {/* ---- A ficha ---- */}
      <Modal
        open={!!aberta}
        onClose={() => setAberta(null)}
        title={aberta?.cliente.name ?? ""}
        description={
          aberta?.cliente.whatsapp
            ? mascararWhatsapp(aberta.cliente.whatsapp)
            : "sem WhatsApp cadastrado"
        }
      >
        {aberta && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-2">
              <Dado rotulo="Visitas" valor={String(aberta.visitas)} />
              <Dado
                rotulo="Última visita"
                valor={aberta.ultimaVisita ? formatDatePtBR(aberta.ultimaVisita) : "—"}
              />
              <Dado rotulo="Ticket médio" valor={formatBRL(aberta.ticketMedio)} />
              <Dado rotulo="Em serviços" valor={formatBRL(aberta.gastoEmServicos)} />
            </div>

            {aberta.gastoEmProdutos > 0 && (
              <Dado rotulo="Em produtos" valor={formatBRL(aberta.gastoEmProdutos)} />
            )}

            {aberta.proximoAtendimento && (
              <div className="rounded-xl border border-gold/40 bg-gold/5 p-3">
                <p className="text-[11px] uppercase tracking-wide text-ivory-muted">
                  Próximo atendimento
                </p>
                <p className="text-sm text-ivory">
                  {formatDatePtBR(aberta.proximoAtendimento.date)} às{" "}
                  {aberta.proximoAtendimento.time}
                </p>
              </div>
            )}

            {aberta.mensalista && (
              <div className="rounded-xl border border-border bg-surface-raised p-3">
                <p className="text-[11px] uppercase tracking-wide text-ivory-muted">Mensalista</p>
                <p className="text-sm text-ivory">
                  {aberta.mensalista.planName} · {formatBRL(aberta.mensalista.price)}/mês
                </p>
              </div>
            )}

            {/* Diz o que ainda não existe, em vez de deixar a ficha parecer
                completa. É a mesma disciplina de D14: não sugerir capacidade. */}
            <p className="text-[11px] text-ivory-muted">
              O histórico completo de atendimentos e compras entra numa próxima
              versão desta ficha.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Dado({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <p className="text-[11px] uppercase tracking-wide text-ivory-muted">{rotulo}</p>
      <p className="font-display text-base font-semibold text-ivory">{valor}</p>
    </div>
  );
}
