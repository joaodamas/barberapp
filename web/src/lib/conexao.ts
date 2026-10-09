/**
 * Estado da conexão para o aviso "Sem conexão — mostrando dados de HH:MM".
 *
 * Com o cache persistente do Firestore, sem rede as telas continuam mostrando o
 * que está guardado no aparelho — e nada diz que aquilo pode estar velho. O
 * aviso existe para isso: o dono que olha a agenda de um sinal ruim precisa
 * saber que o que vê não é de agora.
 *
 * Duas fontes, as baratas:
 * - os eventos `online`/`offline` do navegador decidem SE há aviso;
 * - o último snapshot que veio do servidor (`metadata.fromCache === false`,
 *   registrado em `repository.ts`) diz DE QUANDO são os dados.
 */
export type EstadoDaConexao = { online: boolean; ultimaDoServidor: number | null };

/* Fora do objeto de estado, para registrar a hora sem criar um snapshot novo
 * a cada leitura (o `useSyncExternalStore` compara por identidade). */
let ultima: number | null = null;
let estado: EstadoDaConexao = {
  online: typeof navigator === "undefined" ? true : navigator.onLine,
  ultimaDoServidor: null,
};
const ouvintes = new Set<() => void>();
let ligado = false;

function emitir(novo: EstadoDaConexao) {
  estado = novo;
  ouvintes.forEach((fn) => fn());
}

function ligarEventos() {
  if (ligado || typeof window === "undefined") return;
  ligado = true;
  window.addEventListener("online", () => emitir({ online: true, ultimaDoServidor: ultima }));
  window.addEventListener("offline", () => emitir({ online: false, ultimaDoServidor: ultima }));
  // O valor inicial pode ter sido lido antes de o navegador saber.
  if (estado.online !== navigator.onLine) estado = { online: navigator.onLine, ultimaDoServidor: ultima };
}

/**
 * Um snapshot veio do SERVIDOR. Não notifica ninguém (o aviso nem está na
 * tela); só guarda a hora, para o aviso já nascer com ela quando a rede cair.
 */
export function registrarLeituraDoServidor(agora: number = Date.now()) {
  ultima = agora;
}

export function assinarConexao(aoMudar: () => void) {
  ligarEventos();
  ouvintes.add(aoMudar);
  return () => {
    ouvintes.delete(aoMudar);
  };
}

export const lerConexao = () => estado;
export const conexaoNoServidor = (): EstadoDaConexao => ({ online: true, ultimaDoServidor: null });

/** A frase do aviso. Sem hora conhecida, não inventa uma. */
export function textoDoAvisoDeConexao(ultimaDoServidor: number | null): string {
  if (ultimaDoServidor === null) {
    return "Sem conexão — mostrando os dados salvos neste aparelho";
  }
  const hhmm = new Date(ultimaDoServidor).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `Sem conexão — mostrando dados de ${hhmm}`;
}
