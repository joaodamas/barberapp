"use client";

import { useMemo, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { formatBRL } from "@/lib/format";
import { contar } from "@/lib/plural";
import { gravarEmLote, type OperacaoEmLote } from "@/lib/db/repository";
import { esperarServidorOuSeguir } from "@/lib/db/sem-esperar-servidor";
import { lerReais, reaisParaCampo, VALOR_ILEGIVEL } from "@/lib/reais";
import {
  alcance,
  aVencer,
  baseDaDescricao,
  dataCurta,
  parcelasDoGrupo,
  planoDeEdicaoDoGrupo,
  planoDeExclusao,
  planoDeNovoValor,
  type AtualizacaoDeParcela,
  type EscopoDoGrupo,
  type ParcelaInfo,
} from "@/lib/parcelamento";

type ItemParcelado = {
  id: string;
  date: string;
  description: string;
  category: string;
  value: number;
  parcela?: ParcelaInfo;
};

type Tela =
  | { tipo: "lista" }
  | { tipo: "editar" }
  | { tipo: "valor"; numero: number }
  | { tipo: "excluir"; numero: number };

const ESCOPOS: Array<{ valor: EscopoDoGrupo; rotulo: string }> = [
  { valor: "so_esta", rotulo: "Só esta parcela" },
  { valor: "esta_e_proximas", rotulo: "Esta e as próximas" },
  { valor: "todas", rotulo: "Todas as parcelas do grupo" },
];

const CAMPO = "rounded-controle border border-border bg-surface-raised px-3 py-2 text-sm text-ink";

/**
 * As parcelas de um lançamento, e o que se pode fazer com o grupo.
 *
 * Tudo acontece dentro do próprio modal — inclusive a confirmação de excluir.
 * As alterações do grupo vão num lote só (`gravarEmLote`): ou o grupo inteiro
 * muda, ou nada muda, e ele nunca fica com metade das parcelas no valor velho.
 *
 * O produto não tem fechamento de mês (D24). Então mexer em parcela de mês que
 * já passou é permitido, mas a confirmação AVISA que isso reescreve o resultado
 * (DRE) daquele mês.
 */
export function GrupoDeParcelas({
  grupoId,
  onClose,
  barbershopId,
  colecao,
  itens,
  categorias,
  hoje,
  substantivo,
  onAviso,
}: {
  /** `null` = fechado. */
  grupoId: string | null;
  onClose: () => void;
  barbershopId: string;
  colecao: "expenses" | "otherIncomes";
  itens: ItemParcelado[];
  categorias: string[];
  /** `AAAA-MM-DD`. */
  hoje: string;
  substantivo: "despesa" | "receita";
  /** Quando o servidor ainda não confirmou (offline) ou recusou depois: a tela avisa. */
  onAviso: (aviso: { tipo: "pendente" | "recusada"; texto: string } | null) => void;
}) {
  const [tela, setTela] = useState<Tela>({ tipo: "lista" });
  const [escopo, setEscopo] = useState<EscopoDoGrupo>("so_esta");
  const [descricao, setDescricao] = useState("");
  const [categoria, setCategoria] = useState("");
  const [valor, setValor] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const grupo = useMemo(() => (grupoId ? parcelasDoGrupo(itens, grupoId) : []), [itens, grupoId]);
  const base = grupo[0] ? baseDaDescricao(grupo[0].description) : "";
  const totalDoGrupo = grupo.reduce((s, p) => s + p.value, 0);
  const mesAtual = hoje.slice(0, 7);

  function fechar() {
    setTela({ tipo: "lista" });
    setErro(null);
    onClose();
  }

  function voltar() {
    setTela({ tipo: "lista" });
    setErro(null);
  }

  async function aplicar(operacoes: OperacaoEmLote[]) {
    if (operacoes.length === 0) return voltar();
    setSalvando(true);
    setErro(null);
    try {
      const { noServidor } = await gravarEmLote(barbershopId, colecao, operacoes);
      const situacao = await esperarServidorOuSeguir(noServidor);
      fechar();
      if (situacao === "pendente") {
        onAviso({
          tipo: "pendente",
          texto: `A alteração nas parcelas de "${base}" está guardada neste aparelho e vai sincronizar quando a conexão voltar.`,
        });
        noServidor.then(
          () => onAviso(null),
          (e) => {
            console.error("[parcelas] servidor recusou depois", e);
            onAviso({
              tipo: "recusada",
              texto: `A alteração nas parcelas de "${base}" não foi aceita pelo servidor e não foi salva. Tente de novo.`,
            });
          }
        );
      } else {
        onAviso(null);
      }
    } catch (error) {
      console.error("[parcelas] falha ao aplicar no grupo", error);
      setErro("Não foi possível salvar. Verifique a conexão e tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  const comoAtualizacoes = (planos: AtualizacaoDeParcela[]): OperacaoEmLote[] =>
    planos.map((p) => ({ tipo: "atualizar", id: p.id, dados: p.dados }));

  /* Parcelas de meses que já passaram dentro do que a ação alcança. */
  function mesesPassados(alvos: ItemParcelado[]) {
    return alvos.filter((p) => p.date.slice(0, 7) < mesAtual).length;
  }

  function avisoDeMesPassado(alvos: ItemParcelado[]) {
    const n = mesesPassados(alvos);
    if (n === 0) return null;
    return (
      <p role="note" className="rounded-controle border border-gold/40 bg-gold/5 p-3 text-xs text-ink">
        {contar(n, "parcela é", "parcelas são")} de meses que já passaram. Mudar isso reescreve o
        resultado (DRE) e o caixa daqueles meses.
      </p>
    );
  }

  function salvarEdicao() {
    if (!descricao.trim()) return setErro("Informe a descrição.");
    return aplicar(
      comoAtualizacoes(
        planoDeEdicaoDoGrupo(grupo, { descricaoBase: descricao.trim(), categoria })
      )
    );
  }

  function salvarValor(numero: number) {
    const v = lerReais(valor);
    if (v === null && valor.trim() !== "") return setErro(VALOR_ILEGIVEL);
    if (v === null || v <= 0) return setErro("Informe um valor maior que zero.");
    return aplicar(comoAtualizacoes(planoDeNovoValor(grupo, numero, v)));
  }

  function confirmarExclusao(numero: number) {
    const plano = planoDeExclusao(grupo, numero, escopo);
    return aplicar([
      ...plano.excluir.map((id): OperacaoEmLote => ({ tipo: "excluir", id })),
      ...comoAtualizacoes(plano.atualizar),
    ]);
  }

  const titulo = tela.tipo === "lista" ? `Parcelas · ${base}` : tela.tipo === "editar" ? "Editar o grupo" : tela.tipo === "valor" ? "Alterar valor" : "Excluir parcelas";

  let rodape: React.ReactNode = (
    <Button variant="ghost" onClick={fechar}>
      Fechar
    </Button>
  );
  let corpo: React.ReactNode = null;

  if (tela.tipo === "lista") {
    corpo = (
      <div className="flex flex-col gap-3">
        <p className="text-xs text-ink-muted">
          {contar(grupo.length, "parcela", "parcelas")} · total {formatBRL(totalDoGrupo)}
        </p>
        <ul className="flex flex-col divide-y divide-border">
          {grupo.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span className="flex items-center gap-2 text-ink">
                <span className="w-12 font-medium">{p.parcela!.numero}/{p.parcela!.total}</span>
                <span className="text-ink-muted">{dataCurta(p.date)}</span>
                {aVencer(p.date, hoje) && <Pill tone="gold">a vencer</Pill>}
              </span>
              <span className="flex items-center gap-1">
                <span className="mr-2 font-medium text-ink">{formatBRL(p.value)}</span>
                <button
                  type="button"
                  onClick={() => {
                    setValor(reaisParaCampo(p.value));
                    setErro(null);
                    setTela({ tipo: "valor", numero: p.parcela!.numero });
                  }}
                  className="min-h-11 px-2 text-xs text-gold-strong underline underline-offset-2 md:min-h-8"
                >
                  Alterar valor
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEscopo("so_esta");
                    setErro(null);
                    setTela({ tipo: "excluir", numero: p.parcela!.numero });
                  }}
                  className="min-h-11 px-2 text-xs text-danger underline underline-offset-2 md:min-h-8"
                >
                  Excluir
                </button>
              </span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-ink-muted">
          O sistema não registra qual parcela já foi paga: o que tem data de hoje em diante aparece
          como &quot;a vencer&quot;.
        </p>
      </div>
    );
    rodape = (
      <>
        <Button variant="ghost" onClick={fechar}>
          Fechar
        </Button>
        <Button
          onClick={() => {
            setDescricao(base);
            setCategoria(grupo[0]?.category ?? categorias[0]);
            setErro(null);
            setTela({ tipo: "editar" });
          }}
        >
          Editar descrição e categoria
        </Button>
      </>
    );
  } else if (tela.tipo === "editar") {
    corpo = (
      <div className="grid gap-3">
        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          Descrição (sem o &quot;3/10&quot;, que o sistema acrescenta)
          <input value={descricao} onChange={(e) => setDescricao(e.target.value)} className={CAMPO} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          Categoria
          <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className={CAMPO}>
            {[...new Set([categoria, ...categorias])].filter(Boolean).map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        <p className="text-xs text-ink-muted">Vale para as {grupo.length} parcelas do grupo.</p>
        {avisoDeMesPassado(grupo)}
      </div>
    );
    rodape = (
      <>
        <Button variant="ghost" onClick={voltar}>Voltar</Button>
        <Button onClick={salvarEdicao} disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</Button>
      </>
    );
  } else if (tela.tipo === "valor") {
    const alvos = alcance(grupo, tela.numero, "esta_e_proximas");
    corpo = (
      <div className="grid gap-3">
        <label className="flex flex-col gap-1 text-xs text-ink-muted">
          Novo valor de cada parcela (R$)
          <input
            type="text"
            inputMode="decimal"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            className={CAMPO}
          />
        </label>
        <p className="text-xs text-ink-muted">
          Vale para a parcela {tela.numero} e as próximas ({contar(alvos.length, "parcela", "parcelas")}).
          As anteriores ficam como estão.
        </p>
        {avisoDeMesPassado(alvos)}
      </div>
    );
    const numero = tela.numero;
    rodape = (
      <>
        <Button variant="ghost" onClick={voltar}>Voltar</Button>
        <Button onClick={() => salvarValor(numero)} disabled={salvando}>
          {salvando ? "Salvando…" : "Alterar"}
        </Button>
      </>
    );
  } else {
    const numero = tela.numero;
    const alvos = alcance(grupo, numero, escopo);
    corpo = (
      <div className="grid gap-3">
        <div role="radiogroup" aria-label="O que excluir" className="flex flex-col gap-1">
          {ESCOPOS.map((e) => (
            <label key={e.valor} className="flex min-h-11 items-center gap-2 text-sm text-ink">
              <input
                type="radio"
                name="escopo-exclusao"
                checked={escopo === e.valor}
                onChange={() => setEscopo(e.valor)}
                className="h-4 w-4 accent-gold"
              />
              {e.rotulo}
            </label>
          ))}
        </div>
        <p className="text-sm text-ink-muted">
          Vai excluir {contar(alvos.length, "parcela", "parcelas")}, {formatBRL(alvos.reduce((s, p) => s + p.value, 0))} no
          total. Não dá para desfazer.
        </p>
        {avisoDeMesPassado(alvos)}
      </div>
    );
    rodape = (
      <>
        <Button variant="ghost" onClick={voltar}>Manter</Button>
        <Button
          className="bg-danger text-white hover:bg-danger/90"
          onClick={() => confirmarExclusao(numero)}
          disabled={salvando}
        >
          {salvando ? "Excluindo…" : "Excluir"}
        </Button>
      </>
    );
  }

  return (
    <Modal
      open={grupoId !== null && grupo.length > 0}
      onClose={fechar}
      title={titulo}
      description={substantivo === "despesa" ? "Despesa parcelada" : "Receita parcelada"}
      className="max-w-xl"
      footer={rodape}
    >
      {corpo}
      {erro && (
        <p role="alert" className="mt-3 text-xs text-danger">
          {erro}
        </p>
      )}
    </Modal>
  );
}
