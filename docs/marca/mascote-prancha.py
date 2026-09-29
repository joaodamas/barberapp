import base64, pathlib, re
AQUI = pathlib.Path(__file__).parent
src = (AQUI/"mascote.py").read_text()
ns = {"__file__": str(AQUI/"mascote.py")}; exec(src.split("def icone")[0], ns)
DEFS, mascote = ns["DEFS"], ns["mascote"]()
def f(nome, arq, peso):
    b = base64.b64encode((AQUI/"fontes"/arq).read_bytes()).decode()
    return f"@font-face{{font-family:'{nome}';src:url(data:font/woff2;base64,{b}) format('woff2');font-weight:{peso}}}"
FONTES = f("Outfit","outfit.woff2",700)+f("Sora","sora.woff2",700)
def ic(x,y,s,rx=120,fundo="url(#fundo)"):
    return f'<g transform="translate({x},{y}) scale({s})"><rect width="512" height="512" rx="{rx}" fill="{fundo}"/><g transform="translate(0,6)">{mascote}</g></g>'
def circ(x,y,s):
    return f'<g transform="translate({x},{y}) scale({s})"><clipPath id="c{x}"><circle cx="256" cy="256" r="256"/></clipPath><g clip-path="url(#c{x})"><rect width="512" height="512" fill="#12110E"/><g transform="translate(0,34)">{mascote}</g></g><circle cx="256" cy="256" r="252" fill="none" stroke="#C9A45C" stroke-width="8"/></g>'
corpo = f'''<rect width="1800" height="900" fill="#0A0908"/>
<text x="60" y="70" font-family="Sora" font-weight="700" font-size="22" fill="#8A8170" letter-spacing="3">TOPETE · MASCOTE</text>
{ic(60,110,.9)}
<g transform="translate(560,110)"><rect width="1180" height="300" rx="36" fill="#12110E"/>{ic(40,40,.43,rx=110)}<text x="300" y="192" font-family="Outfit" font-weight="700" font-size="150" letter-spacing="-5" fill="#F4EFE4">topete</text></g>
<g transform="translate(560,450)"><rect width="1180" height="300" rx="36" fill="#F4EFE4"/>{ic(40,40,.43,rx=110)}<text x="300" y="192" font-family="Outfit" font-weight="700" font-size="150" letter-spacing="-5" fill="#12110E">topete</text></g>
{circ(60,600,.5)}<text x="330" y="720" font-family="Sora" font-weight="700" font-size="20" fill="#8A8170">foto do Instagram</text>
<text x="330" y="760" font-family="Sora" font-weight="700" font-size="20" fill="#E0AE58">@usetopete</text>
<g transform="translate(560,790)">{ic(0,0,.14,rx=110)}{ic(100,12,.09,rx=110)}{ic(170,20,.06,rx=110)}
<text x="230" y="50" font-family="Sora" font-weight="700" font-size="18" fill="#8A8170">ícone do app em tamanhos reais</text></g>'''
svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1800 900" width="1800" height="900"><defs><style>{FONTES}</style>{DEFS}</defs>{corpo}</svg>'
(AQUI/"mascote-prancha.svg").write_text(svg)
