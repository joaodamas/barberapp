"use client";

import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useTenant } from "@/lib/tenant-context";
import { formatDatePtBR } from "@/lib/format";
import { contar } from "@/lib/plural";

/**
 * Apagar o movimento de teste e começar o mês limpo.
 *
 * > *"como tiro o registro que você fez no mês?"*
 *
 * ## Por que a prévia vem do SERVIDOR, e não da tela
 *
 * A tela poderia contar o que já tem em memória — e contaria errado. Ela lê
 * `bookings` do mês corrente, não os de março; não lê `commissions` nem
 * `refunds` em lugar nenhum; e `payments` só entra em algumas páginas. O
 * número que o dono precisa ver antes de digitar ZERAR é o que vai
 * efetivamente sair, contado por quem apaga.
 *
 * É a mesma razão de a contagem e a exclusão morarem na MESMA callable: com
 * duas, a lista de coleções existiria em dois lugares, e a que conta acabaria
 * esquecendo a que a outra aprendeu.
 *
 * ## Por que a data mais antiga aparece
 *
 * Ela muda a decisão. "O mais antigo é de 3 dias atrás" é apagar teste; "de 7
 * meses atrás" é apagar a operação da barbearia. A tela não decide por ele —
 * impede que ele decida sem saber.
 */
export function ComecarDoZero() {
  const tenant = useTenant();

  const [aberto, setAberto] = useState(false);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [zerando, setZerando] = useState(false);
  const [palavra, setPalavra] = useState("");
  const [feito, setFeito] = useState<Executado | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function abrir() {
    setAberto(true);
    setFeito(null);
    setPalavra("");
    setErro(null);
    setCarregando(true);
    try {
      const { callFunction } = await import("@/lib/firebase");
      const r = await callFunction<{ barbershopId: string }, Previa>("comecarDoZero", {
        barbershopId: tenant.id,
      });
      setPrevia(r);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui contar o que existe agora.");
    } finally {
      setCarregando(false);
    }
  }

  async function zerar() {
    setZerando(true);
    setErro(null);
    try {
      const { callFunction } = await import("@/lib/firebase");
      const r = await callFunction<{ barbershopId: string; confirmacao: string }, Executado>(
        "comecarDoZero",
        { barbershopId: tenant.id, confirmacao: "ZERAR" }
      );
      setFeito(r);
      setPalavra("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui apagar agora.");
    } finally {
      setZerando(false);
    }
  }

  const nada = previa && previa.total === 0;

  return (
    <>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm text-ink">Apagar o movimento e começar do zero</p>
          <p className="text-xs text-ink-muted md:text-sm">
            Tira do sistema os atendimentos, pagamentos, comissões, despesas e vendas
            — o que foi teste. Equipe, serviços, preços, clientes, horários e taxas
            continuam como estão.
          </p>
        </div>
        <Button variant="secondary" onClick={() => void abrir()} className="shrink-0">
          Começar do zero
        </Button>
      </div>

      <Modal
        open={aberto}
        onClose={() => !zerando && setAberto(false)}
        title={feito ? "Pronto" : "Começar do zero"}
        description={
          feito
            ? undefined
            : "Isto apaga o movimento da barbearia. Não dá para desfazer."
        }
        footer={
          feito ? (
            <Button onClick={() => setAberto(false)}>Fechar</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setAberto(false)} disabled={zerando}>
                Cancelar
              </Button>
              <Button
                variant="danger"
                onClick={() => void zerar()}
                disabled={palavra !== "ZERAR" || zerando || carregando || !!nada}
              >
                {zerando ? "Apagando…" : "Apagar tudo"}
              </Button>
            </>
          )
        }
      >
        <div className="flex flex-col gap-3">
          {carregando && (
            <p className="flex items-center gap-2 text-sm text-ink-muted">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Contando o que existe hoje…
            </p>
          )}

          {feito ? (
            <>
              <p className="text-sm text-ink">
                {feito.total === 0
                  ? "Não havia nada para apagar."
                  : `Saíram ${contar(feito.total, "registro", "registros")}.`}
              </p>
              {feito.produtosZerados > 0 && (
                <p className="text-xs text-ink-muted">
                  O estoque de {contar(feito.produtosZerados, "produto", "produtos")} voltou
                  a zero — dê a entrada real quando for contar a prateleira.
                </p>
              )}
              {feito.sobrou > 0 && (
                /* O teto por chamada existe para a função não morrer no meio. Se
                   bateu nele, dizer "pronto" seria mentira. */
                <p className="rounded-xl border border-gold/40 bg-gold/10 px-3 py-2 text-sm text-ink">
                  Ainda sobraram {contar(feito.sobrou, "registro", "registros")} — era
                  movimento demais para uma vez só. Clique de novo em{" "}
                  <strong>Começar do zero</strong> para continuar.
                </p>
              )}
            </>
          ) : (
            previa && (
              <>
                {nada ? (
                  <p className="text-sm text-ink-muted">
                    Não há movimento registrado. A barbearia já está do jeito que
                    você quer começar.
                  </p>
                ) : (
                  <>
                    <div className="rounded-xl border border-danger/30 bg-danger/5 px-3 py-2.5">
                      <p className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-ink">
                        <AlertTriangle size={14} className="text-danger" aria-hidden />
                        Isto apaga, sem volta
                      </p>
                      <ul className="flex flex-col gap-0.5 text-sm text-ink-muted">
                        {Object.entries(previa.porColecao).map(([colecao, n]) => (
                          <li key={colecao}>
                            · {contar(n, ...NOME_DA_COLECAO(colecao))}
                          </li>
                        ))}
                      </ul>
                    </div>

                    {previa.maisAntigo && (
                      /* A frase que muda a decisão: teste tem dias, operação tem
                         meses. */
                      <p className="text-xs text-ink-muted">
                        O atendimento mais antigo é de{" "}
                        <span className="text-ink">{formatDatePtBR(previa.maisAntigo)}</span>.
                        Confira se não é movimento de verdade antes de apagar.
                      </p>
                    )}

                    <p className="text-xs text-ink-muted">
                      <span className="text-ink">Continuam como estão:</span> equipe,
                      serviços, preços, planos, produtos, clientes, horários, taxas e
                      configurações. O estoque dos produtos volta a zero, porque ele é
                      a soma dos movimentos que estão saindo.
                    </p>

                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="confirmar-zerar" className="text-sm text-ink">
                        Para confirmar, digite <strong>ZERAR</strong>
                      </label>
                      <input
                        id="confirmar-zerar"
                        type="text"
                        value={palavra}
                        autoComplete="off"
                        onChange={(e) => setPalavra(e.target.value.toUpperCase())}
                        className="min-h-11 rounded-xl border border-border bg-surface-raised px-3 text-sm text-ink"
                      />
                    </div>
                  </>
                )}
              </>
            )
          )}

          {erro && (
            <p role="alert" className="text-sm text-danger">
              {erro}
            </p>
          )}
        </div>
      </Modal>
    </>
  );
}

type Previa = {
  modo: "previa";
  porColecao: Record<string, number>;
  total: number;
  maisAntigo: string | null;
};

type Executado = {
  modo: "executado";
  apagado: Record<string, number>;
  total: number;
  sobrou: number;
  produtosZerados: number;
};

/**
 * O nome da coleção nas palavras do dono.
 *
 * "inventory_movements: 4" não é informação para quem vai decidir apagar. O
 * fallback devolve o próprio nome em vez de esconder a linha: uma coleção nova
 * no servidor precisa aparecer feia aqui, e não sumir da lista do que vai ser
 * apagado.
 */
function NOME_DA_COLECAO(colecao: string): [string, string] {
  const nomes: Record<string, [string, string]> = {
    bookings: ["atendimento", "atendimentos"],
    payments: ["pagamento", "pagamentos"],
    commissions: ["comissão", "comissões"],
    refunds: ["estorno", "estornos"],
    cash_entries: ["lançamento no caixa", "lançamentos no caixa"],
    inventory_movements: ["movimento de estoque", "movimentos de estoque"],
    expenses: ["despesa", "despesas"],
    subscriptions: ["mensalista", "mensalistas"],
    subscription_invoices: ["fatura de mensalidade", "faturas de mensalidade"],
    loyalty_transactions: ["ponto de fidelidade", "pontos de fidelidade"],
    client_occurrences: ["ocorrência de cliente", "ocorrências de cliente"],
    whatsapp_messages: ["mensagem de WhatsApp", "mensagens de WhatsApp"],
  };
  return nomes[colecao] ?? [colecao, colecao];
}
