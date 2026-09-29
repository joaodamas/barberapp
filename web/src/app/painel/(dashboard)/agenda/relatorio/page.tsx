import { RelatorioDoMes } from "@/components/agenda/relatorio-do-mes";

/**
 * `/painel/agenda/relatorio?mes=2026-10` — o relatório mensal da agenda.
 *
 * O mês vem da URL, lido aqui no servidor, e não por `useSearchParams` no
 * cliente: o hook obrigaria a tela a viver sob um limite de Suspense (ver a
 * nota na tela de login). A URL com o mês é o que permite ao dono voltar ao
 * mesmo relatório pelo histórico ou mandar o link para o contador.
 *
 * A validação do parâmetro é de `mesDoParametro`: mês inválido vira o atual.
 */
export default async function RelatorioDaAgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ [chave: string]: string | string[] | undefined }>;
}) {
  const { mes } = await searchParams;
  return <RelatorioDoMes mesParam={typeof mes === "string" ? mes : undefined} />;
}
