"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { EditorDeServicos, type Servico } from "@/components/servicos-editor";
import { useTenant } from "@/lib/tenant-context";
import { formatBRL } from "@/lib/format";
import { contar, plural } from "@/lib/plural";

/**
 * Cardápio da barbearia.
 *
 * Existe porque `services` só era editável dentro do passo 3 de `/comecar`:
 * quem terminava o onboarding não tinha mais como mexer em preço, duração ou
 * no que aparece para o cliente. Era a tabela que sustenta a agenda inteira,
 * sem tela no painel.
 */
export default function ServicosPage() {
  const tenant = useTenant();
  const [servicos, setServicos] = useState<Servico[]>([]);

  const ativos = servicos.filter((s) => s.active !== false);
  const semNome = servicos.filter((s) => !s.name.trim());
  const semPreco = ativos.filter((s) => !(s.price > 0));

  const ticketMedio = ativos.length
    ? ativos.reduce((soma, s) => soma + s.price, 0) / ativos.length
    : 0;

  /* A agenda monta os horários a partir da duração: um serviço mais longo que
   * a jornada nunca produz slot, e o cliente vê o dia inteiro indisponível sem
   * entender por quê. */
  const jornadaMin = minutosEntre(tenant.schedule.opensAt, tenant.schedule.closesAt);
  const longoDemais = ativos.filter((s) => s.durationMin > jornadaMin);

  return (
    <div className="flex flex-col gap-6 pt-1 md:gap-10 md:pt-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-ivory-muted md:text-base">Catálogo</p>
          <h1 className="text-xl text-ivory md:text-4xl md:tracking-tight">Serviços</h1>
        </div>
        <Pill tone={ativos.length === 0 ? "danger" : "neutral"}>
          {ativos.length} no app
        </Pill>
      </div>

      {ativos.length === 0 && (
        <Aviso tom="danger">
          <strong className="font-semibold">Nenhum serviço visível.</strong> Enquanto
          estiver assim, seu cliente abre o app e não tem o que agendar.
        </Aviso>
      )}

      {/* "serviço(s) visível(is)" — dois parênteses na mesma frase, e o
          segundo é o pior deles: ninguém lê "visível(is)" e entende. */}
      {semPreco.length > 0 && (
        <Aviso tom="danger">
          {contar(semPreco.length, "serviço", "serviços")}{" "}
          {plural(semPreco.length, "visível", "visíveis")} com preço zerado:{" "}
          {semPreco.map((s) => s.name || "sem nome").join(", ")}. O cliente
          consegue agendar sem pagar nada.
        </Aviso>
      )}

      {longoDemais.length > 0 && (
        <Aviso tom="danger">
          {/* O verbo e o demonstrativo concordavam com um serviço só; com dois
              a frase virava "Corte, Barba dura mais... para esse serviço". */}
          {longoDemais.map((s) => s.name).join(", ")}{" "}
          {plural(longoDemais.length, "dura", "duram")} mais que o expediente (
          {tenant.schedule.opensAt}–{tenant.schedule.closesAt}). A agenda não
          consegue oferecer nenhum horário para{" "}
          {plural(longoDemais.length, "esse serviço", "esses serviços")}.
        </Aviso>
      )}

      <section className="grid gap-4 md:grid-cols-[1.6fr_1fr] md:gap-8">
        <Card className="flex flex-col gap-4 md:p-6">
          <EditorDeServicos
            barbershopId={tenant.id}
            permiteDesativar
            onChange={setServicos}
          />
        </Card>

        <div className="flex flex-col gap-4">
          <Card className="flex flex-col gap-1 md:p-6">
            <p className="text-[11px] uppercase tracking-wide text-ivory-muted md:text-xs">
              Ticket médio do cardápio
            </p>
            <p className="font-display text-lg font-semibold text-ivory md:text-2xl">
              {formatBRL(ticketMedio)}
            </p>
            <p className="text-[11px] text-ivory-muted md:text-xs">
              Média simples {plural(ativos.length, "do", "dos")}{" "}
              {contar(ativos.length, "serviço", "serviços")}{" "}
              {plural(ativos.length, "visível", "visíveis")} — não é o que você
              fatura por atendimento, que depende do que o cliente escolhe.
            </p>
          </Card>

          <Card className="flex flex-col gap-2 text-xs text-ivory-muted md:p-6 md:text-sm">
            <p className="font-medium text-ivory">Como isso afeta a agenda</p>
            <p>
              <strong className="text-ivory">Duração</strong> é o tempo que você
              realmente leva, com a conversa. É ela que impede a agenda de marcar
              dois clientes em cima.
            </p>
            <p>
              <strong className="text-ivory">Ocultar</strong> tira do app sem
              apagar o histórico — use para o serviço sazonal, em vez de excluir e
              recadastrar depois.
            </p>
            {semNome.length > 0 && (
              <p className="text-danger">
                {contar(semNome.length, "linha", "linhas")} sem nome{" "}
                {plural(semNome.length, "não é salva", "não são salvas")} até você
                preencher.
              </p>
            )}
          </Card>
        </div>
      </section>
    </div>
  );
}

function Aviso({ children, tom }: { children: React.ReactNode; tom: "danger" }) {
  return (
    <Card
      className={`flex items-start gap-3 md:p-5 ${
        tom === "danger" ? "border-danger/30" : ""
      }`}
    >
      <AlertTriangle size={18} className="mt-0.5 shrink-0 text-danger" />
      <p className="text-sm text-ivory md:text-base">{children}</p>
    </Card>
  );
}

/** Minutos entre dois horários `HH:MM`. */
function minutosEntre(inicio: string, fim: string) {
  const min = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  return Math.max(min(fim) - min(inicio), 0);
}
