"use client";

import { useState } from "react";
import { AlertTriangle, Check, Loader2, Percent } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTenant } from "@/lib/tenant-context";
import { patchTenant } from "@/lib/db/repository";
import { formatBRL } from "@/lib/format";
import type { TenantPaymentFees } from "@/lib/tenant";

/**
 * Configurações da barbearia.
 *
 * Nasce com as taxas de pagamento porque elas são a origem que falta para o
 * lucro ser verdade: `gatewayFeesTotal` estava fixo em zero, e a tela de
 * Financeiro exibia uma tabela de taxas de MERCADO que não afetava cálculo
 * nenhum — referência, não o que a barbearia paga.
 *
 * A taxa preenchida aqui é congelada em cada pagamento no momento da conclusão
 * do atendimento. Mudar o valor não altera o passado.
 */
const METODOS: Array<{
  chave: keyof TenantPaymentFees;
  label: string;
  ajuda: string;
}> = [
  { chave: "dinheiro", label: "Dinheiro", ajuda: "Normalmente 0% — não passa por maquininha." },
  { chave: "pix", label: "Pix", ajuda: "Cobrado por algumas maquininhas; direto na conta costuma ser 0%." },
  { chave: "debito", label: "Débito", ajuda: "Taxa por transação no débito." },
  { chave: "credito", label: "Crédito", ajuda: "Crédito à vista. Parcelado entra numa próxima versão." },
];

/** Exemplo em cima de um valor redondo — porcentagem sozinha não dá noção. */
const EXEMPLO = 100;

export default function ConfiguracoesPage() {
  const tenant = useTenant();
  const [taxas, setTaxas] = useState<TenantPaymentFees>(tenant.policies.paymentFees);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const naoConfigurado = Object.values(taxas).every((v) => v === 0);
  const mudou =
    JSON.stringify(taxas) !== JSON.stringify(tenant.policies.paymentFees);

  function alterar(chave: keyof TenantPaymentFees, valor: string) {
    // Vírgula é como se digita percentual em português.
    const n = Number(valor.replace(",", "."));
    const limpo = Number.isFinite(n) ? Math.min(Math.max(n, 0), 100) : 0;
    setTaxas((t) => ({ ...t, [chave]: limpo }));
    setSalvo(false);
  }

  async function salvar() {
    setSalvando(true);
    setErro(null);
    try {
      /* Caminho pontilhado: grava só `policies.paymentFees` e preserva as
       * demais políticas. Enviar `policies` inteiro sobrescreveria cancelamento,
       * comissão e alíquota com o que esta tela conhece. */
      await patchTenant(tenant.id, { "policies.paymentFees": taxas });
      setSalvo(true);
    } catch (e) {
      console.error("[configuracoes] falha ao salvar taxas", e);
      setErro("Não foi possível salvar. Verifique a conexão e tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 pt-1 md:gap-10 md:pt-2">
      <div>
        <p className="text-sm text-ivory-muted md:text-base">Ajustes</p>
        <h1 className="text-xl text-ivory md:text-4xl md:tracking-tight">Configurações</h1>
      </div>

      {naoConfigurado && (
        <Card className="flex items-start gap-3 border-danger/30 md:p-5">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-danger" />
          <div>
            <p className="text-sm text-ivory md:text-base">
              Suas taxas de maquininha ainda não foram informadas
            </p>
            <p className="text-xs text-ivory-muted md:text-sm">
              Enquanto estiverem em 0%, o DRE mostra o lucro sem descontar o que a
              maquininha cobra — e o número aparece maior do que é.
            </p>
          </div>
        </Card>
      )}

      <section className="grid gap-4 md:grid-cols-[1.4fr_1fr] md:gap-8">
        <Card className="flex flex-col gap-5 md:p-6">
          <div>
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ivory md:text-base">
              <Percent size={14} className="text-gold-light" />
              Taxas por forma de pagamento
            </h2>
            <p className="mt-1 text-xs text-ivory-muted md:text-sm">
              O que a sua maquininha cobra, não a média do mercado. Está no extrato
              ou no contrato dela.
            </p>
          </div>

          <div className="flex flex-col gap-4">
            {METODOS.map((m) => {
              const taxa = taxas[m.chave];
              const liquido = EXEMPLO - (EXEMPLO * taxa) / 100;
              return (
                <div key={m.chave} className="grid gap-2 md:grid-cols-[1fr_120px_auto] md:items-center">
                  <div>
                    <label htmlFor={`taxa-${m.chave}`} className="text-sm text-ivory">
                      {m.label}
                    </label>
                    <p className="text-xs text-ivory-muted">{m.ajuda}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      id={`taxa-${m.chave}`}
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      value={taxa}
                      onChange={(e) => alterar(m.chave, e.target.value)}
                      className="min-h-11 w-full rounded-xl border border-border bg-surface-raised px-3 text-sm text-ivory"
                    />
                    <span className="text-sm text-ivory-muted">%</span>
                  </div>
                  <p className="text-xs text-ivory-muted md:text-right">
                    {formatBRL(EXEMPLO)} viram{" "}
                    <span className="text-ivory">{formatBRL(liquido)}</span>
                  </p>
                </div>
              );
            })}
          </div>

          {erro && (
            <p role="alert" className="text-xs text-danger">
              {erro}
            </p>
          )}

          <div className="flex items-center gap-3">
            <Button onClick={salvar} disabled={salvando || !mudou}>
              {salvando ? <Loader2 size={16} className="animate-spin" /> : null}
              {salvando ? "Salvando…" : "Salvar taxas"}
            </Button>
            {salvo && !mudou && (
              <span className="flex items-center gap-1 text-xs text-success">
                <Check size={13} /> Salvo
              </span>
            )}
          </div>
        </Card>

        <Card className="flex flex-col gap-2 text-xs text-ivory-muted md:p-6 md:text-sm">
          <p className="font-medium text-ivory">Como a taxa é aplicada</p>
          <p>
            No momento em que você conclui um atendimento, o sistema guarda a taxa
            vigente junto com o pagamento.
          </p>
          <p>
            <strong className="text-ivory">Mudar a taxa não altera o passado.</strong>{" "}
            Se hoje o crédito é 3,49% e mês que vem virar 2,99%, os atendimentos já
            concluídos continuam com 3,49% — é o que você de fato pagou.
          </p>
          <p>
            O mesmo vale para a comissão do barbeiro: o percentual combinado no dia
            do atendimento é o que fica no histórico.
          </p>
        </Card>
      </section>
    </div>
  );
}
