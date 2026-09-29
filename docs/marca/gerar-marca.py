"""
Marca Topete — o mascote (28/09/2026). Gera todos os arquivos a partir de mascote.py.
Rodar: python3 docs/marca/gerar-marca.py && docs/marca/exportar-png.sh
"""
import base64, pathlib
AQUI = pathlib.Path(__file__).parent
ns = {"__file__": str(AQUI/"mascote.py")}
exec((AQUI/"mascote.py").read_text().split("def icone")[0], ns)
DEFS, MASCOTE = ns["DEFS"], ns["mascote"]()
b = base64.b64encode((AQUI/"fontes"/"outfit.woff2").read_bytes()).decode()
FONTE = f"@font-face{{font-family:'Outfit';src:url(data:font/woff2;base64,{b}) format('woff2');font-weight:700}}"
PRETO, MARFIM = "#0E0D0B", "#F4EFE4"

def svg(w, h, corpo, fonte=False):
    estilo = f"<style>{FONTE}</style>" if fonte else ""
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}"><defs>{estilo}{DEFS}</defs>{corpo}</svg>'
def icone(x=0, y=0, s=1):
    return f'<g transform="translate({x},{y}) scale({s})"><rect width="512" height="512" rx="120" fill="url(#fundo)"/><g transform="translate(0,6)">{MASCOTE}</g></g>'
def palavra(x, y, tam, cor):
    return f'<text x="{x}" y="{y}" font-family="Outfit" font-weight="700" font-size="{tam}" letter-spacing="{-tam/32:.1f}" fill="{cor}">topete</text>'

arq = {
  "topete-mascote.svg": svg(512, 512, f'<g transform="translate(0,6)">{MASCOTE}</g>'),
  "topete-icone-app.svg": svg(512, 512, icone()),
  "topete-selo-perfil.svg": svg(1080, 1080, f'''<rect width="1080" height="1080" fill="#12110E"/>
<g transform="translate(540,570) scale(1.78) translate(-256,-262)"><g transform="translate(0,6)">{MASCOTE}</g></g>'''),
  "topete-logo-escuro.svg": svg(1000, 300, f'<rect width="1000" height="300" fill="{PRETO}"/>{icone(30,30,.47)}{palavra(310,196,170,MARFIM)}', True),
  "topete-logo-claro.svg":  svg(1000, 300, f'<rect width="1000" height="300" fill="{MARFIM}"/>{icone(30,30,.47)}{palavra(310,196,170,PRETO)}', True),
  "topete-logo-escuro-transparente.svg": svg(1000, 300, f'{icone(30,30,.47)}{palavra(310,196,170,MARFIM)}', True),
}
for n, c in arq.items():
    (AQUI / n).write_text(c)
print("\n".join(arq))
