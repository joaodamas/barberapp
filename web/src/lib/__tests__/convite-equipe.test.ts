import { describe, expect, it } from "vitest";
import { linkDoConvite, linkDoEmail, linkDoWhatsApp, textoDoConvite, whatsappParaConvite } from "@/lib/convite-equipe";

describe("convite do barbeiro · links e textos", () => {
  it("link no endereço da barbearia, sem barra dobrada", () => {
    expect(linkDoConvite("https://navalha.topete.com.br/", "abc")).toBe("https://navalha.topete.com.br/convite/abc");
  });

  it("WhatsApp: celular sem DDI ganha o 55; número curto não serve", () => {
    expect(whatsappParaConvite("(11) 98888-7777")).toBe("5511988887777");
    expect(whatsappParaConvite("55 11 98888-7777")).toBe("5511988887777");
    expect(whatsappParaConvite("98888-7777")).toBeNull();
  });

  it("texto chama pelo primeiro nome e leva o link", () => {
    const t = textoDoConvite({ barbearia: "Barbearia Navalha", barbeiro: "Caio Ferraz", link: "https://x/convite/1" });
    expect(t).toContain("Fala, Caio!");
    expect(t).toContain("https://x/convite/1");
    expect(t).toContain("7 dias");
  });

  it("links de envio codificam o texto", () => {
    expect(linkDoWhatsApp("5511988887777", "a b")).toBe("https://wa.me/5511988887777?text=a%20b");
    expect(linkDoEmail("caio@exemplo.com", "Navalha", "oi")).toContain("subject=Seu%20acesso");
  });
});
