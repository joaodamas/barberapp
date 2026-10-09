"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Check, Loader2, Shuffle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTenant } from "@/lib/tenant-context";
import { useStaff } from "@/lib/db/use-shop-data";
import { patchDoc, patchTenant } from "@/lib/db/repository";
import { soAvisaSeGravou } from "@/lib/so-avisa-se-gravou";
import { REGRAS, emOrdem, mover, regraDe, type RegraDeDistribuicao } from "@/lib/distribuicao";

/**
 * Distribuição de clientes — quem atende quando o cliente escolhe "Qualquer
 * barbeiro" no agendamento (05/10, pedido do dono).
 *
 * A regra fica em `policies.distribuicao`; a ordem de preferência é o `order`
 * de cada barbeiro, o mesmo campo que a agenda já usa para as colunas. Quem
 * aplica a regra é o servidor, no instante em que trava o horário.
 */
export function AjustesDistribuicao() {
  const tenant = useTenant();
  const { items: equipeToda } = useStaff();
  const equipe = emOrdem(equipeToda.filter((b) => b.active !== false));

  const regraGravada = regraDe(tenant.policies.distribuicao);
  const [regra, setRegra] = useState<RegraDeDistribuicao>(regraGravada);
  /* `null` = a ordem gravada; só vira lista quando o dono mexe. */
  const [ordem, setOrdem] = useState<string[] | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const idsEmOrdem = ordem ?? equipe.map((b) => b.id);
  const lista = idsEmOrdem
    .map((id) => equipe.find((b) => b.id === id))
    .filter((b): b is (typeof equipe)[number] => Boolean(b));
  const mudouOrdem = ordem !== null && ordem.some((id, i) => equipe[i]?.id !== id);
  const mudou = regra !== regraGravada || mudouOrdem;

  async function salvar() {
    setSalvando(true);
    setErro(null);
    const r = await soAvisaSeGravou({
      gravar: async () => {
        if (regra !== regraGravada) {
          await patchTenant(tenant.id, { "policies.distribuicao": regra });
        }
        if (mudouOrdem) {
          await Promise.all(
            lista.map((b, i) => patchDoc(tenant.id, "staff", b.id, { order: i + 1 }))
          );
        }
      },
      avisar: () => {
        setSalvo(true);
        setOrdem(null);
      },
    });
    setSalvando(false);
    if (!r.ok) setErro(r.erro);
  }

  return (
    <Card className="flex flex-col gap-5 md:p-6">
      <div>
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ink md:text-base">
          <Shuffle size={14} className="text-gold-strong" />
          Distribuição de clientes
        </h2>
        <p className="mt-1 text-xs text-ink-muted md:text-sm">
          Quando o cliente escolhe <strong className="text-ink">Qualquer barbeiro</strong> no
          agendamento, ele vê os horários livres de toda a equipe. Ao confirmar, o sistema
          escolhe quem atende por esta regra.
          {equipe.length < 2 && " A opção aparece para o cliente quando houver dois barbeiros ou mais."}
        </p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Regra de distribuição</legend>
        {REGRAS.map((r) => (
          <label
            key={r.id}
            className={
              "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors " +
              (regra === r.id ? "border-gold bg-gold/5" : "border-border hover:border-gold/50")
            }
          >
            <input
              type="radio"
              name="distribuicao"
              value={r.id}
              checked={regra === r.id}
              onChange={() => {
                setRegra(r.id);
                setSalvo(false);
              }}
              className="mt-0.5 h-4 w-4 accent-gold"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-medium text-ink">
                {r.titulo}
                {r.id === "equilibrio" && <span className="ml-1.5 text-xs font-normal text-ink-muted">(padrão)</span>}
              </span>
              <span className="text-xs text-ink-muted">{r.explicacao}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {(regra === "prioridade" || regra === "rodizio") && lista.length > 1 && (
        <div className="flex flex-col gap-2">
          <p className="text-[12.5px] font-medium text-ink-muted">
            {regra === "prioridade" ? "Ordem de preferência" : "Ordem do rodízio"}
          </p>
          <ol className="flex flex-col divide-y divide-border rounded-xl border border-border">
            {lista.map((b, i) => (
              <li key={b.id} className="flex items-center gap-3 px-3 py-2">
                <span className="w-5 text-right text-sm tabular-nums text-ink-muted">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{b.name}</span>
                <Button
                  variant="ghost"
                  aria-label={`Subir ${b.name}`}
                  disabled={i === 0}
                  className="min-h-9 px-2"
                  onClick={() => {
                    setOrdem(mover(idsEmOrdem, i, -1));
                    setSalvo(false);
                  }}
                >
                  <ArrowUp size={14} />
                </Button>
                <Button
                  variant="ghost"
                  aria-label={`Descer ${b.name}`}
                  disabled={i === lista.length - 1}
                  className="min-h-9 px-2"
                  onClick={() => {
                    setOrdem(mover(idsEmOrdem, i, 1));
                    setSalvo(false);
                  }}
                >
                  <ArrowDown size={14} />
                </Button>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button onClick={salvar} disabled={!mudou || salvando}>
          {salvando ? <Loader2 size={14} className="animate-spin" /> : null}
          Salvar distribuição
        </Button>
        {salvo && !mudou && (
          <span className="flex items-center gap-1 text-xs text-success">
            <Check size={14} /> Salvo
          </span>
        )}
        {erro && (
          <span role="alert" className="text-xs text-danger">
            {erro}
          </span>
        )}
      </div>
    </Card>
  );
}
