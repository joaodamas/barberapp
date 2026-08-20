import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Check } from "lucide-react";
import fotoEquipe from "@/assets/fotos/barbearia-equipe.webp";
import fotoDono from "@/assets/fotos/dono-no-salao.webp";
import { Reveal, RevealPalavras } from "@/components/landing/reveal";
import { AssinaturaCorteHub } from "@/components/landing/marca";
import {
  AgendaDoDia,
  EquipeResumo,
  MapaDeCalor,
  ProjecaoCurta,
  ResumoDoMes,
} from "@/components/landing/telas";

export const metadata: Metadata = {
  title: "CorteHub — a barbearia que sabe quanto sobrou",
  description:
    "Agenda que o cliente usa sozinho e financeiro que mostra o lucro de verdade: custo, comissão, ponto de equilíbrio e projeção de caixa.",
};

/**
 * A página da plataforma.
 *
 * Três decisões que valem explicar, porque são o que separa esta página de uma
 * gerada:
 *
 * 1. **Nenhum número redondo.** "R$ 12.469" é o faturamento real da barbearia
 *    que originou o produto; "R$ 12 mil" seria enfeite. Especificidade é a
 *    defesa mais forte contra parecer template — nenhum gerador inventa
 *    "ponto de equilíbrio no dia 18". Eles também precisam FECHAR na conta e
 *    ser plausíveis para o setor — ver `telas.tsx`, onde ambos já falharam.
 *
 * 2. **Nenhuma prova social inflada, e nenhum cliente nomeado.** Dizer "2.400
 *    barbearias" quando existe uma é o tipo de mentira que o primeiro cliente
 *    descobre. E citar o nome da barbearia piloto exigiria autorização dela —
 *    ninguém vira caso de sucesso sem ser consultado. A origem é contada sem
 *    nome: vale pela substância, não pela referência.
 *
 * 3. **O produto se mostra, não se descreve.** Os blocos de tela usam os
 *    componentes REAIS do painel, com os mesmos tokens e o mesmo gráfico.
 *    Mockup envelhece no primeiro ajuste; isto muda junto com o produto.
 *
 * 4. **Duas fotos, não uma galeria.** As imagens são geradas e entram só onde
 *    a seção fala de gente — a origem e a equipe. Espalhar foto pelo resto
 *    devolveria a página ao território de banco de imagens, que é exatamente
 *    o que ela evita. Elas também são o único conteúdo pesado aqui: por isso
 *    são importadas estaticamente (o Next calcula dimensão e desfoque de
 *    carregamento sozinho) e ficam abaixo da dobra, sem `priority`.
 */
export default function LandingPage() {
  return (
    <div className="min-h-screen overflow-y-auto bg-canvas">
      {/* ---------------------------------------------------------------- */}
      {/* Topo                                                              */}
      {/* ---------------------------------------------------------------- */}
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-6 md:px-8">
        <AssinaturaCorteHub className="text-ink" />
        <Link
          href="/login"
          className="text-sm text-ink-muted transition-colors hover:text-ink"
        >
          Entrar
        </Link>
      </header>

      {/* ---------------------------------------------------------------- */}
      {/* Hero — tipografia grande, texto curto, assimétrico                */}
      {/* ---------------------------------------------------------------- */}
      <section className="mx-auto w-full max-w-6xl px-5 pb-16 pt-8 md:px-8 md:pb-28 md:pt-16">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
          <Reveal>
            <p className="mb-5 text-sm text-gold-strong">Para donos de barbearia</p>
            {/* `text-balance` evita a linha órfã de uma palavra, que é o que
                mais denuncia título grande mal quebrado. */}
            <h1 className="text-balance font-brand text-4xl leading-[1.05] tracking-tight text-ink sm:text-5xl md:text-6xl">
              <RevealPalavras texto="Você sabe quanto faturou." />
              <br />
              <RevealPalavras
                texto="Sabe quanto sobrou?"
                className="text-gold-strong"
              />
            </h1>
            <p className="mt-6 max-w-lg text-base leading-relaxed text-ink-muted md:text-lg">
              Agenda que o cliente usa sozinho, e um financeiro que desconta
              comissão, aluguel e imposto para mostrar o que é seu de verdade.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Link
                href="/criar-conta"
                className="group inline-flex min-h-12 items-center gap-2 rounded-xl bg-gold px-6 font-semibold text-ink transition-colors hover:bg-gold-hover"
              >
                Testar 7 dias
                <ArrowRight
                  size={18}
                  className="transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
                />
              </Link>
              <span className="text-sm text-ink-muted">
                Sem cartão. Sem taxa de instalação.
              </span>
            </div>
          </Reveal>

          {/* Camadas sobrepostas: profundidade sem 3D falso. O cartão de trás
              é levemente rotacionado e escalado, o da frente avança. */}
          <Reveal delay={120} className="relative">
            <div className="relative mx-auto max-w-md lg:max-w-none">
              <div className="pointer-events-none absolute -inset-x-6 -top-8 bottom-10 rounded-[2rem] bg-gold/5 blur-2xl" />
              <div className="relative">
                <div className="rotate-[-1.4deg]">
                  <AgendaDoDia />
                </div>
                <div className="relative z-10 -mt-10 ml-auto w-[78%] rotate-[1.2deg] sm:-mt-14">
                  <ResumoDoMes />
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* A dor, com número                                                 */}
      {/* ---------------------------------------------------------------- */}
      <section className="border-y border-border bg-surface/60">
        <div className="mx-auto w-full max-w-6xl px-5 py-16 md:px-8 md:py-24">
          <Reveal>
            <h2 className="max-w-2xl text-balance font-brand text-2xl leading-tight text-ink md:text-4xl">
              A conta que quase nenhuma barbearia faz
            </h2>
          </Reveal>

          <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-3">
            {[
              {
                numero: "R$ 518",
                titulo: "perdidos por mês",
                texto:
                  "É o que sete faltas por mês custam numa barbearia de ticket R$ 74. O dono raramente soma.",
              },
              {
                numero: "40%",
                titulo: "saem em comissão",
                texto:
                  "Incide sobre o faturamento do serviço, e é a maior despesa da barbearia. Quem soma só o que entrou no caixa nunca desconta isso.",
              },
              {
                numero: "dia 18",
                titulo: "o mês vira lucro",
                texto:
                  "Antes disso você trabalhou para pagar aluguel, luz e a cadeira ao lado. Depois, o dinheiro é seu.",
              },
            ].map((item, i) => (
              <Reveal key={item.titulo} delay={i * 90}>
                <div className="h-full bg-canvas p-6 md:p-8">
                  <p className="font-display text-3xl text-gold-strong md:text-4xl">
                    {item.numero}
                  </p>
                  <p className="mt-1 text-sm font-medium text-ink">{item.titulo}</p>
                  <p className="mt-3 text-sm leading-relaxed text-ink-muted">
                    {item.texto}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* O produto se mostrando                                            */}
      {/* ---------------------------------------------------------------- */}
      <section className="mx-auto w-full max-w-6xl px-5 py-16 md:px-8 md:py-28">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
          <Reveal>
            <p className="text-sm text-gold-strong">Projeção de caixa</p>
            <h2 className="mt-3 text-balance font-brand text-2xl leading-tight text-ink md:text-4xl">
              O dia em que o caixa vira, antes de virar
            </h2>
            <p className="mt-5 max-w-md leading-relaxed text-ink-muted">
              A projeção junta os horários já marcados, a cobrança dos
              mensalistas e as contas fixas de cada dia. Onde a linha cruza o
              zero, é ali que falta dinheiro — com semanas de antecedência para
              fazer algo a respeito.
            </p>
            <ul className="mt-7 flex flex-col gap-3">
              {[
                "Horizonte de um mês a um ano",
                "Diz quanto do número é estimativa — e quanto é horário marcado",
                "Ponto de equilíbrio calculado do seu custo real",
              ].map((t) => (
                <li key={t} className="flex items-start gap-2.5 text-sm text-ink-muted">
                  <Check size={16} className="mt-0.5 shrink-0 text-gold-strong" />
                  {t}
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal delay={120}>
            <ProjecaoCurta />
          </Reveal>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Uma barbearia, com nome                                           */}
      {/* ---------------------------------------------------------------- */}
      <section className="border-y border-border bg-surface/60">
        <div className="mx-auto w-full max-w-6xl px-5 py-16 md:px-8 md:py-24">
          <div className="grid items-center gap-10 lg:grid-cols-[0.8fr_1fr] lg:gap-16">
            <Reveal>
              {/* Retrato e não paisagem: a seção fala de UMA barbearia e de um
                  barbeiro só. Enquadramento fechado diz isso antes do texto. */}
              <div className="relative mx-auto max-w-sm overflow-hidden rounded-2xl border border-border shadow-[var(--shadow-md)] lg:max-w-none">
                <Image
                  src={fotoDono}
                  alt="Dono de barbearia consultando o celular no balcão enquanto dois barbeiros atendem ao fundo."
                  sizes="(min-width: 1024px) 28rem, (min-width: 640px) 24rem, 100vw"
                  className="h-full w-full object-cover"
                  placeholder="blur"
                />
              </div>
            </Reveal>

            <Reveal delay={100}>
              <p className="text-sm text-gold-strong">De onde veio</p>
              <p className="mt-5 text-balance font-brand text-xl leading-snug text-ink md:text-3xl">
                O CorteHub nasceu dentro de{" "}
                <span className="text-gold-strong">uma barbearia só</span>, para
                resolver o problema de um barbeiro só.
              </p>
              <p className="mt-5 max-w-xl leading-relaxed text-ink-muted">
                Cada tela aqui existe porque alguém perdeu dinheiro sem ela — a
                falta que ninguém somou, a comissão calculada sobre o preço
                errado, o mês que fechou no vermelho sem aviso. Não somos os
                maiores. Somos os que sabem por que cada número está onde está.
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* O que tem — mostrado, não listado                                  */}
      {/*                                                                    */}
      {/* Eram nove cartões idênticos numa grade. É o padrão que a página     */}
      {/* inteira existe para evitar: parece gerado, e texto sobre texto não  */}
      {/* prova nada. Agora cada bloco mostra a TELA — o que nenhum           */}
      {/* concorrente copia sem ter o produto.                                */}
      {/* ---------------------------------------------------------------- */}
      <section className="mx-auto w-full max-w-6xl px-5 py-16 md:px-8 md:py-24">
        <Reveal>
          <h2 className="max-w-xl text-balance font-brand text-2xl leading-tight text-ink md:text-4xl">
            Três telas que a sua planilha não tem
          </h2>
        </Reveal>

        <div className="mt-12 flex flex-col gap-16 md:gap-24">
          {/* Equipe */}
          <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-16">
            <Reveal>
              <p className="text-sm text-gold-strong">Equipe</p>
              <h3 className="mt-2 text-balance font-brand text-xl leading-snug text-ink md:text-3xl">
                Três cadeiras não viram conflito de horário
              </h3>
              <p className="mt-4 max-w-md leading-relaxed text-ink-muted">
                Cada barbeiro tem a própria agenda, jornada, serviços e comissão.
                O cliente escolhe com quem quer cortar — e quando você contrata
                alguém, a conta não aumenta.
              </p>
            </Reveal>
            {/* Foto e tela na mesma pilha: em cima o que acontece no salão,
                embaixo o que o sistema mostra disso. Separados, seriam duas
                afirmações; sobrepostos, são a mesma. É a composição do topo da
                página, repetida de propósito. */}
            <Reveal delay={100}>
              <div className="relative mx-auto max-w-md lg:max-w-none">
                <div className="overflow-hidden rounded-2xl border border-border shadow-[var(--shadow-md)]">
                  <Image
                    src={fotoEquipe}
                    alt="Dois barbeiros atendendo em cadeiras vizinhas enquanto o dono acompanha pelo tablet."
                    sizes="(min-width: 1024px) 32rem, (min-width: 640px) 28rem, 100vw"
                    className="h-full w-full object-cover"
                    placeholder="blur"
                  />
                </div>
                {/* Cartão à ESQUERDA de propósito: as duas cadeiras ocupadas
                    estão à direita do quadro, e são elas que sustentam o
                    título. O que fica coberto é o balcão. */}
                <div className="relative z-10 -mt-10 mr-auto w-[86%] sm:-mt-14">
                  <EquipeResumo />
                </div>
              </div>
            </Reveal>
          </div>

          {/* Números */}
          <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-16">
            <Reveal className="lg:order-2">
              <p className="text-sm text-gold-strong">Números da operação</p>
              <h3 className="mt-2 text-balance font-brand text-xl leading-snug text-ink md:text-3xl">
                O horário vazio aparece antes de você sentir
              </h3>
              <p className="mt-4 max-w-md leading-relaxed text-ink-muted">
                Mapa de calor por dia e horário, taxa de ocupação, recorrência de
                cliente e os serviços que mais rendem. É onde você descobre qual
                promoção fazer, e quando.
              </p>
            </Reveal>
            <Reveal delay={100} className="lg:order-1">
              <MapaDeCalor />
            </Reveal>
          </div>
        </div>

        {/* O resto, em lista compacta: são recursos que o dono confere, não
            que precisam ser vendidos um a um. */}
        <Reveal>
          <div className="mt-16 grid gap-x-10 gap-y-3 border-t border-border pt-8 sm:grid-cols-2 lg:grid-cols-3">
            {[
              "Agenda com link e marca próprios",
              "Horário livre calculado no servidor",
              "Fluxo de caixa por meio de pagamento",
              "Despesas fixas lançadas uma vez",
              "Fidelidade por carimbo, à prova de estorno",
              "Mensalistas e clube de assinatura",
              "Loja com comissão sobre o lucro",
              "Cancelamento e remarcação com política",
              "Encaixe com aprovação do barbeiro",
            ].map((t) => (
              <p key={t} className="flex items-start gap-2 text-sm text-ink-muted">
                <Check size={15} className="mt-0.5 shrink-0 text-gold-strong" />
                {t}
              </p>
            ))}
          </div>
        </Reveal>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* O que ainda não existe — dito, não escondido                       */}
      {/* ---------------------------------------------------------------- */}
      <section className="border-y border-border bg-surface/60">
        <div className="mx-auto w-full max-w-6xl px-5 py-14 md:px-8 md:py-16">
          <Reveal>
            <div className="flex flex-col gap-3 md:flex-row md:items-baseline md:justify-between">
              <h2 className="text-balance font-brand text-xl leading-tight text-ink md:text-2xl">
                O que ainda não está pronto
              </h2>
              <p className="max-w-md text-sm leading-relaxed text-ink-muted">
                Você recebe sem pagar mais por isso. Está aqui porque preferimos
                dizer do que você descobrir sozinho.
              </p>
            </div>
          </Reveal>

          <div className="mt-8 grid gap-x-10 gap-y-6 sm:grid-cols-3">
            {[
              ["WhatsApp automático", "Confirmação, lembrete no dia e aviso de encaixe. As 34 mensagens já estão aprovadas pela Meta — falta o número entrar no ar."],
              ["Pagamento antecipado", "Pix e cartão na reserva, para o horário não ficar em aberto quando o cliente não aparece."],
              ["Ficha do cliente", "Quantas vezes veio, quanto gastou, quando foi a última. É o que liga a reativação de quem sumiu."],
            ].map(([titulo, texto], i) => (
              <Reveal key={titulo} delay={i * 80}>
                <div className="flex flex-col gap-1.5 border-t border-gold/30 pt-3">
                  <p className="text-sm font-medium text-ink">{titulo}</p>
                  <p className="text-sm leading-relaxed text-ink-muted">{texto}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Preço                                                             */}
      {/* ---------------------------------------------------------------- */}
      <section className="mx-auto w-full max-w-6xl px-5 py-16 md:px-8 md:py-28">
        <Reveal>
          <h2 className="text-balance font-brand text-2xl leading-tight text-ink md:text-4xl">
            Preço por barbearia, não por barbeiro
          </h2>
          <p className="mt-4 max-w-xl leading-relaxed text-ink-muted">
            Contratar alguém não aumenta sua conta. E não existe taxa de
            instalação — se o sistema precisa de instalação paga, ele não é
            simples.
          </p>
        </Reveal>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {[
            { nome: "Agenda", preco: "97", texto: "Agenda, link próprio, clientes e caixa do dia.", destaque: false },
            { nome: "Crescimento", preco: "197", texto: "Tudo do Agenda, mais fidelidade, mensalistas e loja.", destaque: true },
            { nome: "Gestão", preco: "297", texto: "Tudo, mais DRE, projeção e fechamento mensal.", destaque: false },
          ].map((p, i) => (
            <Reveal key={p.nome} delay={i * 90}>
              <div
                className={
                  "flex h-full flex-col gap-3 rounded-2xl border p-6 " +
                  (p.destaque
                    ? "border-gold bg-surface shadow-[var(--shadow-md)]"
                    : "border-border bg-surface/60")
                }
              >
                <p className="text-sm font-medium text-ink">{p.nome}</p>
                <p className="font-display text-3xl text-ink">
                  R$ {p.preco}
                  <span className="text-base text-ink-muted">/mês</span>
                </p>
                <p className="text-sm leading-relaxed text-ink-muted">{p.texto}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Fechamento                                                        */}
      {/* ---------------------------------------------------------------- */}
      <section className="border-t border-border">
        <div className="mx-auto w-full max-w-3xl px-5 py-20 text-center md:px-8 md:py-28">
          <Reveal>
            <h2 className="text-balance font-brand text-3xl leading-tight text-ink md:text-5xl">
              Sete dias para ver o seu próprio número
            </h2>
            <p className="mx-auto mt-5 max-w-md leading-relaxed text-ink-muted">
              Cadastre seus serviços e horários em poucos minutos. No fim da
              primeira semana você já sabe quanto sobrou.
            </p>
            <Link
              href="/criar-conta"
              className="group mt-9 inline-flex min-h-12 items-center gap-2 rounded-xl bg-gold px-7 font-semibold text-ink transition-colors hover:bg-gold-hover"
            >
              Começar agora
              <ArrowRight
                size={18}
                className="transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
              />
            </Link>
          </Reveal>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-5 py-8 text-xs text-ink-muted md:flex-row md:items-center md:justify-between md:px-8">
          <AssinaturaCorteHub className="text-ink" />
          <span>Feito para quem corta cabelo e precisa saber de dinheiro.</span>
          <span className="flex gap-4">
            <Link href="/privacidade" className="underline-offset-2 hover:text-ink hover:underline">
              Privacidade
            </Link>
            <Link href="/termos" className="underline-offset-2 hover:text-ink hover:underline">
              Termos
            </Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
