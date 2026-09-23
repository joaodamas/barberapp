"use client";

import { useState } from "react";
import { Check, Gift, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTenant } from "@/lib/tenant-context";
import { patchTenant } from "@/lib/db/repository";
import { soAvisaSeGravou } from "@/lib/so-avisa-se-gravou";

const META_MIN = 3;
const META_MAX = 30;

/**
 * O programa de fidelidade é uma promessa DO DONO ao cliente dele.
 *
 * Não havia onde configurá-lo, e toda barbearia exibia "faltam 10 para 1 corte
 * grátis" com o padrão da plataforma: um corte grátis prometido em nome de
 * quem nunca decidiu isso (rodada E2E de 23/09). Agora nasce desligado e só
 * aparece para o cliente quando o dono liga aqui, com a meta e a recompensa
 * que ele escolheu.
 *
 * Mudar a meta vale daqui em diante para o saldo de todo mundo — o saldo é a
 * soma dos carimbos, e a meta é só a régua. A tela diz isso.
 */
export function AjustesFidelidade() {
  const tenant = useTenant();
  const atual = tenant.policies.loyalty;
  const incluiNoPlano = tenant.features.loyalty === true;

  const [ligado, setLigado] = useState(atual.enabled);
  const [meta, setMeta] = useState(atual.stampsForReward);
  const [recompensa, setRecompensa] = useState(atual.reward);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const mudou =
    ligado !== atual.enabled || meta !== atual.stampsForReward || recompensa.trim() !== atual.reward;
  const valido = recompensa.trim().length >= 3 && meta >= META_MIN && meta <= META_MAX;

  async function salvar() {
    setSalvando(true);
    setErro(null);
    const r = await soAvisaSeGravou({
      /* O objeto inteiro: `toTenant` normaliza `loyalty` como um bloco, e
       * gravar campo a campo deixaria metade dele no banco. */
      gravar: () =>
        patchTenant(tenant.id, {
          "policies.loyalty": { enabled: ligado, stampsForReward: meta, reward: recompensa.trim() },
        }),
      avisar: () => setSalvo(true),
    });
    setSalvando(false);
    if (!r.ok) setErro(r.erro);
  }

  return (
    <Card className="flex flex-col gap-5 md:p-6">
      <div>
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ink md:text-base">
          <Gift size={14} className="text-gold-strong" />
          Programa de fidelidade
        </h2>
        <p className="mt-1 text-xs text-ink-muted md:text-sm">
          Cada atendimento concluído vale um carimbo. Desligado, o cliente não vê
          nada — nenhuma promessa é feita em seu nome.
        </p>
      </div>

      {!incluiNoPlano ? (
        <p className="rounded-lg bg-surface-raised p-3 text-xs text-ink-muted md:text-sm">
          O seu plano atual não inclui fidelidade.
        </p>
      ) : (
        <>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={ligado}
              onChange={(e) => {
                setLigado(e.target.checked);
                setSalvo(false);
              }}
              className="h-4 w-4 accent-gold"
            />
            Oferecer fidelidade aos meus clientes
          </label>

          {ligado && (
            <div className="grid gap-3 md:grid-cols-[140px_1fr]">
              <div className="flex flex-col gap-1">
                <label htmlFor="fidelidade-meta" className="text-xs text-ink-muted">
                  Carimbos para ganhar
                </label>
                <input
                  id="fidelidade-meta"
                  type="number"
                  min={META_MIN}
                  max={META_MAX}
                  value={meta}
                  onChange={(e) => {
                    const n = Math.round(Number(e.target.value));
                    setMeta(Number.isFinite(n) ? n : META_MIN);
                    setSalvo(false);
                  }}
                  className="min-h-11 rounded-xl border border-border bg-surface-raised px-3 text-sm text-ink"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="fidelidade-recompensa" className="text-xs text-ink-muted">
                  O que o cliente ganha
                </label>
                <input
                  id="fidelidade-recompensa"
                  type="text"
                  maxLength={60}
                  value={recompensa}
                  onChange={(e) => {
                    setRecompensa(e.target.value);
                    setSalvo(false);
                  }}
                  placeholder="1 corte grátis"
                  className="min-h-11 rounded-xl border border-border bg-surface-raised px-3 text-sm text-ink"
                />
              </div>
              <p className="text-xs text-ink-muted md:col-span-2">
                Quando o cliente completar, o app mostra &ldquo;{recompensa.trim() || "a recompensa"}
                &rdquo; liberado e pede que ele avise no balcão. Quem registra o resgate é
                você, na ficha do cliente em <strong className="text-ink">Clientes</strong>.
                Mudar a meta vale para o saldo de todos a partir de agora.
              </p>
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button onClick={salvar} disabled={!mudou || !valido || salvando}>
              {salvando ? <Loader2 size={14} className="animate-spin" /> : null}
              Salvar fidelidade
            </Button>
            {salvo && !mudou && (
              <span className="flex items-center gap-1 text-xs text-success">
                <Check size={14} /> Salvo
              </span>
            )}
          </div>
          {!valido && ligado && (
            <p className="text-xs text-danger">
              A meta vai de {META_MIN} a {META_MAX} carimbos, e a recompensa precisa de um nome.
            </p>
          )}
          {erro && (
            <p role="alert" className="text-xs text-danger">
              {erro}
            </p>
          )}
        </>
      )}
    </Card>
  );
}
