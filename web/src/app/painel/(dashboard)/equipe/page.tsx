"use client";

import { useState } from "react";
import { Plus, Trash2, UserPlus, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { AcessoDoBarbeiro } from "@/components/equipe/acesso-do-barbeiro";
import { ConfirmarSaidaDoBarbeiro, type Acao } from "@/components/equipe/confirmar-saida-do-barbeiro";
import { EmptyState, LoadingRows } from "@/components/ui/empty-state";
import { ErroAoCarregar } from "@/components/ui/erro-ao-carregar";
import { useServices, useStaffComRemuneracao } from "@/lib/db/use-shop-data";
import { createDoc, patchDoc, putDoc } from "@/lib/db/repository";
import { proximaOrdem } from "@/lib/distribuicao";
import { mensagemDaFuncao } from "@/lib/mensagem-da-funcao";
import { deleteField } from "firebase/firestore";
import { useTenant } from "@/lib/tenant-context";
import { contarDeTotal, plural } from "@/lib/plural";
import { lerReais, reaisParaCampo, VALOR_ILEGIVEL } from "@/lib/reais";
import { NOME_DO_PLANO, PRECOS_POR_PLANO, barbeirosExtras, valorMensal } from "@/lib/tenant";
import { historicoDaMudanca } from "@/lib/folha";
import { mesAtual } from "@/lib/format";

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
 *
 * E uma que parece regra e é só aviso: **o teto do plano não bloqueia.** Cada
 * plano cobre um número de barbeiros ativos (`PRECOS_POR_PLANO`); acima dele,
 * cada um custa o extra por mês. Travar o botão tiraria da agenda o barbeiro
 * que o dono acabou de contratar — ele decide, a tela só diz o preço antes, e
 * quem cobra o excedente é o Hub.
 */
export default function EquipePage() {
  const tenant = useTenant();
  /* Do tenant, não da constante da plataforma: a barbearia que combinou 50/50
   * via 40% aqui e o split correto no DRE — duas telas, dois números. */
  const padraoDaCasa = tenant.policies.commissionSplit.barberPct;
  const { items: equipe, status, error } = useStaffComRemuneracao();
  const { items: servicos } = useServices();
  const [erro, setErro] = useState<string | null>(null);
  /* Salário que não deu para ler, por barbeiro. O campo fica com o que foi
   * digitado e com a mensagem — e nada é gravado até ele ser corrigido. */
  const [salarioIlegivel, setSalarioIlegivel] = useState<Record<string, boolean>>({});

  const ativos = equipe.filter((s) => s.active !== false);
  const soloRestante = ativos.length <= 1;

  const plano = tenant.plan;
  const preco = PRECOS_POR_PLANO[plano];
  const extras = barbeirosExtras(plano, ativos.length);
  /* Mais um ativo já passa do teto: é aqui que o aviso precisa vir ANTES do
   * clique, e não só depois, na conta. */
  const noTeto = ativos.length >= preco.tetoDeBarbeiros;
  const avisoDoExtra = `Acima do teto do plano: + R$ ${preco.barbeiroExtra}/mês por barbeiro extra`;

  async function adicionar() {
    setErro(null);
    try {
      await createDoc(tenant.id, "staff", {
        name: "",
        active: true,
        uid: null,
        serviceIds: [],
        schedule: null,
        /* Depois do maior, e não `length + 1`: depois de uma remoção, o
         * tamanho repete uma posição que já existe (08/10). */
        order: proximaOrdem(equipe),
      });
    } catch (e) {
      console.error("[equipe] falha ao adicionar", e);
      setErro("Não foi possível adicionar agora.");
    }
  }

  async function salvar(id: string, campo: string, valor: unknown) {
    setErro(null);
    try {
      /* Comissão e salário vão para `staff_pay`, que só o dono lê: na ficha
       * pública (`staff`) qualquer pessoa leria o salário do barbeiro. A
       * ficha antiga perde os campos na mesma gravação, para não ficar uma
       * cópia velha exposta. */
      /* Salário e entrada/saída gravam também o HISTÓRICO em `staff_pay`
       * (08/10): o DRE de cada mês usa o salário que valia naquele mês, e não
       * o de hoje. Ver `lib/folha.ts`. */
      const historico = historicoDaMudanca(equipe.find((s) => s.id === id), campo, valor, mesAtual());
      if (campo === "commissionPct" || campo === "salary") {
        await putDoc(tenant.id, "staffPay", id, { [campo]: valor, ...historico });
        await patchDoc(tenant.id, "staff", id, { [campo]: deleteField() });
      } else {
        await patchDoc(tenant.id, "staff", id, { [campo]: valor });
        if (historico) await putDoc(tenant.id, "staffPay", id, historico);
      }
      return true;
    } catch (e) {
      console.error("[equipe] falha ao salvar", e);
      setErro("Não foi possível salvar. Verifique a conexão.");
      return false;
    }
  }

  /* Remover passa pelo servidor (08/10). Apagar a ficha direto deixava a
   * conta do barbeiro com o papel, o `members`, o celular recebendo
   * notificação e o Telegram da cadeira ligado — `removerBarbeiro` desfaz o
   * acesso e só então apaga. As regras só deixam apagar direto a ficha sem
   * conta, e nem essa a tela usa: um caminho só. */
  const [removendo, setRemovendo] = useState<string | null>(null);
  /* Desligar e remover pedem confirmação, com o número de horários presos
   * (09/10): eram um toque, sem pergunta. */
  const [aConfirmar, setAConfirmar] = useState<{ id: string; acao: Acao } | null>(null);
  async function remover(id: string) {
    if (soloRestante || removendo) return false;
    setErro(null);
    setRemovendo(id);
    try {
      const { callFunction } = await import("@/lib/firebase");
      await callFunction("removerBarbeiro", { barbershopId: tenant.id, staffId: id });
      return true;
    } catch (e) {
      console.error("[equipe] falha ao remover", e);
      setErro(mensagemDaFuncao(e, "Não foi possível remover agora."));
      return false;
    } finally {
      setRemovendo(null);
    }
  }

  async function confirmarSaida() {
    if (!aConfirmar) return;
    const { id, acao } = aConfirmar;
    const ok = acao === "remover" ? await remover(id) : await salvar(id, "active", false);
    /* Falhou: o modal fica aberto e o erro aparece na tela, para tentar de novo. */
    if (ok) setAConfirmar(null);
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

      {status === "pronto" && equipe.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-ink">
            {contarDeTotal(ativos.length, preco.tetoDeBarbeiros, "barbeiro", "barbeiros")} no
            plano {NOME_DO_PLANO[plano]}
          </p>
          {extras > 0 && (
            <Card role="status" className="flex flex-col gap-1 border-gold/50 bg-gold/5">
              <p className="text-sm font-medium text-ink">{avisoDoExtra}.</p>
              <p className="text-xs text-ink-muted">
                Com {ativos.length} barbeiros atendendo, {extras}{" "}
                {plural(extras, "passa", "passam")} do teto de {preco.tetoDeBarbeiros}: a
                mensalidade vai de R$ {preco.mensal} para R$ {valorMensal(plano, ativos.length)}{" "}
                ({preco.mensal} + {extras} × {preco.barbeiroExtra}). A diferença vem na
                cobrança da plataforma. Quem não está atendendo pode ser desmarcado e
                deixa de contar.
              </p>
            </Card>
          )}
        </div>
      )}

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
                  onChange={(e) =>
                    e.target.checked
                      ? salvar(b.id, "active", true)
                      : setAConfirmar({ id: b.id, acao: "desligar" })
                  }
                  className="h-4 w-4 accent-[var(--color-gold)]"
                />
                Atendendo
              </label>

              <button
                type="button"
                aria-label={`Remover ${b.name || "barbeiro"}`}
                onClick={() => setAConfirmar({ id: b.id, acao: "remover" })}
                disabled={soloRestante || removendo === b.id}
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

            {b.active === false && noTeto && (
              <p className="-mt-2 text-xs font-medium text-ink">
                Ao marcar &quot;Atendendo&quot;: {avisoDoExtra}.
              </p>
            )}

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
                  {/* Texto + `lerReais`: `Number("1.500")` é 1,5, e
                      `Number("1.500,00") || 0` gravava ZERO por cima do
                      salário ao sair do campo. Em branco continua sendo
                      "só comissão" (0); ilegível não grava nada. */}
                  <input
                    type="text"
                    inputMode="decimal"
                    defaultValue={reaisParaCampo(b.salary)}
                    placeholder="0,00"
                    aria-invalid={salarioIlegivel[b.id] === true}
                    onBlur={(e) => {
                      const texto = e.target.value.trim();
                      const v = texto === "" ? 0 : lerReais(texto);
                      setSalarioIlegivel((atual) => ({ ...atual, [b.id]: v === null }));
                      if (v === null) return;
                      if (v !== (b.salary ?? 0)) salvar(b.id, "salary", v);
                    }}
                    className="min-h-11 w-32 rounded-xl border border-border bg-surface-raised px-3 text-sm text-ink"
                  />
                </div>
                {salarioIlegivel[b.id] && (
                  <p role="alert" className="text-xs text-danger">
                    {VALOR_ILEGIVEL} Nada foi salvo.
                  </p>
                )}
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

            <AcessoDoBarbeiro barbeiro={b} />
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
      {equipe.length > 0 && noTeto && (
        <p className="-mt-3 text-xs text-ink-muted md:-mt-5">
          O próximo barbeiro atendendo fica acima do teto do plano: + R${" "}
          {preco.barbeiroExtra}/mês por barbeiro extra.
        </p>
      )}

      {erro && (
        <p role="alert" className="text-sm text-danger">
          {erro}
        </p>
      )}

      {aConfirmar && equipe.some((s) => s.id === aConfirmar.id) && (
        <ConfirmarSaidaDoBarbeiro
          barbeiro={equipe.find((s) => s.id === aConfirmar.id)!}
          acao={aConfirmar.acao}
          trabalhando={removendo === aConfirmar.id}
          onConfirmar={() => void confirmarSaida()}
          onClose={() => setAConfirmar(null)}
        />
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
