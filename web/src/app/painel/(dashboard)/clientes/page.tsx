"use client";

import { useMemo, useState } from "react";
import { Search, Users } from "lucide-react";
import { Pill } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Segmented } from "@/components/ui/segmented";
import { MarcarNoBalcao } from "@/components/marcar-no-balcao";
import { FidelidadeNaFicha } from "@/components/fidelidade-na-ficha";
import { EmptyState, LoadingRows } from "@/components/ui/empty-state";
import { ErroAoCarregar } from "@/components/ui/erro-ao-carregar";
import { formatBRL, formatDatePtBR, toISODate } from "@/lib/format";
import { contar } from "@/lib/plural";
import { mascararWhatsapp, normalizarWhatsapp } from "@/lib/whatsapp-numero";
import {
  filtrarFichas,
  ROTULO_DO_FILTRO,
  type FiltroDeClientes,
} from "@/lib/filtro-de-clientes";
import { combinaComBusca } from "@/lib/clientes-busca";
import {
  listaDeClientes,
  paresDeMesmoNumero,
  type FichaDoCliente,
  type ParDeMesmoNumero,
} from "@/lib/ficha-do-cliente";
import { useTenant } from "@/lib/tenant-context";
import { DireitosDoTitular } from "@/components/direitos-do-titular";
import {
  combineStatus,
  useBookings,
  useClients,
  useInventoryMovements,
  useRefunds,
  useSubscribers,
} from "@/lib/db/use-shop-data";
import { mensagemDaFuncao } from "@/lib/mensagem-da-funcao";

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
  const lidoClientes = useClients();
  const lidoBookings = useBookings();
  const lidoMovements = useInventoryMovements();
  const lidoSubscribers = useSubscribers();
  /* Devoluções abatem o gasto da ficha (08/10). */
  const lidoRefunds = useRefunds();
  const { items: clientes } = lidoClientes;
  const { items: bookings } = lidoBookings;
  const { items: movements } = lidoMovements;
  const { items: subscribers } = lidoSubscribers;
  const { items: refunds } = lidoRefunds;
  /* "Há 47 dias", visitas e gasto saem das CINCO leituras juntas. Só a lista
   * era conferida: com os atendimentos falhando, todo cliente aparecia como
   * "nunca veio" — o dono lia isso como "ninguém voltou". */
  const status = combineStatus(lidoClientes, lidoBookings, lidoMovements, lidoSubscribers, lidoRefunds);
  const error = [lidoClientes, lidoBookings, lidoMovements, lidoSubscribers, lidoRefunds].find(
    (l) => l.status === "erro"
  )?.error;

  const tenant = useTenant();
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<FiltroDeClientes>("todos");
  /* "Marcar horário" da ficha: abre o balcão já com este cliente. */
  const [marcandoPara, setMarcandoPara] = useState<FichaDoCliente | null>(null);
  const [aberta, setAberta] = useState<FichaDoCliente | null>(null);
  const [vinculando, setVinculando] = useState<ParDeMesmoNumero | null>(null);
  const [salvandoVinculo, setSalvandoVinculo] = useState(false);
  const [erroDoVinculo, setErroDoVinculo] = useState<string | null>(null);

  const hoje = new Date();
  const hojeISO = toISODate(hoje);

  const fichas = useMemo(
    () => listaDeClientes({ clientes, bookings, movements, subscribers, refunds, hoje, hojeISO }),
    // `hoje` é novo a cada render; `hojeISO` é o que muda de verdade.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clientes, bookings, movements, subscribers, refunds, hojeISO]
  );

  const encontrados = useMemo(
    () => filtrarFichas(fichas, filtro).filter((f) => combinaComBusca(f.cliente, busca)),
    [fichas, filtro, busca]
  );

  /* Conta do app e balcão com o mesmo número (02/10): os dois aparecem, mas
   * nunca sem aviso — e o dono junta com um toque. */
  const pares = useMemo(() => paresDeMesmoNumero(clientes), [clientes]);
  const parPorCadastro = useMemo(() => {
    const m = new Map<string, { par: ParDeMesmoNumero; outro: string }>();
    for (const par of pares) {
      m.set(par.conta.id, { par, outro: `${par.balcao.name} (cadastro do balcão)` });
      m.set(par.balcao.id, { par, outro: `${par.conta.name} (conta do app)` });
    }
    return m;
  }, [pares]);
  const visitasDe = (id: string) => fichas.find((f) => f.cliente.id === id)?.visitas ?? 0;

  async function vincular() {
    if (!vinculando) return;
    setSalvandoVinculo(true);
    setErroDoVinculo(null);
    try {
      const { callFunction } = await import("@/lib/firebase");
      await callFunction("vincularCadastroDeBalcao", {
        barbershopId: tenant.id,
        deClientId: vinculando.balcao.id,
        paraClientId: vinculando.conta.id,
      });
      setVinculando(null);
    } catch (err) {
      setErroDoVinculo(mensagemDaFuncao(err, "Não foi possível vincular agora."));
    } finally {
      setSalvandoVinculo(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 pt-1 md:gap-8 md:pt-2">
      <div>
        <p className="text-sm text-ink-muted md:text-base">
          {status === "pronto" ? contar(clientes.length, "cadastrado", "cadastrados") : "\u00a0"}
        </p>
        <h1 className="text-[22px] font-semibold leading-[1.15] tracking-[-0.02em] text-ink md:text-[28px]">Clientes</h1>
      </div>

      {status === "carregando" && <LoadingRows rows={4} oQue="seus clientes" />}
      {status === "erro" && <ErroAoCarregar oQue="seus clientes" erro={error} />}

      {status === "pronto" && clientes.length === 0 && (
        <EmptyState
          icon={Users}
          title="Nenhum cliente cadastrado ainda"
          description="O cadastro nasce sozinho quando você marca um atendimento no balcão ou quando alguém agenda pelo app. Você não precisa cadastrar ninguém à mão."
          actionLabel="Marcar atendimento"
          actionHref="/painel"
        />
      )}

      {status === "pronto" && clientes.length > 0 && (
        <>
          <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3">
            <Search size={16} className="text-ink-muted" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome ou WhatsApp"
              aria-label="Buscar cliente por nome ou WhatsApp"
              className="min-h-11 flex-1 bg-transparent text-sm text-ink placeholder:text-ink-muted"
            />
          </div>

          <Segmented
            label="Filtrar clientes"
            value={filtro}
            onChange={setFiltro}
            options={(Object.keys(ROTULO_DO_FILTRO) as FiltroDeClientes[]).map((v) => ({
              value: v,
              label: ROTULO_DO_FILTRO[v],
            }))}
          />

          {pares.length > 0 && (
            <div className="rounded-2xl border border-gold/40 bg-gold/5 p-3 text-sm text-ink md:p-4">
              <p className="font-medium">
                {contar(pares.length, "cliente está", "clientes estão")} com dois cadastros
              </p>
              <p className="mt-0.5 text-xs text-ink-muted">
                A conta do app e o cadastro do balcão têm o mesmo número. Confira e vincule: o
                histórico, os carimbos e o plano passam para a conta, e o cliente vê tudo no app.
              </p>
            </div>
          )}

          {(busca || filtro !== "todos") && encontrados.length === 0 && (
            <p className="text-sm text-ink-muted">
              {busca
                ? "Ninguém com esse nome ou número neste filtro."
                : filtro === "sumidos"
                  ? "Ninguém sumido há 30 dias ou mais."
                  : "Nenhum mensalista ativo."}
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            {encontrados.map((f) => (
              <div key={f.cliente.id} className="flex flex-col">
              {/* `Card` é um `div`; o clicável é o `button` dentro dele.
                 Um `div` com `onClick` não recebe foco pelo teclado e não
                 dispara com Enter — a lista inteira ficaria inacessível para
                 quem não usa mouse. */}
              <button
                type="button"
                onClick={() => setAberta(f)}
                className="card-elevated card-interactive flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-3 text-left transition-colors hover:border-gold/60 md:p-4"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm text-ink md:text-base">{f.cliente.name}</p>
                    {f.mensalista && (
                      <Pill tone="gold">{f.mensalista.planName}</Pill>
                    )}
                  </div>
                  <p className="truncate text-xs text-ink-muted">
                    {f.cliente.whatsapp ? mascararWhatsapp(f.cliente.whatsapp) : "sem WhatsApp"}
                    {f.cliente.uid === null && " · balcão"}
                  </p>
                </div>

                <div className="shrink-0 text-right">
                  {/* A informação que faz o dono agir: há quanto tempo não vem.
                      "12 visitas" é vaidade; "há 47 dias" é decisão. */}
                  <p className="text-xs text-ink-muted">
                    {f.diasSemVir === null
                      ? "nunca veio"
                      : f.diasSemVir === 0
                        ? "veio hoje"
                        : `há ${contar(f.diasSemVir, "dia", "dias")}`}
                  </p>
                  {f.visitas > 0 && (
                    <p className="text-[11px] text-ink-muted">
                      {contar(f.visitas, "visita", "visitas")}
                    </p>
                  )}
                </div>
              </button>
              {parPorCadastro.has(f.cliente.id) && (
                <div className="mx-3 flex items-center justify-between gap-2 rounded-b-xl border border-t-0 border-gold/40 bg-gold/5 px-3 py-2 text-xs text-ink">
                  <span className="min-w-0 truncate">
                    Mesmo número de {parPorCadastro.get(f.cliente.id)!.outro}
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="shrink-0"
                    onClick={() => {
                      setVinculando(parPorCadastro.get(f.cliente.id)!.par);
                      setErroDoVinculo(null);
                    }}
                  >
                    Vincular
                  </Button>
                </div>
              )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* ---- Vincular balcão à conta (02/10) ---- */}
      <Modal
        open={!!vinculando}
        onClose={() => setVinculando(null)}
        title="Vincular os dois cadastros?"
        description="Confira se é a mesma pessoa"
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setVinculando(null)} className="flex-1">
              Cancelar
            </Button>
            <Button onClick={vincular} disabled={salvandoVinculo} className="flex-1">
              {salvandoVinculo ? "Vinculando…" : "Vincular"}
            </Button>
          </div>
        }
      >
        {vinculando && (
          <div className="flex flex-col gap-3 text-sm">
            {[
              { rotulo: "Conta do app", c: vinculando.conta },
              { rotulo: "Cadastro do balcão", c: vinculando.balcao },
            ].map(({ rotulo, c }) => (
              <div key={c.id} className="rounded-xl border border-border bg-surface-raised p-3">
                <p className="text-[12.5px] font-medium text-ink-muted">{rotulo}</p>
                <p className="text-ink">{c.name}</p>
                <p className="text-xs text-ink-muted">
                  {c.whatsapp ? mascararWhatsapp(c.whatsapp) : "sem WhatsApp"} ·{" "}
                  {contar(visitasDe(c.id), "visita", "visitas")}
                </p>
              </div>
            ))}
            <p className="text-xs text-ink-muted">
              Os atendimentos, carimbos, plano de mensalista e pagamentos do balcão passam para a
              conta. O cadastro do balcão sai da lista. Não dá para desfazer pela tela.
            </p>
            {erroDoVinculo && (
              <p role="alert" className="text-xs text-danger">
                {erroDoVinculo}
              </p>
            )}
          </div>
        )}
      </Modal>

      {marcandoPara && (
        <MarcarNoBalcao
          open
          clienteInicial={marcandoPara.cliente}
          onClose={() => setMarcandoPara(null)}
        />
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
            {/* Ações da ficha: falar com o cliente e marcar o próximo horário.
                Sem WhatsApp no cadastro não há botão — e a ficha diz isso. */}
            <div className="flex gap-2">
              {normalizarWhatsapp(aberta.cliente.whatsapp) ? (
                <a
                  href={`https://wa.me/${normalizarWhatsapp(aberta.cliente.whatsapp)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1"
                >
                  <Button variant="secondary" className="w-full">
                    WhatsApp
                  </Button>
                </a>
              ) : (
                <p className="flex-1 self-center text-xs text-ink-muted">
                  Sem WhatsApp no cadastro: não dá para chamar por aqui.
                </p>
              )}
              <Button
                className="flex-1"
                onClick={() => {
                  const ficha = aberta;
                  setAberta(null);
                  setMarcandoPara(ficha);
                }}
              >
                Marcar horário
              </Button>
            </div>

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
                <p className="text-[12.5px] font-medium text-ink-muted">
                  Próximo atendimento
                </p>
                <p className="text-sm text-ink">
                  {formatDatePtBR(aberta.proximoAtendimento.date)} às{" "}
                  {aberta.proximoAtendimento.time}
                </p>
              </div>
            )}

            <FidelidadeNaFicha clientId={aberta.cliente.id} />

            {aberta.mensalista && (
              <div className="rounded-xl border border-border bg-surface-raised p-3">
                <p className="text-[12.5px] font-medium text-ink-muted">Mensalista</p>
                <p className="text-sm text-ink">
                  {aberta.mensalista.planName} · {formatBRL(aberta.mensalista.price)}/mês
                </p>
              </div>
            )}

            {/* Diz o que ainda não existe, em vez de deixar a ficha parecer
                completa. É a mesma disciplina de D14: não sugerir capacidade. */}
            <p className="text-[11px] text-ink-muted">
              O histórico completo de atendimentos e compras entra numa próxima
              versão desta ficha.
            </p>

            {/* `key` pelo cliente: a confirmação digitada para um não pode
                sobreviver à troca de ficha e valer para outro. */}
            <DireitosDoTitular key={aberta.cliente.id} clientId={aberta.cliente.id} />
          </div>
        )}
      </Modal>
    </div>
  );
}

function Dado({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
                <p className="text-[12.5px] font-medium text-ink-muted">{rotulo}</p>
      <p className="font-display text-base font-semibold text-ink">{valor}</p>
    </div>
  );
}
