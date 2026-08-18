/**
 * Em que estado está a lista de horários do passo 2 — a regra em um lugar só.
 *
 * ## Por que existe
 *
 * A tela tinha DOIS estados onde o produto precisa de CINCO, e o buraco tinha
 * uma consequência direta: com dois barbeiros cadastrados e nenhum escolhido
 * ainda, `/agendar` afirmava
 *
 * > *"Nenhum horário livre comporta 30 min neste dia."*
 *
 * sem ter perguntado nada a servidor nenhum. A consulta de disponibilidade
 * desiste quando não há `staffId`, então a resposta ficava `null` — e o `null`
 * caía no mesmo ramo da lista vazia, que significa o oposto: *o servidor
 * respondeu, e não há horário*.
 *
 * Não era um canto raro. Numa barbearia com dois profissionais nenhum vem
 * pré-selecionado, então essa era a **primeira frase** que todo cliente lia ao
 * chegar no passo 2. Ele troca de dia, lê a mesma coisa, conclui que a agenda
 * está lotada e sai. Na verificação de 18/08 havia horário livre no mesmo dia:
 * ele apareceu assim que um profissional foi selecionado, sem nada mudar no
 * banco.
 *
 * É a régua do produto inteiro, nas `UI-UX-GUIDELINES` §9 — *"o sistema não
 * pode afirmar que algo aconteceu quando não aconteceu"* — e a §7, que proíbe
 * um estado terminal de se parecer com um que ainda vai chegar.
 *
 * ## Por que uma função, e não três booleanos na tela
 *
 * Os estados são **mutuamente exclusivos** e a ordem entre eles importa: dia
 * fechado vence a falta de profissional, que vence o carregando, que vence o
 * vazio. Escrito como booleanos soltos no JSX, cada `&&` novo é uma chance de
 * dois ramos aparecerem juntos ou de nenhum aparecer — e o defeito que isto
 * conserta nasceu exatamente de dois significados dividindo um ramo só.
 *
 * Uma função também é a única forma de o teste alcançar a regra: a suíte roda
 * em `environment: "node"` e o repo não tem testing-library, então a página
 * não renderiza em teste. O que dá para provar sem renderizar é a decisão.
 */

/** `null` = a pergunta não foi feita, ou não voltou. `[]` = voltou vazia. */
export type HorariosLivres = string[] | null;

export type EstadoDosHorarios =
  /** A barbearia não abre neste dia. Nem se pergunta. */
  | "dia-fechado"
  /** Falta escolher o profissional — a consulta depende dele. */
  | "escolher-profissional"
  /** A pergunta foi feita e a resposta ainda não voltou. */
  | "carregando"
  /** O servidor respondeu: não há horário livre que caiba. */
  | "sem-horario"
  /** Há horário livre para mostrar. */
  | "com-horario";

export function estadoDosHorarios({
  diaFechado,
  temProfissional,
  horariosLivres,
}: {
  diaFechado: boolean;
  temProfissional: boolean;
  horariosLivres: HorariosLivres;
}): EstadoDosHorarios {
  if (diaFechado) return "dia-fechado";
  if (!temProfissional) return "escolher-profissional";
  if (horariosLivres === null) return "carregando";
  return horariosLivres.length > 0 ? "com-horario" : "sem-horario";
}
