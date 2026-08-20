"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { putDoc, removeDoc } from "@/lib/db/repository";
import { usePlans } from "@/lib/db/use-shop-data";
import { useTenant } from "@/lib/tenant-context";
import { formatBRL } from "@/lib/format";

/**
 * O catálogo de planos de mensalista — o que a barbearia vende.
 *
 * ## Por que esta tela nasce
 *
 * `plans` era lido por todo mundo e **escrito por ninguém**: nem tela, nem
 * provisionamento. Uma barbearia nova nascia sem plano nenhum e não tinha como
 * criar um — o motor inteiro de mensalista (contratar, faturar, cobrir cota,
 * D2, D-3) existia sobre um catálogo que só podia ser preenchido por escrita
 * direta no banco.
 *
 * O produto chegava a admitir isso ao dono: o estado vazio de Mensalistas dizia
 * *"seus planos precisam estar cadastrados; fale com quem cuida da sua conta na
 * plataforma"* — mandava ligar para o suporte para vender o próprio serviço.
 *
 * ## A cota é o campo que muda o dinheiro
 *
 * `servicesIncluded` decide se o atendimento do mensalista sai coberto ou
 * cobrado, e é o que `decidirCobertura` conta na competência. Plano sem cota
 * **não cobre atendimento nenhum** — é plano de desconto, e a tela diz isso com
 * todas as letras, porque a diferença entre "4 cortes por mês" e "desconto no
 * avulso" é a diferença entre a barbearia receber e não receber pelo corte.
 */
type Rascunho = {
  id: string;
  name: string;
  price: number | string;
  priceAvulso: number | string;
  servicesIncluded: number | string;
  unlimited: boolean;
  description: string;
  active: boolean;
};

export function EditorDePlanos({ open, onClose }: { open: boolean; onClose: () => void }) {
  const tenant = useTenant();
  const { items: planos } = usePlans();
  const [rascunhos, setRascunhos] = useState<Record<string, Partial<Rascunho>>>({});
  const [salvando, setSalvando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [novos, setNovos] = useState<Rascunho[]>([]);

  const linhas: Rascunho[] = [
    ...planos.map((p) => ({
      id: p.id,
      name: p.name ?? "",
      price: p.price ?? 0,
      priceAvulso: p.priceAvulso ?? 0,
      servicesIncluded: p.servicesIncluded ?? 0,
      unlimited: Boolean(p.unlimited),
      description: p.description ?? "",
      active: p.active !== false,
      ...rascunhos[p.id],
    })),
    ...novos,
  ];

  function alterar(id: string, campo: keyof Rascunho, valor: unknown) {
    const jaExiste = novos.some((n) => n.id === id);
    if (jaExiste) {
      setNovos((prev) => prev.map((n) => (n.id === id ? { ...n, [campo]: valor } : n)));
      return;
    }
    setRascunhos((prev) => ({ ...prev, [id]: { ...prev[id], [campo]: valor } }));
  }

  async function salvar(linha: Rascunho) {
    if (!linha.name.trim()) return;
    setSalvando(linha.id);
    setErro(null);
    try {
      const cota = Number(linha.servicesIncluded) || 0;
      await putDoc(tenant.id, "plans", linha.id, {
        name: linha.name.trim(),
        price: Number(linha.price) || 0,
        priceAvulso: Number(linha.priceAvulso) || 0,
        description: linha.description.trim(),
        active: linha.active,
        /* Ilimitado e cota são excludentes: com `unlimited`, `decidirCobertura`
         * nem olha a cota. Gravar os dois deixaria o documento dizendo duas
         * coisas, e a leitura escolheria uma delas em silêncio. */
        unlimited: linha.unlimited,
        servicesIncluded: linha.unlimited ? 0 : cota,
      });
      setNovos((prev) => prev.filter((n) => n.id !== linha.id));
      setRascunhos((prev) => {
        const resto = { ...prev };
        delete resto[linha.id];
        return resto;
      });
    } catch (e) {
      console.error("[planos] falha ao salvar", e);
      setErro("Não foi possível salvar. Verifique a conexão e tente de novo.");
    } finally {
      setSalvando(null);
    }
  }

  async function remover(id: string) {
    if (novos.some((n) => n.id === id)) {
      setNovos((prev) => prev.filter((n) => n.id !== id));
      return;
    }
    try {
      await removeDoc(tenant.id, "plans", id);
    } catch (e) {
      console.error("[planos] falha ao remover", e);
      setErro("Não foi possível remover agora.");
    }
  }

  function adicionar() {
    setNovos((prev) => [
      ...prev,
      {
        id: `plano_${Date.now()}`,
        name: "",
        price: "",
        priceAvulso: "",
        servicesIncluded: "",
        unlimited: false,
        description: "",
        active: true,
      },
    ]);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Planos de mensalista"
      description="O que o cliente contrata quando vira mensalista"
      footer={
        <Button onClick={onClose} className="w-full">
          Fechar
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {linhas.length === 0 && (
          <p className="text-sm text-ink-muted">
            Nenhum plano ainda. Crie o primeiro abaixo — depois dele, o botão
            “Novo mensalista” já consegue contratar.
          </p>
        )}

        {linhas.map((p) => (
          <div key={p.id} className="flex flex-col gap-3 rounded-xl border border-border p-3">
            <div className="flex items-center gap-2">
              <input
                aria-label="Nome do plano"
                value={p.name}
                onChange={(e) => alterar(p.id, "name", e.target.value)}
                onBlur={() => salvar(p)}
                placeholder="Ex.: 4 cortes no mês"
                className="min-h-11 w-full rounded-xl border border-border bg-surface-raised px-3 text-sm text-ink"
              />
              <button
                type="button"
                aria-label={`Remover ${p.name || "plano"}`}
                onClick={() => remover(p.id)}
                className="shrink-0 rounded-lg p-2 text-ink-muted transition-colors hover:text-danger"
              >
                <Trash2 size={16} />
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <Campo
                label="Mensalidade"
                dica="O que ele paga por mês."
                valor={p.price}
                onChange={(v) => alterar(p.id, "price", v)}
                onBlur={() => salvar(p)}
              />
              <Campo
                label="Preço avulso de referência"
                dica="Usado para mostrar a economia ao cliente."
                valor={p.priceAvulso}
                onChange={(v) => alterar(p.id, "priceAvulso", v)}
                onBlur={() => salvar(p)}
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={p.unlimited}
                onChange={(e) => {
                  alterar(p.id, "unlimited", e.target.checked);
                  salvar({ ...p, unlimited: e.target.checked });
                }}
              />
              Atendimentos ilimitados
            </label>

            {!p.unlimited && (
              <div className="flex flex-col gap-1.5">
                <label className="text-sm text-ink">Atendimentos inclusos por mês</label>
                <input
                  type="number"
                  min={0}
                  value={p.servicesIncluded}
                  onChange={(e) => alterar(p.id, "servicesIncluded", e.target.value)}
                  onBlur={() => salvar(p)}
                  placeholder="0"
                  className="min-h-11 w-32 rounded-xl border border-border bg-surface-raised px-3 text-sm text-ink"
                />
                <p className="text-xs text-ink-muted">
                  {Number(p.servicesIncluded) > 0
                    ? `Do ${Number(p.servicesIncluded) + 1}º atendimento no mês em diante, ele paga o avulso.`
                    : "Zero significa que o plano NÃO cobre atendimento — é só desconto, e cada corte é cobrado."}
                </p>
              </div>
            )}

            {Number(p.price) > 0 && Number(p.priceAvulso) > 0 && !p.unlimited && Number(p.servicesIncluded) > 0 && (
              <p className="text-xs text-ink-muted">
                Cada atendimento sai a{" "}
                <span className="text-ink">
                  {formatBRL(Number(p.price) / Number(p.servicesIncluded))}
                </span>{" "}
                para ele — o avulso é {formatBRL(Number(p.priceAvulso))}.
              </p>
            )}

            {salvando === p.id && <p className="text-xs text-ink-muted">Salvando…</p>}
          </div>
        ))}

        <button
          type="button"
          onClick={adicionar}
          className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-dashed border-border text-sm text-ink-muted transition-colors hover:border-gold/40 hover:text-ink"
        >
          <Plus size={16} /> Adicionar plano
        </button>

        {erro && (
          <p role="alert" className="text-xs text-danger">
            {erro}
          </p>
        )}
      </div>
    </Modal>
  );
}

function Campo({
  label, dica, valor, onChange, onBlur,
}: {
  label: string;
  dica: string;
  valor: number | string;
  onChange: (v: string) => void;
  onBlur: () => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm text-ink">{label}</label>
      <div className="flex items-center gap-1.5 rounded-xl border border-border bg-surface-raised px-3 py-2.5 focus-within:border-gold/40">
        <span aria-hidden className="text-sm text-ink-muted">R$</span>
        <input
          aria-label={label}
          type="text"
          inputMode="decimal"
          value={valor}
          onChange={(e) => onChange(e.target.value.replace(",", "."))}
          onBlur={onBlur}
          placeholder="0,00"
          className="w-full bg-transparent text-sm text-ink outline-none"
        />
      </div>
      <p className="text-xs text-ink-muted">{dica}</p>
    </div>
  );
}
