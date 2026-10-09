"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Reveal } from "@/components/landing/reveal";
import { ANUAL_DISPONIVEL } from "@/lib/platform";
import {
  MESES_GRATIS_NO_ANUAL,
  economiaDoAnual,
  equivalenteMensalDoAnual,
  type CicloDoPlano,
  type PlanId,
  type PrecoDoPlano,
} from "@/lib/tenant";
import { formatBRL } from "@/lib/format";

/**
 * Os cartões de preço da landing, com o alternador Mensal | Anual.
 *
 * Mora em componente de cliente só por causa do alternador. Com
 * `ANUAL_DISPONIVEL` falso o alternador nem é desenhado e o cartão sai igual
 * ao de antes (R$ N/mês): a página não anuncia um plano que a cobrança ainda
 * não sabe fazer. Preço e economia vêm da tabela única (`PRECOS_POR_PLANO`).
 */

export type CartaoDePlano = {
  id: PlanId;
  nome: string;
  plano: PrecoDoPlano;
  itens: string[];
  destaque: boolean;
};

export function GradeDePrecos({ cartoes }: { cartoes: CartaoDePlano[] }) {
  const [ciclo, setCiclo] = useState<CicloDoPlano>("mensal");
  const anual = ANUAL_DISPONIVEL && ciclo === "anual";

  return (
    <>
      {ANUAL_DISPONIVEL && (
        <div className="mt-8 flex flex-col gap-2">
          <div
            role="group"
            aria-label="Ciclo de cobrança"
            className="inline-flex self-start rounded-full border border-[#E6DDCB] bg-white p-1 text-sm"
          >
            {(["mensal", "anual"] as const).map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={ciclo === c}
                onClick={() => setCiclo(c)}
                className={
                  "rounded-full px-4 py-1.5 font-medium transition-colors " +
                  (ciclo === c ? "bg-[#16140F] text-[#E0AE58]" : "text-[#5A554C]")
                }
              >
                {c === "mensal" ? "Mensal" : `Anual (${MESES_GRATIS_NO_ANUAL} meses grátis)`}
              </button>
            ))}
          </div>
          {anual && (
            <p className="text-sm text-[#5A554C]">
              Pagamento à vista, por Pix ou boleto. O desconto de fundadora não vale no anual.
            </p>
          )}
        </div>
      )}
      <div className="mt-12 grid gap-4 md:grid-cols-3">
        {cartoes.map((p, i) => (
          <Reveal key={p.nome} delay={i * 90}>
            <div
              className={
                "relative flex h-full flex-col rounded-2xl border bg-white p-7 " +
                (p.destaque ? "border-[#C9A45C] shadow-[0_24px_50px_-30px_rgba(143,107,34,.55)]" : "border-[#E6DDCB]")
              }
            >
              {p.destaque && (
                <span className="absolute -top-3 left-6 rounded-full bg-[#16140F] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#E0AE58]">
                  Recomendado
                </span>
              )}
              <p className="text-sm font-semibold">{p.nome}</p>
              {anual ? (
                <>
                  <p className="mt-3 font-brand text-[2.6rem] leading-none tracking-[-0.03em]">
                    R$ {p.plano.anual}
                    <span className="text-base text-[#5A554C]">/ano</span>
                  </p>
                  <p className="mt-2 text-sm text-[#5A554C]">
                    Equivale a {formatBRL(equivalenteMensalDoAnual(p.plano.anual))}/mês · economize{" "}
                    {formatBRL(economiaDoAnual(p.id))}
                  </p>
                </>
              ) : (
                <p className="mt-3 font-brand text-[2.6rem] leading-none tracking-[-0.03em]">
                  R$ {p.plano.mensal}
                  <span className="text-base text-[#5A554C]">/mês</span>
                </p>
              )}
              <p className="mt-2 text-sm font-medium text-[#8F6B22]">Até {p.plano.tetoDeBarbeiros} barbeiros</p>
              <ul className="mt-6 flex flex-col gap-2.5 border-t border-[#EFE8DA] pt-5">
                {p.itens.map((t) => (
                  <li key={t} className="flex items-start gap-2 text-sm text-[#3A352C]">
                    <Check size={16} className="mt-0.5 shrink-0 text-[#8F6B22]" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        ))}
      </div>
    </>
  );
}
