"""Base do formato "Quanto custa…?" (02/10/2026) — texto animado com a conta na tela.

Vertical 1080×1920, ~19–21 s. Sem cenário: tipografia grande, a conta montada
linha a linha (× e = entrando, número que conta, resultado com pop), selo
"conta de exemplo", depois a saída com o Topete e o final com o boing do
mascote (o mesmo do cartoon_base).

Cada elemento animado diz no HTML QUANDO entra (data-in), quando sai
(data-out, opcional), COMO (data-a: sobe | pop | aparece | conta | cai | risca)
e o som (data-som, data-v). Os EVENTOS de som saem desses atributos.
window.render(t) é determinístico, para o gravador quadro a quadro.
"""
import json
import pathlib

import cartoon_base as CB  # só leitura: reaproveita o final (mascote + boing)

AQUI = pathlib.Path(__file__).parent
ICONE = CB.ICONE

CSS = """
body{width:1080px;height:1920px;background:#0E0D0B;overflow:hidden;position:relative;font-family:Manrope;color:#F4EFE4}
.fundo{position:absolute;inset:0;background:radial-gradient(circle at 50% 38%,#2A2017 0,#0E0D0B 62%)}
.grade{position:absolute;inset:0;opacity:.07;background-image:linear-gradient(#E0AE58 1px,transparent 1px),linear-gradient(90deg,#E0AE58 1px,transparent 1px);background-size:90px 90px}
.ov{position:absolute;will-change:transform,opacity}
.logo{left:0;right:0;top:60px;display:flex;justify-content:center;align-items:center;gap:14px;font:700 46px Outfit;letter-spacing:-1.2px}
.logo img{width:60px;height:60px}
.pill{left:50%;top:150px;transform:translateX(-50%);border-radius:999px;padding:16px 32px;font:800 28px/1 Manrope;letter-spacing:.16em;text-transform:uppercase;white-space:nowrap;background:linear-gradient(135deg,#FFE3A3,#E0AE58 50%,#A8752A);color:#0E0D0B}
#gancho{left:70px;right:70px;text-align:center;font:700 128px/0.98 Outfit;letter-spacing:-4px;transform-origin:50% 0}
#gancho em{font-style:normal;color:#E0AE58}
.linha{left:0;right:0;display:flex;justify-content:center;align-items:center;gap:26px}
.num{font:700 120px/1 Outfit;letter-spacing:-4px;white-space:nowrap}
.num small{font:700 42px Manrope;letter-spacing:0;color:#CFC6B4;margin-left:10px}
.op{font:700 110px/1 Outfit;color:#E0AE58;width:90px;text-align:center}
.rot{left:0;right:0;text-align:center;font:700 36px Manrope;color:#9C927E}
.res{font:700 170px/1 Outfit;letter-spacing:-6px;color:#E0AE58;white-space:nowrap;text-shadow:0 20px 60px #E0AE5833}
.res small{font:700 48px Manrope;letter-spacing:0;color:#CFC6B4;margin-left:12px}
.selo{border:5px solid #E0AE58;color:#E0AE58;border-radius:16px;padding:12px 22px;font:800 26px Manrope;letter-spacing:.14em;text-transform:uppercase;transform:rotate(-8deg)}
.cartao{background:#F4EFE4;color:#16140F;border-radius:34px;box-shadow:0 40px 90px -30px #000c;overflow:hidden}
.cartao .cab{background:#16140F;color:#F4EFE4;padding:22px 30px;font:800 26px Manrope;letter-spacing:.12em;text-transform:uppercase;display:flex;align-items:center;gap:14px}
.cartao .cab img{width:44px;height:44px}
.lin{position:relative;display:flex;justify-content:space-between;align-items:center;padding:24px 30px;border-bottom:2px solid #E6DDCB;font:700 34px Manrope}
.lin span:last-child{color:#6B6252}
.luz{position:absolute;inset:0;box-shadow:inset 0 0 0 6px #E0AE58;background:#E0AE5822;pointer-events:none}
.luz.verde{box-shadow:inset 0 0 0 6px #4CC38A;background:#4CC38A22}
.lin.alvo{background:#FBF3E4;box-shadow:inset 8px 0 0 #C9963F}
.lin.alvo span:last-child{color:#C2410C}
.chip{border-radius:999px;padding:18px 32px;font:700 30px Manrope;background:#1C1A16;border:2px solid #3A342A;color:#F4EFE4;white-space:nowrap}
.chip.ouro{background:#E0AE58;border-color:#E0AE58;color:#0E0D0B}
.leg{left:150px;right:175px;top:1392px;text-align:center;font:800 44px/1.14 Outfit;letter-spacing:-1px}
/* zona segura do Reels: o conteúdo (y 60–1500) cabe entre a barra do Instagram (~270) e o perfil/legenda do post (~1560) */
#palco{position:absolute;left:0;top:0;width:1080px;height:1920px;transform-origin:540px 0;transform:translateY(235px) scale(.757)}
.leg em{font-style:normal;color:#E0AE58}
.cta{inset:0;background:radial-gradient(circle at 50% 40%,#2A2017,#0E0D0B 70%);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px;color:#F4EFE4;text-align:center}
.cta .chip{background:#1C1A16}
"""

MOTOR = """
const cl = (x) => Math.max(0, Math.min(1, x)), E = (x) => 1 - Math.pow(1 - cl(x), 3);
const $ = (id) => document.getElementById(id);
const pulo = (x) => x <= 0 ? 0 : Math.exp(-4 * x) * Math.sin(14 * x);
const fmt = (n) => Math.round(n).toLocaleString('pt-BR');
const ANIM = [...document.querySelectorAll('[data-in]')];
function render(t) {
  // gancho: grande na capa, depois sobe e encolhe para virar título
  const g = $('gancho'), kg = E((t - GANCHO_SOBE) / 0.6);
  g.style.top = (GANCHO_Y - (GANCHO_Y - 250) * kg) + 'px';
  g.style.transform = `scale(${1 - 0.56 * kg})`;
  g.style.opacity = t < CTA ? 1 : 0;
  ANIM.forEach((e) => {
    const a = +e.dataset.in, o = e.dataset.out ? +e.dataset.out : 1e9, tipo = e.dataset.a || 'sobe';
    const k = E((t - a) / (tipo === 'pop' ? 0.3 : 0.4)), s = E((t - o) / 0.4);
    let op = (t < a ? 0 : k) * (1 - s), tr = '';
    if (tipo === 'pop') tr = `scale(${0.5 + 0.5 * k + 0.18 * pulo(t - a)})`;
    else if (tipo === 'aparece') tr = '';
    else if (tipo === 'cai') { const y = t < a ? -500 : -500 * (1 - E((t - a) / 0.5)); tr = `translateY(${y + Math.abs(pulo(t - a - 0.4)) * -30}px) rotate(${(+e.dataset.r || 0) * k}deg)`; }
    else if (tipo === 'risca') { e.style.setProperty('--r', (E((t - a) / 0.35) * 100) + '%'); op = (t < a ? 0 : 1) * (1 - s); }
    else tr = `translateY(${(1 - k) * 50 - s * 40}px)`;
    if (tipo === 'conta') {
      const d = +(e.dataset.dur || 1), kk = E((t - a) / d);
      e.querySelector('b').textContent = (e.dataset.pre || '') + fmt(+e.dataset.de + (+e.dataset.ate - +e.dataset.de) * kk);
      op = (t < a ? 0 : E((t - a) / 0.25)) * (1 - s);
      const p = +(e.dataset.pop || (a + d));
      tr = `scale(${1 + 0.16 * pulo(t - p)}) translateY(${-s * 40}px)`;
    }
    if (e.dataset.rot) tr += ` rotate(${e.dataset.rot}deg)`;
    e.style.opacity = op; e.style.transform = tr;
  });
  FALAS.forEach(([a, f, d], i) => { const l = $('leg' + i); if (!l) return; const k = E((t - a + 0.1) / 0.25) * (1 - E((t - a - d - 0.2) / 0.25)); l.style.opacity = k; l.style.transform = `translateY(${(1 - k) * 20}px)`; });
  // final (mesmo do cartoon_base)
  const kk = E((t - CTA) / 0.5);
  $('cta').style.clipPath = `inset(${(1 - kk) * 100}% 0 0 0)`; $('cta').style.opacity = t >= CTA ? 1 : 0;
  ['cta1', 'cta2', 'cta3', 'cta4'].forEach((id, i) => { const k = E((t - CTA - 0.5 - i * 0.3) / 0.4); $(id).style.opacity = k; $(id).style.transform = `translateY(${(1 - k) * 40}px)`; });
  const mx = t - CTA - 0.7, mola = mx <= 0 ? 0 : Math.exp(-3.2 * mx);
  $('cta-topete').style.transform = `rotate(${7 * mola * Math.sin(11 * mx)}deg) scaleY(${1 + 0.22 * mola * Math.sin(9 * mx + 1.2)})`;
  $('cta-masc').style.transform = `scale(${E((t - CTA - 0.2) / 0.4)})`;
  $('logo').style.opacity = $('pill').style.opacity = t < CTA ? 1 : 0;
}
const EVENTOS = ANIM.filter((e) => e.dataset.som).map((e) => ({ t: +(e.dataset.st || e.dataset.in), som: e.dataset.som, v: +(e.dataset.v || 0.45) }));
ANIM.filter((e) => e.dataset.a === 'conta').forEach((e) => EVENTOS.push({ t: +(e.dataset.pop || (+e.dataset.in + +(e.dataset.dur || 1))), som: 'pop', v: 0.6 }));
EVENTOS.push({ t: GANCHO_SOBE, som: 'whoosh', v: 0.35 }, { t: CTA - 0.1, som: 'whoosh', v: 0.5 }, { t: CTA + 0.7, som: 'boing', v: 0.6 }, { t: CTA + 1.3, som: 'brilho', v: 0.45 });
"""


def el(html, entra, a="sobe", sai=None, som=None, v=None, **extra):
    """Acrescenta os atributos de animação na primeira tag do trecho."""
    attrs = f' data-in="{entra}" data-a="{a}"'
    if sai is not None:
        attrs += f' data-out="{sai}"'
    if som:
        attrs += f' data-som="{som}"' + (f' data-v="{v}"' if v is not None else "")
    for k, val in extra.items():
        attrs += f' data-{k}="{val}"'
    i = html.index(">")
    if html[i - 1] == "/":
        i -= 1
    return html[:i] + attrs + html[i:]


def conta(pre, de, ate, entra, dur=1.0, suf="", cls="num", sai=None, estilo=""):
    """Número que conta de `de` até `ate` (pt-BR), com pop no fim."""
    return el(f'<div class="ov {cls}" style="{estilo}"><b>{pre}{de}</b>{suf}</div>', entra, "conta", sai=sai, de=de, ate=ate, pre=pre, dur=dur)


def pagina(nome, *, gancho, falas, durs, D, CTA, corpo, cta, gancho_y=520, gancho_sobe=None):
    legendas = "".join(f'<div class="ov leg" id="leg{i}">{txt}</div>' for i, (_, txt) in enumerate(falas) if txt)
    falas_js = json.dumps([[a, f"fala{i}.wav", d] for i, ((a, _), d) in enumerate(zip(falas, durs))])
    sobe = gancho_sobe if gancho_sobe is not None else falas[1][0]
    html = f'''<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><link rel="stylesheet" href="base.css"><style>{CSS}</style></head><body>
<div class="fundo"></div><div class="grade"></div>
<div id="palco"><div class="ov logo" id="logo"><img src="{ICONE}">topete</div>
<div class="ov pill" id="pill">Quanto custa?</div>
<div class="ov" id="gancho" style="top:{gancho_y}px">{gancho}</div>
{corpo}</div>
{legendas}
{CB.cta_html(*cta)}
<script>
const D = {D}, CTA = {CTA}, GANCHO_Y = {gancho_y}, GANCHO_SOBE = {sobe}, FALAS = {falas_js};
{MOTOR}
window.render = render; window.DURACAO = D; window.EVENTOS = EVENTOS; window.FALAS = FALAS;
if (!navigator.webdriver) {{ const t0 = performance.now(); const loop = () => {{ render(((performance.now() - t0) / 1000) % D); requestAnimationFrame(loop); }}; requestAnimationFrame(loop); }}
else render(0);
</script></body></html>'''
    (AQUI / f"{nome}.html").write_text(html)
    print("ok", nome)
