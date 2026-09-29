import Image from "next/image";
import Link from "next/link";
import { destinoDoCadastro } from "@/lib/platform";
import { PRECOS_POR_PLANO } from "@/lib/tenant";
import { ArrowRight, Check } from "lucide-react";
import fotoEquipe from "@/assets/fotos/barbearia-equipe.webp";
import fotoDono from "@/assets/fotos/dono-no-salao.webp";
import { Reveal, RevealPalavras } from "@/components/landing/reveal";
import { AssinaturaTopete, outfit } from "@/components/landing/marca";
import {
  AgendaDoDia,
  EquipeResumo,
  MapaDeCalor,
  ProjecaoCurta,
  ResumoDoMes,
} from "@/components/landing/telas";

/**
 * A página da plataforma — Topete (29/09/2026; antes, CorteHub).
 *
 * Mora em componente, e não só na rota `/landing`, porque é ela que abre em
 * `topete.com.br/` direto, sem redirecionar (ver `(cliente)/layout.tsx`).
 *
 * O conteúdo é o da versão anterior, que já tinha sido conferido número a
 * número. O que muda é a pele, a pedido do dono: "mais talento, tecnológico e
 * inteligente".
 *
 * 1. **Escura, preto e latão.** A mesma paleta do mascote e dos materiais de
 *    venda. Os blocos de tela continuam CLAROS — são os componentes reais do
 *    painel, e sobre o fundo escuro eles se leem como o que são: o produto
 *    funcionando, não ilustração.
 * 2. **O mascote abre a página.** É a marca, e é o que o Instagram mostra.
 * 3. **"Inteligente" com prova.** A seção nova lista o que o sistema CALCULA
 *    sozinho — cada item existe no código hoje. Nenhum "com IA" de enfeite.
 * 4. **Nada de promessa inflada.** Sem contagem de clientes, sem barbearia
 *    nomeada sem autorização, e o que não está pronto continua dito.
 * 5. **O convite é conversa, não teste de 7 dias.** O cadastro self-service
 *    está fechado por decisão do dono; o botão leva ao WhatsApp comercial
 *    (`destinoDoCadastro`).
 */

const FUNDO = "bg-[#0B0A08]";
const TEXTO = "text-[#F4EFE4]";
const APAGADO = "text-[#A79F8F]";
const LATAO = "text-[#E0AE58]";
const BORDA = "border-[#2A2620]";

function BotaoPrincipal({ children }: { children: React.ReactNode }) {
  return (
    <Link
      href={destinoDoCadastro()}
      className="group inline-flex min-h-12 items-center gap-2 rounded-lg bg-[#E0AE58] px-6 font-semibold text-[#0B0A08] transition-colors hover:bg-[#EDC47A]"
    >
      {children}
      <ArrowRight
        size={18}
        className="transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
      />
    </Link>
  );
}

const INTELIGENTE = [
  {
    titulo: "Encaixe que se calcula",
    texto:
      "Horário ocupado vira pedido de encaixe. O Topete olha o tempo de cada serviço ao redor e diz se dá para encaixar, se fica apertado ou se não vale.",
    exemplo: "Pedro pediu 15:00, barba de 30 min. Cabe entre o Lucas e o intervalo.",
  },
  {
    titulo: "Mensalista com horário fixo",
    texto:
      "Sexta às 17h é dele. O sistema reserva as próximas semanas sozinho e completa toda madrugada. Cancelar uma semana não tira o fixo.",
    exemplo: "Sexta, 17:00, Felipe. Reservado até o fim de novembro.",
  },
  {
    titulo: "Caixa projetado",
    texto:
      "Horários marcados, mensalidades e contas fixas numa linha só. O dia em que o caixa aperta aparece semanas antes.",
    exemplo: "Dia 23 o caixa fica apertado: três contas vencem antes das mensalidades.",
  },
  {
    titulo: "Agenda que não briga",
    texto:
      "Cada barbeiro com jornada, serviços e comissão próprios. O horário livre é calculado no servidor — dois clientes nunca pegam a mesma cadeira.",
    exemplo: "Diego até as 14h, Léo até as 19h. O cliente só vê o que cabe.",
  },
  {
    titulo: "Sua marca no celular do cliente",
    texto:
      "Endereço, logo e cores da sua barbearia. O cliente instala como app, sem loja, e ele se atualiza sozinho.",
    exemplo: "barbeariadoze.topete.com.br, com o logo e as cores do Zé.",
  },
  {
    titulo: "Dados que são seus",
    texto:
      "Cada barbearia isolada das outras, dados em São Paulo, cópia de segurança automática e LGPD resolvida pelo próprio app.",
    exemplo: "A agenda do Zé nunca aparece para a barbearia vizinha.",
  },
];

export function PaginaDaPlataforma() {
  return (
    <div className={`${FUNDO} ${TEXTO} ${outfit.variable} min-h-screen overflow-y-auto overflow-x-hidden`}>

      {/* ------------------------------------------------------------ Topo */}
      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-6 md:px-8">
        <AssinaturaTopete className={TEXTO} />
        <nav className={`flex items-center gap-6 text-sm ${APAGADO}`}>
          <a href="#inteligente" className="hidden hover:text-[#F4EFE4] sm:inline">
            Recursos
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
      <section className="relative z-10 mx-auto w-full max-w-6xl px-5 pb-20 pt-6 md:px-8 md:pb-32 md:pt-14">
        <div className="grid grid-cols-1 items-center gap-14 lg:grid-cols-[1.05fr_1fr]">
          <Reveal>
            <p className="mb-6 text-sm uppercase tracking-[0.18em] text-[#E0AE58]">
              Sistema para barbearias
            </p>
            <h1
              className="font-brand text-balance text-[2.6rem] leading-[1.02] tracking-[-0.035em] sm:text-6xl md:text-7xl"
            >
              <RevealPalavras texto="Agenda cheia." />
              <br />
              {/* Gradiente num span só: `background-clip: text` não atravessa as
                  palavras animadas de `RevealPalavras`, que viram blocos. */}
              <span className={`${LATAO} italic`}>Cadeira girando.</span>
            </h1>
            <p className={`mt-7 max-w-lg text-base leading-relaxed md:text-lg ${APAGADO}`}>
              O cliente marca sozinho pelo link da sua barbearia. O Topete encaixa,
              guarda o horário do mensalista e desconta comissão, maquininha e
              aluguel para mostrar quanto sobrou de verdade.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-5">
              <BotaoPrincipal>Quero conhecer</BotaoPrincipal>
              <span className={`text-sm ${APAGADO}`}>Demonstração de 20 minutos, pelo WhatsApp.</span>
            </div>
          </Reveal>

          <Reveal delay={120} className="relative">
            <div className="relative mx-auto aspect-square w-full max-w-[30rem]">
              <Image
                src="/topete-mascote.svg"
                alt="O mascote do Topete: um homem de barba com um grande topete dourado."
                width={512}
                height={512}
                priority
                unoptimized
                className="relative z-10 h-full w-full"
              />
            </div>
          </Reveal>
        </div>
      </section>

      {/* A listra do poste de barbearia: o único enfeite da página, e é do assunto. */}
      <div
        aria-hidden
        className="h-3 bg-[repeating-linear-gradient(-45deg,#E0AE58_0_14px,#0B0A08_14px_28px,#F4EFE4_28px_42px,#0B0A08_42px_56px)]"
      />

      {/* --------------------------------------------- O produto de verdade */}
      <section className={`relative z-10 border-y ${BORDA} bg-[#100E0B]`}>
        <div className="mx-auto w-full max-w-6xl px-5 py-16 md:px-8 md:py-24">
          <Reveal>
            <p className="text-sm text-[#E0AE58]">O painel do dono</p>
            <h2 className="mt-3 max-w-2xl text-balance font-brand text-3xl leading-tight tracking-[-0.02em] md:text-5xl">
              O dia inteiro numa tela. O mês inteiro em outra.
            </h2>
          </Reveal>
          <Reveal delay={120}>
            <div className="relative mt-12 grid grid-cols-1 gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="min-w-0 overflow-x-auto rounded-2xl shadow-[0_24px_48px_-24px_#000] lg:rotate-[-0.8deg]">
                <AgendaDoDia />
              </div>
              <div className="min-w-0 self-end rounded-2xl shadow-[0_24px_48px_-24px_#000] lg:rotate-[0.8deg]">
                <ResumoDoMes />
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ------------------------------------------------- A dor, com número */}
      <section className="relative z-10 mx-auto w-full max-w-6xl px-5 py-16 md:px-8 md:py-24">
        <Reveal>
          <h2 className="max-w-2xl text-balance font-brand text-3xl leading-tight tracking-[-0.02em] md:text-5xl">
            Você sabe quanto faturou. <span className={LATAO}>Sabe quanto sobrou?</span>
          </h2>
        </Reveal>
        <div className={`mt-12 grid gap-px overflow-hidden rounded-2xl border ${BORDA} bg-[#2A2620] sm:grid-cols-3`}>
          {[
            {
              numero: "R$ 518",
              titulo: "perdidos por mês",
              texto: "É o que sete faltas por mês custam numa barbearia de ticket R$ 74. O dono raramente soma.",
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
              texto: "Antes disso você trabalhou para pagar aluguel, luz e a cadeira ao lado. Depois, o dinheiro é seu.",
            },
          ].map((item, i) => (
            <Reveal key={item.titulo} delay={i * 90}>
              <div className="h-full bg-[#0F0D0A] p-7 md:p-9">
                <p className={`font-brand text-4xl tracking-[-0.03em] md:text-5xl ${LATAO}`}>
                  {item.numero}
                </p>
                <p className="mt-2 text-sm font-medium">{item.titulo}</p>
                <p className={`mt-3 text-sm leading-relaxed ${APAGADO}`}>{item.texto}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------ Inteligente */}
      <section id="inteligente" className={`relative z-10 border-y ${BORDA} bg-[#100E0B]`}>
        <div className="mx-auto w-full max-w-6xl px-5 py-16 md:px-8 md:py-24">
          <Reveal>
            <p className="text-sm text-[#E0AE58]">O que o Topete faz sozinho</p>
            <h2 className="mt-3 max-w-2xl text-balance font-brand text-3xl leading-tight tracking-[-0.02em] md:text-5xl">
              Menos conta de cabeça. Mais cadeira ocupada.
            </h2>
          </Reveal>
          <dl className={`mt-12 grid grid-cols-1 border-t ${BORDA} md:grid-cols-2 md:gap-x-16`}>
            {INTELIGENTE.map(({ titulo, texto, exemplo }) => (
              <div key={titulo} className={`border-b ${BORDA} py-7`}>
                <dt className="font-brand text-xl md:text-2xl">{titulo}</dt>
                <dd className={`mt-2 text-sm leading-relaxed ${APAGADO}`}>{texto}</dd>
                <dd className="mt-3 text-sm italic text-[#E0AE58]">{exemplo}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ------------------------------------------------- Projeção de caixa */}
      <section className="relative z-10 mx-auto w-full max-w-6xl px-5 py-16 md:px-8 md:py-28">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-20">
          <Reveal>
            <p className="text-sm text-[#E0AE58]">Projeção de caixa</p>
            <h2 className="mt-3 text-balance font-brand text-3xl leading-tight tracking-[-0.02em] md:text-5xl">
              O dia em que o caixa vira, antes de virar
            </h2>
            <p className={`mt-5 max-w-md leading-relaxed ${APAGADO}`}>
              A projeção junta os horários já marcados, a cobrança dos mensalistas e
              as contas fixas de cada dia. Onde a linha cruza o zero, é ali que falta
              dinheiro — com semanas de antecedência para fazer algo a respeito.
            </p>
            <ul className="mt-7 flex flex-col gap-3">
              {[
                "Horizonte de um mês a um ano",
                "Diz quanto do número é estimativa — e quanto é horário marcado",
                "Ponto de equilíbrio calculado do seu custo real",
              ].map((t) => (
                <li key={t} className={`flex items-start gap-2.5 text-sm ${APAGADO}`}>
                  <Check size={16} className="mt-0.5 shrink-0 text-[#E0AE58]" />
                  {t}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={120}>
            <div className="rounded-2xl shadow-[0_24px_48px_-24px_#000]">
              <ProjecaoCurta />
            </div>
          </Reveal>
        </div>
      </section>

      {/* -------------------------------------------------------- Equipe */}
      <section className={`relative z-10 border-y ${BORDA} bg-[#100E0B]`}>
        <div className="mx-auto grid grid-cols-1 w-full max-w-6xl items-center gap-10 px-5 py-16 md:px-8 md:py-24 lg:grid-cols-2 lg:gap-16">
          <Reveal>
            <p className="text-sm text-[#E0AE58]">Equipe e números</p>
            <h2 className="mt-3 text-balance font-brand text-3xl leading-tight tracking-[-0.02em] md:text-4xl">
              Três cadeiras não viram conflito. O horário vazio aparece antes de você sentir.
            </h2>
            <p className={`mt-5 max-w-md leading-relaxed ${APAGADO}`}>
              Cada barbeiro com agenda, jornada, serviços e comissão próprios — e o
              cliente escolhe com quem quer cortar. O mapa de calor mostra os dias e
              horários mais cheios e a maior brecha da semana.
            </p>
            <div className="mt-8 rounded-2xl shadow-[0_24px_48px_-24px_#000]">
              <MapaDeCalor />
            </div>
          </Reveal>
          <Reveal delay={100}>
            <div className="relative mx-auto max-w-md lg:max-w-none">
              <div className={`overflow-hidden rounded-2xl border ${BORDA}`}>
                <Image
                  src={fotoEquipe}
                  alt="Dois barbeiros atendendo em cadeiras vizinhas enquanto o dono acompanha pelo tablet."
                  sizes="(min-width: 1024px) 32rem, (min-width: 640px) 28rem, 100vw"
                  className="h-full w-full object-cover"
                  placeholder="blur"
                />
              </div>
              <div className="relative z-10 -mt-10 mr-auto w-[86%] sm:-mt-14">
                <EquipeResumo />
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* -------------------------------------------------------- Origem */}
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
            <p className="text-sm text-[#E0AE58]">De onde veio</p>
            <p className="mt-5 text-balance font-brand text-2xl leading-snug tracking-[-0.02em] md:text-4xl">
              O Topete nasceu dentro de <span className={LATAO}>uma barbearia só</span>, para
              resolver o problema de um barbeiro só.
            </p>
            <p className={`mt-5 max-w-xl leading-relaxed ${APAGADO}`}>
              Cada tela aqui existe porque alguém perdeu dinheiro sem ela — a falta que
              ninguém somou, a comissão calculada sobre o preço errado, o mês que fechou
              no vermelho sem aviso. Não somos os maiores. Somos os que sabem por que
              cada número está onde está.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ------------------------------------------- O que ainda não existe */}
      <section className={`relative z-10 border-y ${BORDA} bg-[#100E0B]`}>
        <div className="mx-auto w-full max-w-6xl px-5 py-14 md:px-8 md:py-16">
          <Reveal>
            <div className="flex flex-col gap-3 md:flex-row md:items-baseline md:justify-between">
              <h2 className="text-balance font-brand text-2xl tracking-[-0.02em] md:text-3xl">
                O que ainda não está pronto
              </h2>
              <p className={`max-w-md text-sm leading-relaxed ${APAGADO}`}>
                Você recebe sem pagar mais por isso. Está aqui porque preferimos dizer do
                que você descobrir sozinho.
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
              ["Acesso de cada barbeiro", "Hoje o painel é do dono. Cada barbeiro vai ter a própria agenda e o próprio acerto."],
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

      {/* -------------------------------------------------------- Preço */}
      <section id="precos" className="relative z-10 mx-auto w-full max-w-6xl px-5 py-16 md:px-8 md:py-28">
        <Reveal>
          <h2 className="text-balance font-brand text-3xl leading-tight tracking-[-0.02em] md:text-5xl">
            Preço por barbearia, <span className={LATAO}>não por cadeira</span>
          </h2>
          <p className={`mt-4 max-w-xl leading-relaxed ${APAGADO}`}>
            A mensalidade cobre a equipe até o teto do plano. A marca própria vem
            inclusa, e não existe taxa de instalação.
          </p>
        </Reveal>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {/* Preço e teto saem de `PRECOS_POR_PLANO`, a mesma tabela que a tela
              Equipe usa para avisar do barbeiro extra — a página não pode
              prometer um teto e o painel cobrar outro. */}
          {[
            { nome: "Agenda", plano: PRECOS_POR_PLANO.agenda, texto: "Agenda com link e marca próprios, encaixe, clientes e caixa do dia.", destaque: false },
            { nome: "Crescimento", plano: PRECOS_POR_PLANO.crescimento, texto: "Tudo do Agenda, mais mensalistas com horário fixo, fidelidade e loja.", destaque: true },
            { nome: "Gestão", plano: PRECOS_POR_PLANO.gestao, texto: "Tudo, mais DRE, projeção de caixa e fechamento mensal.", destaque: false },
          ].map((p, i) => (
            <Reveal key={p.nome} delay={i * 90}>
              <div
                className={
                  "relative flex h-full flex-col gap-3 rounded-2xl border p-7 " +
                  (p.destaque
                    ? "border-[#E0AE58] bg-[#14120F]"
                    : `${BORDA} bg-[#14120F]`)
                }
              >
                {p.destaque && (
                  <span className="absolute -top-3 left-6 bg-[#0B0A08] px-2 text-[11px] uppercase tracking-[0.14em] text-[#E0AE58]">
                    Mais escolhido
                  </span>
                )}
                <p className="text-sm font-medium">{p.nome}</p>
                <p className="font-brand text-4xl tracking-[-0.03em]">
                  R$ {p.plano.mensal}
                  <span className={`text-base ${APAGADO}`}>/mês</span>
                </p>
                <p className={`text-sm font-medium ${LATAO}`}>
                  Até {p.plano.tetoDeBarbeiros} barbeiros
                </p>
                <p className={`text-sm leading-relaxed ${APAGADO}`}>{p.texto}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <p className={`mt-6 text-sm ${APAGADO}`}>
          <span className={`font-medium ${TEXTO}`}>Barbeiro extra:</span> R${" "}
          {PRECOS_POR_PLANO.agenda.barbeiroExtra}/mês cada, acima do teto do plano.
        </p>
      </section>

      {/* ---------------------------------------------------- Fechamento */}
      <section className={`relative z-10 overflow-hidden border-t ${BORDA}`}>
        <div className="relative mx-auto w-full max-w-3xl px-5 py-20 text-center md:px-8 md:py-28">
          <Reveal>
            <Image
              src="/topete-icone.svg"
              alt=""
              width={88}
              height={88}
              unoptimized
              className="mx-auto mb-8 h-20 w-20 rounded-[22%]"
            />
            <h2 className="text-balance font-brand text-4xl leading-tight tracking-[-0.03em] md:text-6xl">
              Vamos encher a sua <span className={LATAO}>agenda?</span>
            </h2>
            <p className={`mx-auto mt-5 max-w-md leading-relaxed ${APAGADO}`}>
              Em 20 minutos a gente mostra o Topete funcionando com os serviços e os
              horários da sua barbearia.
            </p>
            <div className="mt-10 flex justify-center">
              <BotaoPrincipal>Falar com a gente</BotaoPrincipal>
            </div>
            <p className={`mt-6 text-sm ${APAGADO}`}>@usetopete no Instagram</p>
          </Reveal>
        </div>
      </section>

      <footer className={`relative z-10 border-t ${BORDA}`}>
        <div className={`mx-auto flex w-full max-w-6xl flex-col gap-4 px-5 py-8 text-xs md:flex-row md:items-center md:justify-between md:px-8 ${APAGADO}`}>
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
