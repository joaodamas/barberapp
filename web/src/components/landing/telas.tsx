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
