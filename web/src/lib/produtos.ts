import type { Doc } from "@/lib/db/repository";
import type { InventoryMovementDoc } from "@/lib/domain";
import { formatBRL } from "@/lib/format";
import { lerReais, VALOR_ILEGIVEL } from "@/lib/reais";
import { rotuloDoMotivo } from "@/lib/ajuste-de-estoque";

/**
 * Editar e arquivar produto — o lado da tela.
 *
 * ⚠️ PAR com a regra de `products` em `firestore.rules`: o servidor de regras
 * recusa o que a tela nem deveria mandar (preço ou custo negativo, campo fora
 * da lista). Mudar a lista de campos aqui exige mudar lá.
 */

export const TAMANHO_MAXIMO_DO_NOME = 120;

/** O que a edição pode tocar. Estoque NÃO entra: só o servidor muda o saldo. */
export type EdicaoDeProduto = {
  name: string;
  price: number;
  cost: number;
  minStock: number;
};

export type CamposDeEdicao = {
  name: string;
  price: string;
  cost: string;
  minStock: string;
};

/** Os campos do produto como a tela os mostra ao abrir a edição. */
export function camposDoProduto(
  p: { name: string; price: number; cost: number; minStock: number },
  paraCampo: (v: number) => string
): CamposDeEdicao {
  /* Produto antigo pode não ter custo/preço/mínimo gravados: o campo abre
   * VAZIO, e não "NaN" ou "undefined". */
  const numero = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? paraCampo(v) : "");
  return {
    name: p.name ?? "",
    price: numero(p.price),
    cost: numero(p.cost),
    minStock: typeof p.minStock === "number" && Number.isFinite(p.minStock) ? String(p.minStock) : "",
  };
}

/**
 * Lê o formulário de edição. Devolve o erro em português, ou o valor limpo.
 *
 * Preço precisa ser maior que zero (produto de graça não se vende); custo pode
 * ser zero (brinde do fornecedor) mas nunca negativo; mínimo é inteiro.
 */
export function lerEdicaoDeProduto(
  campos: CamposDeEdicao
): { ok: true; valor: EdicaoDeProduto } | { ok: false; erro: string } {
  const name = campos.name.trim();
  if (!name) return { ok: false, erro: "Informe o nome do produto." };
  if (name.length > TAMANHO_MAXIMO_DO_NOME) {
    return { ok: false, erro: `O nome pode ter até ${TAMANHO_MAXIMO_DO_NOME} caracteres.` };
  }

  const price = lerReais(campos.price);
  if (price === null) return { ok: false, erro: VALOR_ILEGIVEL };
  if (!(price > 0)) return { ok: false, erro: "Informe um preço de venda maior que zero." };

  if (campos.cost.trim() === "") return { ok: false, erro: "Informe o custo unitário." };
  const cost = lerReais(campos.cost);
  if (cost === null) return { ok: false, erro: VALOR_ILEGIVEL };

  const minTexto = campos.minStock.trim();
  if (minTexto !== "" && !/^\d+$/.test(minTexto)) {
    return { ok: false, erro: "O estoque mínimo precisa ser um número inteiro." };
  }

  return { ok: true, valor: { name, price, cost, minStock: minTexto === "" ? 0 : Number(minTexto) } };
}

export function estaArquivado(p: { archived?: boolean | null }): boolean {
  return p.archived === true;
}

/** Ativos na lista principal; arquivados na seção recolhida. */
export function separarArquivados<T extends { archived?: boolean | null }>(
  produtos: T[]
): { ativos: T[]; arquivados: T[] } {
  const ativos: T[] = [];
  const arquivados: T[] = [];
  for (const p of produtos) (estaArquivado(p) ? arquivados : ativos).push(p);
  return { ativos, arquivados };
}

/** Arquivar produto com saldo pede confirmação: some do "Vender" com unidades dentro. */
export function pedeConfirmacaoParaArquivar(p: { stock?: number | null }): boolean {
  return (Number(p.stock) || 0) > 0;
}

/* ================================================================== */
/* O histórico do produto                                             */
/* ================================================================== */

export type LinhaDoHistorico = {
  id: string;
  date: string;
  tipo: "compra" | "venda" | "devolucao" | "ajuste";
  titulo: string;
  detalhe: string;
  /** Efeito no saldo: positivo sobe, negativo desce. */
  delta: number;
};

/**
 * Tudo o que mexeu no saldo do produto, mais recente primeiro.
 *
 * Ajuste manual lê `quantity` ASSINADA; a devolução (`refundOf`) é positiva por
 * construção. As duas moram em `kind: "ajuste"` e a tela as distingue pelo
 * `refundOf` — a mesma regra do DRE.
 */
export function historicoDoProduto(
  movimentos: Doc<InventoryMovementDoc>[],
  productId: string
): LinhaDoHistorico[] {
  const linhas: LinhaDoHistorico[] = [];

  for (const m of movimentos) {
    if (m.productId !== productId) continue;
    const q = Number(m.quantity) || 0;
    const date = String(m.date ?? "");

    if (m.kind === "compra") {
      const custo = Number(m.unitCost);
      linhas.push({
        id: m.id,
        date,
        tipo: "compra",
        titulo: "Entrada",
        detalhe: Number.isFinite(custo) ? `a ${formatBRL(custo)} por unidade` : "",
        delta: q,
      });
    } else if (m.kind === "venda") {
      const preco = Number(m.unitPrice);
      linhas.push({
        id: m.id,
        date,
        tipo: "venda",
        titulo: "Venda",
        detalhe: Number.isFinite(preco) ? `a ${formatBRL(preco)} por unidade` : "",
        delta: -q,
      });
    } else if (m.kind === "ajuste" && m.refundOf) {
      linhas.push({
        id: m.id,
        date,
        tipo: "devolucao",
        titulo: "Devolução",
        detalhe: "voltou para o estoque",
        delta: q,
      });
    } else if (m.kind === "ajuste") {
      linhas.push({
        id: m.id,
        date,
        tipo: "ajuste",
        titulo: q < 0 ? "Saída sem venda" : "Ajuste de contagem",
        detalhe: rotuloDoMotivo(m.reason, m.reasonText),
        delta: q,
      });
    } else if (m.kind === "perda") {
      linhas.push({ id: m.id, date, tipo: "ajuste", titulo: "Perda", detalhe: "", delta: -q });
    }
  }

  return linhas.sort((a, b) => b.date.localeCompare(a.date));
}
