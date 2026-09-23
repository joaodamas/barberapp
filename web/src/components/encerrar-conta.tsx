"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useTenant } from "@/lib/tenant-context";
import {
  dataDoExpurgo,
  dataPorExtenso,
  DIAS_ATE_O_EXPURGO,
  mensagemDoErro,
} from "@/lib/direitos-do-titular";

/**
 * O dono encerra a conta da barbearia — e pode se arrepender dentro da janela.
 *
 * `encerrarConta` existia desde 12/08 e nenhuma tela o chamava: os Termos
 * prometiam "você pode encerrar quando quiser" e "30 dias para exportar", sem
 * botão para o primeiro nem gatilho para o segundo (P0-4).
 *
 * ## O que a tela diz, e quando
 *
 * A janela de 30 dias é explicada ANTES do clique — é ela que faz o encerramento
 * ser reversível, e quem não sabe disso não encerra, ou encerra em pânico. A
 * data do expurgo só aparece DEPOIS de o servidor responder, e vem da resposta
 * ou do documento vivo, nunca de uma conta feita aqui antes da gravação
 * (`soAvisaSeGravou`).
 *
 * O botão fica fora do modo leitura de propósito: a conta suspensa por
 * inadimplência também pode ser encerrada, e é justamente quem mais precisa.
 */
export function EncerrarConta() {
  const tenant = useTenant();
  /* `reaberta` cobre o instante entre a resposta do servidor e a chegada do
   * snapshot: sem ela, a tela mostraria "conta encerrada" logo depois de o
   * dono ler que reabriu. */
  const [reaberta, setReaberta] = useState(false);
  const encerrada = tenant.status === "encerrada" && !reaberta;

  const [aberto, setAberto] = useState(false);
  const [palavra, setPalavra] = useState("");
  const [motivo, setMotivo] = useState("");
  const [executando, setExecutando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  /* A resposta do servidor. O documento vivo também muda, mas a resposta chega
   * primeiro — e é ela que prova que gravou. */
  const [expurgoEm, setExpurgoEm] = useState<string | null>(null);

  const dataPrometida = expurgoEm ? new Date(expurgoEm) : dataDoExpurgo(tenant.encerradaEmMs);

  async function encerrar() {
    setExecutando(true);
    setErro(null);
    try {
      const { callFunction } = await import("@/lib/firebase");
      const r = await callFunction<
        { barbershopId: string; motivo?: string },
        { expurgoEm: string }
      >("encerrarConta", {
        barbershopId: tenant.id,
        ...(motivo.trim() ? { motivo: motivo.trim() } : {}),
      });
      setExpurgoEm(r.expurgoEm);
      setReaberta(false);
      setPalavra("");
    } catch (e) {
      setErro(mensagemDoErro(e));
    } finally {
      setExecutando(false);
    }
  }

  async function reabrir() {
    setExecutando(true);
    setErro(null);
    try {
      const { callFunction } = await import("@/lib/firebase");
      await callFunction<{ barbershopId: string }, { reaberta: boolean }>("reabrirConta", {
        barbershopId: tenant.id,
      });
      setExpurgoEm(null);
      setReaberta(true);
      setAberto(false);
    } catch (e) {
      setErro(mensagemDoErro(e));
    } finally {
      setExecutando(false);
    }
  }

  if (encerrada || expurgoEm) {
    return (
      <div className="flex flex-col gap-3">
        <div className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2.5 text-sm text-ink">
          <p className="font-medium">Conta encerrada</p>
          <p className="text-ink-muted">
            {dataPrometida ? (
              <>
                Os dados desta barbearia serão excluídos a partir de{" "}
                <strong className="text-ink">{dataPorExtenso(dataPrometida)}</strong>. Até lá
                o painel fica em modo leitura, e dá para exportar o que precisar.
              </>
            ) : (
              /* Sem data confiável, não inventa uma. */
              "Os dados desta barbearia serão excluídos ao fim da janela de exportação. Até lá o painel fica em modo leitura."
            )}
          </p>
        </div>
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <p className="text-xs text-ink-muted md:text-sm">
            Mudou de ideia? Reabrir devolve a conta ao estado em que estava.
          </p>
          <Button
            variant="secondary"
            onClick={() => void reabrir()}
            disabled={executando}
            className="shrink-0"
          >
            {executando ? "Reabrindo…" : "Reabrir conta"}
          </Button>
        </div>
        {erro && (
          <p role="alert" className="text-sm text-danger">
            {erro}
          </p>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm text-ink">Encerrar a conta da barbearia</p>
          <p className="text-xs text-ink-muted md:text-sm">
            Você tem {DIAS_ATE_O_EXPURGO} dias para exportar e para mudar de ideia. Depois
            disso os dados são excluídos.
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={() => {
            setAberto(true);
            setErro(null);
            setPalavra("");
          }}
          className="shrink-0"
        >
          Encerrar conta
        </Button>
      </div>

      <Modal
        open={aberto}
        onClose={() => !executando && setAberto(false)}
        title="Encerrar a conta"
        description={`Nada é apagado hoje. A exclusão acontece ${DIAS_ATE_O_EXPURGO} dias depois.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAberto(false)} disabled={executando}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={() => void encerrar()}
              disabled={palavra !== "ENCERRAR" || executando}
            >
              {executando ? "Encerrando…" : "Encerrar conta"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <div className="rounded-xl border border-danger/30 bg-danger/5 px-3 py-2.5">
            <p className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-ink">
              <AlertTriangle size={14} className="text-danger" aria-hidden />O que acontece
            </p>
            <ul className="flex flex-col gap-0.5 text-sm text-ink-muted">
              <li>· Hoje: o painel entra em modo leitura. Você continua vendo tudo.</li>
              <li>
                · Durante {DIAS_ATE_O_EXPURGO} dias: dá para exportar os dados dos clientes e
                reabrir a conta, se mudar de ideia.
              </li>
              <li>
                · Depois: agenda, clientes, equipe e o endereço (subdomínio) da barbearia são excluídos, e
                as contas de acesso da equipe perdem o vínculo.
              </li>
              <li>
                · Os registros fiscais (pagamentos, comissões, despesas) ficam guardados pelo
                prazo da lei, sem nome nem telefone de ninguém.
              </li>
            </ul>
          </div>

          <label className="flex flex-col gap-1 text-sm text-ink">
            Por que está saindo? (opcional)
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              maxLength={500}
              rows={2}
              className="rounded-xl border border-border bg-surface-raised px-3 py-2 text-sm text-ink"
            />
          </label>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="confirmar-encerrar" className="text-sm text-ink">
              Para confirmar, digite <strong>ENCERRAR</strong>
            </label>
            <input
              id="confirmar-encerrar"
              type="text"
              value={palavra}
              autoComplete="off"
              onChange={(e) => setPalavra(e.target.value.toUpperCase())}
              className="min-h-11 rounded-xl border border-border bg-surface-raised px-3 text-sm text-ink"
            />
          </div>

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
