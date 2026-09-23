"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { auth } from "@/lib/firebase";
import { mensagemDoErro } from "@/lib/direitos-do-titular";

/**
 * O cliente final apaga a própria conta.
 *
 * Não existia: as regras deixavam apagar `users/{uid}`, mas a conta de login e
 * o cadastro em cada barbearia ficavam. A conta global é dado de que o
 * CorteHub é controlador de fato — ninguém além da plataforma pode atender a
 * esse pedido, e por isso o botão é dele, e não um "peça à barbearia"
 * (`docs/LGPD-DIREITOS-DO-TITULAR.md` §1 e §3.3).
 *
 * "Conta excluída" só aparece com a resposta do servidor. Antes dela, a pessoa
 * não pode sair daqui achando que sumiu do sistema.
 */
export function ExcluirMinhaConta() {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [palavra, setPalavra] = useState("");
  const [executando, setExecutando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [excluida, setExcluida] = useState(false);

  async function excluir() {
    setExecutando(true);
    setErro(null);
    try {
      const { callFunction } = await import("@/lib/firebase");
      await callFunction<Record<string, never>, unknown>("excluirMinhaConta", {});
      setExcluida(true);
    } catch (e) {
      setErro(mensagemDoErro(e, { parcial: true }));
    } finally {
      setExecutando(false);
    }
  }

  async function sair() {
    /* A conta já não existe no servidor; isto só limpa a sessão guardada neste
     * aparelho. Se falhar, a sessão morre sozinha na próxima renovação. */
    await signOut(auth).catch(() => undefined);
    router.replace("/login");
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setAberto(true);
          setErro(null);
          setPalavra("");
        }}
        className="min-h-11 self-start text-sm text-danger transition-colors hover:text-danger/80"
      >
        Excluir minha conta
      </button>

      <Modal
        open={aberto}
        onClose={() => !executando && !excluida && setAberto(false)}
        title={excluida ? "Conta excluída" : "Excluir minha conta"}
        className="max-w-md"
        footer={
          excluida ? (
            <Button onClick={() => void sair()}>Fechar</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setAberto(false)} disabled={executando}>
                Cancelar
              </Button>
              <Button
                variant="danger"
                onClick={() => void excluir()}
                disabled={palavra !== "EXCLUIR" || executando}
              >
                {executando ? "Excluindo…" : "Excluir conta"}
              </Button>
            </>
          )
        }
      >
        {excluida ? (
          <p className="text-sm text-ink-muted">
            Seu login, seu perfil e seu nome e telefone em todas as barbearias foram
            apagados. Os valores dos atendimentos continuam no caixa delas, sem
            identificar você.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="rounded-xl border border-danger/30 bg-danger/5 px-3 py-2.5">
              <p className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-ink">
                <AlertTriangle size={14} className="text-danger" aria-hidden />
                Não dá para desfazer
              </p>
              <ul className="flex flex-col gap-0.5 text-sm text-ink-muted">
                <li>· Seu login e seu perfil são apagados.</li>
                <li>
                  · Em todas as barbearias onde você se atendeu, seu nome e telefone saem do
                  cadastro e do histórico.
                </li>
                <li>
                  · O valor de cada atendimento fica no caixa da barbearia, sem identificar
                  você — é registro que ela precisa guardar.
                </li>
                <li>· Seus carimbos de fidelidade se perdem.</li>
                <li>
                  · Se você tiver horário marcado ou plano de mensalista ativo, cancele antes.
                </li>
              </ul>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="confirmar-excluir-conta" className="text-sm text-ink">
                Para confirmar, digite <strong>EXCLUIR</strong>
              </label>
              <input
                id="confirmar-excluir-conta"
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
        )}
      </Modal>
    </>
  );
}
