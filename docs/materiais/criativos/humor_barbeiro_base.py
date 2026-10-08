"""Base do formato "Coisas que todo barbeiro já ouviu" (02/10/2026) — humor curto.

A piada é o centro; o Topete só aparece no fim (mascote com boing + uma linha).
Peças: cabeça do barbeiro (mascote, com boca que fala e o "olhar de tédio"
pra câmera), cabeça de cliente desenhada aqui (cabelo variável, boca que fala,
olhos arregalados), câmera virtual (zoom/pan por keyframes), capa no 1º quadro,
falas em balão (cliente em branco, barbeiro em dourado), "ba-dum-tss" e cartão final.

Contrato com o gravador/mixador dos cartoons: window.render(t), DURACAO,
EVENTOS [{t, som, v}] e a linha `const ... FALAS = [[início, "falaN.wav", duração], ...];`.
"""
import json
import pathlib
import sys

AQUI = pathlib.Path(__file__).parent
sys.path.insert(0, str(AQUI.parent.parent / "marca"))
import mascote as _m  # noqa: E402

ICONE = "../../marca/topete-mascote.svg"
PELE = _m.PELE

CSS = """
body{width:1080px;height:1920px;background:#0E0D0B;overflow:hidden;position:relative;font-family:Manrope}
#cena{position:absolute;left:0;top:0;width:1080px;height:1920px}
.ov{position:absolute;will-change:transform,opacity}
#capa{inset:0;background:linear-gradient(180deg,#0E0D0Bf2 0%,#0E0D0Bcc 45%,#0E0D0B66 100%);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:22px;color:#F4EFE4;padding:0 70px}
#capa .marca{display:flex;align-items:center;gap:14px;font:700 44px Outfit;letter-spacing:-1px}
#capa .marca img{width:58px;height:58px}
#capa h1{font:700 104px/1.0 Outfit;letter-spacing:-4px}
#capa h1 em{font-style:normal;color:#E0AE58}
#capa .num{font:700 220px/0.9 Outfit;letter-spacing:-8px;background:linear-gradient(135deg,#FFE3A3,#E0AE58 45%,#A8752A);-webkit-background-clip:text;color:transparent}
#tag{left:50%;top:292px;transform:translateX(-50%);background:#16140Fe6;border:2px solid #3A342A;color:#F4EFE4;border-radius:999px;padding:16px 30px;font:800 26px/1 Manrope;white-space:nowrap}
#tag b{color:#E0AE58}
/* zona segura do Reels: fala acima do perfil/legenda do post (~1560) e fora da coluna de ícones (x>955) */
.fala{left:70px;right:150px;top:1392px;display:flex}
.fala span{max-width:820px;border-radius:36px;padding:20px 30px;font:800 44px/1.12 Outfit;letter-spacing:-1px;box-shadow:0 20px 40px -18px #000c}
.fala.c{justify-content:flex-start}.fala.c span{background:#F4EFE4;color:#16140F;border-bottom-left-radius:10px}
.fala.b{justify-content:flex-end}.fala.b span{background:linear-gradient(135deg,#FFE3A3,#E0AE58 50%,#C9963F);color:#0E0D0B;border-bottom-right-radius:10px}
.quem{display:block;font:800 22px Manrope;letter-spacing:.14em;text-transform:uppercase;opacity:.6;margin-bottom:6px}
#badum{left:60px;right:150px;top:380px;text-align:center;font:800 92px Outfit;letter-spacing:-2px;color:#E0AE58;text-shadow:0 8px 0 #0E0D0B,0 0 40px #0008}
.rot{background:#16140F;color:#F4EFE4;border-radius:22px;padding:14px 24px;font:800 34px Manrope;white-space:nowrap;box-shadow:0 14px 30px -12px #000a}
#fim{inset:0;background:radial-gradient(circle at 50% 40%,#2A2017,#0E0D0B 70%);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px;color:#F4EFE4;text-align:center;padding:0 70px}
"""


def escuro(cor, f=0.82):
    c = cor.lstrip("#")
    r, g, b = (int(c[i:i + 2], 16) for i in (0, 2, 4))
    return "#%02X%02X%02X" % (int(r * f), int(g * f), int(b * f))


def cabeca_barbeiro(id_, cx, cy, s):
    """Mascote com boca que abre (id-boca) e o olhar de tédio pra câmera (id-tedio). (cx, cy) = centro do rosto."""
    return f'''<g id="{id_}" transform="translate({cx - 256 * s},{cy - 300 * s}) scale({s})">{_m.mascote()}
<ellipse id="{id_}-boca" cx="256" cy="398" rx="22" ry="1" fill="#3A1F12"/>
<g id="{id_}-tedio" opacity="0"><rect x="204" y="288" width="30" height="19" fill="{PELE}"/><rect x="280" y="288" width="30" height="19" fill="{PELE}"/>
<path d="M206 306 H232 M282 306 H308" stroke="#16140F" stroke-width="6" stroke-linecap="round"/>
<path d="M194 278 H240 M272 278 H318" stroke="#6E4D1B" stroke-width="11" stroke-linecap="round"/></g></g>'''


def cabeca_cliente(id_, cx, cy, r=150, pele="#C98F5E", cabelo="curto", cor="#2B1E14", barba=False):
    """Cliente de frente. cabelo: curto | longo | entradas | cacheado. Ids: id-boca, id-arr (olhos arregalados), id-on (olhos normais), id-sorri."""
    sh = escuro(pele)
    atras, frente = "", ""
    if cabelo == "longo":
        tufos = "".join(f'<circle cx="{cx + dx * r:.0f}" cy="{cy + dy * r:.0f}" r="{rr * r:.0f}" fill="{cor}"/>'
                        for dx, dy, rr in [(-1.0, -0.2, .42), (-0.75, -0.75, .45), (-0.2, -1.05, .48), (0.4, -1.0, .46), (0.95, -0.55, .44), (1.05, 0.1, .40),
                                           (-1.05, 0.35, .36), (1.02, 0.55, .34), (-0.9, 0.75, .30), (0.9, 0.85, .28)])
        atras = f'<ellipse cx="{cx}" cy="{cy - .05 * r}" rx="{1.15 * r}" ry="{1.2 * r}" fill="{cor}"/>{tufos}'
        frente = (f'<path d="M{cx - .92 * r} {cy - .05 * r} C{cx - .98 * r} {cy - 1.38 * r} {cx + .98 * r} {cy - 1.38 * r} {cx + .92 * r} {cy - .05 * r} '
                  f'L{cx + .7 * r} {cy - .38 * r} L{cx + .5 * r} {cy - .12 * r} L{cx + .28 * r} {cy - .42 * r} L{cx + .05 * r} {cy - .15 * r} '
                  f'L{cx - .2 * r} {cy - .45 * r} L{cx - .42 * r} {cy - .16 * r} L{cx - .66 * r} {cy - .40 * r} Z" fill="{cor}"/>')
    elif cabelo == "curto":
        frente = (f'<path d="M{cx - .9 * r} {cy - .12 * r} C{cx - .98 * r} {cy - 1.4 * r} {cx + .98 * r} {cy - 1.4 * r} {cx + .9 * r} {cy - .12 * r} '
                  f'C{cx + .7 * r} {cy - .5 * r} {cx - .7 * r} {cy - .5 * r} {cx - .9 * r} {cy - .12 * r} Z" fill="{cor}"/>')
    elif cabelo == "entradas":
        frente = (f'<path d="M{cx - .9 * r} {cy + .05 * r} C{cx - .95 * r} {cy - .35 * r} {cx - .8 * r} {cy - .55 * r} {cx - .62 * r} {cy - .62 * r} L{cx - .7 * r} {cy - .1 * r} Z" fill="{cor}"/>'
                  f'<path d="M{cx + .9 * r} {cy + .05 * r} C{cx + .95 * r} {cy - .35 * r} {cx + .8 * r} {cy - .55 * r} {cx + .62 * r} {cy - .62 * r} L{cx + .7 * r} {cy - .1 * r} Z" fill="{cor}"/>'
                  f'<ellipse cx="{cx - .2 * r}" cy="{cy - .72 * r}" rx="{.28 * r}" ry="{.1 * r}" fill="#fff" opacity=".35"/>'
                  f'<path d="M{cx - .05 * r} {cy - .98 * r} l-8 -26 M{cx + .05 * r} {cy - .99 * r} l4 -30 M{cx + .14 * r} {cy - .97 * r} l14 -22" stroke="{cor}" stroke-width="7" stroke-linecap="round"/>')
    elif cabelo == "cacheado":
        tufos = "".join(f'<circle cx="{cx + dx * r:.0f}" cy="{cy + dy * r:.0f}" r="{.36 * r:.0f}" fill="{cor}"/>'
                        for dx, dy in [(-1.0, -0.35), (-0.8, -0.9), (-0.3, -1.2), (0.3, -1.2), (0.8, -0.9), (1.0, -0.35), (-0.55, -1.3), (0.55, -1.3), (0, -1.45),
                                       (-1.15, 0.15), (1.15, 0.15), (-1.25, -0.8), (1.25, -0.8)])
        atras = tufos
        frente = (f'<path d="M{cx - .92 * r} {cy - .05 * r} C{cx - .98 * r} {cy - 1.38 * r} {cx + .98 * r} {cy - 1.38 * r} {cx + .92 * r} {cy - .05 * r} '
                  f'C{cx + .6 * r} {cy - .45 * r} {cx - .6 * r} {cy - .45 * r} {cx - .92 * r} {cy - .05 * r} Z" fill="{cor}"/>')
    ex, ey = .34 * r, cy + .02 * r
    pelos = ""
    if barba:
        pelos = (f'<path d="M{cx - .88 * r} {cy + .1 * r} C{cx - .86 * r} {cy + .9 * r} {cx - .42 * r} {cy + 1.12 * r} {cx} {cy + 1.12 * r} '
                 f'C{cx + .42 * r} {cy + 1.12 * r} {cx + .86 * r} {cy + .9 * r} {cx + .88 * r} {cy + .1 * r} C{cx + .7 * r} {cy + .5 * r} {cx + .35 * r} {cy + .36 * r} {cx} {cy + .34 * r} '
                 f'C{cx - .35 * r} {cy + .36 * r} {cx - .7 * r} {cy + .5 * r} {cx - .88 * r} {cy + .1 * r} Z" fill="{cor}"/>')
    boca_cor = "#C26A4A" if barba else "#6B2E1A"
    return f'''<g id="{id_}">{atras}
<ellipse cx="{cx - .9 * r}" cy="{cy + .1 * r}" rx="{.12 * r}" ry="{.2 * r}" fill="{sh}"/><ellipse cx="{cx + .9 * r}" cy="{cy + .1 * r}" rx="{.12 * r}" ry="{.2 * r}" fill="{sh}"/>
<ellipse cx="{cx}" cy="{cy}" rx="{.9 * r}" ry="{r}" fill="{pele}"/>{frente}
<path id="{id_}-br" d="M{cx - ex - .16 * r} {ey - .2 * r} q{.16 * r} {-.08 * r} {.32 * r} 0 M{cx + ex - .16 * r} {ey - .2 * r} q{.16 * r} {-.08 * r} {.32 * r} 0" stroke="{escuro(cor, .9)}" stroke-width="{.06 * r}" fill="none" stroke-linecap="round"/>
<g id="{id_}-on"><circle cx="{cx - ex}" cy="{ey}" r="{.07 * r}" fill="#16140F"/><circle cx="{cx + ex}" cy="{ey}" r="{.07 * r}" fill="#16140F"/></g>
<g id="{id_}-arr" opacity="0"><circle cx="{cx - ex}" cy="{ey}" r="{.17 * r}" fill="#fff" stroke="#16140F" stroke-width="5"/><circle cx="{cx + ex}" cy="{ey}" r="{.17 * r}" fill="#fff" stroke="#16140F" stroke-width="5"/>
<circle cx="{cx - ex}" cy="{ey}" r="{.06 * r}" fill="#16140F"/><circle cx="{cx + ex}" cy="{ey}" r="{.06 * r}" fill="#16140F"/></g>
<path d="M{cx - .05 * r} {cy + .12 * r} q{-.07 * r} {.14 * r} {.06 * r} {.17 * r}" stroke="{sh}" stroke-width="{.05 * r}" fill="none" stroke-linecap="round"/>
{pelos}<path id="{id_}-sorri" d="M{cx - .22 * r} {cy + .45 * r} q{.22 * r} {.2 * r} {.44 * r} 0" stroke="#6B2E1A" stroke-width="{.05 * r}" fill="none" stroke-linecap="round" opacity="0"/>
<ellipse id="{id_}-boca" cx="{cx}" cy="{cy + .48 * r}" rx="{.17 * r}" ry="{.025 * r}" fill="{boca_cor}"/></g>'''


def avental(x, y, w, h):
    """Tronco do barbeiro: camisa marfim e avental preto. (x, y) = canto de cima à esquerda."""
    return (f'<path d="M{x} {y + 60} C{x} {y + 15} {x + .2 * w} {y} {x + w / 2} {y} C{x + .8 * w} {y} {x + w} {y + 15} {x + w} {y + 60} L{x + w + 10} {y + h} L{x - 10} {y + h} Z" fill="#F4EFE4"/>'
            f'<path d="M{x + .18 * w} {y + 70} L{x + .82 * w} {y + 70} L{x + .9 * w} {y + h} L{x + .1 * w} {y + h} Z" fill="#16140F"/>')


def capa_corte(cx, topo, larg, baixo):
    """Capa de corte sobre o cliente sentado."""
    return (f'<path d="M{cx} {topo} C{cx - .35 * larg} {topo + 10} {cx - .48 * larg} {topo + 90} {cx - .5 * larg} {topo + 200} L{cx - .55 * larg} {baixo} L{cx + .55 * larg} {baixo} '
            f'L{cx + .5 * larg} {topo + 200} C{cx + .48 * larg} {topo + 90} {cx + .35 * larg} {topo + 10} {cx} {topo} Z" fill="#F7F5F0" stroke="#D9D1C1" stroke-width="6"/>'
            f'<path d="M{cx - 60} {topo + 8} L{cx} {topo + 70} L{cx + 60} {topo + 8}" fill="none" stroke="#D9D1C1" stroke-width="6"/>')


def tesoura(id_, x, y, esc=1.0, cor="#9C927E"):
    return (f'<g id="{id_}" transform="translate({x},{y}) scale({esc})"><g id="{id_}1"><path d="M0 0 L-70 -30 Q-76 -28 -70 -22 Z" fill="{cor}"/>'
            f'<circle cx="18" cy="16" r="12" fill="none" stroke="#C9963F" stroke-width="6"/></g>'
            f'<g id="{id_}2"><path d="M0 0 L-70 30 Q-76 28 -70 22 Z" fill="{cor}"/><circle cx="18" cy="-16" r="12" fill="none" stroke="#C9963F" stroke-width="6"/></g>'
            f'<circle r="5" fill="#16140F"/></g>')


def fim_html(linha_a, linha_b, extra=""):
    m = _m.mascote()
    base, topete = m.split("<!-- TOPETE")
    return f'''<div class="ov" id="fim"><div id="fim-masc" style="width:300px;height:300px"><svg viewBox="0 0 512 512" style="width:300px;height:300px;overflow:visible"><defs>{_m.DEFS}</defs><g transform="translate(0,6)">{base}<g id="fim-topete" style="transform-origin:256px 226px"><!-- TOPETE{topete}</g></g></svg></div>
<p id="fim1" style="font:700 58px/1.12 Outfit;letter-spacing:-1.5px;max-width:900px">{linha_a}<br><span style="color:#E0AE58">{linha_b}</span></p>
{extra}
<p id="fim2" style="margin-top:18px;font:700 112px/0.9 Outfit;letter-spacing:-5px">topete<span style="color:#E0AE58">.</span></p>
<p id="fim3" style="font:800 40px Manrope;color:#E0AE58">@usetopete</p></div>'''


MOTOR = """
const cl = (x) => Math.max(0, Math.min(1, x)), E = (x) => 1 - Math.pow(1 - cl(x), 3);
const EIO = (x) => { x = cl(x); return x < .5 ? 4*x*x*x : 1 - Math.pow(-2*x + 2, 3)/2; };
const $ = (id) => document.getElementById(id);
const pulo = (x) => x <= 0 ? 0 : Math.exp(-4 * x) * Math.sin(14 * x);
const falando = (t, quem) => FALAS.some(([a, f, d], i) => QUEM[i] === quem && t >= a && t <= a + d);
function camera(t) {
  let x = 540, y = 960, s = 1;
  for (const [a, d, X, Y, S] of CAM) { if (t <= a) break; const u = EIO((t - a) / d); x += (X - x) * u; y += (Y - y) * u; s += (S - s) * u; }
  let dx = 0, dy = 0;
  for (const [a, d, amp] of TREME) { const k = (t - a) / d; if (k > 0 && k < 1) { dx += Math.sin(t * 70) * amp * (1 - k); dy += Math.cos(t * 55) * amp * (1 - k); } }
  $('cam').setAttribute('transform', `translate(${540 + dx} ${960 + dy}) scale(${s}) translate(${-x} ${-y})`);
}
function boca(id, r, t, quem) {
  const b = $(id); if (!b) return;
  b.setAttribute('ry', falando(t, quem) ? r * (0.15 + 0.85 * Math.abs(Math.sin(t * 17)) * (0.6 + 0.4 * Math.abs(Math.sin(t * 5.3)))) : r * 0.08);
}
function comum(t) {
  camera(t);
  const kc = 1 - E((t - CAPA) / 0.4);
  $('capa').style.opacity = kc; $('capa').style.transform = `scale(${1 + 0.06 * (1 - kc)})`;
  const kt = E((t - CAPA - 0.2) / 0.4) * (1 - E((t - FIM + 0.2) / 0.3));
  $('tag').style.opacity = kt;
  FALAS.forEach(([a, f, d], i) => { const l = $('fala' + i); if (!l) return; const k = E((t - a + 0.08) / 0.2) * (1 - E((t - a - d - 0.35) / 0.2));
    l.style.opacity = k; l.style.transform = `translateY(${(1 - k) * 30}px) scale(${0.92 + 0.08 * k})`; });
  const kb = E((t - BADUM) / 0.18) * (1 - E((t - BADUM - 1.4) / 0.3));
  $('badum').style.opacity = kb; $('badum').style.transform = `rotate(${-6 + 3 * pulo(t - BADUM)}deg) scale(${0.5 + 0.5 * kb + 0.25 * pulo(t - BADUM)})`;
  const kf = E((t - FIM) / 0.45);
  $('fim').style.clipPath = `inset(${(1 - kf) * 100}% 0 0 0)`; $('fim').style.opacity = t >= FIM ? 1 : 0;
  ['fim1', 'fim-x', 'fim2', 'fim3'].forEach((id, i) => { const e = $(id); if (!e) return; const k = E((t - FIM - 0.35 - i * 0.22) / 0.35); e.style.opacity = k; e.style.transform = `translateY(${(1 - k) * 36}px)`; });
  const mx = t - FIM - 0.55, mola = mx <= 0 ? 0 : Math.exp(-3.2 * mx);
  $('fim-topete').style.transform = `rotate(${7 * mola * Math.sin(11 * mx)}deg) scaleY(${1 + 0.22 * mola * Math.sin(9 * mx + 1.2)})`;
  $('fim-masc').style.transform = `scale(${E((t - FIM - 0.15) / 0.4)})`;
}
const EVENTOS = [];
function eventosComuns() {
  EVENTOS.push({ t: CAPA, som: 'whoosh', v: 0.4 }, { t: BADUM, som: 'badum', v: 0.75 });
  EVENTOS.push({ t: FIM - 0.1, som: 'whoosh', v: 0.45 }, { t: FIM + 0.55, som: 'boing', v: 0.6 }, { t: FIM + 1.15, som: 'brilho', v: 0.4 });
}
"""


def pagina(nome, *, num, titulo_capa, mundo, overlays, falas, quem, durs, D, CAPA, BADUM, FIM, CAM, TREME, fim, ep_js, ep_eventos, badum_txt="ba-dum-tss! 🥁", badum_top=380):
    """falas: [(início, legenda)], quem: ['c'|'b'] na mesma ordem. CAM: [[t, dur, x, y, escala]]. TREME: [[t, dur, amp]]."""
    rotulo = {"c": "Cliente", "b": "Barbeiro"}
    baloes = "".join(f'<div class="ov fala {q}" id="fala{i}"><span><i class="quem">{rotulo[q]}</i>{txt}</span></div>'
                     for i, ((_, txt), q) in enumerate(zip(falas, quem)) if txt)
    falas_js = json.dumps([[a, f"fala{i}.wav", d] for i, ((a, _), d) in enumerate(zip(falas, durs))])
    html = f'''<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><link rel="stylesheet" href="base.css"><style>{CSS}</style></head><body>
<svg id="cena" viewBox="0 0 1080 1920" xmlns="http://www.w3.org/2000/svg"><defs>{_m.DEFS}</defs>
<rect width="1080" height="1920" fill="#0E0D0B"/><g id="cam">{mundo}</g></svg>
{overlays}{baloes}
<div class="ov" id="badum" style="top:{badum_top}px">{badum_txt}</div>
<div class="ov" id="tag">Coisas que todo barbeiro já ouviu · <b>#{num}</b></div>
<div class="ov" id="capa"><div class="marca"><img src="{ICONE}">topete</div><h1>{titulo_capa}</h1><div class="num">#{num}</div></div>
{fim_html(*fim)}
<script>
const D = {D}, CAPA = {CAPA}, BADUM = {BADUM}, FIM = {FIM}, QUEM = {json.dumps(quem)}, CAM = {json.dumps(CAM)}, TREME = {json.dumps(TREME)}, FALAS = {falas_js};
{MOTOR}
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
