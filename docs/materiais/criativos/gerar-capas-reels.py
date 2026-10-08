"""Capas dos Reels do @usetopete (02/10/2026) — uma por vídeo, no mesmo padrão, para a grade do perfil.

1080×1920. O perfil mostra a capa recortada em 3:4 no centro (y 240–1680), então tudo que importa fica
entre y≈330 e y≈1590: selo da série, título grande (legível na miniatura), mascote e @usetopete.
Fundo: um quadro do próprio vídeo, desfocado e escurecido — cada capa tem a cor do seu episódio,
mas o desenho é o mesmo em todas.

Saída: capas-reels/<código>.html → ~/Desktop/Topete/capas-reels/<código>.jpg (vai para o bucket em
capas-reels/<código>.jpg; o publicar-instagram.py usa como cover_url).
"""
import html as H
import pathlib
import subprocess

AQUI = pathlib.Path(__file__).parent
SAIDA = AQUI / "capas-reels"
SAIDA.mkdir(exist_ok=True)
T = pathlib.Path.home() / "Desktop/Topete"
DEST = T / "capas-reels"
DEST.mkdir(exist_ok=True)
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

# código, vídeo, selo da série, título (com <em> no destaque)
REELS = [
    ("K1", "cartoons/K1-whatsapp-que-nao-para", "Sem × Com Topete · Ep. 1", "O WhatsApp <em>que não para</em>"),
    ("K2", "cartoons/K2-sabado-lotado", "Sem × Com Topete · Ep. 2", "Sábado <em>lotado</em>"),
    ("K3", "cartoons/K3-fim-do-dia", "Sem × Com Topete · Ep. 3", "22h e a conta <em>não fecha</em>"),
    ("K4", "cartoons/K4-mensalista-esquecido", "Sem × Com Topete · Ep. 4", "O mensalista <em>esquecido</em>"),
    ("K5", "cartoons/K5-acerto-da-comissao", "Sem × Com Topete · Ep. 5", "Acerto da <em>comissão</em>"),
    ("K6", "cartoons/K6-da-pra-pagar-o-aluguel", "Sem × Com Topete · Ep. 6", "Dá pra pagar <em>o aluguel?</em>"),
    ("K7", "cartoons/K7-cade-o-thiago", "Sem × Com Topete · Ep. 7", "Cadê <em>o Thiago?</em>"),
    ("K8", "cartoons/K8-a-pomada-acabou", "Sem × Com Topete · Ep. 8", "A pomada <em>acabou</em>"),
    ("K9", "cartoons/K9-cancelou-e-ninguem-soube", "Sem × Com Topete · Ep. 9", "Cancelou e <em>ninguém soube</em>"),
    ("K10", "cartoons/K10-o-servico-a-mais", "Sem × Com Topete · Ep. 10", "O serviço <em>a mais</em>"),
    ("Q1", "formatos/Q1-cliente-sumido", "Quanto custa?", "Um cliente <em>que sumiu</em>"),
    ("Q2", "formatos/Q2-horario-vago", "Quanto custa?", "Um horário <em>vago</em>"),
    ("Q3", "formatos/Q3-tempo-no-whatsapp", "Quanto custa?", "O tempo <em>no WhatsApp</em>"),
    ("O1", "formatos/O1-nao-baixar-app", "Dúvida nº 1", "“Meu cliente não vai <em>baixar app</em>”"),
    ("O2", "formatos/O2-barbeiro-nao-sabe", "Dúvida nº 2", "“Meu barbeiro não sabe <em>mexer</em>”"),
    ("O3", "formatos/O3-quanto-custa", "Dúvida nº 3", "“Tá, mas <em>quanto custa?</em>”"),
    ("H1", "formatos/H1-aparadinha", "Coisas que todo barbeiro já ouviu #1", "“Só uma <em>aparadinha</em>”"),
    ("H2", "formatos/H2-igual-a-foto", "Coisas que todo barbeiro já ouviu #2", "“Faz <em>igual a foto</em>”"),
    ("H3", "formatos/H3-to-na-porta", "Coisas que todo barbeiro já ouviu #3", "“Tô <em>na porta</em>”"),
]

CSS = """
@font-face{font-family:"Outfit";src:url("../../../marca/fontes/outfit.woff2") format("woff2");font-weight:700}
@font-face{font-family:"Manrope";src:url("../../../../web/src/assets/fontes/manrope-latin-var.woff2") format("woff2");font-weight:400 800}
*{box-sizing:border-box;margin:0;padding:0}
body{width:1080px;height:1920px;overflow:hidden;position:relative;background:#0E0D0B;color:#F4EFE4;font-family:Manrope}
.fundo{position:absolute;inset:-40px;width:1160px;height:2000px;object-fit:cover;filter:blur(22px) brightness(.34) saturate(.9)}
.veu{position:absolute;inset:0;background:linear-gradient(180deg,#0E0D0Bcc 0%,#0E0D0B33 30%,#0E0D0B33 62%,#0E0D0Bee 100%)}
.miolo{position:absolute;left:90px;right:90px;top:330px;bottom:330px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:44px}
.marca{display:flex;align-items:center;gap:16px;font:700 58px Outfit;letter-spacing:-1.5px}
.marca img{width:84px;height:84px}
.selo{border-radius:999px;padding:18px 34px;font:800 30px/1.2 Manrope;letter-spacing:.12em;text-transform:uppercase;background:linear-gradient(135deg,#FFE3A3,#E0AE58 50%,#A8752A);color:#0E0D0B;max-width:900px}
h1{font:700 128px/1.0 Outfit;letter-spacing:-4.5px;text-shadow:0 6px 30px #000a}
h1 em{font-style:normal;color:#E0AE58}
.arroba{font:800 38px Manrope;color:#E0AE58;letter-spacing:.02em}
"""
MASCOTE = "../../../marca/topete-mascote.svg"


def quadro(video, destino):
    dur = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(video)]))
    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-ss", f"{dur * 0.45:.2f}", "-i", str(video), "-frames:v", "1", "-q:v", "3", str(destino)], check=True)


for cod, video, selo, titulo in REELS:
    quadro(T / f"{video}.mp4", SAIDA / f"{cod}-fundo.jpg")
    pag = (f'<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><style>{CSS}</style></head><body>'
           f'<img class="fundo" src="{cod}-fundo.jpg"><div class="veu"></div><div class="miolo">'
           f'<div class="marca"><img src="{MASCOTE}">topete</div><span class="selo">{H.escape(selo)}</span>'
           f'<h1>{titulo}</h1><p class="arroba">@usetopete</p></div></body></html>')
    arq = SAIDA / f"{cod}.html"
    arq.write_text(pag)
    png = SAIDA / f"{cod}.png"
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files",
                    "--force-device-scale-factor=1", "--window-size=1080,1920", "--virtual-time-budget=3000",
                    f"--screenshot={png}", f"file://{arq}"], check=True, capture_output=True)
    subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "90", str(png), "--out", str(DEST / f"{cod}.jpg")], check=True, capture_output=True)
    png.unlink()
    print("ok", cod)
