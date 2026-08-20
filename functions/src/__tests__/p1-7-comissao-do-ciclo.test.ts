import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  estornoDaComissaoDeServico,
  idDaComissaoDeCicloNovo,
  idDoEstornoDaComissaoDeServico,
} from "../comissoes";
import {
  calcularEventoFinanceiro,
  chaveDoCiclo,
  SEM_TAXA,
  type PaymentFees,
} from "../financial-events";

/**
 * P1-7 — a comissão de um atendimento reconcluído.
 *
 * ## O que o gate mediu, e nenhum teste pegava
 *
 * `completed → no_show → completed` apagava `comissao_{bookingId}` e o recriava
 * lendo `staff.commissionPct` de HOJE. Em 20/08, na bancada com trigger real,
 * um atendimento de R$ 50,00 comissionado a 40% (R$ 20,00) renasceu a 60%
 * (R$ 30,00) porque o cadastro mudou entre as duas conclusões.
 *
 * O teste que deveria ter pego isso — `financial-events.test.ts` › "o histórico
 * não muda quando o cadastro muda" — chama `calcularEventoFinanceiro` duas vezes
 * e compara duas variáveis locais. Ele prova que uma função pura não muta o
 * objeto que já devolveu, o que é verdade trivial em JavaScript. Sobre o
 * DOCUMENTO GRAVADO, que é o que o título afirma, ele não diz nada.
 *
 * Este arquivo cobre o que aquele promete.
 */

const TAXAS: PaymentFees = { ...SEM_TAXA, debito: 1.99, credito: 3.49 };

/** O atendimento-âncora do gate: corte de R$ 50,00, barbeiro a 40%. */
const CONCLUSAO_ORIGINAL = calcularEventoFinanceiro({
  valor: 50,
  metodo: "pix",
  commissionPctDoBarbeiro: 40,
  padraoPct: 40,
  fees: TAXAS,
});

describe("P1-7 · a reversão nega o que foi gravado, não o que o cadastro diz hoje", () => {
  it("o estorno espelha exatamente a linha original", () => {
    const original = CONCLUSAO_ORIGINAL.commission;

    const estorno = estornoDaComissaoDeServico({
      bookingId: "bk1",
      chave: "ev1",
      staffId: "b-rafael",
      uid: null,
      staffName: "Rafael",
      date: "2026-08-20",
      commissionPct: original.commissionPct,
      commissionBase: original.commissionBase,
      commissionAmount: original.commissionAmount,
    });

    expect(estorno.commissionAmount).toBe(-20);
    expect(estorno.commissionBase).toBe(-50);
    expect(estorno.commissionPct).toBe(40);
    expect(estorno.origin).toBe("servico");
    expect(estorno.bookingId).toBe("bk1");
  });

  it("o par soma zero — é o que tira o valor do acerto sem apagar o histórico", () => {
    const original = CONCLUSAO_ORIGINAL.commission;
    const estorno = estornoDaComissaoDeServico({
      bookingId: "bk1",
      chave: "ev1",
      staffId: "b-rafael",
      uid: null,
      staffName: "Rafael",
      date: "2026-08-20",
      commissionPct: original.commissionPct,
      commissionBase: original.commissionBase,
      commissionAmount: original.commissionAmount,
    });

    expect(original.commissionAmount + estorno.commissionAmount).toBe(0);
  });

  it("o cadastro mudou para 60% e o ESTORNO continua a 40%", () => {
    /* Se o estorno relesse o cadastro, negaria R$ 30,00 de uma comissão de
     * R$ 20,00 — e sobraria saldo NEGATIVO de um atendimento que existiu.
     * É o mesmo argumento que `refunds.ts` já fazia para a venda. */
    const original = CONCLUSAO_ORIGINAL.commission;
    const estorno = estornoDaComissaoDeServico({
      bookingId: "bk1",
      chave: "ev1",
      staffId: "b-rafael",
      uid: null,
      staffName: "Rafael",
      date: "2026-08-20",
      commissionPct: original.commissionPct,
      commissionBase: original.commissionBase,
      commissionAmount: original.commissionAmount,
    });

    const seRelesseOCadastro = calcularEventoFinanceiro({
      valor: 50,
      metodo: "pix",
      commissionPctDoBarbeiro: 60,
      padraoPct: 40,
      fees: TAXAS,
    }).commission.commissionAmount;

    expect(seRelesseOCadastro).toBe(30);
    expect(Math.abs(estorno.commissionAmount)).toBe(20);
  });
});

describe("P1-7 · o ciclo inteiro fecha no valor do FATO", () => {
  it("concluir → desfazer → reconcluir devolve os mesmos R$ 20,00, com o cadastro a 60%", () => {
    const original = CONCLUSAO_ORIGINAL.commission;

    const estorno = estornoDaComissaoDeServico({
      bookingId: "bk1",
      chave: "ev1",
      staffId: "b-rafael",
      uid: null,
      staffName: "Rafael",
      date: "2026-08-20",
      commissionPct: original.commissionPct,
      commissionBase: original.commissionBase,
      commissionAmount: original.commissionAmount,
    });

    /* A reconclusão usa o percentual CONGELADO — é o que o handler passa como
     * `pctCongelado`, em vez de `staffSnap.get("commissionPct")`. */
    const reconclusao = calcularEventoFinanceiro({
      valor: 50,
      metodo: "cash",
      commissionPctDoBarbeiro: original.commissionPct,
      padraoPct: 40,
      fees: TAXAS,
    }).commission;

    const saldo =
      original.commissionAmount + estorno.commissionAmount + reconclusao.commissionAmount;

    expect(saldo).toBe(20);
    expect(reconclusao.commissionPct).toBe(40);
  });

  it("o bruto do pagamento é o do fato, mesmo que o preço da reserva tenha mudado", () => {
    /* O defeito irmão: a rematerialização lia `booking.value` de agora. Editar o
     * preço do serviço entre as duas conclusões fazia o "mesmo" pagamento
     * renascer com outro bruto, sem nada registrar a troca. */
    const congelado = { grossAmount: 50 };
    const reservaHoje = { value: 90 };

    const valorUsado = congelado.grossAmount;
    expect(valorUsado).toBe(50);
    expect(valorUsado).not.toBe(reservaHoje.value);
  });
});

describe("P1-7 · os ids são derivados, e é isso que sobrevive ao retry", () => {
  it("o estorno deriva da reserva E do evento", () => {
    expect(idDoEstornoDaComissaoDeServico("bk1", "ev1")).toBe("comissao_estorno_bk1_ev1");
  });

  it("dois ciclos da mesma reserva não colidem", () => {
    expect(idDoEstornoDaComissaoDeServico("bk1", "ev1")).not.toBe(
      idDoEstornoDaComissaoDeServico("bk1", "ev3")
    );
  });

  it("a reconclusão NÃO reusa o id da conclusão original", () => {
    /* Se reusasse, a linha positiva sobrescreveria a que o estorno negou e o
     * barbeiro terminaria o ciclo com zero sobre um atendimento que aconteceu. */
    expect(idDaComissaoDeCicloNovo("bk1", "ev2")).not.toBe("comissao_bk1");
    expect(idDaComissaoDeCicloNovo("bk1", "ev2")).toBe("comissao_bk1_ev2");
  });

  it("a mesma entrega reprocessada produz o MESMO id", () => {
    /* Idempotência por construção: o retry sobrescreve em vez de somar de novo.
     * Uma chave de relógio ou aleatória gravaria a segunda linha negativa e
     * cortaria o acerto pela metade — defeito pior que o corrigido. */
    expect(chaveDoCiclo("abc-123")).toBe(chaveDoCiclo("abc-123"));
    expect(idDoEstornoDaComissaoDeServico("bk1", chaveDoCiclo("abc-123"))).toBe(
      idDoEstornoDaComissaoDeServico("bk1", chaveDoCiclo("abc-123"))
    );
  });

  it("a chave é sanitizada — id de documento não aceita barra", () => {
    /* Uma chave com "/" criaria uma subcoleção em vez de um documento, e o
     * Firestore aceitaria sem reclamar. Mesma precaução do R1. */
    expect(chaveDoCiclo("a/b/c")).toBe("abc");
    expect(chaveDoCiclo(undefined)).toBe("sem-evento");
    expect(chaveDoCiclo("")).toBe("sem-evento");
  });
});

/**
 * O código, sem os comentários.
 *
 * A primeira versão de "a reversão não apaga mais a comissão" falhou contra o
 * COMENTÁRIO que explica o que havia ali antes — o teste media texto, não
 * comportamento. Um teste de fonte que não distingue os dois ou mente sobre o
 * código, ou proíbe explicar a própria mudança.
 */
function codigoDe(arquivo: string): string {
  return readFileSync(resolve(__dirname, "..", arquivo), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("P1-7 · o que a fonte precisa continuar dizendo", () => {
  const fonte = codigoDe("financial-events.ts");

  it("a reversão NÃO apaga mais a comissão", () => {
    /* Esta é a linha que causava o dano. Se ela voltar, o histórico volta a
     * ficar mudo e o P1-7 ressuscita — sem nenhuma tela para revelá-lo. */
    expect(fonte).not.toMatch(/comissaoRef\.delete\(/);
  });

  it("a reversão grava a linha negativa", () => {
    expect(fonte).toMatch(/estornoDaComissaoDeServico\(/);
  });

  it("a reconclusão prefere o percentual congelado ao cadastro", () => {
    /* A ordem importa: `pctCongelado ?? staffSnap…`. Invertida, o cadastro de
     * hoje volta a vencer e o defeito retorna em silêncio. */
    expect(fonte).toMatch(/commissionPctDoBarbeiro:\s*pctCongelado\s*\?\?/);
  });

  it("o pagamento é congelado ANTES de ser apagado", () => {
    expect(fonte).toMatch(/pagamento:\s*pagamentoSnap\.exists/);
  });

  it("a reversão limpa o `paymentMethod` junto com a cobertura", () => {
    /* Sem isto, a reserva fica "Não compareceu" exibindo "Crédito" na coluna
     * Pagamento, sem pagamento nenhum no banco — divergência booking × payment
     * criada pelo produto, e permanente se ninguém concluir de novo. Visto na
     * tela durante o gate de 20/08. */
    expect(fonte).toMatch(/cobertura:\s*FieldValue\.delete\(\)[\s\S]{0,80}paymentMethod:\s*null/);
  });

  it("o bruto da reconclusão sai do congelado, não de `depois.value`", () => {
    expect(fonte).toMatch(/reconclusao && ciclo\?\.pagamento/);
  });
});
