"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { putDoc, removeDoc, subscribeToCollection } from "@/lib/db/repository";
import type { ServiceDoc } from "@/lib/domain";

/**
 * Tabela editável do cardápio da barbearia.
 *
 * Vivia dentro do passo 3 do onboarding, e era o único lugar do produto que
 * escrevia em `services`. Quem terminava o onboarding perdia o acesso: mudar o
 * preço do corte exigia voltar ao wizard pela barra de endereço, ou editar o
 * Firestore na mão. Preço de barbearia muda — a edição precisa morar no painel.
 *
 * Salva no `blur` de cada campo, e não num botão "Salvar" no fim: a tabela é
 * uma lista de documentos independentes, e um botão único faria o dono achar
 * que perdeu tudo ao sair da tela sem clicar.
 */
export type Servico = ServiceDoc & { id: string };

export function EditorDeServicos({
  barbershopId,
  permiteDesativar = false,
  onChange,
}: {
  barbershopId: string;
  /** Só o painel desativa: no onboarding todo serviço nasce visível. */
  permiteDesativar?: boolean;
  onChange?: (servicos: Servico[]) => void;
}) {
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [status, setStatus] = useState<"carregando" | "pronto" | "erro">("carregando");
  const [erroDeEscrita, setErroDeEscrita] = useState<string | null>(null);
  const [aExcluir, setAExcluir] = useState<Servico | null>(null);

  useEffect(
    () =>
      subscribeToCollection<ServiceDoc>(barbershopId, "services", {
        onData: (items) => {
          const lista = items as Servico[];
          setServicos(lista);
          setStatus("pronto");
          onChange?.(lista);
        },
        onError: (e) => {
          console.error("[servicos] falha ao carregar", e);
          setStatus("erro");
        },
      }),
    // `onChange` fica de fora de propósito: uma função nova a cada render do
    // pai recriaria a assinatura do Firestore a cada frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [barbershopId]
  );

  /** Edição otimista na tela; o Firestore confirma no blur. */
  function atualizar(id: string, campo: keyof Servico, valor: string) {
    setServicos((prev) =>
      prev.map((s) =>
        s.id === id
          ? { ...s, [campo]: campo === "name" ? valor : Math.max(0, Number(valor) || 0) }
          : s
      )
    );
  }

  async function salvarLinha(servico: Servico) {
    // Nome vazio é linha recém-criada que o dono ainda não preencheu.
    if (!servico.name.trim()) return;
    try {
      setErroDeEscrita(null);
      await putDoc(barbershopId, "services", servico.id, {
        name: servico.name.trim(),
        durationMin: Math.max(servico.durationMin, 5),
        price: servico.price,
        active: servico.active !== false,
      });
    } catch (e) {
      console.error("[servicos] falha ao salvar", e);
      setErroDeEscrita(`Não foi possível salvar "${servico.name}". Verifique a conexão.`);
    }
  }

  async function alternarVisibilidade(servico: Servico) {
    const proximo = servico.active === false;
    setServicos((prev) =>
      prev.map((s) => (s.id === servico.id ? { ...s, active: proximo } : s))
    );
    try {
      setErroDeEscrita(null);
      await putDoc(barbershopId, "services", servico.id, { active: proximo });
    } catch (e) {
      console.error("[servicos] falha ao alternar", e);
      setErroDeEscrita("Não foi possível mudar a visibilidade. Tente de novo.");
      setServicos((prev) =>
        prev.map((s) => (s.id === servico.id ? { ...s, active: !proximo } : s))
      );
    }
  }

  async function excluir(servico: Servico) {
    setAExcluir(null);
    try {
      setErroDeEscrita(null);
      await removeDoc(barbershopId, "services", servico.id);
    } catch (e) {
      console.error("[servicos] falha ao excluir", e);
      setErroDeEscrita(`Não foi possível excluir "${servico.name}".`);
    }
  }

  function adicionar() {
    void putDoc(barbershopId, "services", `serv_${Date.now()}`, {
      name: "",
      durationMin: 30,
      price: 0,
      active: true,
    }).catch((e) => {
      console.error("[servicos] falha ao adicionar", e);
      setErroDeEscrita("Não foi possível adicionar. Verifique a conexão.");
    });
  }

  const colunas = permiteDesativar
    ? "md:grid-cols-[1fr_110px_120px_44px_44px]"
    : "md:grid-cols-[1fr_110px_120px_44px]";

  if (status === "erro") {
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl border border-danger/30 bg-danger/5 p-4">
        <p className="text-sm text-ivory">Não foi possível carregar seus serviços.</p>
        <p className="text-xs text-ivory-muted">
          Pode ser conexão ou permissão. O cardápio segue como está para quem já
          o viu — nada foi perdido.
        </p>
        <Button variant="ghost" onClick={() => window.location.reload()}>
          Tentar de novo
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        className={`hidden gap-3 px-1 text-xs uppercase tracking-wide text-ivory-muted md:grid ${colunas}`}
      >
        <span>Serviço</span>
        <span>Duração</span>
        <span>Preço</span>
        {permiteDesativar && <span>Visível</span>}
        <span />
      </div>

      {status === "carregando" && (
        <div className="h-11 animate-pulse rounded-xl bg-surface-raised" />
      )}

      {servicos.map((s) => {
        const oculto = s.active === false;
        return (
          <div key={s.id} className={`grid gap-2 md:items-center ${colunas}`}>
            <input
              aria-label="Nome do serviço"
              value={s.name}
              onChange={(e) => atualizar(s.id, "name", e.target.value)}
              onBlur={() => salvarLinha(s)}
              placeholder="Corte"
              className={`rounded-xl border border-border bg-surface-raised px-3 py-2.5 text-sm ${
                oculto ? "text-ivory-muted line-through" : "text-ivory"
              }`}
            />
            <div className="flex items-center gap-2">
              <input
                aria-label="Duração em minutos"
                type="number"
                min={5}
                step={5}
                value={s.durationMin}
                onChange={(e) => atualizar(s.id, "durationMin", e.target.value)}
                onBlur={() => salvarLinha(s)}
                className="w-full rounded-xl border border-border bg-surface-raised px-3 py-2.5 text-sm text-ivory"
              />
              <span className="text-xs text-ivory-muted md:hidden">min</span>
            </div>
            <input
              aria-label="Preço"
              type="number"
              min={0}
              step="0.01"
              value={s.price || ""}
              onChange={(e) => atualizar(s.id, "price", e.target.value)}
              onBlur={() => salvarLinha(s)}
              placeholder="0,00"
              className="rounded-xl border border-border bg-surface-raised px-3 py-2.5 text-sm text-ivory"
            />

            {permiteDesativar && (
              <button
                type="button"
                aria-label={
                  oculto ? `Mostrar ${s.name} no app` : `Ocultar ${s.name} do app`
                }
                aria-pressed={!oculto}
                title={
                  oculto
                    ? "Oculto — o cliente não vê nem consegue agendar"
                    : "Visível para o cliente"
                }
                onClick={() => alternarVisibilidade(s)}
                className={`flex h-11 w-11 items-center justify-center rounded-xl transition-colors ${
                  oculto
                    ? "text-ivory-muted hover:bg-surface-raised hover:text-ivory"
                    : "text-success hover:bg-success/10"
                }`}
              >
                {oculto ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            )}

            <button
              type="button"
              aria-label={`Remover ${s.name || "serviço sem nome"}`}
              onClick={() => setAExcluir(s)}
              className="flex h-11 w-11 items-center justify-center rounded-xl text-ivory-muted transition-colors hover:bg-danger/10 hover:text-danger"
            >
              <Trash2 size={16} />
            </button>
          </div>
        );
      })}

      <button
        type="button"
        onClick={adicionar}
        className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-dashed border-border text-sm text-ivory-muted transition-colors hover:border-gold/50 hover:text-ivory"
      >
        <Plus size={16} /> Adicionar serviço
      </button>

      {erroDeEscrita && (
        <p role="alert" className="text-xs text-danger">
          {erroDeEscrita}
        </p>
      )}

      <Modal
        open={!!aExcluir}
        onClose={() => setAExcluir(null)}
        title="Excluir serviço"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAExcluir(null)}>
              Cancelar
            </Button>
            <Button onClick={() => aExcluir && excluir(aExcluir)}>Excluir</Button>
          </>
        }
      >
        <p className="text-sm text-ivory">
          Excluir <strong>{aExcluir?.name || "este serviço"}</strong> do cardápio?
        </p>
        <p className="mt-2 text-xs text-ivory-muted">
          As reservas já feitas continuam como estão. Se a ideia é só tirar do app
          por um tempo, ocultar preserva o histórico e é reversível num clique.
        </p>
      </Modal>
    </div>
  );
}
