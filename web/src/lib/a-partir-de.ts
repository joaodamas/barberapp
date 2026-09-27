/**
 * "a partir de" é uma MARCA do preço, não parte do nome do serviço.
 *
 * A tela de Serviços não tinha onde marcar isso, e o dono escreveu no nome:
 * "Luzes a partir de", "Pigmentação a partir de" (O Siqueira, 26/09). O app do
 * cliente então mostrava "Luzes a partir de · a partir de R$ 80,00" — ou, onde
 * a marca não estava ligada, prometia um preço fechado para um serviço que não
 * tem.
 *
 * Esta função separa as duas coisas. Ela roda na LEITURA (`useServices`), para
 * o que já está gravado aparecer certo em toda tela, e na GRAVAÇÃO (editor de
 * Serviços), para o nome ser corrigido de vez no primeiro salvar.
 */
const SUFIXO = /[\s\-–—·(]*a\s+partir\s+de[\s:)]*$/i;
const PREFIXO = /^a\s+partir\s+de[\s:]+/i;

export function separarAPartirDe<S extends { name?: string; priceFrom?: boolean }>(servico: S): S {
  const nome = servico.name ?? "";
  const limpo = nome.replace(SUFIXO, "").replace(PREFIXO, "").trim();
  if (limpo === nome.trim() || !limpo) return servico;
  return { ...servico, name: limpo, priceFrom: true };
}
