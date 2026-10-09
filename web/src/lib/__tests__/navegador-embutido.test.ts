import { describe, expect, it } from "vitest";
import { ehNavegadorEmbutido } from "@/lib/navegador-embutido";

const UA = {
  instagramIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21F90 Instagram 340.0.0.30.100 (iPhone14,5; iOS 17_5; pt_BR; pt-BR; scale=3.00; 1170x2532; 640404681)",
  instagramAndroid:
    "Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/125.0.0.0 Mobile Safari/537.36 Instagram 340.0.0.28.101 Android",
  facebookIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21F90 [FBAN/FBIOS;FBAV/460.0.0.45.114;FBBV/580000000;FBDV/iPhone14,5]",
  facebookAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/125.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/460.0.0.40.109;]",
  line: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.8.0",
  webviewAndroid:
    "Mozilla/5.0 (Linux; Android 13; SM-A546E Build/TP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0.0.0 Mobile Safari/537.36",
  safariIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36",
  chromeDesktop:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  /** O Topete instalado na tela de início do iPhone: sem o token `Safari`. */
  appInstaladoIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
};

describe("navegador de dentro de outro aplicativo", () => {
  it("reconhece Instagram, Facebook, Line e WebView do Android", () => {
    for (const ua of [
      UA.instagramIos,
      UA.instagramAndroid,
      UA.facebookIos,
      UA.facebookAndroid,
      UA.line,
      UA.webviewAndroid,
    ]) {
      expect(ehNavegadorEmbutido(ua), ua).toBe(true);
    }
  });

  it("deixa em paz os navegadores de verdade e o app instalado", () => {
    for (const ua of [UA.safariIos, UA.chromeAndroid, UA.chromeDesktop, UA.appInstaladoIos]) {
      expect(ehNavegadorEmbutido(ua), ua).toBe(false);
    }
  });

  it("sem User-Agent, não presume nada", () => {
    expect(ehNavegadorEmbutido("")).toBe(false);
    expect(ehNavegadorEmbutido(null)).toBe(false);
    expect(ehNavegadorEmbutido(undefined)).toBe(false);
  });
});
