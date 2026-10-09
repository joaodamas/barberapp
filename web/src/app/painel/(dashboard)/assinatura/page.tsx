"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Pill } from "@/components/ui/pill";
import { useShopCollection } from "@/lib/db/use-collection";
import { mensagemDoErro } from "@/lib/direitos-do-titular";
import { AVISO_DE_COPIA_FALHOU, copiarOuSelecionar } from "@/lib/copiar-texto";
import { formatBRL } from "@/lib/format";
import { ANUAL_DISPONIVEL } from "@/lib/platform";
import {
  MESES_GRATIS_NO_ANUAL,
  NOME_DO_PLANO,
  PRECOS_POR_PLANO,
  economiaDoAnual,
  equivalenteMensalDoAnual,
  type CicloDoPlano,
  type PlanId,
} from "@/lib/tenant";
import { useTenant } from "@/lib/tenant-context";

/**
 * A assinatura do dono com o Topete (29/09).
 *
 * Quem cobra é o Hub da JP Projects (boleto do Inter). Esta tela só MOSTRA o
 * que o Hub diz e manda PEDIDOS para lá: mudar de plano e cancelar viram
 * pendência para a equipe do Topete aplicar (`escolherPlano`,
 * `pedirCancelamento`). Nada aqui muda o plano na hora — se mudasse, o dono
 * usaria um plano e pagaria outro.
 *
 * Pela lente de confiança, a tela nunca afirma o que não sabe:
 *   - boleto só aparece se o Hub devolveu; sem resposta, diz que não conseguiu
 *     buscar, e não "tudo em dia";
 *   - o valor da mensalidade é o do Hub (que já tem o desconto de fundadora do 1º mês e
 *     barbeiro extra); sem ele, a tela diz "preço de tabela";
 *   - a barbearia isenta (o O Siqueira) não vê preço nem boleto.
 */

type Situacao = "pago" | "aberto" | "atrasado" | "processando" | "cancelado";
type Boleto = { id: string; valor: number; vencimento: string; situacao: Situacao; pagoEm: string | null };
type Resposta =
  | {
      disponivel: true;
      isento: false;
      assinatura: {
        plano: string | null;
        valor: number | null;
        ciclo: string | null;
        valorCiclo?: number | null;
        status: string | null;
        proximoVencimento: string | null;
      };
      boletos: Boleto[];
    }
  | { disponivel: false; isento: boolean; motivo: "isento" | "fora_de_producao" | "hub_sem_rota" | "hub_fora" };

type Pedido = { tipo: string; plano: string | null; valor: number | null; ciclo?: string | null; em?: { toDate?: () => Date } };

const PLANOS: PlanId[] = ["agenda", "crescimento", "gestao"];

const O_QUE_O_PLANO_TRAZ: Record<PlanId, string> = {
  agenda: "Agenda online com a sua marca, encaixe e mensagem pronta para enviar pelo WhatsApp.",
  crescimento: "Tudo do Agenda, mais mensalistas, loja, fidelidade e projeção de caixa.",
  gestao: "Tudo do Crescimento, mais despesas, DRE e o fechamento completo do mês.",
};

const ROTULO: Record<Situacao, { texto: string; tom: "success" | "danger" | "gold" | "neutral" }> = {
  pago: { texto: "Pago", tom: "success" },
  aberto: { texto: "Em aberto", tom: "gold" },
  atrasado: { texto: "Atrasado", tom: "danger" },
  processando: { texto: "Processando", tom: "neutral" },
  cancelado: { texto: "Cancelado", tom: "neutral" },
};

/** R$ 970 quando é redondo, R$ 80,83 quando não é. */
function reais(n: number) {
  return Number.isInteger(n) ? `R$ ${n}` : formatBRL(n);
}

/** "2026-10-10" → "10/10/2026", sem passar por fuso. */
function dataCurta(iso: string) {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}

export default function AssinaturaPage() {
  const tenant = useTenant();
  const [resposta, setResposta] = useState<Resposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const { callFunction } = await import("@/lib/firebase");
        const r = await callFunction<{ barbershopId: string }, Resposta>("minhaAssinatura", {
          barbershopId: tenant.id,
        });
        if (vivo) setResposta(r);
      } catch (e) {
        if (vivo) setErro(mensagemDoErro(e));
      }
    })();
    return () => {
      vivo = false;
    };
  }, [tenant.id, tentativa]);

  function tentarDeNovo() {
    setErro(null);
    setResposta(null);
    setTentativa((n) => n + 1);
  }

  const isento = tenant.isento === true || (resposta && !resposta.disponivel && resposta.isento);

  return (
    <div className="flex flex-col gap-6 pt-1 md:gap-10 md:pt-2">
      <header className="flex flex-col gap-1">
        <p className="text-sm text-ink-muted">Sua conta no Topete</p>
        <h1 className="font-display text-3xl text-ink md:text-4xl">Assinatura</h1>
      </header>

      {isento ? (
        <Card className="flex flex-col gap-3 border-gold/50 md:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-ink md:text-lg">Barbearia fundadora</h2>
            <Pill tone="gold">Sem mensalidade</Pill>
          </div>
          <p className="max-w-2xl text-sm text-ink-muted">
            O Topete nasceu aqui. Sua barbearia tem todos os recursos liberados e não
            recebe cobrança — nem agora, nem quando os preços mudarem.
          </p>
        </Card>
      ) : (
        <>
          <PlanoAtual plano={tenant.plan} resposta={resposta} />
          <Cobrancas resposta={resposta} erro={erro} onTentarDeNovo={tentarDeNovo} barbershopId={tenant.id} />
          <MudarDePlano plano={tenant.plan} barbershopId={tenant.id} />
          <Cancelar barbershopId={tenant.id} />
        </>
      )}
    </div>
  );
}

function PlanoAtual({ plano, resposta }: { plano: PlanId; resposta: Resposta | null }) {
  const doHub = resposta?.disponivel ? resposta.assinatura : null;
  const valor = doHub?.valor ?? null;
  return (
    <Card className="flex flex-col gap-2 md:p-6">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Seu plano</p>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="font-display text-2xl text-ink">{NOME_DO_PLANO[plano]}</h2>
        {doHub?.ciclo === "anual" && doHub.valorCiclo != null ? (
          <span className="text-sm text-ink">
            {reais(doHub.valorCiclo)}/ano ({formatBRL(equivalenteMensalDoAnual(doHub.valorCiclo))}/mês)
          </span>
        ) : valor !== null ? (
          <span className="text-sm text-ink">{formatBRL(valor)}/mês</span>
        ) : (
          <span className="text-sm text-ink-muted">
            {formatBRL(PRECOS_POR_PLANO[plano].mensal)}/mês (preço de tabela)
          </span>
        )}
      </div>
      <p className="text-sm text-ink-muted">{O_QUE_O_PLANO_TRAZ[plano]}</p>
      {doHub?.proximoVencimento && (
        <p className="text-sm text-ink">Próximo vencimento: {dataCurta(doHub.proximoVencimento)}</p>
      )}
    </Card>
  );
}

function Cobrancas({
  resposta,
  erro,
  onTentarDeNovo,
  barbershopId,
}: {
  resposta: Resposta | null;
  erro: string | null;
  onTentarDeNovo: () => void;
  barbershopId: string;
}) {
  const [aberto, setAberto] = useState<Boleto | null>(null);

  let corpo: React.ReactNode;
  if (erro || (resposta && !resposta.disponivel && resposta.motivo === "hub_fora")) {
    corpo = (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm text-ink-muted">Não conseguimos buscar seus boletos agora.</p>
        <Button variant="secondary" onClick={onTentarDeNovo}>
          Tentar de novo
        </Button>
      </div>
    );
  } else if (!resposta) {
    corpo = <p className="text-sm text-ink-muted">Buscando seus boletos…</p>;
  } else if (!resposta.disponivel) {
    corpo = (
      <p className="text-sm text-ink-muted">
        Seus boletos ainda não aparecem aqui. Para segunda via, fale com o suporte do Topete.
      </p>
    );
  } else if (resposta.boletos.length === 0) {
    corpo = <p className="text-sm text-ink-muted">Nenhum boleto emitido até agora.</p>;
  } else {
    corpo = (
      <ul className="flex flex-col divide-y divide-border">
        {resposta.boletos.map((b) => {
          const r = ROTULO[b.situacao];
          const pagavel = b.situacao === "aberto" || b.situacao === "atrasado";
          return (
            <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="flex flex-col">
                <span className="text-sm font-medium text-ink">{formatBRL(b.valor)}</span>
                <span className="text-xs text-ink-muted">
                  Vence {dataCurta(b.vencimento)}
                  {b.pagoEm ? ` · pago em ${dataCurta(b.pagoEm)}` : ""}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Pill tone={r.tom}>{r.texto}</Pill>
                {pagavel && (
                  <Button size="sm" onClick={() => setAberto(b)}>
                    Pagar
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <Card className="flex flex-col gap-3 md:p-6">
      <h2 className="text-sm font-semibold text-ink md:text-base">Boletos</h2>
      {corpo}
      {aberto && <SegundaVia boleto={aberto} barbershopId={barbershopId} onClose={() => setAberto(null)} />}
    </Card>
  );
}

type Via = { linhaDigitavel: string | null; pixCopiaECola: string | null; pdfBase64: string | null };

function SegundaVia({ boleto, barbershopId, onClose }: { boleto: Boleto; barbershopId: string; onClose: () => void }) {
  const [via, setVia] = useState<Via | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const { callFunction } = await import("@/lib/firebase");
        const r = await callFunction<{ barbershopId: string; id: string }, Via>("segundaVia", {
          barbershopId,
          id: boleto.id,
        });
        if (vivo) setVia(r);
      } catch (e) {
        if (vivo) setErro(mensagemDoErro(e));
      }
    })();
    return () => {
      vivo = false;
    };
  }, [barbershopId, boleto.id]);

  function baixarPdf(base64: string) {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `topete-boleto-${boleto.vencimento}.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Boleto de ${formatBRL(boleto.valor)}`}
      description={`Vence ${dataCurta(boleto.vencimento)}`}
    >
      {erro && (
        <p role="alert" className="text-sm text-danger">
          {erro}
        </p>
      )}
      {!erro && !via && <p className="text-sm text-ink-muted">Buscando o boleto…</p>}
      {via && (
        <div className="flex flex-col gap-4">
          {via.pixCopiaECola && (
            <Campo rotulo="Pix copia e cola" valor={via.pixCopiaECola} />
          )}
          {via.linhaDigitavel && (
            <Campo rotulo="Linha digitável" valor={via.linhaDigitavel} />
          )}
          {via.pdfBase64 && (
            <Button variant="secondary" onClick={() => baixarPdf(via.pdfBase64!)}>
              <Download size={16} /> Baixar boleto em PDF
            </Button>
          )}
          {!via.pixCopiaECola && !via.linhaDigitavel && !via.pdfBase64 && (
            <p className="text-sm text-ink-muted">
              O banco ainda não liberou os dados deste boleto. Tente de novo em alguns minutos.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}

/** Um dado para copiar. Se o navegador não deixa, o texto fica selecionado e o aviso diz o que fazer. */
function Campo({ rotulo, valor }: { rotulo: string; valor: string }) {
  const textoRef = useRef<HTMLParagraphElement>(null);
  const [copia, setCopia] = useState<"sim" | "nao" | null>(null);

  async function copiar() {
    const ok = await copiarOuSelecionar(valor, textoRef.current);
    setCopia(ok ? "sim" : "nao");
    if (ok) setTimeout(() => setCopia(null), 2000);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-ink-muted">{rotulo}</span>
      <p
        ref={textoRef}
        className="break-all rounded-lg border border-border bg-surface-raised p-3 font-mono text-xs text-ink"
      >
        {valor}
      </p>
      <Button variant="secondary" size="sm" onClick={copiar} className="self-start">
        {copia === "sim" ? <Check size={14} /> : <Copy size={14} />} {copia === "sim" ? "Copiado" : "Copiar"}
      </Button>
      {copia === "nao" && (
        <p role="status" className="text-xs text-ink-muted">
          {AVISO_DE_COPIA_FALHOU}
        </p>
      )}
    </div>
  );
}

function usePedidos() {
  const { items } = useShopCollection<Pedido>("pedidosPlataforma", { orderByField: "em", direction: "desc" });
  return items;
}

function MudarDePlano({ plano, barbershopId }: { plano: PlanId; barbershopId: string }) {
  const pedidos = usePedidos();
  const ultimo = pedidos.find((p) => p.tipo === "plano_escolhido");
  const [escolhido, setEscolhido] = useState<PlanId | null>(null);
  const [ciclo, setCiclo] = useState<CicloDoPlano>("mensal");
  const anual = ANUAL_DISPONIVEL && ciclo === "anual";
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function pedir() {
    if (!escolhido) return;
    setEnviando(true);
    setErro(null);
    try {
      const { callFunction } = await import("@/lib/firebase");
      await callFunction("escolherPlano", { barbershopId, plano: escolhido, ciclo: anual ? "anual" : "mensal" });
      setEscolhido(null);
    } catch (e) {
      setErro(mensagemDoErro(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Card className="flex flex-col gap-4 md:p-6">
      <div>
        <h2 className="text-sm font-semibold text-ink md:text-base">Mudar de plano</h2>
        <p className="mt-1 text-xs text-ink-muted md:text-sm">
          O pedido vai para a equipe do Topete, que confirma e ajusta a cobrança. Até lá, tudo segue como está.
        </p>
      </div>

      {ultimo?.plano && (
        <p role="status" className="text-sm text-ink">
          Pedido enviado{ultimo.em?.toDate ? ` em ${ultimo.em.toDate().toLocaleDateString("pt-BR")}` : ""}: plano{" "}
          {NOME_DO_PLANO[ultimo.plano as PlanId] ?? ultimo.plano}
          {ultimo.ciclo === "anual" ? " (anual)" : ""}.
        </p>
      )}

      {ANUAL_DISPONIVEL && (
        <div role="group" aria-label="Ciclo de cobrança" className="inline-flex self-start rounded-full border border-border p-1 text-sm">
          {(["mensal", "anual"] as const).map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={ciclo === c}
              onClick={() => setCiclo(c)}
              className={`rounded-full px-4 py-1.5 font-medium ${ciclo === c ? "bg-gold/20 text-ink" : "text-ink-muted"}`}
            >
              {c === "mensal" ? "Mensal" : `Anual (${MESES_GRATIS_NO_ANUAL} meses grátis)`}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {PLANOS.map((p) => {
          const atual = p === plano;
          const preco = PRECOS_POR_PLANO[p];
          return (
            <div
              key={p}
              className={`flex flex-col gap-2 rounded-xl border p-4 ${atual ? "border-gold/60 bg-gold/5" : "border-border"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-ink">{NOME_DO_PLANO[p]}</span>
                {atual && <Pill tone="gold">Atual</Pill>}
              </div>
              {anual ? (
                <>
                  <span className="text-sm text-ink">{reais(preco.anual)}/ano</span>
                  <span className="text-xs text-ink-muted">
                    Equivale a {formatBRL(equivalenteMensalDoAnual(preco.anual))}/mês · economize{" "}
                    {reais(economiaDoAnual(p))}
                  </span>
                </>
              ) : (
                <span className="text-sm text-ink">{formatBRL(preco.mensal)}/mês</span>
              )}
              <span className="text-xs text-ink-muted">
                Até {preco.tetoDeBarbeiros} barbeiros · + {formatBRL(preco.barbeiroExtra)} por barbeiro extra
              </span>
              <span className="text-xs text-ink-muted">{O_QUE_O_PLANO_TRAZ[p]}</span>
              {!atual && (
                <Button variant="secondary" size="sm" className="mt-auto self-start" onClick={() => setEscolhido(p)}>
                  Quero este
                </Button>
              )}
            </div>
          );
        })}
      </div>

      <Modal
        open={escolhido !== null}
        onClose={() => setEscolhido(null)}
        title={escolhido ? `Pedir o plano ${NOME_DO_PLANO[escolhido]}?` : ""}
        description={
          anual
            ? "O Hub gera a cobrança anual à vista (Pix ou boleto). Até o pagamento, seu plano segue como está."
            : "A equipe do Topete confirma a mudança e a próxima cobrança já vem com o valor novo."
        }
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEscolhido(null)} disabled={enviando}>
              Voltar
            </Button>
            <Button onClick={pedir} disabled={enviando}>
              {enviando ? "Enviando…" : "Enviar pedido"}
            </Button>
          </div>
        }
      >
        {escolhido && !anual && (
          <p className="text-sm text-ink">
            {formatBRL(PRECOS_POR_PLANO[escolhido].mensal)}/mês, até {PRECOS_POR_PLANO[escolhido].tetoDeBarbeiros}{" "}
            barbeiros.
          </p>
        )}
        {escolhido && anual && (
          <div className="flex flex-col gap-2 text-sm text-ink">
            <p>
              {reais(PRECOS_POR_PLANO[escolhido].anual)}/ano à vista (equivale a{" "}
              {formatBRL(equivalenteMensalDoAnual(PRECOS_POR_PLANO[escolhido].anual))}/mês), até{" "}
              {PRECOS_POR_PLANO[escolhido].tetoDeBarbeiros} barbeiros.
            </p>
            <p className="text-ink-muted">
              Barbeiro extra segue {formatBRL(PRECOS_POR_PLANO[escolhido].barbeiroExtra)}/mês, à parte. O desconto de
              fundadora não vale no anual.
            </p>
            <p className="text-ink-muted">
              Se você já paga mensal, o pedido só é registrado: o Hub decide a data da cobrança anual, e nada muda no
              seu mês corrente.
            </p>
          </div>
        )}
        {erro && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {erro}
          </p>
        )}
      </Modal>
    </Card>
  );
}

function Cancelar({ barbershopId }: { barbershopId: string }) {
  const pedidos = usePedidos();
  const pedido = pedidos.find((p) => p.tipo === "pediu_cancelamento");
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function pedir() {
    setEnviando(true);
    setErro(null);
    try {
      const { callFunction } = await import("@/lib/firebase");
      await callFunction("pedirCancelamento", { barbershopId, motivo: motivo.trim() || undefined });
      setAberto(false);
      setMotivo("");
    } catch (e) {
      setErro(mensagemDoErro(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Card className="flex flex-col gap-3 md:p-6">
      <h2 className="text-sm font-semibold text-ink md:text-base">Cancelar a assinatura</h2>
      {pedido ? (
        <p role="status" className="text-sm text-ink">
          Pedido de cancelamento enviado
          {pedido.em?.toDate ? ` em ${pedido.em.toDate().toLocaleDateString("pt-BR")}` : ""}. A equipe do Topete vai
          falar com você antes de parar a cobrança.
        </p>
      ) : (
        <>
          <p className="text-xs text-ink-muted md:text-sm">
            A cobrança para depois que a equipe do Topete confirmar. Seus dados continuam aqui até lá.
          </p>
          <Button variant="ghost" className="self-start px-0" onClick={() => setAberto(true)}>
            Quero cancelar
          </Button>
        </>
      )}

      <Modal
        open={aberto}
        onClose={() => setAberto(false)}
        title="Pedir o cancelamento?"
        description="Nada para agora. A equipe do Topete recebe o pedido e fala com você."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAberto(false)} disabled={enviando}>
              Voltar
            </Button>
            <Button variant="danger" onClick={pedir} disabled={enviando}>
              {enviando ? "Enviando…" : "Pedir cancelamento"}
            </Button>
          </div>
        }
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-ink-muted">Se quiser, conte o motivo</span>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            maxLength={300}
            rows={3}
            className="rounded-lg border border-border bg-surface-raised p-3 text-sm text-ink"
          />
        </label>
        {erro && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {erro}
          </p>
        )}
      </Modal>
    </Card>
  );
}
