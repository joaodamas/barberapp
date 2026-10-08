"""Base dos cartoons "Sem Topete × Com Topete" (02/10/2026).

O que todo episódio tem em comum: a barbearia, o barbeiro (cabeça = mascote)
atrás do balcão, o selo Sem/Com Topete, a tesoura que "corta" o antes, o
celular grande com a tela do Topete, as legendas da narração e o final com o
boing no topete. Cada episódio (gerar-cartoons2.py) entrega só a sua história:
SVG/HTML a mais, a função ep(t) e os seus efeitos.

Regras: nomes só inventados; valores marcados como exemplo; nada que o
produto não faz.
"""
import json
import sys
import pathlib

AQUI = pathlib.Path(__file__).parent
sys.path.insert(0, str(AQUI.parent.parent / "marca"))
import mascote as _m  # noqa: E402

ICONE = "../../marca/topete-mascote.svg"
PELE = _m.PELE

CSS = """
body{width:1080px;height:1920px;background:#0E0D0B;overflow:hidden;position:relative;font-family:Manrope}
#cena{position:absolute;left:0;top:0;width:1080px;height:1920px}
#palco{position:absolute;left:0;top:0;width:1080px;height:1920px;transform-origin:540px 915px;transform:translateY(-15px) scale(.764)}
.ov{position:absolute;will-change:transform,opacity}
.pill{left:50%;top:352px;transform:translateX(-50%);border-radius:999px;padding:18px 34px;font:800 30px/1 Manrope;letter-spacing:.14em;text-transform:uppercase;white-space:nowrap}
.sem{background:#2A2722;color:#E9E3D6;border:2px solid #4A453C}
.com{background:linear-gradient(135deg,#FFE3A3,#E0AE58 50%,#A8752A);color:#0E0D0B}
.logo{left:0;right:0;top:276px;display:flex;justify-content:center;align-items:center;gap:14px;font:700 46px Outfit;letter-spacing:-1.2px;color:#F4EFE4}
.logo img{width:60px;height:60px}
.leg{left:150px;right:175px;top:1392px;text-align:center;font:800 44px/1.14 Outfit;letter-spacing:-1px;color:#F4EFE4}
.leg em{font-style:normal;color:#E0AE58}
.fone{left:290px;top:430px;width:500px;height:1010px;background:#0E0D0B;border-radius:70px;padding:16px;box-shadow:0 60px 120px -30px #000c}
.fone .tela{position:relative;width:100%;height:100%;background:#F4EFE4;border-radius:56px;overflow:hidden;color:#16140F}
.tl{position:absolute;inset:0;padding:70px 34px 30px}
.rot{font:800 22px Manrope;letter-spacing:.12em;color:#A8752A;text-transform:uppercase}
.lin{display:flex;justify-content:space-between;align-items:center;background:#fff;border:2.5px solid #E6DDCB;border-radius:22px;padding:20px 22px;font:700 26px Manrope;margin-top:12px}
.exemplo{position:absolute;left:0;right:0;bottom:22px;text-align:center;font:800 16px Manrope;letter-spacing:.14em;color:#9C927E;text-transform:uppercase}
.cartao{background:#fff;color:#16140F;border-radius:26px;padding:20px 26px;font:700 30px/1.25 Manrope;box-shadow:0 18px 36px -14px #0008;white-space:nowrap}
.cta{inset:0;background:radial-gradient(circle at 50% 40%,#2A2017,#0E0D0B 70%);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px;color:#F4EFE4;text-align:center}
.chip{border-radius:999px;padding:18px 32px;font:700 30px Manrope;background:#1C1A16;border:2px solid #3A342A;color:#F4EFE4}
"""


def tesoura_pequena(id_, x, y, cor="#9C927E"):
    return (f'<g id="{id_}" transform="translate({x},{y})"><g id="{id_}1"><path d="M0 0 L-70 -30 Q-76 -28 -70 -22 Z" fill="{cor}"/>'
            f'<circle cx="18" cy="16" r="12" fill="none" stroke="#C9963F" stroke-width="6"/></g>'
            f'<g id="{id_}2"><path d="M0 0 L-70 30 Q-76 28 -70 22 Z" fill="{cor}"/><circle cx="18" cy="-16" r="12" fill="none" stroke="#C9963F" stroke-width="6"/></g></g>')


def fundo(janela="dia"):
    """Parede, chão, poste, janela (dia | noite | tarde), relógio. O balcão vem depois, por cima do barbeiro."""
    ceu = {"noite": "#14213A", "tarde": "#F2B66B", "dia": "#BFE0EC"}[janela]
    lua = '<g id="lua"><circle cx="250" cy="560" r="34" fill="#F4EFE4"/><circle cx="264" cy="550" r="30" fill="#14213A"/></g>' if janela == "noite" else ""
    return f'''<rect width="1080" height="1920" fill="#0E0D0B"/>
<rect x="0" y="300" width="1080" height="1230" fill="#EADFCB" id="parede"/>
<rect x="0" y="1180" width="1080" height="350" fill="#3B2F22"/><rect x="0" y="1170" width="1080" height="14" fill="#A8752A"/>
<rect x="56" y="470" width="64" height="360" rx="32" fill="url(#listra)"/>
<rect x="46" y="452" width="84" height="26" rx="10" fill="#A8752A"/><rect x="46" y="822" width="84" height="26" rx="10" fill="#A8752A"/>
<g id="janela"><rect x="170" y="440" width="260" height="300" rx="18" fill="{ceu}" id="ceu" stroke="#A8752A" stroke-width="14"/>{lua}
<path d="M300 440 L300 740 M170 590 L430 590" stroke="#A8752A" stroke-width="10"/></g>
<g transform="translate(900,500)"><circle r="78" fill="#fff" stroke="#16140F" stroke-width="10"/>
<g fill="#16140F">{"".join(f'<rect x="-3" y="-66" width="6" height="14" transform="rotate({a})"/>' for a in range(0, 360, 30))}</g>
<rect id="pont-h" x="-5" y="-40" width="10" height="44" rx="5" fill="#16140F"/>
<rect id="pont-m" x="-3.5" y="-60" width="7" height="64" rx="3.5" fill="#C9963F"/><circle r="9" fill="#16140F"/></g>'''


def barbeiro_balcao(cx=540, cy=820, s=0.62):
    """Barbeiro atrás do balcão: cabeça (mascote), tronco, braços apoiados. Ids: cab, bE, bD, suor."""
    cabeca = _m.mascote()
    return f'''<g id="barbeiro">
<path d="M{cx-120} 1000 C{cx-120} 955 {cx-80} 935 {cx} 935 C{cx+80} 935 {cx+120} 955 {cx+120} 1000 L{cx+130} 1120 L{cx-130} 1120 Z" fill="#F4EFE4"/>
<path d="M{cx-80} 1010 L{cx+80} 1010 L{cx+90} 1120 L{cx-90} 1120 Z" fill="#16140F"/>
<g id="bE"><path d="M{cx-110} 990 C{cx-160} 1030 {cx-170} 1070 {cx-120} 1090" stroke="#F4EFE4" stroke-width="44" fill="none" stroke-linecap="round"/><circle cx="{cx-112}" cy="1092" r="24" fill="{PELE}"/></g>
<g id="bD"><path d="M{cx+110} 990 C{cx+160} 1030 {cx+170} 1070 {cx+120} 1090" stroke="#F4EFE4" stroke-width="44" fill="none" stroke-linecap="round"/><circle cx="{cx+112}" cy="1092" r="24" fill="{PELE}"/></g>
<g id="cab"><g transform="translate({cx - 256 * s},{cy - 300 * s}) scale({s})">{cabeca}</g></g>
<path id="suor" d="M{cx+120} 730 C{cx+112} 746 {cx+108} 756 {cx+116} 764 C{cx+124} 772 {cx+136} 764 {cx+132} 752 C{cx+130} 744 {cx+124} 738 {cx+120} 730 Z" fill="#7FC4E8" opacity="0"/>
</g>'''


def balcao():
    return '''<g id="balcao"><rect x="120" y="1100" width="840" height="400" rx="10" fill="#5A4027"/>
<rect x="100" y="1080" width="880" height="34" rx="10" fill="#7A5733"/><rect x="120" y="1114" width="840" height="10" fill="#4A341F"/>
<rect x="470" y="1200" width="140" height="140" rx="70" fill="none" stroke="#A8752A" stroke-width="10"/>
<text x="540" y="1290" text-anchor="middle" font-family="Outfit" font-weight="700" font-size="76" fill="#A8752A">Z</text></g>'''


def svg(extra_atras, extra_frente, janela="dia", cenario=None):
    """cenario: SVG próprio do episódio (substitui barbearia + barbeiro + balcão). Precisa ter os ids
    pont-m e pont-h só se o episódio mexer no relógio — a base não mexe."""
    return f'''<svg id="cena" viewBox="0 0 1080 1920" xmlns="http://www.w3.org/2000/svg">
<defs>{_m.DEFS}<pattern id="listra" width="60" height="60" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
<rect width="60" height="60" fill="#F4EFE4"/><rect width="20" height="60" fill="#C9963F"/><rect x="30" width="10" height="60" fill="#0E0D0B"/></pattern></defs>
<g id="mundo">{cenario if cenario is not None else fundo(janela) + extra_atras + barbeiro_balcao() + balcao() + extra_frente}</g>
<rect id="escurece" width="1080" height="1920" fill="#0E0D0B" opacity="0"/></svg>'''


def cta_html(frase_a, frase_b, chips):
    m = _m.mascote()
    base, topete = m.split("<!-- TOPETE")
    return f'''<div class="ov cta" id="cta"><div id="cta-masc" style="width:330px;height:330px"><svg viewBox="0 0 512 512" style="width:330px;height:330px;overflow:visible"><defs>{_m.DEFS}</defs><g transform="translate(0,6)">{base}<g id="cta-topete" style="transform-origin:256px 226px"><!-- TOPETE{topete}</g></g></svg></div>
<p id="cta1" style="font:700 120px/0.9 Outfit;letter-spacing:-5px">topete<span style="color:#E0AE58">.</span></p>
<p id="cta2" style="font:700 52px/1.15 Outfit;letter-spacing:-1px;max-width:880px">{frase_a} <span style="color:#E0AE58">{frase_b}</span></p>
<div id="cta3" style="display:flex;gap:16px;flex-wrap:wrap;justify-content:center;max-width:900px;margin-top:10px">{"".join(f'<span class="chip">{c}</span>' for c in chips)}</div>
<p id="cta4" style="margin-top:26px;font:800 40px Manrope;color:#E0AE58">@usetopete</p></div>'''


CORTE = '''<svg class="ov" id="corte" viewBox="0 0 1080 1920" style="left:0;top:0;width:1080px;height:1920px;pointer-events:none">
<path id="corte-linha" d="M-40 980 L1120 900" stroke="#F4EFE4" stroke-width="10" stroke-dasharray="1200" stroke-dashoffset="1200" fill="none"/>
<g id="corte-tes"><g id="ct1"><path d="M0 0 L-110 -44 Q-118 -40 -110 -32 Z" fill="#E0AE58"/><circle cx="28" cy="24" r="20" fill="none" stroke="#E0AE58" stroke-width="10"/></g>
<g id="ct2"><path d="M0 0 L-110 44 Q-118 40 -110 32 Z" fill="#E0AE58"/><circle cx="28" cy="-24" r="20" fill="none" stroke="#E0AE58" stroke-width="10"/></g><circle r="8" fill="#0E0D0B"/></g></svg>'''

MOTOR_COMUM = """
const cl = (x) => Math.max(0, Math.min(1, x)), E = (x) => 1 - Math.pow(1 - cl(x), 3), EI = (x) => { x = cl(x); return x < .5 ? 4*x*x*x : 1 - Math.pow(-2*x + 2, 3)/2; };
const $ = (id) => document.getElementById(id);
const pulo = (x) => x <= 0 ? 0 : Math.exp(-4 * x) * Math.sin(14 * x);
const conta = (a, b, k) => Math.round(a + (b - a) * E(k)).toLocaleString('pt-BR');
function comum(t) {
  const cor = E((t - VIRA - 0.3) / 0.7);
  $('mundo').style.filter = `grayscale(${0.85 * (1 - cor)}) brightness(${0.92 + 0.08 * cor})`;
  $('p-sem').style.opacity = t < VIRA + 0.2 ? 1 : 0;
  $('p-sem').style.transform = `translateX(-50%) scale(${1 + 0.15 * pulo(t - 0.1)})`;
  $('p-com').style.opacity = t >= VIRA + 0.45 ? E((t - VIRA - 0.5) / 0.4) : 0;
  $('p-com').style.transform = `translateX(-50%) scale(${1 + 0.18 * pulo(t - VIRA - 0.5)})`;
  $('logo').style.opacity = t < CTA ? 1 : 0;
  const kx = (t - VIRA) / 0.7;
  $('corte').style.opacity = kx > 0 && kx < 1.5 ? 1 - cl((kx - 1) / 0.5) : 0;
  $('corte-linha').setAttribute('stroke-dashoffset', 1200 * (1 - E(kx)));
  const x = -120 + 1320 * EI(kx), y = 990 - 80 * EI(kx), ab = Math.abs(Math.sin(kx * Math.PI * 3)) * 26;
  $('corte-tes').setAttribute('transform', `translate(${x},${y}) rotate(-4)`);
  $('ct1').setAttribute('transform', `rotate(${-ab})`); $('ct2').setAttribute('transform', `rotate(${ab})`);
  const kf = E((t - FONE[0]) / 0.5) * (1 - E((t - FONE[1]) / 0.45));
  $('fone').style.opacity = cl(kf * 1.2); $('fone').style.transform = `translateY(${(1 - kf) * 900}px)`;
  $('escurece').setAttribute('opacity', 0.45 * kf);
  FALAS.forEach(([a, f, d], i) => { const l = $('leg' + i); if (!l) return; const k = E((t - a + 0.1) / 0.25) * (1 - E((t - a - d - 0.2) / 0.25)); l.style.opacity = k; l.style.transform = `translateY(${(1 - k) * 20}px)`; });
  const kk = E((t - CTA) / 0.5);
  $('cta').style.clipPath = `inset(${(1 - kk) * 100}% 0 0 0)`; $('cta').style.opacity = t >= CTA ? 1 : 0;
  ['cta1', 'cta2', 'cta3', 'cta4'].forEach((id, i) => { const k = E((t - CTA - 0.5 - i * 0.3) / 0.4); $(id).style.opacity = k; $(id).style.transform = `translateY(${(1 - k) * 40}px)`; });
  const mx = t - CTA - 0.7, mola = mx <= 0 ? 0 : Math.exp(-3.2 * mx);
  $('cta-topete').style.transform = `rotate(${7 * mola * Math.sin(11 * mx)}deg) scaleY(${1 + 0.22 * mola * Math.sin(9 * mx + 1.2)})`;
  $('cta-masc').style.transform = `scale(${E((t - CTA - 0.2) / 0.4)})`;
}
const EVENTOS = [];
function eventosComuns() {
  EVENTOS.push({ t: VIRA - 0.15, som: 'whoosh', v: 0.55 }, { t: VIRA + 0.15, som: 'snip', v: 0.9 }, { t: VIRA + 0.42, som: 'snip', v: 0.9 });
  EVENTOS.push({ t: FONE[0], som: 'swish', v: 0.5 }, { t: FONE[1], som: 'swish', v: 0.35 });
  EVENTOS.push({ t: CTA - 0.1, som: 'whoosh', v: 0.5 }, { t: CTA + 0.7, som: 'boing', v: 0.6 }, { t: CTA + 1.3, som: 'brilho', v: 0.45 });
}
"""


def pagina(nome, *, janela="dia", atras="", frente="", overlays, tela_fone, falas, durs, D, VIRA, FONE, CTA, cta, ep_js, ep_eventos, cenario=None):
    legendas = "".join(f'<div class="ov leg" id="leg{i}">{txt}</div>' for i, (_, txt) in enumerate(falas) if txt)
    falas_js = json.dumps([[a, f"fala{i}.wav", d] for i, ((a, _), d) in enumerate(zip(falas, durs))])
    html = f'''<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><link rel="stylesheet" href="base.css"><style>{CSS}</style></head><body>
<div id="palco">{svg(atras, frente, janela, cenario)}
{overlays}
<div class="ov fone" id="fone"><div class="tela">{tela_fone}<div class="exemplo">Valores de exemplo</div></div></div>
{CORTE}</div>
<div class="ov logo" id="logo"><img src="{ICONE}">topete</div>
<div class="ov pill sem" id="p-sem">✕ Sem Topete</div><div class="ov pill com" id="p-com">✓ Com Topete</div>
{legendas}
{cta_html(*cta)}
<script>
const D = {D}, VIRA = {VIRA}, FONE = {json.dumps(FONE)}, CTA = {CTA}, FALAS = {falas_js};
{MOTOR_COMUM}
{ep_js}
function render(t) {{ comum(t); ep(t); }}
eventosComuns();
{ep_eventos}
window.render = render; window.DURACAO = D; window.EVENTOS = EVENTOS; window.FALAS = FALAS;
if (!navigator.webdriver) {{ const t0 = performance.now(); const loop = () => {{ render(((performance.now() - t0) / 1000) % D); requestAnimationFrame(loop); }}; requestAnimationFrame(loop); }}
else render(0);
</script></body></html>'''
    (AQUI / f"{nome}.html").write_text(html)
    print("ok", nome)
