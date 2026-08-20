"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/format";
import { contar } from "@/lib/plural";
import { EditorDeServicos, type Servico } from "@/components/servicos-editor";
import type { Tenant } from "@/lib/tenant";

/**
 * Partir de uma tabela vazia com "Adicionar serviço" gera abandono. O cadastro
 * já semeia quatro linhas com preço zerado — vira uma tarefa de 90 segundos.
 *
 * A tabela em si é a mesma de `/painel/servicos`: era só aqui que o produto
 * escrevia em `services`, e quem terminava o onboarding ficava sem como mudar
 * um preço. O passo continua com o que é dele — o texto de ajuda e o botão que
 * exige ao menos um serviço vendável antes de seguir.
 */
export function PassoServicos({
  tenant,
  onSubmit,
  saving,
}: {
  tenant: Tenant;
  onSubmit: (data?: Record<string, unknown>) => void;
  saving: boolean;
}) {
  const [servicos, setServicos] = useState<Servico[]>([]);

  const validos = servicos.filter((s) => s.name.trim() && s.durationMin > 0 && s.price > 0);

  return (
    <div className="flex flex-col gap-4">
      <EditorDeServicos barbershopId={tenant.id} onChange={setServicos} />

      <div className="rounded-xl border border-border bg-surface-raised/60 p-4 text-xs text-ink-muted">
        <p className="mb-1 font-medium text-ink">Como preencher</p>
        <p>
          <strong className="text-ink">Nome:</strong> como você chama no dia a dia. &quot;Corte +
          barba&quot; funciona melhor que &quot;Combo Premium&quot;.
        </p>
        <p>
          <strong className="text-ink">Duração:</strong> quanto tempo você realmente leva,
          incluindo a conversa. A agenda usa isso para não marcar dois clientes em cima.
        </p>
      </div>

      <Button
        onClick={() => onSubmit()}
        disabled={validos.length === 0 || saving}
        title={validos.length === 0 ? "Preencha ao menos um serviço com preço" : undefined}
      >
        {saving
          ? "Salvando…"
          : validos.length === 0
            ? "Preencha ao menos um serviço"
            : /* Este `(s)` é o mais caro dos nove: é o PRIMEIRO texto do
                 produto que um dono novo lê, no onboarding, e o caso de um
                 serviço só é o mais provável nesse momento. */
              `Continuar com ${contar(validos.length, "serviço", "serviços")} · ${formatBRL(
                validos.reduce((s, x) => s + x.price, 0) / validos.length
              )} em média`}
      </Button>
    </div>
  );
}
