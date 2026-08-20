"use client";

import { useState } from "react";
import { Plus, Trash2, UserPlus, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { EmptyState, LoadingRows } from "@/components/ui/empty-state";
import { ErroAoCarregar } from "@/components/ui/erro-ao-carregar";
import { useServices, useStaff } from "@/lib/db/use-shop-data";
import { createDoc, patchDoc, removeDoc } from "@/lib/db/repository";
import { useTenant } from "@/lib/tenant-context";
import { contarDeTotal } from "@/lib/plural";

/**
 * A equipe.
 *
 * Esta tela é o que destrava o produto para barbearia com mais de uma cadeira —
 * que é a maioria das que pagam mais. Até ela existir, o servidor aguentava N
 * barbeiros e ninguém conseguia criar o segundo.
 *
 * Duas regras de comportamento que parecem detalhe e não são:
 *
 * 1. **Nunca dá para ficar com zero barbeiros ativos.** A barbearia sem
 *    barbeiro não consegue receber reserva nenhuma, e o dono descobriria isso
 *    pelo cliente reclamando. O último ativo não pode ser desativado nem
 *    removido.
 * 2. **Serviços vazio significa TODOS.** Um barbeiro recém-cadastrado, sem nada
 *    marcado, precisa atender — senão ele nasce invisível na agenda e o dono
 *    acha que o sistema quebrou.
 */
export default function EquipePage() {
  const tenant = useTenant();
  /* Do tenant, não da constante da plataforma: a barbearia que combinou 50/50
   * via 40% aqui e o split correto no DRE — duas telas, dois números. */
  const padraoDaCasa = tenant.policies.commissionSplit.barberPct;
  const { items: equipe, status, error } = useStaff();
  const { items: servicos } = useServices();
  const [erro, setErro] = useState<string | null>(null);

  const ativos = equipe.filter((s) => s.active !== false);
  const soloRestante = ativos.length <= 1;

  async function adicionar() {
    setErro(null);
    try {
      await createDoc(tenant.id, "staff", {
        name: "",
        active: true,
        uid: null,
        serviceIds: [],
        commissionPct: null,
        schedule: null,
        order: equipe.length + 1,
      });
    } catch (e) {
      console.error("[equipe] falha ao adicionar", e);
      setErro("Não foi possível adicionar agora.");
    }
  }

  async function salvar(id: string, campo: string, valor: unknown) {
    setErro(null);
    try {
      await patchDoc(tenant.id, "staff", id, { [campo]: valor });
    } catch (e) {
      console.error("[equipe] falha ao salvar", e);
      setErro("Não foi possível salvar. Verifique a conexão.");
    }
  }

  async function remover(id: string) {
    if (soloRestante) return;
    setErro(null);
    try {
      await removeDoc(tenant.id, "staff", id);
    } catch (e) {
      console.error("[equipe] falha ao remover", e);
      setErro("Não foi possível remover agora.");
    }
  }

  function alternarServico(id: string, atuais: string[], serviceId: string) {
    const tem = atuais.includes(serviceId);
    salvar(id, "serviceIds", tem ? atuais.filter((s) => s !== serviceId) : [...atuais, serviceId]);
  }

  return (
    <div className="flex flex-col gap-6 pt-1 md:gap-8 md:pt-2">
      <div>
        <p className="text-sm text-ink-muted md:text-base">Quem atende</p>
        <h1 className="text-xl text-ink md:text-3xl md:tracking-tight">Equipe</h1>
        <p className="mt-1 max-w-2xl text-xs text-ink-muted md:text-sm">
          Com um barbeiro só, o cliente não escolhe nada — ele marca serviço e
          horário, como hoje. A partir do segundo, a escolha aparece sozinha no
          agendamento.
        </p>
      </div>

      {status === "carregando" && <LoadingRows rows={2} oQue="sua equipe" />}
      {status === "erro" && <ErroAoCarregar oQue="sua equipe" erro={error} />}

      {status === "pronto" && equipe.length === 0 && (
        <EmptyState
          icon={Users}
          title="Nenhum barbeiro cadastrado"
          description="Toda barbearia precisa de ao menos um para receber reservas. Normalmente ele é criado no cadastro — se sumiu, adicione agora."
          actionLabel="Adicionar barbeiro"
          onAction={adicionar}
        />
      )}

      {equipe.map((b) => {
        const marcados: string[] = b.serviceIds ?? [];
        const fazTudo = marcados.length === 0;
        const ehOUltimoAtivo = b.active !== false && soloRestante;

        return (
          <Card key={b.id} className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <input
                aria-label="Nome do barbeiro"
                defaultValue={b.name}
                placeholder="Nome do barbeiro"
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== b.name) salvar(b.id, "name", v);
                }}
                className="min-h-11 flex-1 rounded-xl border border-border bg-surface-raised px-4 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-gold"
              />

              <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-ink-muted">
                <input
                  type="checkbox"
                  checked={b.active !== false}
                  disabled={ehOUltimoAtivo}
                  onChange={(e) => salvar(b.id, "active", e.target.checked)}
                  className="h-4 w-4 accent-[var(--color-gold)]"
                />
                Atendendo
              </label>

              <button
                type="button"
                aria-label={`Remover ${b.name || "barbeiro"}`}
                onClick={() => remover(b.id)}
                disabled={soloRestante}
                title={
                  soloRestante
                    ? "A barbearia precisa de ao menos um barbeiro para receber reservas"
                    : undefined
                }
                className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl text-ink-muted transition-colors hover:bg-danger/10 hover:text-danger disabled:cursor-not-allowed disabled:opacity-30"
              >
                <Trash2 size={16} />
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-[200px_1fr]">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-ink-muted">
                  Comissão dele
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    defaultValue={b.commissionPct ?? ""}
                    placeholder={String(padraoDaCasa)}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      salvar(b.id, "commissionPct", v === "" ? null : Number(v));
                    }}
                    className="min-h-11 w-24 rounded-xl border border-border bg-surface-raised px-3 text-sm text-ink"
                  />
                  {/* Dizia "% do lucro", e a base da comissão de serviço é o
                      valor do atendimento. O rótulo errado aqui vira discussão
                      com o barbeiro no dia do acerto. */}
                  <span className="text-sm text-ink-muted">% do atendimento</span>
                </div>
                <p className="text-xs text-ink-muted">
                  Em branco usa o padrão da barbearia ({padraoDaCasa}%).
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-ink-muted">
                  Salário mensal
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-ink-muted">R$</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    defaultValue={b.salary ?? ""}
                    placeholder="0,00"
                    onBlur={(e) => {
                      const v = Math.max(Number(e.target.value) || 0, 0);
                      if (v !== (b.salary ?? 0)) salvar(b.id, "salary", v);
                    }}
                    className="min-h-11 w-32 rounded-xl border border-border bg-surface-raised px-3 text-sm text-ink"
                  />
                </div>
                <p className="text-xs text-ink-muted">
                  Fixo, além da comissão. Entra como custo de folha no resultado
                  do mês — deixe em branco para quem trabalha só por comissão.
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-ink-muted">
                  O que ele faz
                </label>
                <div className="flex flex-wrap gap-2">
                  {servicos.map((s) => {
                    const ativo = fazTudo || marcados.includes(s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        aria-pressed={ativo}
                        onClick={() => alternarServico(b.id, marcados, s.id)}
                        className={
                          "min-h-11 cursor-pointer rounded-xl border px-3 text-sm transition-colors " +
                          (ativo
                            ? "border-gold bg-gold/10 text-ink"
                            : "border-border text-ink-muted hover:border-gold/50 hover:text-ink")
                        }
                      >
                        {s.name}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-ink-muted">
                  {/* "Atende 1 de 1 serviços" na barbearia que acabou de
                      entrar — e ela SEMPRE começa com um serviço só. Na forma
                      X de Y quem manda na concordância é Y. */}
                  {fazTudo
                    ? "Nada marcado — ele atende todos os serviços."
                    : `Atende ${contarDeTotal(marcados.length, servicos.length, "serviço", "serviços")}.`}
                </p>
              </div>
            </div>

            {b.uid ? (
              <Pill tone="success">Tem acesso ao sistema</Pill>
            ) : (
              <p className="text-xs text-ink-muted">
                Sem acesso ao sistema — ele aparece na agenda, mas não entra no app.
              </p>
            )}
          </Card>
        );
      })}

      {equipe.length > 0 && (
        <button
          type="button"
          onClick={adicionar}
          className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border text-sm text-ink-muted transition-colors hover:border-gold/50 hover:text-ink"
        >
          <UserPlus size={16} /> Adicionar barbeiro
        </button>
      )}

      {erro && (
        <p role="alert" className="text-sm text-danger">
          {erro}
        </p>
      )}

      {ativos.length > 1 && (
        <Card className="flex flex-col gap-2 border-gold/30 bg-gold/5">
          <p className="text-sm font-medium text-ink">
            <Plus size={14} className="mr-1 inline" />O agendamento mudou
          </p>
          <p className="text-xs text-ink-muted">
            Com {ativos.length} barbeiros atendendo, o cliente agora escolhe com
            quem quer cortar. E a capacidade da agenda multiplicou: sua taxa de
            ocupação vai cair mesmo sem o movimento cair — são mais horários
            disponíveis para o mesmo número de clientes.
          </p>
        </Card>
      )}
    </div>
  );
}
