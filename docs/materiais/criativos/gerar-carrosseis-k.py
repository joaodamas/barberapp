"""Carrosséis "Sem Topete × Com Topete" feitos dos quadros dos cartoons K1–K10 (02/10/2026).

Cada carrossel (1080×1350, 5 cartões): capa com o gancho · o caos (sem Topete) ·
a tela do Topete · o desfecho · CTA. Os quadros saem dos vídeos prontos em
~/Desktop/Topete/cartoons; os textos e os tempos, do próprio HTML do episódio
(legendas leg0–leg3, VIRA, FONE, CTA) — o carrossel conta a mesma história do Reels.

Saída: carrosseis-k/KC<n>-<i>.html (+ quadros) → render para ~/Desktop/Topete/criativos/KC<n>-<i>.png
"""
import html as H
import pathlib
import re
import subprocess

AQUI = pathlib.Path(__file__).parent
SAIDA = AQUI / "carrosseis-k"
SAIDA.mkdir(exist_ok=True)
VIDEOS = pathlib.Path.home() / "Desktop/Topete/cartoons"
DEST = pathlib.Path.home() / "Desktop/Topete/criativos"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

EPISODIOS = [  # (n, html, vídeo, frase do CTA)
    (1, "K1-whatsapp", "K1-whatsapp-que-nao-para", "Agenda online com a cara da sua barbearia."),
    (2, "K2-sabado-lotado", "K2-sabado-lotado", "Encaixe com aprovação num toque."),
    (3, "K3-fim-do-dia", "K3-fim-do-dia", "O caixa do dia na palma da mão."),
    (4, "K4-mensalista-esquecido", "K4-mensalista-esquecido", "Mensalista com horário fixo, toda semana."),
    (5, "K5-comissao", "K5-acerto-da-comissao", "Comissão calculada em cada atendimento."),
    (6, "K6-aluguel", "K6-da-pra-pagar-o-aluguel", "O financeiro da barbearia, sem susto."),
    (7, "K7-cliente-sumiu", "K7-cade-o-thiago", "Veja quem está sumindo antes de perder."),
    (8, "K8-pomada", "K8-a-pomada-acabou", "Estoque com aviso de mínimo."),
    (9, "K9-cancelou", "K9-cancelou-e-ninguem-soube", "Cancelou? O horário volta pro link."),
    (10, "K10-servico-a-mais", "K10-o-servico-a-mais", "Adicionou serviço? Sai com o preço do combo."),
]

CSS = """
@font-face{font-family:"Outfit";src:url("../../../marca/fontes/outfit.woff2") format("woff2");font-weight:700}
@font-face{font-family:"Manrope";src:url("../../../../web/src/assets/fontes/manrope-latin-var.woff2") format("woff2");font-weight:400 800}
*{box-sizing:border-box;margin:0;padding:0}
body{width:1080px;height:1350px;overflow:hidden;position:relative;background:#0E0D0B;color:#F4EFE4;font-family:Manrope}
.cena{position:absolute;left:0;top:0;width:1080px;height:1110px;object-fit:cover;object-position:center}
.rodape{position:absolute;left:0;right:0;bottom:0;height:240px;padding:34px 64px 0;background:#0E0D0B}
.pill{display:inline-block;border-radius:999px;padding:12px 24px;font:800 22px/1 Manrope;letter-spacing:.14em;text-transform:uppercase}
.sem{background:#2A2722;color:#E9E3D6;border:2px solid #4A453C}.com{background:linear-gradient(135deg,#FFE3A3,#E0AE58 50%,#A8752A);color:#0E0D0B}
.txt{margin-top:20px;font:800 46px/1.12 Outfit;letter-spacing:-1px}
em{font-style:normal;color:#E0AE58}
.num{position:absolute;right:56px;bottom:40px;font:800 22px Manrope;color:#6B6252;letter-spacing:.1em}
.marca{position:absolute;left:44px;top:40px;display:flex;align-items:center;gap:12px;font:700 38px Outfit;letter-spacing:-1px;background:#0E0D0Bcc;padding:10px 20px 10px 12px;border-radius:999px}
.marca img{width:46px;height:46px}
"""
ICONE = "../../../marca/topete-mascote.svg"


def ler_episodio(nome):
    s = (AQUI / f"{nome}.html").read_text()
    vira = float(re.search(r"VIRA = ([\d.]+)", s).group(1))
    fone = [float(x) for x in re.search(r"FONE = \[([\d.]+),\s*([\d.]+)\]", s).groups()]
    cta = float(re.search(r"CTA = ([\d.]+)", s).group(1))
    legs = dict(re.findall(r'<div class="ov leg" id="leg(\d)"[^>]*>(.*?)</div>', s))
    return vira, fone, cta, legs


def quadro(video, t, destino):
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-ss", f"{t:.2f}", "-i", str(video), "-frames:v", "1",
                    "-vf", "crop=1080:1110:0:360", "-q:v", "2", str(destino)], check=True)


def pagina(corpo):
    return f'<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>{CSS}</style></head><body>{corpo}</body></html>'


def cartao(img, pill, texto, i):
    cls = "sem" if pill.startswith("✕") else "com"
    return pagina(f'<img class="cena" src="{img}"><div class="marca"><img src="{ICONE}">topete</div>'
                  f'<div class="rodape"><span class="pill {cls}">{pill}</span><p class="txt">{texto}</p></div><span class="num">{i}/5</span>')


def capa(img, gancho):
    return pagina(f'<img class="cena" src="{img}" style="filter:grayscale(.9) brightness(.32) blur(2px)">'
                  f'<div class="marca"><img src="{ICONE}">topete</div>'
                  f'<div style="position:absolute;left:64px;right:64px;top:300px">'
                  f'<span class="pill sem">✕ Sem Topete</span> <span class="pill com" style="margin-left:8px">✓ Com Topete</span>'
                  f'<p style="margin-top:34px;font:800 92px/1.02 Outfit;letter-spacing:-3px">{gancho}</p>'
                  f'<p style="margin-top:30px;font:700 32px Manrope;color:#CFC6B4">Arrasta pro lado →</p></div>'
                  f'<div class="rodape" style="height:120px"></div><span class="num">1/5</span>')


def fim(frase):
    import sys
    sys.path.insert(0, str(AQUI.parent.parent / "marca"))
    import mascote as m
    svg = f'<svg viewBox="0 0 512 512" style="width:300px;height:300px"><defs>{m.DEFS}</defs><g transform="translate(0,6)">{m.mascote()}</g></svg>'
    return pagina(f'<div style="position:absolute;inset:0;background:radial-gradient(circle at 50% 38%,#2A2017,#0E0D0B 70%);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px;text-align:center;padding:0 80px">'
                  f'{svg}<p style="font:700 120px/0.9 Outfit;letter-spacing:-5px">topete<span style="color:#E0AE58">.</span></p>'
                  f'<p style="font:700 50px/1.15 Outfit;letter-spacing:-1px;color:#E0AE58">{H.escape(frase)}</p>'
                  f'<p style="margin-top:20px;font:700 32px Manrope;color:#CFC6B4">Sistema para barbearias · link na bio</p>'
                  f'<p style="font:800 40px Manrope;color:#E0AE58">@usetopete</p></div><span class="num">5/5</span>')


def render(html_path, png):
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files",
                    "--force-device-scale-factor=1", "--window-size=1080,1350", "--virtual-time-budget=3000",
                    f"--screenshot={png}", f"file://{html_path}"], check=True, capture_output=True)


for n, nome_html, nome_video, frase in EPISODIOS:
    vira, fone, cta, legs = ler_episodio(nome_html)
    video = VIDEOS / f"{nome_video}.mp4"
    tempos = {"capa": 0.3, "a": max(0.6, vira - 1.2), "b": fone[0] + 0.72 * (fone[1] - fone[0]), "c": (fone[1] + cta) / 2}
    for k, t in tempos.items():
        quadro(video, t, SAIDA / f"KC{n}-{k}.jpg")
    paginas = [
        capa(f"KC{n}-capa.jpg", legs.get("0", "")),
        cartao(f"KC{n}-a.jpg", "✕ Sem Topete", legs.get("1", ""), 2),
        cartao(f"KC{n}-b.jpg", "✓ Com Topete", legs.get("2", ""), 3),
        cartao(f"KC{n}-c.jpg", "✓ Com Topete", legs.get("3", ""), 4),
        fim(frase),
    ]
    for i, p in enumerate(paginas, 1):
        arq = SAIDA / f"KC{n}-{i}.html"
        arq.write_text(p)
        render(arq, DEST / f"KC{n}-{i}.png")
    print("ok carrossel", n)
