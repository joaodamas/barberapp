import { describe, expect, it } from "vitest";
import { converterCampos } from "@/lib/firestore-rest";

describe("financeiro pela API REST (02/10)", () => {
  it("converte formas, taxas e comissão do formato REST do Firestore", () => {
    const r = converterCampos({
      paymentForms: {
        arrayValue: {
          values: [
            { mapValue: { fields: { id: { stringValue: "pix" }, base: { stringValue: "pix" }, label: { stringValue: "Pix" }, feePct: { integerValue: "0" }, active: { booleanValue: true } } } },
            { mapValue: { fields: { id: { stringValue: "credit" }, base: { stringValue: "credit" }, label: { stringValue: "Tap Crédito" }, feePct: { doubleValue: 2.99 }, active: { booleanValue: true } } } },
          ],
        },
      },
      commissionSplit: { mapValue: { fields: { barberPct: { integerValue: "60" }, shopPct: { integerValue: "40" } } } },
    });
    expect(r).toEqual({
      paymentForms: [
        { id: "pix", base: "pix", label: "Pix", feePct: 0, active: true },
        { id: "credit", base: "credit", label: "Tap Crédito", feePct: 2.99, active: true },
      ],
      commissionSplit: { barberPct: 60, shopPct: 40 },
    });
  });

  it("lista vazia e mapa vazio não quebram", () => {
    expect(converterCampos({ paymentForms: { arrayValue: {} }, commissionSplit: { mapValue: {} } })).toEqual({
      paymentForms: [],
      commissionSplit: {},
    });
  });
});
