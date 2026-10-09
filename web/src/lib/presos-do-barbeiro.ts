import { EM_ABERTO } from "@/lib/domain";

/**
 * O que fica preso com um barbeiro que deixa de atender ou é removido (09/10):
 * os horários futuros em aberto e os mensalistas com horário fixo com ele.
 * Alimenta a confirmação da tela de Equipe, que diz o número antes do toque.
 */
export function contarPresos(params: {
  staffId: string;
  /** Hoje, `YYYY-MM-DD`. */
  hoje: string;
  reservas: Array<{ staffId?: string; date: string; status: string }>;
  fixos: Array<{ status?: string; horarioFixo?: { staffId?: string } | null }>;
}): { reservas: number; fixos: number } {
  return {
    reservas: params.reservas.filter(
      (r) => r.staffId === params.staffId && r.date >= params.hoje && EM_ABERTO.includes(r.status as never)
    ).length,
    fixos: params.fixos.filter((f) => f.status === "ativo" && f.horarioFixo?.staffId === params.staffId).length,
  };
}
