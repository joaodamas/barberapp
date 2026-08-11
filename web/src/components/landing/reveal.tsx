"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Revela o bloco quando ele entra na tela.
 *
 * `IntersectionObserver` e não animação por scroll contínuo: o efeito dispara
 * uma vez e para. Elemento que se move enquanto a pessoa lê é a crítica mais
 * comum a esse estilo de página — "enquanto você ainda está usando o site tem
 * mil informações aparecendo, e isso atrapalha".
 *
 * `prefers-reduced-motion` não é enfeite de acessibilidade aqui: quem marcou
 * essa preferência costuma ter enjoo com movimento, e uma página inteira que
 * desliza é exatamente o gatilho. Nesse caso o conteúdo nasce visível, sem
 * transição nenhuma.
 */
export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  /** Atraso em ms, para escalonar itens de uma mesma linha. */
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    const reduzir = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduzir) {
      setVisivel(true);
      return;
    }
    const el = ref.current;
    if (!el) return;

    const observador = new IntersectionObserver(
      ([entrada]) => {
        if (entrada.isIntersecting) {
          setVisivel(true);
          observador.disconnect();
        }
      },
      // 12% já dentro da tela: revelar no primeiro pixel faz o bloco aparecer
      // ainda cortado pela dobra.
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    observador.observe(el);
    return () => observador.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={
        "transition-[opacity,transform] duration-700 ease-out motion-reduce:transition-none " +
        (visivel ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0") +
        (className ? ` ${className}` : "")
      }
    >
      {children}
    </div>
  );
}

/**
 * Revela palavra a palavra.
 *
 * Escalonar por PALAVRA e não por letra: letra a letra vira efeito de
 * apresentação de slide e atrasa a leitura do que é a promessa da página.
 * Palavra dá cadência sem custar tempo — 45 ms entre elas some como percepção
 * e aparece como intenção.
 */
export function RevealPalavras({
  texto,
  className = "",
  destaque,
  classeDestaque = "",
}: {
  texto: string;
  className?: string;
  /** Palavras que recebem tratamento próprio. */
  destaque?: string[];
  classeDestaque?: string;
}) {
  const [visivel, setVisivel] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisivel(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const o = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setVisivel(true);
          o.disconnect();
        }
      },
      { threshold: 0.2 }
    );
    o.observe(el);
    return () => o.disconnect();
  }, []);

  return (
    <span ref={ref} className={className}>
      {texto.split(" ").map((palavra, i) => (
        <span
          key={`${palavra}-${i}`}
          style={{ transitionDelay: `${i * 45}ms` }}
          className={
            "inline-block transition-[opacity,transform] duration-500 ease-out motion-reduce:transition-none " +
            (visivel ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0") +
            (destaque?.includes(palavra) ? ` ${classeDestaque}` : "")
          }
        >
          {palavra}
          {"\u00A0"}
        </span>
      ))}
    </span>
  );
}
