import { LineChart } from "@/components/ui/chart";

/**
 * Pedaços REAIS do produto, não imagem de produto.
 *
 * A tentação seria colocar um mockup bonito. Mas mockup envelhece no dia
 * seguinte ao primeiro ajuste de tela, e o visitante percebe quando o que ele
 * vê na página não é o que ele encontra dentro. Estes blocos usam os mesmos
 * tokens, as mesmas fontes e o mesmo componente de gráfico do painel — se o
 * produto mudar, a vitrine muda junto.
 *
 * Os números são os da barbearia de referência, não redondos de propósito:
 * "R$ 12.469" é verdade e "R$ 12.000" é enfeite, e a diferença entre os dois é
 * exatamente o que separa uma página que parece feita por gente de uma que
 * parece gerada.
 */

/** Uma linha da agenda do dia, como ela é no painel. */
export function AgendaDoDia() {
  const linhas = [
    { hora: "09:00", cliente: "Marcos Andrade", servico: "Corte + barba", valor: "R$ 90,00", situacao: "Concluído" },
    { hora: "09:40", cliente: "Rafael Pinto", servico: "Corte", valor: "R$ 60,00", situacao: "Concluído" },
    { hora: "10:20", cliente: "Vitor Salles", servico: "Barba", valor: "R$ 35,00", situacao: "Confirmado" },
    { hora: "11:00", cliente: "Diego Prado", servico: "Corte + sobrancelha", valor: "R$ 70,00", situacao: "Aguardando" },
  ];

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-lg)]">
      <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
        <p className="text-xs font-semibold uppercase tracking-wider text-ivory-muted">
          Agenda do dia
        </p>
        <p className="font-display text-sm text-ivory">R$ 255,00 previstos</p>
      </div>
      <table className="w-full text-sm">
        <tbody>
          {linhas.map((l) => (
            <tr key={l.hora} className="border-b border-border/60 last:border-0">
              <td className="whitespace-nowrap px-5 py-3 font-display text-gold-light">{l.hora}</td>
              <td className="px-2 py-3 text-ivory">{l.cliente}</td>
              <td className="hidden px-2 py-3 text-ivory-muted sm:table-cell">{l.servico}</td>
              <td className="whitespace-nowrap px-2 py-3 text-right text-ivory">{l.valor}</td>
              <td className="px-5 py-3 text-right">
                <span
                  className={
                    "inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs " +
                    (l.situacao === "Concluído"
                      ? "bg-success/10 text-success"
                      : l.situacao === "Confirmado"
                        ? "bg-gold/10 text-gold-light"
                        : "bg-surface-raised text-ivory-muted")
                  }
                >
                  {l.situacao}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** O DRE, resumido ao que o dono realmente lê. */
export function ResumoDoMes() {
  const linhas = [
    { rotulo: "Faturamento", valor: "R$ 12.469", tom: "text-ivory" },
    { rotulo: "Custo variável", valor: "− R$ 3.104", tom: "text-ivory-muted" },
    { rotulo: "Despesa fixa", valor: "− R$ 4.953", tom: "text-ivory-muted" },
  ];
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-md)]">
      <p className="text-xs font-semibold uppercase tracking-wider text-ivory-muted">
        Resultado do mês
      </p>
      <div className="flex flex-col gap-2">
        {linhas.map((l) => (
          <div key={l.rotulo} className="flex items-baseline justify-between text-sm">
            <span className="text-ivory-muted">{l.rotulo}</span>
            <span className={l.tom}>{l.valor}</span>
          </div>
        ))}
      </div>
      <div className="mt-1 flex items-baseline justify-between border-t border-border pt-3">
        <span className="text-sm text-ivory">Sobrou</span>
        <span className="font-display text-2xl text-success">R$ 7.516</span>
      </div>
      <p className="text-xs text-ivory-muted">
        Ponto de equilíbrio no <strong className="text-ivory">dia 17</strong> — a
        partir dele, o mês vira lucro.
      </p>
    </div>
  );
}

/** A projeção, com o zero por cima. */
export function ProjecaoCurta() {
  const dados = [
    -1240, -980, -1510, -820, -140, 470, 210, 830, 1490, 1120,
    1880, 2540, 2210, 2960, 3610, 3380, 4120, 4790, 4530, 5240,
  ].map((value, i) => ({ label: `dia ${i + 1}`, value }));

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-md)]">
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-ivory-muted">
          Projeção de caixa
        </p>
        <p className="font-display text-lg text-ivory">R$ 5.240</p>
      </div>
      <LineChart
        height={120}
        desenhar
        label="Saldo acumulado projetado para os próximos 20 dias."
        data={dados}
      />
      <p className="text-xs text-ivory-muted">
        A linha tracejada é o zero. Você vê o dia em que o caixa vira antes de
        ele virar.
      </p>
    </div>
  );
}

/** Mapa de calor de ocupação — o elemento visual mais forte do painel. */
export function MapaDeCalor() {
  const dias = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const horas = ["09", "10", "11", "12", "14", "15", "16", "17", "18"];
  // Padrão fixo: sábado cheio, meio de semana à tarde vazio. É como uma
  // barbearia de verdade se comporta, e é o que a tela revela ao dono.
  const ocupacao = [
    [40, 60, 30, 20, 10, 30, 50, 40, 20],
    [30, 50, 40, 20, 20, 40, 60, 50, 30],
    [50, 70, 50, 30, 30, 50, 70, 60, 40],
    [60, 80, 60, 40, 40, 60, 80, 70, 50],
    [80, 100, 80, 50, 60, 90, 100, 90, 70],
    [100, 100, 90, 70, 80, 100, 100, 80, 40],
  ];

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-md)]">
      <p className="text-xs font-semibold uppercase tracking-wider text-ivory-muted">
        Ocupação por dia e horário
      </p>
      <div className="flex gap-2">
        <div className="flex flex-col gap-1 pt-[18px]">
          {dias.map((d) => (
            <span key={d} className="h-5 text-[10px] leading-5 text-ivory-muted">{d}</span>
          ))}
        </div>
        <div className="flex-1">
          <div className="mb-1 flex gap-1">
            {horas.map((h) => (
              <span key={h} className="flex-1 text-center text-[10px] text-ivory-muted">{h}</span>
            ))}
          </div>
          <div className="flex flex-col gap-1">
            {ocupacao.map((linha, i) => (
              <div key={dias[i]} className="flex gap-1">
                {linha.map((v, j) => (
                  <span
                    key={`${i}-${j}`}
                    className="h-5 flex-1 rounded"
                    style={{
                      backgroundColor: "var(--color-gold)",
                      // Opacidade e não cores diferentes: a escala fica ordenável
                      // a olho, que é o que um mapa de calor precisa entregar.
                      opacity: 0.06 + (v / 100) * 0.85,
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="text-xs text-ivory-muted">
        Sábado às 10h lota. Quarta às 12h está vazia — é ali que uma promoção
        rende.
      </p>
    </div>
  );
}

/** A equipe, como ela aparece no painel. */
export function EquipeResumo() {
  const barbeiros = [
    { nome: "Rômulo", atendimentos: 84, valor: "R$ 6.240", pct: 100 },
    { nome: "Léo", atendimentos: 61, valor: "R$ 4.180", pct: 72 },
    { nome: "Vinícius", atendimentos: 38, valor: "R$ 2.740", pct: 45 },
  ];
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-md)]">
      <p className="text-xs font-semibold uppercase tracking-wider text-ivory-muted">
        Equipe no mês
      </p>
      {barbeiros.map((b) => (
        <div key={b.nome} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-ivory">{b.nome}</span>
            <span className="text-ivory-muted">
              {b.atendimentos} atendimentos · <span className="text-ivory">{b.valor}</span>
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-raised">
            <span className="block h-full rounded-full bg-gold" style={{ width: `${b.pct}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
