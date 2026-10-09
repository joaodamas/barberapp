"use client";

import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useServices } from "@/lib/db/use-shop-data";
import { aplicarCombos, aplicarCombosComCongelados, diferencaDeServicos } from "@/lib/combos";
import { calcularDesconto, lerNumeroDigitado } from "@/lib/desconto";
import { formasAtivas, type FormaDePagamento } from "@/lib/formas-de-pagamento";
import { formatBRL, formatPctPtBR } from "@/lib/format";
import { chaveDeIdempotencia } from "@/lib/chave-de-idempotencia";
import { mensagemDaFuncao } from "@/lib/mensagem-da-funcao";
import { useTenant } from "@/lib/tenant-context";
import type { BookingDoc, TipoDeDesconto } from "@/lib/domain";
import type { Doc } from "@/lib/db/repository";

/**
 * Editar a cobrança de um atendimento CONCLUÍDO — pedido do dono, 02/10.
 *
 * O "Adicionar serviço" errado, o desconto que não era, a forma trocada: tudo
 * aqui. Quem grava é o servidor (`editarCobrancaDoAtendimento`), numa transação
 * que ajusta pagamento, comissão e reserva juntos e deixa o rastro — a tela não
 * escreve dinheiro. O preço vem do catálogo, com combo, como na marcação.
 *
 * Dono: qualquer atendimento do mês, inclusive desconto. Barbeiro: os próprios,
 * no mesmo dia, sem dar, mudar ou tirar desconto — o desconto é do dono
 * (08/10). O servidor confere; a tela só não oferece o que vai ser recusado.
 */

type ModoDoDesconto = "manter" | "sem" | "novo";

type Resumo = {
  serviceNames: string[];
  cobrado: number;
  paymentFormLabel: string | null;
  paymentMethod: string | null;
  commissionAmount: number;
};

export function EditarCobranca({
  aberto,
  aoFechar,
  booking,
  ehDono,
}: {
  aberto: boolean;
  aoFechar: () => void;
  booking: Doc<BookingDoc>;
  ehDono: boolean;
}) {
  const tenant = useTenant();
  const { items: servicos } = useServices();
  const ativos = useMemo(() => servicos.filter((s) => s.active !== false), [servicos]);
  const catalogo = useMemo(() => servicos.map((s) => ({ ...s, id: s.id })), [servicos]);
  const formas = formasAtivas(tenant.policies);
  /* Serviço apagado do catálogo continua com o nome gravado na reserva. */
  const nomes = new Map<string, string>([
    ...(booking.serviceIds ?? []).map((id, i): [string, string] => [String(id), (booking as { serviceNames?: string[] }).serviceNames?.[i] ?? "Serviço"]),
    ...servicos.map((s): [string, string] => [s.id, s.name]),
  ]);

  const [ids, setIds] = useState<string[]>(() => (booking.serviceIds ?? []).map(String));
  const [adicionando, setAdicionando] = useState(false);
  const tinhaDesconto = (Number(booking.discountAmount) || 0) > 0;
  const [modo, setModo] = useState<ModoDoDesconto>("manter");
  const [tipo, setTipo] = useState<TipoDeDesconto>("valor");
  const [texto, setTexto] = useState("");
  const [forma, setForma] = useState<FormaDePagamento | null>(
    () =>
      formas.find((f) => f.id === booking.paymentFormId) ??
      formas.find((f) => f.base === booking.paymentMethod) ??
      null
  );
  const [chave] = useState(chaveDeIdempotencia);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<{ antes: Resumo; depois: Resumo } | null>(null);

  /* A mesma conta do servidor: combos do catálogo e o desconto sobre o bruto novo. */
  /* Lista igual à do atendimento: nada é re-precificado (o servidor mantém o
   * bruto congelado). Lista mudou: os serviços que já estavam valem como
   * ativos — um combo desativado depois não é desmontado em peças. */
  const idsAtuais = (booking.serviceIds ?? []).map(String);
  const inalterados = idsAtuais.length > 0 && idsAtuais.length === ids.length && idsAtuais.every((x, i) => x === ids[i]);
  const previa = inalterados
    ? { valor: Number(booking.value) || 0, combos: [] as string[] }
    : idsAtuais.length > 0 && (Number(booking.value) || 0) > 0
      ? (() => {
          /* A mesma conta do servidor: o que fica vale a parte do preço
           * gravado; só o que foi somado entra pelo preço de hoje. */
          const { extras, remover } = diferencaDeServicos(idsAtuais, ids);
          const c = aplicarCombosComCongelados(booking, extras, catalogo, remover);
          return { valor: c.valor, combos: c.combos };
        })()
      : aplicarCombos(
          ids,
          catalogo.map((s) => (idsAtuais.includes(s.id) && s.active === false ? { ...s, active: true } : s))
        );
  const descontoEmReais = (() => {
    if (modo === "sem") return 0;
    if (modo === "novo") return calcularDesconto({ valor: previa.valor, tipo, entrada: lerNumeroDigitado(texto) }).desconto;
    if (!tinhaDesconto) return 0;
    const entrada = booking.discountInput;
    return entrada?.tipo === "pct"
      ? calcularDesconto({ valor: previa.valor, tipo: "pct", entrada: entrada.valor }).desconto
      : Math.min(Number(booking.discountAmount) || 0, previa.valor);
  })();
  const cobrar = Math.round((previa.valor - descontoEmReais) * 100) / 100;
  const cobradoAntes = Math.round(((Number(booking.value) || 0) - (Number(booking.discountAmount) || 0)) * 100) / 100;
  const viraCortesia = descontoEmReais > 0 && descontoEmReais >= previa.valor;
  const podeConfirmar = ids.length > 0 && !!forma && !viraCortesia && !salvando;

  async function confirmar() {
    if (!forma) return;
    setSalvando(true);
    setErro(null);
    try {
      const { callFunction } = await import("@/lib/firebase");
      const desconto =
        modo === "sem"
          ? null
          : modo === "novo"
            ? { tipo, valor: lerNumeroDigitado(texto) ?? 0 }
            : undefined;
      const r = await callFunction<Record<string, unknown>, { antes: Resumo; depois: Resumo }>(
        "editarCobrancaDoAtendimento",
        {
          barbershopId: tenant.id,
          bookingId: booking.id,
          serviceIds: ids,
          ...(desconto !== undefined ? { desconto } : {}),
          paymentMethod: forma.base,
          paymentFormId: forma.id,
          idempotencyKey: chave,
        }
      );
      setFeito({ antes: r.antes, depois: r.depois });
    } catch (e) {
      setErro(mensagemDaFuncao(e, "Não consegui editar a cobrança agora."));
    } finally {
      setSalvando(false);
    }
  }

  const ultima = booking.edicoesDeCobranca?.at(-1);

  if (feito) {
    return (
      <Modal
        open={aberto}
        onClose={aoFechar}
        title="Cobrança editada"
        description={booking.clientName}
        footer={<Button onClick={aoFechar}>Pronto</Button>}
      >
        <div className="flex flex-col gap-2 text-sm">
          <Linha rotulo="Serviços" antes={feito.antes.serviceNames.join(" + ")} depois={feito.depois.serviceNames.join(" + ")} />
          <Linha rotulo="Cobrado" antes={formatBRL(feito.antes.cobrado)} depois={formatBRL(feito.depois.cobrado)} />
          <Linha
            rotulo="Forma"
            antes={feito.antes.paymentFormLabel ?? feito.antes.paymentMethod ?? "—"}
            depois={feito.depois.paymentFormLabel ?? feito.depois.paymentMethod ?? "—"}
          />
          <Linha
            rotulo="Comissão"
            antes={formatBRL(feito.antes.commissionAmount)}
            depois={formatBRL(feito.depois.commissionAmount)}
          />
          <p className="mt-2 text-xs text-ink-muted">
            Caixa, comissão e o resultado do mês já estão com o valor novo. Fica registrado quem editou e quando.
          </p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={aberto}
      onClose={() => !salvando && aoFechar()}
      title="Editar cobrança"
      description={`${booking.clientName} · ${booking.time}`}
      footer={
        <>
          <Button variant="ghost" onClick={aoFechar} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={!podeConfirmar}>
            {salvando ? "Salvando…" : "Salvar cobrança"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {ultima && (
          <p className="text-xs text-ink-muted">
            Já editada {booking.edicoesDeCobranca!.length === 1 ? "uma vez" : `${booking.edicoesDeCobranca!.length} vezes`} — a
            última em {new Date(ultima.emMs).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
            {ultima.papel === "staff" ? " pelo barbeiro" : " pelo dono"}.
          </p>
        )}

        {/* SERVIÇOS */}
        <section>
          <p className="mb-2 text-[12.5px] font-medium text-ink-muted">Serviços feitos</p>
          <ul className="flex flex-col gap-2">
            {ids.map((id, i) => (
              <li
                key={`${id}-${i}`}
                className="flex items-center justify-between rounded-xl border border-border bg-surface-raised px-3 py-2"
              >
                <span className="text-sm text-ink">{nomes.get(id) ?? "Serviço"}</span>
                <button
                  type="button"
                  aria-label={`Tirar ${nomes.get(id) ?? "serviço"}`}
                  disabled={ids.length === 1 || salvando}
                  onClick={() => setIds((atual) => atual.filter((_, j) => j !== i))}
                  className="alvo-toque cursor-pointer rounded-lg p-1 text-ink-muted hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <X size={16} />
                </button>
              </li>
            ))}
          </ul>
          {adicionando ? (
            <div className="mt-2 grid grid-cols-2 gap-2">
              {ativos.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setIds((atual) => [...atual, s.id]);
                    setAdicionando(false);
                  }}
                  className="cursor-pointer rounded-xl border border-border px-3 py-2 text-left text-sm text-ink hover:border-gold hover:bg-gold/10"
                >
                  {s.name}
                  <span className="block text-xs text-ink-muted">{formatBRL(Number(s.price) || 0)}</span>
                </button>
              ))}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAdicionando(true)}
              className="alvo-toque mt-2 inline-flex cursor-pointer items-center gap-1 text-sm font-medium text-gold-strong"
            >
              <Plus size={14} /> Adicionar serviço
            </button>
          )}
          {previa.combos.length > 0 && (
            <p className="mt-2 text-xs text-ink-muted">Com combo: {previa.combos.join(", ")}</p>
          )}
        </section>

        {/* DESCONTO — só o dono dá, muda ou tira; o barbeiro só mantém (08/10). */}
        {(ehDono || tinhaDesconto) && (
          <section>
            <p className="mb-2 text-[12.5px] font-medium text-ink-muted">Desconto</p>
            <div className="flex flex-wrap gap-2">
              {tinhaDesconto && (
                <Opcao ativa={modo === "manter"} onClick={() => setModo("manter")}>
                  Manter o de antes
                </Opcao>
              )}
              {(ehDono || !tinhaDesconto) && (
                <Opcao ativa={modo === "sem" || (!tinhaDesconto && modo === "manter")} onClick={() => setModo("sem")}>
                  Sem desconto
                </Opcao>
              )}
              {ehDono && (
                <Opcao ativa={modo === "novo"} onClick={() => setModo("novo")}>
                  {tinhaDesconto ? "Mudar desconto" : "Dar desconto"}
                </Opcao>
              )}
            </div>
            {modo === "novo" && (
              <div className="mt-2 flex items-center gap-2">
                <div className="flex overflow-hidden rounded-xl border border-border">
                  {(["valor", "pct"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTipo(t)}
                      className={`cursor-pointer px-3 py-2 text-sm ${tipo === t ? "bg-gold/15 text-gold-strong" : "text-ink"}`}
                    >
                      {t === "valor" ? "R$" : "%"}
                    </button>
                  ))}
                </div>
                <input
                  inputMode="decimal"
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  placeholder={tipo === "valor" ? "10,00" : "10"}
                  aria-label="Valor do desconto"
                  className="w-28 rounded-xl border border-border bg-surface px-3 py-2 text-sm text-ink"
                />
              </div>
            )}
          </section>
        )}

        {/* FORMA DE PAGAMENTO */}
        <section>
          <p className="mb-2 text-[12.5px] font-medium text-ink-muted">Como o cliente pagou</p>
          <div className={formas.length > 4 ? "grid grid-cols-3 gap-2" : "grid grid-cols-2 gap-2"}>
            {formas.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={forma?.id === f.id}
                onClick={() => setForma(f)}
                className={
                  forma?.id === f.id
                    ? "flex min-h-12 cursor-pointer flex-col items-center justify-center rounded-xl border border-gold bg-gold/15 px-2 text-sm font-medium text-gold-strong"
                    : "flex min-h-12 cursor-pointer flex-col items-center justify-center rounded-xl border border-border px-2 text-sm font-medium text-ink hover:border-gold hover:bg-gold/10"
                }
              >
                <span className="leading-tight">{f.label}</span>
                {f.feePct > 0 && <span className="text-[11px] font-normal text-ink-muted">{formatPctPtBR(f.feePct, 2)}</span>}
              </button>
            ))}
          </div>
        </section>

        {/* ANTES → DEPOIS */}
        <div className="rounded-xl border border-border bg-surface-raised/60 p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-ink-muted">Cobrado</span>
            <span>
              <s className="text-ink-muted">{formatBRL(cobradoAntes)}</s>{" "}
              <b className="text-ink">{formatBRL(cobrar)}</b>
            </span>
          </div>
          {descontoEmReais > 0 && (
            <p className="mt-1 text-xs text-ink-muted">
              {formatBRL(previa.valor)} com {formatBRL(descontoEmReais)} de desconto
            </p>
          )}
          <p className="mt-2 text-xs text-ink-muted">
            A comissão é recalculada com o mesmo percentual do atendimento, e a taxa da maquininha é a cadastrada hoje.
          </p>
          {viraCortesia && (
            <p role="alert" className="mt-2 text-xs text-danger">
              Com esse desconto o atendimento sairia de graça — cortesia se trata à parte.
            </p>
          )}
        </div>

        {erro && (
          <p role="alert" className="text-xs text-danger">
            {erro}
          </p>
        )}
      </div>
    </Modal>
  );
}

function Opcao({ ativa, onClick, children }: { ativa: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativa}
      className={
        ativa
          ? "cursor-pointer rounded-full border border-gold bg-gold/15 px-3 py-1.5 text-sm text-gold-strong"
          : "cursor-pointer rounded-full border border-border px-3 py-1.5 text-sm text-ink hover:border-gold"
      }
    >
      {children}
    </button>
  );
}

function Linha({ rotulo, antes, depois }: { rotulo: string; antes: string; depois: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-ink-muted">{rotulo}</span>
      <span className="text-right">
        {antes === depois ? (
          <span className="text-ink">{depois}</span>
        ) : (
          <>
            <s className="text-ink-muted">{antes}</s> <b className="text-ink">{depois}</b>
          </>
        )}
      </span>
    </div>
  );
}
