"use client";

import { useState } from "react";
import { AlertTriangle, Check, Clock, Loader2, Percent } from "lucide-react";
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

/** Limites do campo de tolerância: acima de 2h não é atraso, é outro dia. */
const TOLERANCIA_MIN = 0;
const TOLERANCIA_MAX = 120;

export default function ConfiguracoesPage() {
  const tenant = useTenant();

  /**
   * O formulário NÃO semeia do tenant — ele exibe o tenant até alguém digitar.
   *
   * `useState(tenant.policies…)` lê o valor uma vez, no primeiro render — e o
   * primeiro render acontece com a ficha que veio do servidor, cacheada por até
   * 300s. Quando o snapshot ao vivo chegasse com o valor real, o campo
   * continuaria mostrando o antigo, `mudou` viraria verdadeiro sozinho, e
   * salvar gravaria o valor velho POR CIMA do novo: a tela desfazendo a
   * própria mudança do dono, em silêncio.
   *
   * Com rascunho nulo, o campo segue a fonte viva. Assim que o dono digita, o
   * rascunho vence — e a chegada de um snapshot não puxa o texto debaixo do
   * dedo dele. Salvar limpa o rascunho e devolve o campo à fonte.
   */
  const [rascunhoTaxas, setRascunhoTaxas] = useState<TenantPaymentFees | null>(null);
  const [rascunhoTolerancia, setRascunhoTolerancia] = useState<number | null>(null);
  const [rascunhoComissao, setRascunhoComissao] = useState<number | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const taxas = rascunhoTaxas ?? tenant.policies.paymentFees;
  const tolerancia = rascunhoTolerancia ?? tenant.policies.booking.lateToleranceMinutes;
  const comissao = rascunhoComissao ?? tenant.policies.commissionSplit.barberPct;

  const naoConfigurado = Object.values(taxas).every((v) => v === 0);
  const mudou =
    JSON.stringify(taxas) !== JSON.stringify(tenant.policies.paymentFees) ||
    tolerancia !== tenant.policies.booking.lateToleranceMinutes ||
    comissao !== tenant.policies.commissionSplit.barberPct;

  function alterar(chave: keyof TenantPaymentFees, valor: string) {
    // Vírgula é como se digita percentual em português.
    const n = Number(valor.replace(",", "."));
    const limpo = Number.isFinite(n) ? Math.min(Math.max(n, 0), 100) : 0;
    setRascunhoTaxas({ ...taxas, [chave]: limpo });
    setSalvo(false);
  }

  function alterarTolerancia(valor: string) {
    const n = Number(valor);
    const limpo = Number.isFinite(n)
      ? Math.min(Math.max(Math.round(n), TOLERANCIA_MIN), TOLERANCIA_MAX)
      : tenant.policies.booking.lateToleranceMinutes;
    setRascunhoTolerancia(limpo);
    setSalvo(false);
  }

  /**
   * O padrão da casa — D1.
   *
   * `shopPct` é gravado junto e derivado, nunca digitado: dois campos livres
   * somando 100 é um convite a gravar 40/50 e ninguém saber qual manda. A
   * barbearia fica com o que sobra da comissão, por definição.
   */
  function alterarComissao(valor: string) {
    const n = Number(valor.replace(",", "."));
    const limpo = Number.isFinite(n) ? Math.min(Math.max(Math.round(n), 0), 100) : comissao;
    setRascunhoComissao(limpo);
    setSalvo(false);
  }

  async function salvar() {
    setSalvando(true);
    setErro(null);
    try {
      /* Caminho pontilhado: grava só o campo, e preserva o resto da política.
       * Enviar `policies` inteiro sobrescreveria cancelamento, comissão e
       * alíquota com o que esta tela conhece; enviar `policies.booking` inteiro
       * apagaria antecedência mínima e prazo de encaixe, que esta tela nem
       * exibe. */
      await patchTenant(tenant.id, {
        "policies.paymentFees": taxas,
        "policies.booking.lateToleranceMinutes": tolerancia,
        /* O objeto INTEIRO, e não dois caminhos pontilhados separados.
         *
         * `toTenant` faz spread RASO em `policies`, e só `booking` e
         * `paymentFees` têm merge próprio — o comentário de lá diz exatamente
         * por quê: *"toda política que for objeto e virar editável precisa
         * entrar aqui"*. Gravar `commissionSplit.barberPct` sozinho deixaria o
         * documento com metade do objeto e faria `shopPct` sumir na leitura,
         * que é o mesmo defeito que `policies.booking` produziu em produção em
         * 11/08. Gravando os dois campos juntos, o objeto no banco está sempre
         * completo e o spread raso continua correto — sem precisar mexer na
         * normalização, que é de outra frente. */
        "policies.commissionSplit": { barberPct: comissao, shopPct: 100 - comissao },
      });
      /* Rascunho descartado: o campo volta a seguir a fonte viva, que em
       * seguida chega pelo snapshot com exatamente o que acabou de ser gravado.
       * É o que faz o selo "Salvo" aparecer — antes, `mudou` continuava
       * verdadeiro porque a comparação era contra uma ficha que não atualizava,
       * e o dono nunca via confirmação nenhuma. */
      setRascunhoTaxas(null);
      setRascunhoTolerancia(null);
      setRascunhoComissao(null);
      setSalvo(true);
    } catch (e) {
      console.error("[configuracoes] falha ao salvar configurações", e);
      setErro("Não foi possível salvar. Verifique a conexão e tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 pt-1 md:gap-10 md:pt-2">
      {/* O menu tem DOIS nomes para esta rota — o pai "Ajustes" e o filho
          "Taxas e regras" — e a tela não usava nenhum dos dois: dizia
          "Configurações". Sobretítulo e título passam a ser exatamente esses
          dois, cada um no seu papel: o nome da área em cima como contexto não
          servia, porque contexto é o que a tela contém, e o nome é o título. */}
      <div>
        <p className="text-sm text-ivory-muted md:text-base">Taxas e regras</p>
        <h1 className="text-xl text-ivory md:text-4xl md:tracking-tight">Ajustes</h1>
      </div>

      {naoConfigurado && (
        <Card className="flex items-start gap-3 border-danger/30 md:p-5">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-danger" />
          <div>
            <p className="text-sm text-ivory md:text-base">
              Suas taxas de maquininha ainda não foram informadas
            </p>
            <p className="text-xs text-ivory-muted md:text-sm">
              Enquanto estiverem em 0%, o resultado do mês mostra o lucro sem
              descontar o que a maquininha cobra — e o número aparece maior do
              que é.
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

        <Card className="flex flex-col gap-5 md:p-6">
          <div>
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ivory md:text-base">
              <Clock size={14} className="text-gold-light" />
              Quando um atraso vira atraso
            </h2>
            <p className="mt-1 text-xs text-ivory-muted md:text-sm">
              Depois desse tempo, o painel avisa que o horário passou e a reserva
              continua em aberto — e oferece concluir ou marcar falta.
            </p>
          </div>

          <div className="grid gap-2 md:grid-cols-[1fr_120px_auto] md:items-center">
            <div>
              <label htmlFor="tolerancia" className="text-sm text-ivory">
                Tolerância de atraso
              </label>
              <p className="text-xs text-ivory-muted">
                Barbearia trabalha com atraso normal. Muito curto, tudo vira
                alerta e você para de ler a seção.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                id="tolerancia"
                type="number"
                min={TOLERANCIA_MIN}
                max={TOLERANCIA_MAX}
                step={5}
                value={tolerancia}
                onChange={(e) => alterarTolerancia(e.target.value)}
                className="min-h-11 w-full rounded-xl border border-border bg-surface-raised px-3 text-sm text-ivory"
              />
              <span className="text-sm text-ivory-muted">min</span>
            </div>
            <p className="text-xs text-ivory-muted md:text-right">
              14:00 avisa às{" "}
              <span className="text-ivory">
                {horaMaisMinutos("14:00", tolerancia)}
              </span>
            </p>
          </div>

          <p className="text-xs text-ivory-muted">
            Marcar falta é sempre uma decisão sua. O sistema aponta o que está em
            aberto e nunca fecha o dia decidindo sozinho quem faltou.
          </p>
        </Card>

        {/* O padrão da casa — D1.
            Três telas liam este percentual (Equipe, Loja, DRE) e NENHUMA o
            escrevia: a de Equipe dizia "em branco usa o padrão da barbearia
            (40%)" e o dono não tinha onde mudar os 40. */}
        <Card className="flex flex-col gap-5 md:p-6">
          <div>
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-ivory md:text-base">
              <Percent size={14} className="text-gold-light" />
              Comissão padrão da barbearia
            </h2>
            <p className="mt-1 text-xs text-ivory-muted md:text-sm">
              Vale para quem está no padrão da casa. Quem tem percentual próprio
              cadastrado em Equipe continua com o dele.
            </p>
          </div>

          <div className="grid gap-2 md:grid-cols-[1fr_120px_auto] md:items-center">
            <div>
              <label htmlFor="comissao" className="text-sm text-ivory">
                Fica com o barbeiro
              </label>
              <p className="text-xs text-ivory-muted">
                Sobre o valor do atendimento; na loja, sobre o lucro da venda.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                id="comissao"
                type="number"
                min={0}
                max={100}
                step={5}
                value={comissao}
                onChange={(e) => alterarComissao(e.target.value)}
                className="min-h-11 w-full rounded-xl border border-border bg-surface-raised px-3 text-sm text-ivory"
              />
              <span className="text-sm text-ivory-muted">%</span>
            </div>
            <p className="text-xs text-ivory-muted md:text-right">
              Num corte de {formatBRL(EXEMPLO)}:{" "}
              <span className="text-ivory">
                {formatBRL((EXEMPLO * comissao) / 100)}
              </span>{" "}
              para o barbeiro, {formatBRL((EXEMPLO * (100 - comissao)) / 100)} para
              a barbearia
            </p>
          </div>

          <p className="text-xs text-ivory-muted">
            Vale dos próximos atendimentos em diante. O percentual do dia do
            atendimento é o que fica no histórico — mudar aqui não reescreve
            acerto que já foi fechado.
          </p>
        </Card>
      </section>

      <div className="flex items-center gap-3">
        <Button onClick={salvar} disabled={salvando || !mudou}>
          {salvando ? <Loader2 size={16} className="animate-spin" /> : null}
          {salvando ? "Salvando…" : "Salvar alterações"}
        </Button>
        {salvo && !mudou && (
          <span className="flex items-center gap-1 text-xs text-success">
            <Check size={13} /> Salvo
          </span>
        )}
        {erro && (
          <p role="alert" className="text-xs text-danger">
            {erro}
          </p>
        )}
      </div>
    </div>
  );
}

/** "14:00" + 15 → "14:15". Percentual sozinho não dá noção; minuto solto também não. */
function horaMaisMinutos(hora: string, minutos: number) {
  const [h, m] = hora.split(":").map(Number);
  const total = h * 60 + m + minutos;
  const hh = String(Math.floor(total / 60) % 24).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}
