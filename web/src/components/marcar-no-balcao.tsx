"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Search, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Pill } from "@/components/ui/pill";
import { formatBRL, formatDatePtBR, toISODate } from "@/lib/format";
import { useTenant } from "@/lib/tenant-context";
import { useClients, useServices, useStaff } from "@/lib/db/use-shop-data";
import { bookableDays, firstBookableIndex } from "@/lib/slots";
import { normalizarWhatsapp, whatsappValido, mascararWhatsapp } from "@/lib/whatsapp-numero";
import { filtrarClientes } from "@/lib/clientes-busca";
import type { Doc } from "@/lib/db/repository";
import type { ClientDoc } from "@/lib/domain";

/**
 * D13 — o dono marca um atendimento para quem chegou no balcão ou ligou.
 *
 * O produto tinha um caminho só de criação de reserva: o app do cliente
 * autenticado. Nenhuma das telas do painel agendava. Para uma barbearia isso
 * significa que a maior parte dos horários — os que chegam por telefone e pela
 * porta — não existia no sistema.
 *
 * ## A ordem, e por que é essa
 *
 * `serviço → barbeiro → quando → para quem → resumo → confirmar`
 *
 * Serviço primeiro porque ele determina os outros dois: quem pode atender
 * (nem todo barbeiro faz tudo) e quanto tempo ocupa — sem a duração não há como
 * saber quais horários cabem. Perguntar o horário antes obrigaria a recalcular
 * a lista e apagar a escolha do dono na frente dele.
 *
 * O cliente fica por último de propósito: é o passo com digitação, e digitar
 * nome e telefone para depois descobrir que não há vaga é o pior desperdício do
 * balcão, com a pessoa esperando em pé.
 *
 * Tudo numa tela só, sem wizard. O dono precisa poder trocar o serviço depois de
 * ver os horários sem recomeçar — e um passo por vez esconderia justamente a
 * informação que faz mudar de ideia.
 *
 * ## O que este fluxo NÃO faz
 *
 * **Não recebe pagamento.** Termina em reserva confirmada; o pagamento acontece
 * na conclusão do atendimento, como em qualquer outra reserva. Pagamento
 * antecipado saiu do produto em 17/08, e trazê-lo de volta aqui de carona seria
 * reintroduzir pela porta lateral o que D14 tirou da frente.
 */

export function MarcarNoBalcao({
  open,
  onClose,
  aoMarcar,
}: {
  open: boolean;
  onClose: () => void;
  aoMarcar?: (r: { bookingId: string; clientId: string }) => void;
}) {
  const tenant = useTenant();
  const { items: servicos } = useServices();
  const { items: equipe } = useStaff();
  const { items: clientes } = useClients();

  const dias = useMemo(() => bookableDays(new Date(), tenant.schedule), [tenant.schedule]);
  const [diaIndex, setDiaIndex] = useState(() => firstBookableIndex(dias));
  const [hora, setHora] = useState<string | null>(null);

  const [busca, setBusca] = useState("");
  const [clienteEscolhido, setClienteEscolhido] = useState<Doc<ClientDoc> | null>(null);
  const [nomeNovo, setNomeNovo] = useState("");
  const [whatsappNovo, setWhatsappNovo] = useState("");
  const [criandoNovo, setCriandoNovo] = useState(false);

  const [servicosEscolhidos, setServicosEscolhidos] = useState<string[]>([]);
  const [barbeiroClicado, setBarbeiroClicado] = useState<string | null>(null);

  const [resposta, setResposta] = useState<{ chave: string; slots: string[] } | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);

  const dia = dias[diaIndex];
  const ativos = useMemo(() => equipe.filter((b) => b.active !== false), [equipe]);
  const catalogo = useMemo(() => servicos.filter((s) => s.active !== false), [servicos]);

  const escolhidos = useMemo(
    () => catalogo.filter((s) => servicosEscolhidos.includes(s.id)),
    [catalogo, servicosEscolhidos]
  );
  const valorTotal = escolhidos.reduce((s, x) => s + (x.price ?? 0), 0);
  const duracaoTotal = escolhidos.reduce((s, x) => s + (x.durationMin ?? 0), 0);

  /* Só quem FAZ o serviço escolhido aparece.
   *
   * Lista vazia em `serviceIds` significa "faz tudo", e não "não faz nada" — a
   * mesma leitura do servidor. Duas interpretações diferentes para o mesmo campo
   * fariam a tela oferecer alguém que a function recusa. */
  const barbeirosQueFazem = useMemo(
    () =>
      ativos.filter((b) => {
        const lista = b.serviceIds ?? [];
        if (lista.length === 0) return true;
        return servicosEscolhidos.every((id) => lista.includes(id));
      }),
    [ativos, servicosEscolhidos]
  );

  /* O barbeiro válido é DERIVADO, não sincronizado.
   *
   * Trocar o serviço pode tirar da lista quem já estava selecionado. Corrigir
   * isso com um `useEffect` que zera o estado renderiza uma vez com o barbeiro
   * inválido antes de limpar — e nessa passagem o resumo mostra alguém que a
   * function vai recusar. Derivar não tem esse intervalo: se ele não faz o
   * serviço, ele nunca esteve escolhido. */
  const barbeiroId = barbeirosQueFazem.some((b) => b.id === barbeiroClicado)
    ? barbeiroClicado
    : null;

  /* ---- Horários livres, do SERVIDOR ----
   *
   * Mesma fonte que o app do cliente usa. A tela do painel poderia calcular
   * sozinha, porque o dono lê a agenda inteira — e seria uma segunda fonte para
   * a mesma pergunta, exatamente o padrão que esta auditoria mais encontrou. */
  const duracaoParaSlots = duracaoTotal > 0 ? duracaoTotal : (tenant.schedule?.slotMinutes ?? 30);
  const chave = `${dia?.iso ?? ""}|${barbeiroId ?? ""}|${duracaoParaSlots}`;

  useEffect(() => {
    if (!open || !dia?.iso || !barbeiroId) return;
    let cancelado = false;
    (async () => {
      try {
        const { callFunction } = await import("@/lib/firebase");
        const r = await callFunction<
          {
            barbershopId: string;
            date: string;
            staffId: string;
            durationMin: number;
            paraOBalcao: boolean;
          },
          { slots: string[] }
        >("availableSlots", {
          barbershopId: tenant.id,
          date: dia.iso,
          staffId: barbeiroId,
          durationMin: duracaoParaSlots,
          /* Sem isto a lista chega filtrada pela antecedência mínima e o caso
           * mais comum do balcão — a pessoa já sentada na cadeira — não
           * aparece. Achado abrindo a tela: 15:55 no relógio, primeiro horário
           * oferecido 17:00. Quem valida o pedido é o servidor, pelo claim. */
          paraOBalcao: true,
        });
        if (!cancelado) setResposta({ chave, slots: r.slots ?? [] });
      } catch (err) {
        console.error("[balcao] falha ao buscar horários", err);
        if (!cancelado) setResposta({ chave, slots: [] });
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [open, dia?.iso, barbeiroId, duracaoParaSlots, tenant.id, chave]);

  /* Só vale a resposta desta combinação de dia, barbeiro e duração.
   *
   * Guardar a chave junto da resposta faz a lista voltar sozinha para
   * "carregando" quando qualquer uma muda — sem um `setState` de limpeza no
   * efeito, que renderizaria o resultado do dia anterior por um quadro. */
  const horariosLivres = resposta?.chave === chave ? resposta.slots : null;

  /* A regra da busca mora em `lib/clientes-busca.ts`, com teste.
   *
   * Ela estava aqui e usava `normalizarWhatsapp` — a função de GRAVAR, que
   * devolve "" abaixo de 10 dígitos. Todo fragmento virava string vazia e a
   * busca por número não funcionava; o dono não achava o cliente e criava um
   * cadastro duplicado, que é justamente o que G3 existe para evitar. */
  const encontrados = useMemo(() => filtrarClientes(clientes, busca), [busca, clientes]);

  function limpar() {
    setDiaIndex(firstBookableIndex(dias));
    setHora(null);
    setBusca("");
    setClienteEscolhido(null);
    setNomeNovo("");
    setWhatsappNovo("");
    setCriandoNovo(false);
    setServicosEscolhidos([]);
    setBarbeiroClicado(null);
    setErro(null);
    setPronto(false);
  }

  function fechar() {
    limpar();
    onClose();
  }

  const clienteOk = clienteEscolhido !== null || (criandoNovo && nomeNovo.trim().length > 1);
  const podeConfirmar =
    !!dia && !!hora && clienteOk && servicosEscolhidos.length > 0 && !!barbeiroId;

  async function confirmar() {
    if (!podeConfirmar || !dia || !hora || !barbeiroId) return;
    setSalvando(true);
    setErro(null);
    try {
      const { callFunction } = await import("@/lib/firebase");
      const r = await callFunction<
        Record<string, unknown>,
        { bookingId: string; clientId: string }
      >("createBookingAtCounter", {
        barbershopId: tenant.id,
        date: dia.iso,
        time: hora,
        staffId: barbeiroId,
        serviceIds: servicosEscolhidos,
        ...(clienteEscolhido
          ? { clientId: clienteEscolhido.id }
          : {
              clientName: nomeNovo.trim(),
              clientWhatsapp: normalizarWhatsapp(whatsappNovo),
            }),
      });
      setPronto(true);
      aoMarcar?.(r);
    } catch (err) {
      /* O erro do servidor aparece COMO ELE VEIO. Trocar por "não foi possível"
       * esconderia justamente o que o dono precisa saber: horário tomado, teto
       * de reservas do cliente, barbeiro que não faz o serviço. */
      setErro(
        (err as { message?: string })?.message ??
          "Não foi possível marcar agora. Tente de novo."
      );
    } finally {
      setSalvando(false);
    }
  }

  if (pronto) {
    return (
      <Modal
        open={open}
        onClose={fechar}
        /* O botão que abre este fluxo diz "Marcar atendimento" e a agenda ao
           lado fala em horário e atendimento; só a confirmação dizia
           "reserva", que é a palavra do app do CLIENTE. */
        title="Atendimento marcado"
        description={`${formatDatePtBR(dia?.iso ?? "")} às ${hora}`}
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => { limpar(); }} className="flex-1">
              Marcar outro
            </Button>
            <Button onClick={fechar} className="flex-1">
              Ver na agenda
            </Button>
          </div>
        }
      >
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-gold/15">
            <Check size={22} className="text-gold" />
          </div>
          <p className="text-sm text-ivory">
            {clienteEscolhido?.name ?? nomeNovo} · {escolhidos.map((s) => s.name).join(" + ")}
          </p>
          <p className="text-xs text-ivory-muted">
            O pagamento é registrado quando você concluir o atendimento.
          </p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={fechar}
      title="Marcar atendimento"
      description="Para quem chegou no balcão ou ligou"
      footer={
        <div className="flex flex-col gap-2">
          {erro && (
            <p role="alert" className="text-xs text-danger">
              {erro}
            </p>
          )}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={fechar} className="flex-1">
              Cancelar
            </Button>
            <Button onClick={confirmar} disabled={!podeConfirmar || salvando} className="flex-1">
              {salvando ? "Marcando…" : "Confirmar reserva"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {/* ---- 1 · serviço ---- */}
        <section className="flex flex-col gap-2">
          <p className="text-[11px] uppercase tracking-wide text-ivory-muted">
            1 · O que vai fazer
          </p>
          <div className="flex flex-wrap gap-2">
            {catalogo.map((s) => {
              const marcado = servicosEscolhidos.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={marcado}
                  onClick={() =>
                    setServicosEscolhidos((atual) =>
                      marcado ? atual.filter((x) => x !== s.id) : [...atual, s.id]
                    )
                  }
                  className={
                    "rounded-xl border px-3 py-2 text-left text-xs transition-colors " +
                    (marcado
                      ? "border-gold bg-gold/10 text-ivory"
                      : "border-border text-ivory-muted hover:border-gold/60")
                  }
                >
                  <span className="block">{s.name}</span>
                  <span className="block text-[11px] text-ivory-muted">
                    {formatBRL(s.price ?? 0)} · {s.durationMin ?? 0} min
                  </span>
                </button>
              );
            })}
          </div>
          {catalogo.length === 0 && (
            <p className="text-xs text-ivory-muted">
              Nenhum serviço ativo. Cadastre um em Serviços antes de marcar.
            </p>
          )}
        </section>

        {/* ---- 2 · barbeiro ---- */}
        <section className="flex flex-col gap-2">
          <p className="text-[11px] uppercase tracking-wide text-ivory-muted">
            2 · Com quem
          </p>
          <div className="flex flex-wrap gap-2">
            {barbeirosQueFazem.map((b) => (
              <button
                key={b.id}
                type="button"
                aria-pressed={barbeiroId === b.id}
                onClick={() => {
                  setBarbeiroClicado(b.id);
                  setHora(null);
                }}
                className={
                  "rounded-xl border px-3 py-2 text-xs transition-colors " +
                  (barbeiroId === b.id
                    ? "border-gold bg-gold/10 text-ivory"
                    : "border-border text-ivory-muted hover:border-gold/60")
                }
              >
                {b.name}
              </button>
            ))}
          </div>
          {servicosEscolhidos.length > 0 && barbeirosQueFazem.length === 0 && (
            /* Dizer QUAL é o problema, e não só que a lista está vazia. */
            <p className="text-xs text-danger">
              Nenhum barbeiro ativo faz todos os serviços escolhidos.
            </p>
          )}
        </section>

        {/* ---- 3 · quando ---- */}
        <section className="flex flex-col gap-2">
          <p className="text-[11px] uppercase tracking-wide text-ivory-muted">3 · Quando</p>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {dias.slice(0, 14).map((d, i) => (
              <button
                key={d.iso}
                type="button"
                disabled={d.disabled}
                aria-pressed={i === diaIndex}
                onClick={() => {
                  setDiaIndex(i);
                  setHora(null);
                }}
                className={
                  "shrink-0 rounded-lg border px-2.5 py-1.5 text-[11px] transition-colors disabled:opacity-30 " +
                  (i === diaIndex
                    ? "border-gold bg-gold/10 text-ivory"
                    : "border-border text-ivory-muted")
                }
              >
                {d.iso === toISODate(new Date()) ? "Hoje" : formatDatePtBR(d.iso)}
              </button>
            ))}
          </div>

          {!barbeiroId ? (
            <p className="text-xs text-ivory-muted">
              Escolha o serviço e o barbeiro para ver os horários livres.
            </p>
          ) : horariosLivres === null ? (
            <p className="text-xs text-ivory-muted">Carregando horários…</p>
          ) : horariosLivres.length === 0 ? (
            <p className="text-xs text-ivory-muted">
              Nenhum horário livre nesse dia para esse barbeiro.
            </p>
          ) : (
            <div className="grid grid-cols-4 gap-1.5">
              {horariosLivres.map((h) => (
                <button
                  key={h}
                  type="button"
                  aria-pressed={hora === h}
                  onClick={() => setHora(h)}
                  className={
                    "rounded-lg border py-2 text-xs transition-colors " +
                    (hora === h
                      ? "border-gold bg-gold/10 text-ivory"
                      : "border-border text-ivory-muted hover:border-gold/60")
                  }
                >
                  {h}
                </button>
              ))}
            </div>
          )}
        </section>

        {/* ---- 4 · quem ---- */}
        <section className="flex flex-col gap-2">
          <p className="text-[11px] uppercase tracking-wide text-ivory-muted">4 · Para quem</p>

          {clienteEscolhido ? (
            <div className="flex items-center justify-between gap-2 rounded-xl border border-gold/60 bg-gold/5 px-3 py-2">
              <div>
                <p className="text-sm text-ivory">{clienteEscolhido.name}</p>
                <p className="text-[11px] text-ivory-muted">
                  {clienteEscolhido.whatsapp
                    ? mascararWhatsapp(clienteEscolhido.whatsapp)
                    : "sem WhatsApp"}
                  {clienteEscolhido.uid === null && " · balcão"}
                </p>
              </div>
              <Button variant="ghost" onClick={() => setClienteEscolhido(null)}>
                Trocar
              </Button>
            </div>
          ) : criandoNovo ? (
            <div className="flex flex-col gap-2">
              <input
                autoFocus
                value={nomeNovo}
                onChange={(e) => setNomeNovo(e.target.value)}
                placeholder="Nome de quem vai ser atendido"
                className="min-h-11 rounded-xl border border-border bg-surface px-3 text-sm text-ivory placeholder:text-ivory-muted"
              />
              <input
                value={whatsappNovo}
                onChange={(e) => setWhatsappNovo(e.target.value)}
                inputMode="numeric"
                placeholder="WhatsApp com DDD (opcional)"
                className="min-h-11 rounded-xl border border-border bg-surface px-3 text-sm text-ivory placeholder:text-ivory-muted"
              />
              {/* O número não é obrigatório: uma pessoa pode não querer dar. Mas
                  sem ele não há como reconhecê-la na próxima visita, e o aviso
                  diz isso em vez de deixar o dono descobrir depois.

                  São TRÊS estados, e não dois. A primeira versão tinha só dois e
                  dizia "sem WhatsApp" com um número válido digitado na frente —
                  uma frase falsa na tela, que é exatamente a classe de defeito
                  que a Rodada 1 acabou de tirar do produto. Achado abrindo a
                  tela; nenhum teste desta rodada olhava para este texto. */}
              <p className="text-[11px] text-ivory-muted">
                {!whatsappNovo.trim()
                  ? "Sem WhatsApp, este cliente não é reconhecido na próxima visita."
                  : !whatsappValido(whatsappNovo)
                    ? "Número incompleto — vai ser salvo, mas não serve para reconhecer o cliente na próxima vez."
                    : "Com este número, o cliente é reconhecido nas próximas visitas."}
              </p>
              <Button variant="ghost" onClick={() => setCriandoNovo(false)}>
                Buscar um cliente existente
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3">
                <Search size={14} className="text-ivory-muted" />
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar por nome ou WhatsApp"
                  className="min-h-11 flex-1 bg-transparent text-sm text-ivory placeholder:text-ivory-muted"
                />
              </div>

              <div className="flex flex-col gap-1">
                {encontrados.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setClienteEscolhido(c)}
                    className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-left transition-colors hover:border-gold/60"
                  >
                    <span className="text-sm text-ivory">{c.name}</span>
                    <span className="text-[11px] text-ivory-muted">
                      {c.whatsapp ? mascararWhatsapp(c.whatsapp) : "—"}
                    </span>
                  </button>
                ))}
                {busca && encontrados.length === 0 && (
                  <p className="px-1 text-xs text-ivory-muted">
                    Ninguém com esse nome ou número.
                  </p>
                )}
              </div>

              <Button
                variant="secondary"
                onClick={() => {
                  setCriandoNovo(true);
                  /* O que ele já digitou vira o nome: obrigar a redigitar depois
                   * de buscar e não achar é atrito puro, e é o caminho mais
                   * comum — cliente novo. */
                  setNomeNovo(busca.trim());
                }}
              >
                <UserPlus size={14} />
                Cliente novo
              </Button>
            </div>
          )}
        </section>

        {/* ---- resumo ---- */}
        {podeConfirmar && (
          <section className="flex flex-col gap-1 rounded-xl border border-border bg-surface-raised p-3">
            <p className="text-[11px] uppercase tracking-wide text-ivory-muted">Resumo</p>
            <p className="text-sm text-ivory">
              {clienteEscolhido?.name ?? nomeNovo} · {escolhidos.map((s) => s.name).join(" + ")}
            </p>
            <p className="text-xs text-ivory-muted">
              {formatDatePtBR(dia!.iso)} às {hora} · {duracaoTotal} min ·{" "}
              {ativos.find((b) => b.id === barbeiroId)?.name}
            </p>
            <div className="mt-1 flex items-center justify-between">
              <Pill tone="gold">{formatBRL(valorTotal)}</Pill>
              {/* O produto não recebe pagamento antecipado. Dizer isso aqui
                  evita que o dono espere uma etapa de cobrança que não existe. */}
              <span className="text-[11px] text-ivory-muted">pagamento no atendimento</span>
            </div>
          </section>
        )}
      </div>
    </Modal>
  );
}
