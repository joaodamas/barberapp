import { describe, expect, it } from "vitest";
import { SEM_TAXA } from "../financial-events";
import { valoresDoPagamento } from "../payments";
import { formasDoTenant, type FormaDePagamento } from "../formas-de-pagamento";

/**
 * O que o servidor CONGELA quando a barbearia tem formas próprias.
 *
 * A régua completa é exercida em `web/src/lib/__tests__/formas-de-pagamento.test.ts`,
 * que também prova que os dois arquivos não divergiram. O que estes casos
 * guardam é a fronteira que só existe aqui: o documento gravado tem de ser
 * legível a partir dos próprios campos, hoje e daqui a um ano — depois de o
 * dono renomear, desativar ou apagar a forma.
 */

const FORMAS: FormaDePagamento[] = [
  { id: "credit", label: "Crédito aproximação", base: "credit", feePct: 3.49, active: true },
  { id: "credito-inserido", label: "Crédito inserido", base: "credit", feePct: 4.19, active: true },
];

describe("valoresDoPagamento · a forma entra congelada", () => {
  it("grava id E rótulo da forma escolhida", () => {
    const v = valoresDoPagamento({
      bruto: 100,
      metodo: "credit",
      fees: SEM_TAXA,
      formas: FORMAS,
      formaId: "credito-inserido",
    });
    expect(v).toMatchObject({
      paymentMethod: "credit",
      paymentFormId: "credito-inserido",
      paymentFormLabel: "Crédito inserido",
      feePct: 4.19,
      feeAmount: 4.19,
      netAmount: 95.81,
    });
  });

  it("o rótulo congelado é o que permite ler o extrato depois", () => {
    /* Só o id não bastaria: renomear a forma reescreveria a história de todos
     * os pagamentos que a citam, e apagá-la deixaria um código na tela. */
    const v = valoresDoPagamento({ bruto: 50, metodo: "credit", fees: SEM_TAXA, formas: FORMAS });
    expect(v.paymentFormLabel).toBe("Crédito aproximação");
  });

  it("sem formas cadastradas, a tabela de quatro chaves continua valendo", () => {
    /* O caminho de toda barbearia que existe hoje. Um centavo de diferença aqui
     * seria uma migração silenciosa do custo de operar. */
    const v = valoresDoPagamento({
      bruto: 100,
      metodo: "credit",
      fees: { dinheiro: 0, pix: 0, debito: 1.99, credito: 3.49 },
    });
    expect(v.feePct).toBe(3.49);
    expect(v.paymentFormId).toBeNull();
    expect(v.paymentFormLabel).toBeNull();
  });

  it("atendimento sem método não ganha forma nenhuma", () => {
    /* O coberto pelo plano: não entrou dinheiro no balcão, então não houve
     * maquininha — e afirmar uma forma seria inventar o fato. */
    const v = valoresDoPagamento({ bruto: 50, metodo: null, fees: SEM_TAXA, formas: FORMAS });
    expect(v).toMatchObject({ paymentFormId: null, paymentFormLabel: null, feePct: 0 });
  });

  it("a barbearia legada tem as quatro nativas derivadas do documento cru", () => {
    const formas = formasDoTenant({ paymentFees: { dinheiro: 0, pix: 0, debito: 1.99, credito: 3.49 } });
    const v = valoresDoPagamento({ bruto: 100, metodo: "debit", fees: SEM_TAXA, formas });
    expect(v.feePct).toBe(1.99);
    expect(v.paymentFormLabel).toBe("Débito");
  });
});
