"""Base do formato "Objeção em 15 segundos" (02/10/2026).

Tela escura com a objeção sendo digitada (fala de um dono de barbearia, voz
do Google) → carimbo da virada → fundo claro com a resposta mostrada (voz do
dono, clonada) → final escuro com o mascote (o mesmo CTA dos cartoons).

Para gravar: window.render(t), DURACAO, EVENTOS e a linha `const ... FALAS = [[...]];`
que o mixador (scratchpad/anim/mix_cartoon.py) lê.
"""
import json
import pathlib

import cartoon_base as CB

AQUI = pathlib.Path(__file__).parent
ICONE = CB.ICONE

CSS = """
body{width:1080px;height:1920px;background:#0E0D0B;overflow:hidden;position:relative;font-family:Manrope}
.ov{position:absolute;will-change:transform,opacity}
#fundo-claro{inset:0;background:#F4EFE4}
.logo{left:0;right:0;top:60px;display:flex;justify-content:center;align-items:center;gap:14px;font:700 46px Outfit;letter-spacing:-1.2px;color:#F4EFE4}
.logo img{width:60px;height:60px}
.rotulo{left:0;right:0;top:170px;text-align:center;font:800 26px Manrope;letter-spacing:.2em;text-transform:uppercase;color:#E0AE58}
#quote{left:80px;right:80px;top:560px;transform-origin:50% 0}
#quote .aspas{font:700 220px/0.6 Outfit;color:#E0AE58;height:110px}
#quote .txt{font:700 92px/1.06 Outfit;letter-spacing:-3px;color:#F4EFE4;min-height:300px}
#quote .cur{display:inline-block;width:8px;height:84px;background:#E0AE58;margin-left:6px;vertical-align:-10px}
#quote .quem{margin-top:34px;display:flex;align-items:center;gap:18px;font:700 30px Manrope;color:#9C927E}
#quote .quem i{width:58px;height:58px;border-radius:50%;background:#2A2722;display:inline-block;position:relative}
#quote .quem i::after{content:"";position:absolute;left:17px;top:10px;width:24px;height:24px;border-radius:50%;background:#5A554C;box-shadow:0 26px 0 6px #5A554C}
#carimbo{left:50%;top:860px;border:10px solid #E0AE58;color:#E0AE58;border-radius:28px;padding:22px 44px;font:800 76px/1 Outfit;letter-spacing:-1px;white-space:nowrap;background:#0E0D0B}
.leg{left:150px;right:175px;top:1392px;text-align:center;font:800 44px/1.14 Outfit;letter-spacing:-1px;color:#16140F}
/* zona segura do Reels: conteúdo (y 60–1520) entre a barra do Instagram (~270) e o perfil/legenda do post (~1560) */
#zona{position:absolute;left:0;top:0;width:1080px;height:1920px;transform-origin:540px 0;transform:translateY(235px) scale(.747)}
.leg em{font-style:normal;color:#A8752A}
.leg.esc{color:#F4EFE4}.leg.esc em{color:#E0AE58}
.fone{left:290px;top:500px;width:500px;height:1010px;background:#0E0D0B;border-radius:70px;padding:16px;box-shadow:0 60px 120px -40px #0008}
.fone .tela{position:relative;width:100%;height:100%;background:#F4EFE4;border-radius:56px;overflow:hidden;color:#16140F}
.tl{position:absolute;inset:0;padding:70px 30px 30px}
.exemplo{position:absolute;left:0;right:0;bottom:22px;text-align:center;font:800 16px Manrope;letter-spacing:.14em;color:#9C927E;text-transform:uppercase}
.toque{width:90px;height:90px;border-radius:50%;background:#E0AE58;opacity:0;margin:-45px 0 0 -45px}
.chip-l{background:#16140F;color:#F4EFE4;border-radius:999px;padding:16px 28px;font:800 28px Manrope;white-space:nowrap;box-shadow:0 18px 36px -16px #0007}
.chip-l b{color:#E0AE58}
.cta{inset:0;background:radial-gradient(circle at 50% 40%,#2A2017,#0E0D0B 70%);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px;color:#F4EFE4;text-align:center}
.chip{border-radius:999px;padding:18px 32px;font:700 30px Manrope;background:#1C1A16;border:2px solid #3A342A;color:#F4EFE4}
"""

MOTOR = """
const cl = (x) => Math.max(0, Math.min(1, x)), E = (x) => 1 - Math.pow(1 - cl(x), 3);
const $ = (id) => document.getElementById(id);
const pulo = (x) => x <= 0 ? 0 : Math.exp(-4 * x) * Math.sin(14 * x);
function toque(t, lista) {
  let k = 0, x = 0, y = 0; lista.forEach(([a, px, py]) => { const d = t - a; if (d > -0.05 && d < 0.45) { k = 1 - cl(d / 0.45); x = px; y = py; } });
  const e = $('toque'); if (!e) return; e.style.opacity = k * 0.55; e.style.left = x + 'px'; e.style.top = y + 'px'; e.style.transform = `scale(${0.6 + 0.6 * (1 - k)})`;
}
function comum(t) {
  // objeção sendo digitada, com cursor
  const [a0, , d0] = FALAS[0];
  const n = Math.round(OBJ.length * cl((t - a0 + 0.1) / (d0 * 0.85)));
  $('obj').textContent = t < 0.05 ? OBJ : OBJ.slice(0, Math.max(n, 0));  // quadro 0 = capa completa
  $('cur').style.opacity = t < VIRA && Math.floor(t * 2.4) % 2 === 0 ? 1 : 0;
  // virada: objeção sobe e encolhe; fundo clareia
  const kv = E((t - VIRA) / 0.6);
  $('quote').style.transform = `translateY(${-430 * kv}px) scale(${1 - 0.42 * kv})`;
  $('quote').style.opacity = 1 - 0.25 * kv;
  $('fundo-claro').style.opacity = E((t - VIRA - 0.2) / 0.5);
  $('obj').style.color = kv > 0.5 ? '#5A554C' : '#F4EFE4';
  $('quem').style.opacity = 1 - kv;
  $('rotulo').style.opacity = 1 - kv;
  $('logo').style.color = kv > 0.5 ? '#16140F' : '#F4EFE4';
  const kc = E((t - VIRA) / 0.25) * (1 - E((t - VIRA - 1.3) / 0.3));
  $('carimbo').style.opacity = kc; $('carimbo').style.transform = `translateX(-50%) rotate(-6deg) scale(${1.6 - 0.6 * E((t - VIRA) / 0.25) + 0.08 * pulo(t - VIRA - 0.2)})`;
  FALAS.forEach(([a, f, d], i) => { const l = $('leg' + i); if (!l) return; const k = E((t - a + 0.1) / 0.25) * (1 - E((t - a - d - 0.2) / 0.25)); l.style.opacity = k; l.style.transform = `translateY(${(1 - k) * 20}px)`; });
  const kk = E((t - CTA) / 0.5);
  $('cta').style.clipPath = `inset(${(1 - kk) * 100}% 0 0 0)`; $('cta').style.opacity = t >= CTA ? 1 : 0;
  ['cta1', 'cta2', 'cta3', 'cta4'].forEach((id, i) => { const k = E((t - CTA - 0.4 - i * 0.25) / 0.4); $(id).style.opacity = k; $(id).style.transform = `translateY(${(1 - k) * 40}px)`; });
  const mx = t - CTA - 0.6, mola = mx <= 0 ? 0 : Math.exp(-3.2 * mx);
  $('cta-topete').style.transform = `rotate(${7 * mola * Math.sin(11 * mx)}deg) scaleY(${1 + 0.22 * mola * Math.sin(9 * mx + 1.2)})`;
  $('cta-masc').style.transform = `scale(${E((t - CTA - 0.15) / 0.4)})`;
}
const EVENTOS = [];
function eventosComuns() {
  const [a0, , d0] = FALAS[0];
  for (let x = a0; x < a0 + d0 * 0.85; x += 0.09) EVENTOS.push({ t: x, som: 'tick', v: 0.18 });
  EVENTOS.push({ t: VIRA - 0.1, som: 'whoosh', v: 0.5 }, { t: VIRA + 0.05, som: 'pop', v: 0.6 }, { t: VIRA + 0.12, som: 'snip', v: 0.7 });
  EVENTOS.push({ t: CTA - 0.1, som: 'whoosh', v: 0.5 }, { t: CTA + 0.6, som: 'boing', v: 0.6 }, { t: CTA + 1.2, som: 'brilho', v: 0.45 });
}
"""


def pagina(nome, *, rotulo, objecao, quem, carimbo, palco, falas, durs, D, VIRA, CTA, ep_js, ep_eventos,
           cta=("Fale com a gente.", "Veja funcionando na sua barbearia.", ["Chama no direct"])):
    """falas: [(início, legenda_html, escura?)] — a fala 0 é a objeção (sem legenda: ela já está na tela)."""
    legendas = "".join(f'<div class="ov leg{" esc" if esc else ""}" id="leg{i}">{txt}</div>'
                       for i, (_, txt, esc) in enumerate(falas) if txt)
    falas_js = json.dumps([[a, f"fala{i}.wav", d] for i, ((a, _, _), d) in enumerate(zip(falas, durs))])
    html = f'''<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><link rel="stylesheet" href="base.css"><style>{CSS}</style></head><body>
<div class="ov" id="fundo-claro" style="opacity:0"></div>
<div id="zona"><div class="ov logo" id="logo"><img src="{ICONE}">topete</div>
<div class="ov rotulo" id="rotulo">{rotulo}</div>
<div class="ov" id="quote"><div class="aspas">“</div><div class="txt"><span id="obj">{objecao}</span><span class="cur" id="cur"></span></div>
<div class="quem" id="quem"><i></i>{quem}</div></div>
{palco}
<div class="ov" id="carimbo" style="opacity:0">{carimbo}</div></div>
{legendas}
{CB.cta_html(*cta)}
<script>
const D = {D}, VIRA = {VIRA}, CTA = {CTA}, OBJ = {json.dumps(objecao)}, FALAS = {falas_js};
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
