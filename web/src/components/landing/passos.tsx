"use client";

import { useEffect, useRef, useState } from "react";
import type { StaticImageData } from "next/image";
import { Celular, Notebook } from "@/components/landing/molduras";
import { useMenosMovimento } from "@/components/landing/movimento";
import celAgendarServicos from "@/assets/landing/cel-agendar-servicos.jpg";
import celAgendarHorario from "@/assets/landing/cel-agendar-horario.jpg";
import celEncaixePedido from "@/assets/landing/cel-encaixe-pedido.jpg";
import celEncaixeAprovado from "@/assets/landing/cel-encaixe-aprovado.jpg";
import celHoje from "@/assets/landing/cel-hoje.jpg";
import celPagamento from "@/assets/landing/cel-pagamento.jpg";
import celMensalistas from "@/assets/landing/cel-mensalistas.jpg";
import celProjecao from "@/assets/landing/cel-projecao.jpg";
import celAvisos from "@/assets/landing/cel-avisos.jpg";
import pcHoje from "@/assets/landing/pc-hoje.jpg";
import pcMensalistas from "@/assets/landing/pc-mensalistas.jpg";
import pcQuantoSobrou from "@/assets/landing/pc-quanto-sobrou.jpg";

/**
 * "Como funciona": o texto rola, a tela acompanha (02/10/2026).
 *
 * Todas as telas são quadros do app real. No computador, o aparelho fica parado
 * ao lado (sticky) e troca quando o passo correspondente cruza o meio da tela —
 * é a animação que tem função: quem lê "o cliente pede encaixe" está vendo o
 * pedido, e um instante depois o "Encaixe aprovado". No celular não há palco
 * fixo: cada passo traz a própria tela logo abaixo do texto, que é o que se lê
 * bem num aparelho de 6 polegadas.
 *
 * `prefers-reduced-motion`: as trocas viram corte seco e o passo de duas telas
 * mostra direto o resultado.
 */

type Passo = {
  rotulo: string;
  titulo: string;
  texto: string;
  /** Uma linha concreta: o exemplo ou o plano em que o recurso vem. */
  nota?: string;
  cel: { src: StaticImageData; alt: string };
  /** Segunda tela do mesmo passo — o "depois" da ação mostrada na primeira. */
  cel2?: { src: StaticImageData; alt: string };
  pc?: { src: StaticImageData; alt: string };
};

const PASSOS: Passo[] = [
  {
    rotulo: "O cliente",
    titulo: "Marca sozinho, pelo link da sua barbearia",
    texto:
      "Escolhe o serviço, o barbeiro e o horário — de madrugada, no domingo, quando quiser. O link tem o nome e as cores da barbearia e abre no navegador, sem baixar app.",
    nota: "barbeariadoze.topete.com.br",
    cel: { src: celAgendarServicos, alt: "Tela do cliente escolhendo Barba e Corte, com o preço do combo de R$ 75." },
    cel2: { src: celAgendarHorario, alt: "Tela do cliente escolhendo o barbeiro, o sábado e um horário livre." },
  },
  {
    rotulo: "Encaixe",
    titulo: "Horário cheio vira pedido de encaixe",
    texto:
      "O cliente pede num horário ocupado, o pedido chega para você com Aprovar e Recusar, e a resposta aparece nas reservas dele. Um toque entre um corte e outro.",
    cel: { src: celEncaixePedido, alt: "Painel do dono com um pedido de encaixe e os botões Aprovar encaixe e Recusar." },
    cel2: { src: celEncaixeAprovado, alt: "O mesmo painel com o aviso Encaixe aprovado: já está na agenda." },
  },
  {
    rotulo: "O seu dia",
    titulo: "O dia inteiro numa tela",
    texto:
      "Quantos atendimentos, quanto já entrou, quanto ainda vem e o que precisa de você. No celular, no balcão ou no computador — é a mesma agenda.",
    pc: { src: pcHoje, alt: "Painel do dono no computador: 26 atendimentos, ocupação, previsão do dia e recebido hoje." },
    cel: { src: celHoje, alt: "A mesma tela Hoje no celular do dono." },
  },
  {
    rotulo: "Fechamento",
    titulo: "Concluiu, cobrou, entrou no caixa",
    texto:
      "Fez sobrancelha além do corte? Adiciona o serviço e o combo sai com o preço certo. Escolhe Pix, cartão ou dinheiro, e a comissão de quem atendeu já está calculada.",
    cel: { src: celPagamento, alt: "No celular: Corte e Sobrancelha somados, R$ 65, e a escolha da forma de pagamento." },
  },
  {
    rotulo: "Mensalistas",
    titulo: "Horário fixo que se guarda sozinho",
    texto:
      "O horário de cada mensalista fica reservado semanas à frente. Remarcou? Muda só aquela semana. E você vê quem já pagou o mês e quem está em aberto.",
    nota: "Nos planos Crescimento e Gestão",
    pc: { src: pcMensalistas, alt: "Tela Mensalistas no computador: faturado, recebido, em aberto e a lista de planos." },
    cel: { src: celMensalistas, alt: "Mensalistas no celular, com o total recebido e o que está em aberto." },
  },
  {
    rotulo: "Financeiro",
    titulo: "Quanto sobrou, de verdade",
    texto:
      "Receita, comissões, taxas da maquininha e despesas num resultado do mês. E a projeção mostra o caixa dos próximos 30 dias, antes de ele apertar.",
    nota: "Projeção no Crescimento · resultado do mês (DRE) no Gestão",
    pc: { src: pcQuantoSobrou, alt: "Tela Quanto sobrou no computador: receita, custos e o resultado do mês." },
    cel: { src: celProjecao, alt: "Projeção de caixa dos próximos 30 dias no celular." },
  },
  {
    rotulo: "Avisos",
    titulo: "Os avisos chegam no seu celular",
    texto:
      "Pedido de encaixe, cliente que cancelou e reserva nova aparecem como notificação — ou no Telegram, de graça. Cada barbeiro recebe só o que é da cadeira dele.",
    cel: { src: celAvisos, alt: "Tela Avisos: notificação neste celular e conexão com o Telegram." },
  },
];

function Composicao({ passo, segunda, priority = false }: { passo: Passo; segunda: boolean; priority?: boolean }) {
  const cel = segunda && passo.cel2 ? passo.cel2 : passo.cel;
  if (passo.pc) {
    return (
      <div className="relative pb-[10%] pr-[6%]">
        <Notebook src={passo.pc.src} alt={passo.pc.alt} priority={priority} />
        <Celular src={cel.src} alt={cel.alt} className="absolute bottom-0 right-0 w-[27%]" sizes="(min-width: 1024px) 12rem, 28vw" />
      </div>
    );
  }
  return (
    <div className="relative mx-auto flex w-[min(100%,26rem)] items-end justify-center">
      <Celular src={cel.src} alt={cel.alt} className="w-[62%]" priority={priority} />
    </div>
  );
}

export function ComoFunciona() {
  const [ativo, setAtivo] = useState(0);
  // Índice do passo cuja segunda tela já apareceu; vale só enquanto ele é o ativo.
  const [segundaDe, setSegundaDe] = useState<number | null>(null);
  const reduzir = useMenosMovimento();
  const segunda = reduzir || segundaDe === ativo;
  const refs = useRef<(HTMLLIElement | null)[]>([]);

  // O passo que cruza o meio da janela é o ativo.
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entradas) => {
        for (const e of entradas) {
          if (e.isIntersecting) setAtivo(Number((e.target as HTMLElement).dataset.i));
        }
      },
      { rootMargin: "-48% 0px -48% 0px" }
    );
    refs.current.forEach((el) => el && obs.observe(el));
    return () => obs.disconnect();
  }, []);

  // Passo com duas telas: mostra a ação, e 1,6 s depois o resultado dela.
  useEffect(() => {
    if (!PASSOS[ativo].cel2 || reduzir) return;
    const t = window.setTimeout(() => setSegundaDe(ativo), 1600);
    return () => window.clearTimeout(t);
  }, [ativo, reduzir]);

  return (
    <div className="grid grid-cols-1 gap-x-16 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
      <ol className="relative">
        {PASSOS.map((p, i) => (
          <li
            key={p.titulo}
            ref={(el) => {
              refs.current[i] = el;
            }}
            data-i={i}
            className="flex flex-col justify-center py-10 lg:min-h-[78vh] lg:py-0"
          >
            <div
              className={
                "transition-opacity duration-500 motion-reduce:transition-none " +
                (ativo === i ? "lg:opacity-100" : "lg:opacity-35")
              }
            >
              <p className="flex items-center gap-3 text-sm font-medium text-[#8F6B22]">
                <span className="font-brand text-base tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                <span className="h-px w-8 bg-[#C9A45C]" aria-hidden />
                {p.rotulo}
              </p>
              <h3 className="mt-4 text-balance font-brand text-3xl leading-[1.08] tracking-[-0.02em] text-[#16140F] md:text-[2.6rem]">
                {p.titulo}
              </h3>
              <p className="mt-4 max-w-md leading-relaxed text-[#5A554C]">{p.texto}</p>
              {p.nota && <p className="mt-4 text-sm font-medium text-[#8F6B22]">{p.nota}</p>}
            </div>
            {/* No celular, a tela vem logo abaixo do texto. */}
            <div className="mt-8 lg:hidden">
              <Composicao passo={p} segunda={Boolean(p.cel2)} />
            </div>
          </li>
        ))}
      </ol>

      {/* No computador, o palco fica parado e troca de tela. */}
      <div className="hidden lg:block">
        <div className="sticky top-[11vh] flex h-[78vh] items-center">
          <div className="relative w-full">
            {PASSOS.map((p, i) => (
              <div
                key={p.titulo}
                aria-hidden={ativo !== i}
                className={
                  "transition-[opacity,transform] duration-700 ease-out motion-reduce:transition-none " +
                  (i === 0 ? "relative " : "absolute inset-0 ") +
                  (ativo === i ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0")
                }
              >
                <div className="flex h-full items-center">
                  <div className="w-full">
                    <Composicao passo={p} segunda={ativo === i && segunda} priority={i === 0} />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="absolute bottom-0 left-0 text-xs text-[#8A8170]">
            Telas reais do Topete, com uma barbearia de exemplo.
          </p>
        </div>
      </div>
    </div>
  );
}
