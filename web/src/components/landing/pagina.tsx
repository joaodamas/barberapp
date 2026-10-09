import Image from "next/image";
import Link from "next/link";
import { destinoDoCadastro } from "@/lib/platform";
import { PRECOS_POR_PLANO } from "@/lib/tenant";
import { ArrowRight, Check, Plus } from "lucide-react";
import fotoDono from "@/assets/fotos/dono-no-salao.webp";
import pcAgenda from "@/assets/landing/pc-agenda.jpg";
import celAgendarHorario from "@/assets/landing/cel-agendar-horario.jpg";
import { Reveal } from "@/components/landing/reveal";
import { AssinaturaTopete, outfit } from "@/components/landing/marca";
import { Celular, Notebook } from "@/components/landing/molduras";
import { TourDoTopete } from "@/components/landing/tour";
import { ComoFunciona } from "@/components/landing/passos";
import { SemComTopete } from "@/components/landing/sem-com";
import { QuantoCusta } from "@/components/landing/conta";
import { GradeDePrecos } from "@/components/landing/precos";

/**
 * A página da plataforma — Topete. Terceira versão (02/10/2026).
 *
 * Mora em componente, e não só na rota `/landing`, porque é ela que abre em
 * `topete.com.br/` direto (ver `(cliente)/layout.tsx`).
 *
 * O que muda, a partir do diagnóstico "ainda tem cara de IA" do dono e da
 * comparação com Squire, Booksy, Fresha, Trinks e BestBarbers:
 *
 * 1. **Telas de verdade.** Nada de maquete desenhada em código: todas as telas
 *    são quadros do app real, gravado com uma barbearia de exemplo (a
 *    "Navalha", dados fictícios) — `docs/materiais/landing/extrair.sh`.
 * 2. **O produto se mostra.** Tour narrado logo abaixo do topo, e um "como
 *    funciona" em que a tela acompanha o texto.
 * 3. **Nenhum número sem origem.** Os números da dor viram contas escritas,
 *    com valores redondos e o selo "conta de exemplo".
 * 4. **Ritmo claro/escuro.** O escuro é a marca (topo, vídeos, fechamento); o
 *    claro é onde o produto aparece — tela branca sobre marfim se lê como o
 *    que é, e quebra a fórmula "página toda escura com título dourado".
 * 5. **Animação só com função:** revelar ao chegar, trocar a tela no passo
 *    certo, montar a conta. `prefers-reduced-motion` desliga tudo.
 * 6. **Honestidade mantida:** o que ainda não existe continua dito, e nenhum
 *    nome de pessoa real aparece (só nomes inventados).
 */

const FUNDO = "bg-[#0B0A08]";
const TEXTO = "text-[#F4EFE4]";
const APAGADO = "text-[#A79F8F]";
const LATAO = "text-[#E0AE58]";
const BORDA = "border-[#2A2620]";
const CLARO = "bg-[#F4EFE4] text-[#16140F]";

function BotaoPrincipal({ children }: { children: React.ReactNode }) {
  return (
    <Link
      href={destinoDoCadastro()}
      className="group inline-flex min-h-12 items-center gap-2 rounded-lg bg-[#E0AE58] px-6 font-semibold text-[#0B0A08] transition-colors hover:bg-[#EDC47A] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#E0AE58]/40"
    >
      {children}
      <ArrowRight size={18} className="transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
    </Link>
  );
}

function Titulo({ children, claro = false }: { children: React.ReactNode; claro?: boolean }) {
  return (
    <h2
      className={
        "text-balance font-brand text-[2.1rem] leading-[1.06] tracking-[-0.025em] md:text-5xl " +
        (claro ? "text-[#16140F]" : "")
      }
    >
      {children}
    </h2>
  );
}

function Rotulo({ children, claro = false }: { children: React.ReactNode; claro?: boolean }) {
  return (
    <p className={"mb-4 text-sm font-medium " + (claro ? "text-[#8F6B22]" : "text-[#E0AE58]")}>{children}</p>
  );
}

const DETALHES = [
  {
    titulo: "Encaixe que se calcula",
    texto:
      "O Topete olha o tempo de cada serviço ao redor e diz se dá para encaixar, se fica apertado ou se não vale.",
    exemplo: "Thiago pediu 15:00, barba de 30 min. Cabe entre o corte do Murilo e o intervalo.",
  },
  {
    titulo: "Agenda que não briga",
    texto:
      "Cada barbeiro com jornada, serviços e comissão próprios. O horário livre é calculado no servidor — dois clientes nunca pegam a mesma cadeira.",
    exemplo: "Otávio até as 14h, Igor até as 19h. O cliente só vê o que cabe.",
  },
  {
    titulo: "Combo com o preço certo",
    texto:
      "Corte e barba juntos saem pelo preço do combo — na reserva do cliente, no balcão e quando você adiciona um serviço ao concluir.",
    exemplo: "Corte R$ 50 + barba R$ 35 viram o combo de R$ 75.",
  },
  {
    titulo: "Dados que são seus",
    texto:
      "Cada barbearia isolada das outras, dados em São Paulo, cópia de segurança automática e LGPD resolvida pelo próprio app.",
    exemplo: "A agenda do Zé nunca aparece para a barbearia vizinha.",
  },
];

const DUVIDAS = [
  {
    p: "Meu cliente precisa baixar um app?",
    r: "Não. É um link da sua barbearia que abre no navegador, como qualquer site. Quem quiser coloca na tela de início do celular, com o nome e o ícone da barbearia.",
  },
  {
    p: "Meu barbeiro não sabe mexer em sistema.",
    r: "Ele quase não precisa. Toca em Iniciar no Telegram e passa a receber a agenda dele às 7h e os pedidos de encaixe da cadeira dele, com o botão de aprovar.",
  },
  {
    p: "Tem taxa de implantação?",
    r: "Não. Você paga só a mensalidade do plano. A marca própria vem inclusa.",
  },
  {
    p: "E o WhatsApp que eu já uso?",
    r: "Continua sendo onde você conversa com o cliente. O link entra para tirar de você o “tem horário?”. Hoje o Topete monta a mensagem certa e você envia com um toque — o envio automático ainda não está pronto.",
  },
];

export function PaginaDaPlataforma() {
  return (
    <div className={`${FUNDO} ${TEXTO} ${outfit.variable} min-h-screen overflow-y-auto overflow-x-hidden`}>
      {/* ------------------------------------------------------------ Topo */}
      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-6 md:px-8">
        <AssinaturaTopete className={TEXTO} />
        <nav className={`flex items-center gap-6 text-sm ${APAGADO}`}>
          <a href="#como-funciona" className="hidden hover:text-[#F4EFE4] sm:inline">
            Como funciona
          </a>
          <a href="#precos" className="hidden hover:text-[#F4EFE4] sm:inline">
            Preços
          </a>
          <Link
            href="/login"
            className={`rounded-lg border ${BORDA} px-3 py-1.5 transition-colors hover:border-[#E0AE58] hover:text-[#F4EFE4]`}
          >
            Entrar
          </Link>
        </nav>
      </header>

      {/* ------------------------------------------------------------ Hero */}
      <section className="relative z-10 mx-auto w-full max-w-6xl px-5 pb-16 pt-4 md:px-8 md:pb-24 md:pt-12">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:gap-10">
          <Reveal>
            <p className="mb-5 text-sm uppercase tracking-[0.18em] text-[#E0AE58]">Sistema para barbearias</p>
            <h1 className="text-balance font-brand text-[2.7rem] leading-[1.02] tracking-[-0.035em] sm:text-6xl md:text-[4.2rem]">
              Seu cliente marca sozinho. <span className={LATAO}>Você só corta.</span>
            </h1>
            <p className={`mt-6 max-w-lg text-base leading-relaxed md:text-lg ${APAGADO}`}>
              Agenda online com a cara da sua barbearia, encaixe com aprovação, caixa do dia e o resultado do mês —
              no celular e no computador.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-4">
              <BotaoPrincipal>Quero conhecer</BotaoPrincipal>
              <a
                href="#tour"
                className="inline-flex items-center gap-2 text-sm font-medium text-[#F4EFE4] underline decoration-[#E0AE58]/50 underline-offset-4 hover:decoration-[#E0AE58]"
              >
                Ver o Topete em 1 minuto
              </a>
            </div>
            <ul className={`mt-9 flex flex-wrap gap-x-5 gap-y-2 text-sm ${APAGADO}`}>
              {["Sem taxa de implantação", "Dados em São Paulo", "Sem baixar app"].map((t) => (
                <li key={t} className="flex items-center gap-1.5">
                  <Check size={15} className="text-[#E0AE58]" />
                  {t}
                </li>
              ))}
            </ul>
          </Reveal>

          {/* O produto de verdade abre a página: a agenda do dono no notebook e
              o cliente marcando no celular — as duas pontas do mesmo horário. */}
          <div className="relative pb-[9%] pr-[5%]">
            <Reveal>
              <Notebook
                src={pcAgenda}
                alt="Agenda do dono no computador: a semana, os barbeiros e os horários marcados e de encaixe."
                priority
                sizes="(min-width: 1024px) 36rem, 95vw"
              />
            </Reveal>
            <Reveal delay={220} className="absolute bottom-0 right-0 w-[29%]">
              <Celular
                src={celAgendarHorario}
                alt="O cliente escolhendo barbeiro, dia e horário pelo link da barbearia."
                priority
                sizes="(min-width: 1024px) 11rem, 30vw"
              />
            </Reveal>
          </div>
        </div>
      </section>

      {/* A listra do poste de barbearia: o único enfeite da página, e é do assunto. */}
      <div
        aria-hidden
        className="h-3 bg-[repeating-linear-gradient(-45deg,#E0AE58_0_14px,#0B0A08_14px_28px,#F4EFE4_28px_42px,#0B0A08_42px_56px)]"
      />

      {/* ------------------------------------------------------------ Tour */}
      <section id="tour" className="relative z-10 scroll-mt-6 bg-[#100E0B]">
        <div className="mx-auto w-full max-w-5xl px-5 py-16 md:px-8 md:py-24">
          <Reveal>
            <div className="mb-10 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <Rotulo>Veja funcionando</Rotulo>
                <Titulo>O Topete em 1 minuto</Titulo>
              </div>
              <p className={`max-w-sm leading-relaxed ${APAGADO}`}>
                O app de verdade, no notebook e no celular: o cliente marcando, o encaixe, o caixa e o mês.
              </p>
            </div>
          </Reveal>
          <Reveal delay={100}>
            <TourDoTopete />
          </Reveal>
        </div>
      </section>

      {/* -------------------------------------------------- Como funciona */}
      <section id="como-funciona" className={`relative z-10 scroll-mt-6 ${CLARO}`}>
        <div className="mx-auto w-full max-w-[68rem] px-5 pt-16 md:px-8 md:pt-20">
          <Reveal>
            <Rotulo claro>Como funciona</Rotulo>
            <Titulo claro>Do link do cliente ao fim do mês</Titulo>
          </Reveal>
        </div>
        <div className="mx-auto w-full max-w-[68rem] px-5 pb-12 md:px-8 lg:pb-16">
          <ComoFunciona />
        </div>
      </section>

      {/* ------------------------------------------------ Sem × com Topete */}
      <section className="relative z-10 overflow-hidden">
        <div className="mx-auto w-full max-w-6xl px-5 py-16 md:px-8 md:py-24">
          <Reveal>
            <div className="mb-10 flex flex-col gap-3 md:mb-14 md:flex-row md:items-end md:justify-between">
              <div>
                <Rotulo>Sem Topete × com Topete</Rotulo>
                <Titulo>A rotina que todo barbeiro conhece</Titulo>
              </div>
              <p className={`max-w-sm leading-relaxed ${APAGADO}`}>
                A série do nosso Instagram, <span className="text-[#F4EFE4]">@usetopete</span>. Toque no som para ouvir.
              </p>
            </div>
          </Reveal>
          <SemComTopete />
        </div>
      </section>

      {/* --------------------------------------------------- Quanto custa */}
      <section className={`relative z-10 ${CLARO}`}>
        <div className="mx-auto w-full max-w-6xl px-5 py-16 md:px-8 md:py-24">
          <Reveal>
            <div className="mb-10 flex flex-col gap-4 md:mb-12 md:flex-row md:items-end md:justify-between">
              <div>
                <Rotulo claro>A conta que ninguém faz</Rotulo>
                <Titulo claro>Quanto custa ficar como está?</Titulo>
              </div>
              <p className="inline-flex w-fit items-center gap-2 rounded-full border border-[#C9A45C] px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#8F6B22]">
                Conta de exemplo · troque pelos seus números
              </p>
            </div>
          </Reveal>
          <QuantoCusta />
        </div>
      </section>

      {/* ------------------------------------------------------- Detalhes */}
      <section className={`relative z-10 border-b ${BORDA} bg-[#100E0B]`}>
        <div className="mx-auto w-full max-w-6xl px-5 py-16 md:px-8 md:py-24">
          <Reveal>
            <Rotulo>O que o Topete faz sozinho</Rotulo>
            <Titulo>Menos conta de cabeça. Mais cadeira ocupada.</Titulo>
          </Reveal>
          <dl className={`mt-12 grid grid-cols-1 border-t ${BORDA} md:grid-cols-2 md:gap-x-16`}>
            {DETALHES.map(({ titulo, texto, exemplo }, i) => (
              <Reveal key={titulo} delay={(i % 2) * 80}>
                <div className={`border-b ${BORDA} py-7`}>
                  <dt className="font-brand text-xl md:text-2xl">{titulo}</dt>
                  <dd className={`mt-2 text-sm leading-relaxed ${APAGADO}`}>{texto}</dd>
                  <dd className="mt-3 text-sm text-[#E0AE58]">{exemplo}</dd>
                </div>
              </Reveal>
            ))}
          </dl>
        </div>
      </section>

      {/* --------------------------------------------------------- Origem */}
      <section className="relative z-10 mx-auto w-full max-w-6xl px-5 py-16 md:px-8 md:py-24">
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[0.8fr_1fr] lg:gap-16">
          <Reveal>
            <div className={`relative mx-auto max-w-sm overflow-hidden rounded-2xl border ${BORDA} lg:max-w-none`}>
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
            <Rotulo>De onde veio</Rotulo>
            <p className="text-balance font-brand text-2xl leading-snug tracking-[-0.02em] md:text-4xl">
              O Topete nasceu dentro de <span className={LATAO}>uma barbearia de verdade</span>, para resolver o
              problema de um barbeiro só.
            </p>
            <p className={`mt-5 max-w-xl leading-relaxed ${APAGADO}`}>
              Cada tela aqui existe porque alguém perdeu dinheiro sem ela — a falta que ninguém somou, a comissão
              calculada sobre o preço errado, o mês que fechou no vermelho sem aviso. Não somos os maiores. Somos os
              que sabem por que cada número está onde está.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ------------------------------------------ O que ainda não existe */}
      <section className={`relative z-10 border-y ${BORDA} bg-[#100E0B]`}>
        <div className="mx-auto w-full max-w-6xl px-5 py-14 md:px-8 md:py-16">
          <Reveal>
            <div className="flex flex-col gap-3 md:flex-row md:items-baseline md:justify-between">
              <h2 className="text-balance font-brand text-2xl tracking-[-0.02em] md:text-3xl">O que ainda não está pronto</h2>
              <p className={`max-w-md text-sm leading-relaxed ${APAGADO}`}>
                Você recebe sem pagar mais por isso. Está aqui porque preferimos dizer do que você descobrir sozinho.
              </p>
            </div>
          </Reveal>
          <div className="mt-8 grid gap-x-10 gap-y-6 sm:grid-cols-3">
            {[
              [
                "WhatsApp automático",
                "Confirmação e lembrete enviados sozinhos. Hoje o Topete já monta a mensagem certa e você envia com um toque.",
              ],
              ["Pagamento antecipado", "Pix e cartão na reserva, para o horário não ficar em aberto quando o cliente não aparece."],
              ["Painel de cada barbeiro", "Hoje o painel é do dono; cada barbeiro recebe a agenda e os encaixes dele no Telegram."],
            ].map(([titulo, texto], i) => (
              <Reveal key={titulo} delay={i * 80}>
                <div className="flex flex-col gap-1.5 border-t border-[#E0AE58]/30 pt-3">
                  <p className="text-sm font-medium">{titulo}</p>
                  <p className={`text-sm leading-relaxed ${APAGADO}`}>{texto}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- Preço */}
      <section id="precos" className={`relative z-10 scroll-mt-6 ${CLARO}`}>
        <div className="mx-auto w-full max-w-6xl px-5 py-16 md:px-8 md:py-24">
          <Reveal>
            <Rotulo claro>Preços</Rotulo>
            <Titulo claro>Preço por barbearia, não por cadeira</Titulo>
            <p className="mt-4 max-w-xl leading-relaxed text-[#5A554C]">
              A mensalidade cobre a equipe até o teto do plano. A marca própria vem inclusa, e não existe taxa de
              implantação.
            </p>
          </Reveal>
          {/* Preço e teto saem de `PRECOS_POR_PLANO`, a mesma tabela que a tela
              Equipe usa — a página não pode prometer um teto e o painel cobrar outro.
              O que cada plano libera espelha `FEATURES_POR_PLANO`. O alternador
              Mensal | Anual só aparece com `ANUAL_DISPONIVEL`. */}
          <GradeDePrecos
            cartoes={[
              {
                id: "agenda",
                nome: "Agenda",
                plano: PRECOS_POR_PLANO.agenda,
                itens: ["Link e marca próprios", "Encaixe com aprovação", "Clientes e caixa do dia", "Avisos no celular e no Telegram"],
                destaque: false,
              },
              {
                id: "crescimento",
                nome: "Crescimento",
                plano: PRECOS_POR_PLANO.crescimento,
                itens: ["Tudo do Agenda", "Mensalistas com horário fixo", "Loja e fidelidade", "Projeção de caixa"],
                destaque: true,
              },
              {
                id: "gestao",
                nome: "Gestão",
                plano: PRECOS_POR_PLANO.gestao,
                itens: ["Tudo do Crescimento", "Despesas", "Quanto sobrou (DRE)", "Fechamento do mês"],
                destaque: false,
              },
            ]}
          />
          <div className="mt-8 grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
            <p className="text-sm text-[#5A554C]">
              <span className="font-semibold text-[#16140F]">Barbeiro extra:</span> R${" "}
              {PRECOS_POR_PLANO.agenda.barbeiroExtra}/mês cada, acima do teto do plano.{" "}
              <span className="font-semibold text-[#16140F]">Sem taxa de implantação.</span>
            </p>
            <p className="rounded-xl bg-[#16140F] px-5 py-3 text-sm text-[#F4EFE4]">
              <span className="font-semibold text-[#E0AE58]">Fundadoras:</span> 30% de desconto no 1º mês para as 20
              primeiras barbearias. Depois, mensalidade normal.
            </p>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------- Dúvidas */}
      <section className={`relative z-10 border-t border-[#E6DDCB] ${CLARO}`}>
        <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-10 px-5 py-16 md:px-8 md:py-24 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
          <Reveal>
            <Rotulo claro>Dúvidas</Rotulo>
            <Titulo claro>O que todo dono pergunta</Titulo>
          </Reveal>
          <div className="divide-y divide-[#E6DDCB] border-y border-[#E6DDCB]">
            {DUVIDAS.map((d) => (
              <details key={d.p} className="group py-5 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-brand text-xl tracking-[-0.01em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A45C]">
                  {d.p}
                  <Plus size={20} className="shrink-0 text-[#8F6B22] transition-transform duration-300 group-open:rotate-45 motion-reduce:transition-none" />
                </summary>
                <p className="mt-3 max-w-xl leading-relaxed text-[#5A554C]">{d.r}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------- Fechamento */}
      <section className="relative z-10 overflow-hidden">
        <div className="relative mx-auto w-full max-w-3xl px-5 py-20 text-center md:px-8 md:py-28">
          <Reveal>
            <Image
              src="/topete-mascote.svg"
              alt=""
              width={112}
              height={112}
              unoptimized
              className="mx-auto mb-8 h-24 w-24"
            />
            <h2 className="text-balance font-brand text-4xl leading-tight tracking-[-0.03em] md:text-6xl">
              Vamos encher a sua <span className={LATAO}>agenda?</span>
            </h2>
            <p className={`mx-auto mt-5 max-w-md leading-relaxed ${APAGADO}`}>
              Em 20 minutos a gente mostra o Topete funcionando com os serviços e os horários da sua barbearia.
            </p>
            <div className="mt-10 flex justify-center">
              <BotaoPrincipal>Falar com a gente</BotaoPrincipal>
            </div>
            <p className={`mt-6 text-sm ${APAGADO}`}>@usetopete no Instagram</p>
          </Reveal>
        </div>
      </section>

      <footer className={`relative z-10 border-t ${BORDA}`}>
        <div
          className={`mx-auto flex w-full max-w-6xl flex-col gap-4 px-5 py-8 text-xs md:flex-row md:items-center md:justify-between md:px-8 ${APAGADO}`}
        >
          <AssinaturaTopete className={TEXTO} />
          <span>Feito para quem corta cabelo e precisa saber de dinheiro.</span>
          <span className="flex gap-4">
            <Link href="/privacidade" className="underline-offset-2 hover:text-[#F4EFE4] hover:underline">
              Privacidade
            </Link>
            <Link href="/termos" className="underline-offset-2 hover:text-[#F4EFE4] hover:underline">
              Termos
            </Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
