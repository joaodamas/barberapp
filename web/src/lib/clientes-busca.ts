import type { ClientDoc } from "@/lib/domain";

/**
 * Encontrar o cliente que já existe — G3.
 *
 * Esta é a rede que impede o cadastro duplicado. A deduplicação por WhatsApp só
 * funciona no servidor quando o dono **não** cria um cliente novo; se ele
 * procurar, não achar, e clicar em "Cliente novo" com o número digitado de outro
 * jeito, nasce um segundo cadastro para a mesma pessoa. A busca é o que evita
 * isso, e por isso ela vive aqui, testada, e não dentro do JSX.
 *
 * ## O erro que este arquivo existe para não repetir
 *
 * A primeira versão comparava usando `normalizarWhatsapp`, que é a função de
 * **gravar**: ela devolve `""` abaixo de 10 dígitos e prefixa o DDI 55. O efeito
 * era que todo fragmento virava string vazia — buscar "97777" com o Seu Zé
 * cadastrado como "(11) 97777-6666" não devolvia nada, e a busca por número
 * simplesmente não funcionava. Passou por typecheck e por lint; só apareceu ao
 * abrir a tela.
 *
 * **Guardar e procurar são operações diferentes, e a normalização de uma não
 * serve para a outra.**
 */

export type ClienteBuscavel = Pick<ClientDoc, "name" | "whatsapp" | "active">;

/** Quantos dígitos justificam procurar por número em vez de por nome. */
const MINIMO_DE_DIGITOS = 3;

/**
 * O cliente casa com o que foi digitado?
 *
 * Nome por trecho, sem acento importar menos que o caso: quem digita "zé" acha
 * "Seu Zé da Esquina". Número por trecho de dígitos, comparado contra o número
 * inteiro gravado — inclusive o DDI, porque o dono digita o final do celular e
 * o banco guarda "5511...".
 */
export function combinaComBusca(cliente: ClienteBuscavel, termoBruto: string): boolean {
  const termo = termoBruto.trim().toLowerCase();
  if (!termo) return true;

  if ((cliente.name ?? "").toLowerCase().includes(termo)) return true;

  /* Dígitos crus. Menos de três não é busca, é ruído: "1" casaria com quase
   * todo mundo e esconderia o cliente certo no meio da lista. */
  const digitos = termoBruto.replace(/\D/g, "");
  if (digitos.length < MINIMO_DE_DIGITOS) return false;

  return (cliente.whatsapp ?? "").includes(digitos);
}

/**
 * Os clientes que o dono deve ver agora.
 *
 * Cadastro inativo fica de fora: ele é resultado de fusão, e marcar reserva nele
 * criaria histórico num registro que já foi substituído.
 */
export function filtrarClientes<T extends ClienteBuscavel>(
  clientes: T[],
  termo: string,
  limite = 8
): T[] {
  return clientes
    .filter((c) => c.active !== false && combinaComBusca(c, termo))
    .slice(0, limite);
}
