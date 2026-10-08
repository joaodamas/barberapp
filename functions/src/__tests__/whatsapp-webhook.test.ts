import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { confirmacaoPeloBotao } from "../whatsapp/webhook";

/**
 * Webhook do WhatsApp (08/10): o toque no botão passa pela mesma lógica do
 * app, e o evento é processado antes da resposta.
 */

const fonte = readFileSync(resolve(__dirname, "../whatsapp/webhook.ts"), "utf8");

describe("confirmar presença pelo botão", () => {
  it("só a reserva confirmada vira confirmada pelo cliente", () => {
    expect(confirmacaoPeloBotao("confirmed")).toBe("confirmed_by_client");
  });

  it("🔒 pedido de encaixe não é aprovado pelo próprio cliente", () => {
    expect(confirmacaoPeloBotao("fit_in_requested")).toBeNull();
  });

  it("🔒 confirmar presença não paga reserva que espera pagamento", () => {
    expect(confirmacaoPeloBotao("pending_payment")).toBeNull();
  });

  it("encerrada ou já confirmada: nada a fazer", () => {
    for (const s of ["completed", "cancelled_by_client", "cancelled_by_shop", "expired", "confirmed_by_client", undefined]) {
      expect(confirmacaoPeloBotao(s), String(s)).toBeNull();
    }
  });
});

describe("o caminho de cada botão", () => {
  const corpo = fonte.slice(fonte.indexOf("async function aplicarBotao"));

  it("🔒 encaixe passa por aplicarRespostaDoEncaixe, a transação do painel e do Telegram", () => {
    expect(corpo).toContain("aplicarRespostaDoEncaixe(");
  });

  it("🔒 cancelamento usa a política de devolução e transação que relê o status", () => {
    const cancelar = fonte.slice(fonte.indexOf("async function cancelarPeloBotao"));
    expect(cancelar).toContain("desfechoDoCancelamento(");
    expect(cancelar).toContain("runTransaction(");
    expect(cancelar).toContain("EM_ABERTO");
  });

  it("🔒 nenhum update direto com o status do mapa", () => {
    expect(corpo).not.toMatch(/ref\.update\(\{\s*status: novoStatus/);
  });

  it("processa o evento ANTES de responder 200", () => {
    const handler = fonte.slice(fonte.indexOf("export const whatsappWebhook"), fonte.indexOf("async function processar"));
    const processa = handler.indexOf("await processar(req.body)");
    const responde = handler.indexOf('res.status(200).send("EVENT_RECEIVED")');
    expect(processa).toBeGreaterThan(-1);
    expect(responde).toBeGreaterThan(processa);
  });
});
