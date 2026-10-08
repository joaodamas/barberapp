"""Cartoons "sem Topete × com Topete" (02/10/2026) — piloto K1: o WhatsApp que não para.

Vertical 1080×1920, ~22 s. Tudo desenhado aqui (SVG + HTML) e animado por
window.render(t), determinístico, para o gravador quadro a quadro
(scratchpad/anim/gravar.mjs). Os efeitos sonoros saem de window.EVENTOS e a
narração (voz do dono, clonada) entra nos tempos de window.FALAS.

Regras: só nomes inventados (nunca cliente/barbeiro real); nada que o produto
não faz — o cliente marca pelo link; o aviso chega no celular do barbeiro.
"""
import pathlib
import sys

AQUI = pathlib.Path(__file__).parent
sys.path.insert(0, str(AQUI.parent.parent / "marca"))
import mascote as _m  # noqa: E402

ICONE = "../../marca/topete-mascote.svg"

# Cabeça do barbeiro = o mascote. Fica num <g> dentro do SVG da cena.
CABECA = _m.mascote()

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
.bal{right:215px;max-width:440px;background:#fff;color:#16140F;border-radius:30px 30px 8px 30px;padding:20px 26px;font:700 30px/1.25 Manrope;box-shadow:0 18px 36px -14px #0008;white-space:nowrap}
.badge{background:#E5484D;color:#fff;border-radius:999px;padding:8px 16px;font:800 28px Manrope}
.fone{left:290px;top:430px;width:500px;height:1010px;background:#0E0D0B;border-radius:70px;padding:16px;box-shadow:0 60px 120px -30px #000c}
.fone .tela{position:relative;width:100%;height:100%;background:#F4EFE4;border-radius:56px;overflow:hidden;color:#16140F}
.tl{position:absolute;inset:0;padding:70px 34px 30px}
.url{display:inline-block;background:#E9E1D0;border-radius:999px;padding:8px 18px;font:700 19px Manrope;color:#6B6252}
.srv{display:flex;justify-content:space-between;align-items:center;background:#fff;border:2.5px solid #E6DDCB;border-radius:22px;padding:20px 22px;font:700 26px Manrope;margin-top:12px}
.srv.on{border-color:#C9963F;background:#FBF3E4}
.hr{display:inline-block;width:124px;text-align:center;background:#fff;border:2.5px solid #E6DDCB;border-radius:18px;padding:16px 0;font:800 26px Manrope;margin:10px 6px 0 0}
.hr.on{background:#16140F;color:#F4EFE4;border-color:#16140F}
.btn{position:absolute;left:34px;right:34px;bottom:40px;border-radius:24px;padding:26px 0;text-align:center;font:800 30px Manrope;background:#D9D1C1;color:#fff}
.btn.on{background:#16140F}
.toque{width:90px;height:90px;border-radius:50%;background:#E0AE58;opacity:0;margin:-45px 0 0 -45px}
.notif{left:120px;right:120px;top:400px;background:#1C1A16;color:#F4EFE4;border-radius:34px;padding:28px 32px;display:flex;gap:22px;align-items:center;box-shadow:0 40px 80px -24px #000c}
.notif img{width:84px;height:84px;border-radius:20px}
.cta{inset:0;background:radial-gradient(circle at 50% 40%,#2A2017,#0E0D0B 70%);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px;color:#F4EFE4;text-align:center}
.chip{border-radius:999px;padding:18px 32px;font:700 30px Manrope;background:#1C1A16;border:2px solid #3A342A;color:#F4EFE4}
"""


def cena_svg():
    """Barbearia: parede, espelho, poste, relógio, prateleira com celular, cadeira, cliente e barbeiro."""
    s = 0.56  # escala da cabeça-mascote (viewBox 512)
    hx, hy = 660, 800  # centro aproximado do rosto do barbeiro
    return f'''<svg id="cena" viewBox="0 0 1080 1920" xmlns="http://www.w3.org/2000/svg">
<defs>{_m.DEFS}
<pattern id="listra" width="60" height="60" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
<rect width="60" height="60" fill="#F4EFE4"/><rect width="20" height="60" fill="#C9963F"/><rect x="30" width="10" height="60" fill="#0E0D0B"/></pattern></defs>
<g id="mundo">
<rect width="1080" height="1920" fill="#0E0D0B"/>
<rect x="0" y="300" width="1080" height="1230" fill="#EADFCB"/>
<rect x="0" y="1180" width="1080" height="350" fill="#3B2F22"/>
<rect x="0" y="1170" width="1080" height="14" fill="#A8752A"/>
<!-- poste de barbearia -->
<rect x="56" y="470" width="64" height="360" rx="32" fill="url(#listra)"/>
<rect x="46" y="452" width="84" height="26" rx="10" fill="#A8752A"/><rect x="46" y="822" width="84" height="26" rx="10" fill="#A8752A"/>
<!-- espelho -->
<rect x="170" y="430" width="400" height="560" rx="200" fill="#C9D7D6" stroke="#A8752A" stroke-width="16"/>
<path d="M230 560 C260 500 320 470 380 470" stroke="#fff" stroke-width="14" fill="none" opacity=".55" stroke-linecap="round"/>
<!-- relógio -->
<g transform="translate(900,520)"><circle r="78" fill="#fff" stroke="#16140F" stroke-width="10"/>
<g fill="#16140F">{"".join(f'<rect x="-3" y="-66" width="6" height="14" transform="rotate({a})"/>' for a in range(0, 360, 30))}</g>
<rect id="pont-h" x="-5" y="-40" width="10" height="44" rx="5" fill="#16140F"/>
<rect id="pont-m" x="-3.5" y="-60" width="7" height="64" rx="3.5" fill="#C9963F"/><circle r="9" fill="#16140F"/></g>
<!-- prateleira e celular -->
<rect x="760" y="930" width="280" height="20" rx="6" fill="#6E4D1B"/>
<g id="cel"><rect x="880" y="800" width="78" height="132" rx="16" fill="#16140F"/><rect x="887" y="812" width="64" height="108" rx="10" fill="#2E3A44" id="cel-tela"/>
<g id="cel-badge" opacity="0"><circle cx="958" cy="806" r="24" fill="#E5484D"/><text id="cel-num" x="958" y="815" text-anchor="middle" font-family="Manrope" font-weight="800" font-size="24" fill="#fff">1</text></g></g>
<!-- cadeira -->
<rect x="250" y="1250" width="260" height="40" rx="16" fill="#16140F"/>
<rect x="362" y="1288" width="36" height="150" fill="#9C927E"/><ellipse cx="380" cy="1450" rx="130" ry="24" fill="#16140F"/>
<!-- cliente -->
<g id="cliente">
<path id="capa" d="M380 920 C300 930 240 980 220 1080 L190 1290 L570 1290 L540 1080 C520 980 460 930 380 920 Z" fill="#F7F5F0" stroke="#D9D1C1" stroke-width="6"/>
<path d="M330 930 L380 990 L430 930" fill="none" stroke="#D9D1C1" stroke-width="6"/>
<g id="cli-cab"><ellipse cx="380" cy="860" rx="72" ry="80" fill="#C98F5E"/>
<path d="M306 846 C300 780 340 752 384 752 C430 752 462 784 456 846 C446 812 420 800 384 800 C346 800 318 812 306 846 Z" fill="#2B1E14"/>
<ellipse cx="308" cy="868" rx="12" ry="18" fill="#B57C4E"/><ellipse cx="452" cy="868" rx="12" ry="18" fill="#B57C4E"/>
<circle cx="354" cy="866" r="7" fill="#16140F"/><circle cx="406" cy="866" r="7" fill="#16140F"/>
<g id="cli-bravo" opacity="0"><path d="M336 842 L370 852" stroke="#2B1E14" stroke-width="8" stroke-linecap="round"/><path d="M424 842 L390 852" stroke="#2B1E14" stroke-width="8" stroke-linecap="round"/>
<path d="M362 906 L398 906" stroke="#7A4A2A" stroke-width="7" stroke-linecap="round"/></g>
<g id="cli-feliz"><path d="M338 844 C348 838 360 838 368 842" stroke="#2B1E14" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M392 842 C400 838 412 838 422 844" stroke="#2B1E14" stroke-width="7" fill="none" stroke-linecap="round"/>
<path d="M356 898 C368 914 392 914 404 898" stroke="#7A4A2A" stroke-width="7" fill="none" stroke-linecap="round"/></g></g>
<g id="pensa" opacity="0"><circle cx="250" cy="760" r="12" fill="#fff"/><circle cx="220" cy="720" r="18" fill="#fff"/>
<circle cx="170" cy="640" r="66" fill="#fff"/><circle cx="170" cy="640" r="40" fill="none" stroke="#16140F" stroke-width="7"/>
<path id="pensa-pont" d="M170 640 L170 612" stroke="#16140F" stroke-width="7" stroke-linecap="round"/><path d="M170 640 L190 652" stroke="#16140F" stroke-width="7" stroke-linecap="round"/></g>
</g>
<!-- barbeiro -->
<g id="barbeiro">
<rect x="612" y="1240" width="40" height="230" rx="18" fill="#16140F"/><rect x="672" y="1240" width="40" height="230" rx="18" fill="#16140F"/>
<path d="M585 960 C585 925 615 905 662 905 C709 905 740 925 740 960 L748 1260 L577 1260 Z" fill="#F4EFE4"/>
<path d="M606 990 L718 990 L730 1262 L594 1262 Z" fill="#16140F"/><rect x="636" y="1060" width="52" height="40" rx="8" fill="#2A2722"/>
<g id="braco-tesoura"><path d="M600 960 C560 980 520 960 500 920" stroke="#F4EFE4" stroke-width="40" fill="none" stroke-linecap="round"/>
<circle cx="498" cy="916" r="22" fill="{_m.PELE}"/>
<g id="tesoura" transform="translate(470,880)"><g id="lam1" style="transform-origin:0px 0px"><path d="M0 0 L-70 -30 Q-76 -28 -70 -22 Z" fill="#9C927E"/><circle cx="18" cy="16" r="12" fill="none" stroke="#C9963F" stroke-width="6"/></g>
<g id="lam2" style="transform-origin:0px 0px"><path d="M0 0 L-70 30 Q-76 28 -70 22 Z" fill="#9C927E"/><circle cx="18" cy="-16" r="12" fill="none" stroke="#C9963F" stroke-width="6"/></g></g></g>
<g id="braco-cel" style="transform-origin:725px 960px"><path d="M725 960 C760 1040 760 1110 740 1160" stroke="#F4EFE4" stroke-width="40" fill="none" stroke-linecap="round"/>
<circle cx="738" cy="1166" r="22" fill="{_m.PELE}"/></g>
<g id="cel-mao" opacity="0"><rect x="760" y="1000" width="70" height="120" rx="14" fill="#16140F"/><rect x="767" y="1010" width="56" height="98" rx="9" fill="#E9E3D6"/>
<path d="M725 960 C780 1000 790 1050 780 1080" stroke="#F4EFE4" stroke-width="40" fill="none" stroke-linecap="round"/><circle cx="782" cy="1086" r="22" fill="{_m.PELE}"/></g>
<g id="cab-barb"><g transform="translate({hx - 256 * s},{hy - 300 * s}) scale({s})">{CABECA}</g></g>
<path id="suor" d="M790 730 C782 746 778 756 786 764 C794 772 806 764 802 752 C800 744 794 738 790 730 Z" fill="#7FC4E8" opacity="0"/>
</g>
</g>
<rect id="escurece" width="1080" height="1920" fill="#0E0D0B" opacity="0"/>
</svg>'''


BALOES = ["Tem horário hoje?", "E amanhã às 15h?", "Oi?? 👀", "Consegue 18h?", "Quanto tá o corte?", "Responde aí 🙏", "Sábado ainda tem vaga?"]
T_BAL = [1.1, 1.7, 2.3, 2.85, 3.35, 3.8, 4.25]

FALAS = [  # (início, arquivo, legenda)
    (0.5, "fala0.wav", "Cortando cabelo e respondendo <em>WhatsApp</em> ao mesmo tempo?"),
    (4.7, "fala1.wav", "Enquanto isso, o cliente na cadeira… <em>esperando.</em>"),
    (9.5, "fala2.wav", "Com o Topete, o cliente <em>marca sozinho</em>, pelo link da sua barbearia."),
    (14.9, "fala3.wav", "E você só fica sabendo. <em>Sem parar o corte.</em>"),
    (18.2, "fala4.wav", ""),
]
DUR_FALA = [3.11, 3.02, 3.67, 2.31, 2.71]
D = 22.5


def html():
    baloes = "".join(f'<div class="ov bal" id="b{i}">{t}</div>' for i, t in enumerate(BALOES))
    legendas = "".join(f'<div class="ov leg" id="leg{i}">{txt}</div>' for i, (_, _, txt) in enumerate(FALAS) if txt)
    fone = f'''<div class="ov fone" id="fone"><div class="tela">
<div class="tl" id="tlA"><div style="display:flex;align-items:center;gap:14px"><span style="width:64px;height:64px;border-radius:18px;background:#16140F;color:#E0AE58;display:grid;place-items:center;font:800 32px Outfit">Z</span>
<div><b style="font:800 32px Outfit;letter-spacing:-.5px">Barbearia do Zé</b><br><span class="url">barbeariadoze.topete.com.br</span></div></div>
<p style="font:800 22px Manrope;letter-spacing:.12em;color:#A8752A;margin-top:34px">ESCOLHA O SERVIÇO</p>
<div class="srv" id="s-corte"><span>Corte</span><span>R$ 50</span></div><div class="srv"><span>Barba</span><span>R$ 35</span></div><div class="srv"><span>Corte + barba</span><span>R$ 80</span></div>
<p style="font:800 22px Manrope;letter-spacing:.12em;color:#A8752A;margin-top:30px" id="hr-tit">SÁBADO, 04/10</p>
<div id="hrs"><span class="hr">14:00</span><span class="hr" id="h15">15:00</span><span class="hr">16:30</span></div>
<div class="btn" id="btn">Confirmar</div></div>
<div class="tl" id="tlB" style="display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:22px;opacity:0">
<div id="ok" style="width:170px;height:170px;border-radius:50%;background:#047857;color:#fff;display:grid;place-items:center;font:800 96px Manrope">✓</div>
<b style="font:800 46px/1.05 Outfit;letter-spacing:-1px">Horário<br>confirmado</b>
<span style="font:700 26px/1.4 Manrope;color:#6B6252">Sáb 04/10 · 15:00<br>Corte · com Otávio</span></div>
<div class="ov toque" id="toque"></div></div></div>'''
    notif = f'''<div class="ov notif" id="notif"><img src="{ICONE}"><div style="font:600 28px/1.35 Manrope"><b style="font:800 30px Manrope">Nova reserva</b><br>Thiago · Corte<br><span style="color:#E0AE58">Sáb 04/10 às 15:00</span></div></div>'''
    cta = f'''<div class="ov cta" id="cta"><div id="cta-masc" style="width:330px;height:330px"><svg viewBox="0 0 512 512" style="width:330px;height:330px;overflow:visible"><defs>{_m.DEFS}</defs><g transform="translate(0,6)">{_m.mascote().split("<!-- TOPETE")[0]}<g id="cta-topete" style="transform-origin:256px 226px"><!-- TOPETE{_m.mascote().split("<!-- TOPETE")[1]}</g></g></svg></div>
<p id="cta1" style="font:700 120px/0.9 Outfit;letter-spacing:-5px">topete<span style="color:#E0AE58">.</span></p>
<p id="cta2" style="font:700 52px/1.15 Outfit;letter-spacing:-1px;max-width:860px">Agenda online <span style="color:#E0AE58">com a cara da sua barbearia.</span></p>
<div id="cta3" style="display:flex;gap:16px;flex-wrap:wrap;justify-content:center;max-width:900px;margin-top:10px"><span class="chip">Link com a sua marca</span><span class="chip">O cliente marca sozinho</span></div>
<p id="cta4" style="margin-top:26px;font:800 40px Manrope;color:#E0AE58">@usetopete</p></div>'''
    return f'''<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><link rel="stylesheet" href="base.css"><style>{CSS}</style></head><body>
<div id="palco">{cena_svg()}
{baloes}<div class="ov badge" id="contador" style="left:850px;top:965px">+37</div>
{fone}{notif}<svg class="ov" id="corte" viewBox="0 0 1080 1920" style="left:0;top:0;width:1080px;height:1920px;pointer-events:none">
<path id="corte-linha" d="M-40 980 L1120 900" stroke="#F4EFE4" stroke-width="10" stroke-dasharray="1200" stroke-dashoffset="1200" fill="none"/>
<g id="corte-tes"><g id="ct1"><path d="M0 0 L-110 -44 Q-118 -40 -110 -32 Z" fill="#E0AE58"/><circle cx="28" cy="24" r="20" fill="none" stroke="#E0AE58" stroke-width="10"/></g>
<g id="ct2"><path d="M0 0 L-110 44 Q-118 40 -110 32 Z" fill="#E0AE58"/><circle cx="28" cy="-24" r="20" fill="none" stroke="#E0AE58" stroke-width="10"/></g><circle r="8" fill="#0E0D0B"/></g></svg></div>
<div class="ov logo" id="logo"><img src="{ICONE}">topete</div>
<div class="ov pill sem" id="p-sem">✕ Sem Topete</div><div class="ov pill com" id="p-com">✓ Com Topete</div>
{legendas}{cta}

<script>{motor()}</script></body></html>'''


def motor():
    import json
    return f"""
const D = {D}, TB = {json.dumps(T_BAL)}, FALAS = {json.dumps([[a, f, d] for (a, f, _), d in zip(FALAS, DUR_FALA)])};
const cl = (x) => Math.max(0, Math.min(1, x)), E = (x) => 1 - Math.pow(1 - cl(x), 3), EI = (x) => {{ x = cl(x); return x < .5 ? 4*x*x*x : 1 - Math.pow(-2*x + 2, 3)/2; }};
const $ = (id) => document.getElementById(id);
const pulo = (x) => x <= 0 ? 0 : Math.exp(-4 * x) * Math.sin(14 * x);
const VIRA = 8.1, FONE = [9.4, 14.5], CTA = 17.6;
function render(t) {{
  const depois = t >= VIRA + 0.45;
  // cor: cinza antes, volta à cor depois do corte
  const cor = E((t - VIRA - 0.3) / 0.7);
  $('mundo').style.filter = `grayscale(${{0.85 * (1 - cor)}}) brightness(${{0.92 + 0.08 * cor}})`;
  $('p-sem').style.opacity = t < VIRA + 0.2 ? 1 : 0;
  $('p-sem').style.transform = `translateX(-50%) scale(${{1 + 0.15 * pulo(t - 0.1)}})`;
  $('p-com').style.opacity = depois ? E((t - VIRA - 0.5) / 0.4) : 0;
  $('p-com').style.transform = `translateX(-50%) scale(${{1 + 0.18 * pulo(t - VIRA - 0.5)}})`;
  $('logo').style.opacity = t < CTA ? 1 : 0;

  // relógio: normal, depois dispara enquanto o cliente espera
  const vel = t < 4.6 ? 6 : t < VIRA ? 6 + 260 * cl((t - 4.6) / 2) : 6;
  const ang = t < VIRA ? 6 * t + 260 * Math.max(0, (t - 4.6)) * cl((t - 4.6) / 2) * 0.6 : 6 * t + 520;
  $('pont-m').setAttribute('transform', `rotate(${{ang * 6}})`); $('pont-h').setAttribute('transform', `rotate(${{ang / 2}})`);

  // celular da prateleira: vibra a cada mensagem (antes)
  let vib = 0; TB.forEach((a) => {{ const x = t - a; if (x > 0 && x < 0.35) vib = Math.sin(x * 90) * 6 * (1 - x / 0.35); }});
  const comCel = t >= 2.9 && t < VIRA;  // barbeiro pega o celular
  $('cel').setAttribute('transform', `translate(${{vib}},0)`); $('cel').style.opacity = comCel ? 0 : 1;
  const n = TB.filter((a) => t >= a).length;
  $('cel-badge').setAttribute('opacity', t < VIRA && n ? 1 : 0); $('cel-num').textContent = n;
  $('cel-tela').setAttribute('fill', (t < VIRA && vib) ? '#7FC4E8' : '#2E3A44');

  // balões empilhando acima do celular
  TB.forEach((a, i) => {{
    const b = $('b' + i), k = E((t - a) / 0.3), sai = E((t - VIRA - 0.1) / 0.3);
    const acima = TB.filter((x) => t >= x && x > a).length;
    b.style.top = (575 - 90 * acima) + 'px';
    b.style.opacity = t < a ? 0 : k * (1 - sai) * (acima > 3 ? 0 : acima > 2 ? 0.45 : 1);
    b.style.transform = `scale(${{0.6 + 0.4 * k + 0.12 * pulo(t - a)}}) translateY(${{-sai * 60}}px)`; b.style.transformOrigin = 'right bottom';
  }});
  const kc = E((t - 4.4) / 0.3) * (1 - E((t - VIRA - 0.1) / 0.3));
  $('contador').style.opacity = kc; $('contador').style.transform = `scale(${{0.5 + 0.5 * kc + 0.2 * pulo(t - 4.4)}})`;

  // barbeiro: corta → para e olha o celular → (depois) corta tranquilo
  const corta = !comCel;
  const sn = corta ? Math.abs(Math.sin(t * 9)) * 24 : 4;
  $('lam1').setAttribute('transform', `rotate(${{sn}})`); $('lam2').setAttribute('transform', `rotate(${{-sn}})`);
  const baixa = comCel ? E((t - 2.9) / 0.4) : (t >= VIRA && t < VIRA + 0.8 ? 1 - E((t - VIRA) / 0.6) : 0);
  $('braco-tesoura').setAttribute('transform', `rotate(${{-80 * baixa + (corta ? Math.sin(t * 3) * 3 : 0)}} 600 960)`);
  $('braco-cel').style.opacity = comCel ? 0 : 1; $('cel-mao').setAttribute('opacity', comCel ? 1 : 0);
  $('cab-barb').setAttribute('transform', `rotate(${{comCel ? 16 * E((t - 2.9) / 0.4) : (depois ? Math.sin(t * 1.6) * 3 : 0)}} 660 905)`);
  const su = t > 5.2 && t < VIRA ? 1 : 0;
  $('suor').setAttribute('opacity', su); $('suor').setAttribute('transform', `translate(0,${{su ? ((t - 5.2) * 30) % 40 : 0}})`);

  // cliente: contente → impaciente (pé batendo, relógio no pensamento) → contente
  const bravo = t > 4.5 && t < VIRA + 0.5;
  $('cli-bravo').setAttribute('opacity', bravo ? 1 : 0); $('cli-feliz').setAttribute('opacity', bravo ? 0 : 1);
  $('cli-cab').setAttribute('transform', bravo ? `rotate(${{Math.sin(t * 7) * 2}} 380 860)` : '');
  const kp = E((t - 5.0) / 0.3) * (1 - E((t - VIRA) / 0.3));
  $('pensa').setAttribute('opacity', kp); $('pensa-pont').setAttribute('transform', `rotate(${{t * 400}} 170 640)`);
  $('capa').setAttribute('transform', bravo ? `translate(0,${{Math.abs(Math.sin(t * 10)) * 5}})` : '');

  // o corte: tesoura atravessa a tela e "corta" o antes
  const kx = (t - VIRA) / 0.7;
  $('corte').style.opacity = kx > 0 && kx < 1.5 ? 1 - cl((kx - 1) / 0.5) : 0;
  $('corte-linha').setAttribute('stroke-dashoffset', 1200 * (1 - E(kx)));
  const x = -120 + 1320 * EI(kx), y = 990 - 80 * EI(kx), ab = Math.abs(Math.sin(kx * Math.PI * 3)) * 26;
  $('corte-tes').setAttribute('transform', `translate(${{x}},${{y}}) rotate(-4)`);
  $('ct1').setAttribute('transform', `rotate(${{-ab}})`); $('ct2').setAttribute('transform', `rotate(${{ab}})`);

  // celular grande: o cliente marcando pelo link
  const kf = E((t - FONE[0]) / 0.5) * (1 - E((t - FONE[1]) / 0.45));
  $('fone').style.opacity = cl(kf * 1.2); $('fone').style.transform = `translateY(${{(1 - kf) * 900}}px)`;
  $('escurece').setAttribute('opacity', 0.45 * kf);
  const toques = [[10.5, 160, 300], [11.65, 220, 545], [12.35, 234, 900]];
  let tq = 0, tx = 0, ty = 0; toques.forEach(([a, px, py]) => {{ const d = t - a; if (d > -0.05 && d < 0.45) {{ tq = 1 - cl(d / 0.45); tx = px; ty = py; }} }});
  $('toque').style.opacity = tq * 0.55; $('toque').style.left = tx + 'px'; $('toque').style.top = ty + 'px'; $('toque').style.transform = `scale(${{0.6 + 0.6 * (1 - tq)}})`;
  $('s-corte').classList.toggle('on', t >= 10.5);
  $('hr-tit').style.opacity = $('hrs').style.opacity = E((t - 10.8) / 0.35);
  $('h15').classList.toggle('on', t >= 11.65); $('btn').classList.toggle('on', t >= 11.65);
  const kb = E((t - 12.5) / 0.35);
  $('tlA').style.opacity = 1 - kb; $('tlB').style.opacity = kb;
  $('ok').style.transform = `scale(${{0.4 + 0.6 * kb + 0.2 * pulo(t - 12.55)}})`;

  // aviso no celular do barbeiro
  const kn = E((t - 14.9) / 0.35) * (1 - E((t - CTA + 0.3) / 0.3));
  $('notif').style.opacity = kn; $('notif').style.transform = `translateY(${{(1 - kn) * -120}}px) scale(${{1 + 0.06 * pulo(t - 14.9)}})`;

  // legendas da narração
  FALAS.forEach(([a, f, d], i) => {{ const l = $('leg' + i); if (!l) return; const k = E((t - a + 0.1) / 0.25) * (1 - E((t - a - d - 0.2) / 0.25)); l.style.opacity = k; l.style.transform = `translateY(${{(1 - k) * 20}}px)`; }});
  // a legenda sai de cima do celular grande

  // final: cortina escura sobe, mascote dá o "boing"
  const kk = E((t - CTA) / 0.5);
  $('cta').style.clipPath = `inset(${{(1 - kk) * 100}}% 0 0 0)`; $('cta').style.opacity = t >= CTA ? 1 : 0;
  ['cta1', 'cta2', 'cta3', 'cta4'].forEach((id, i) => {{ const k = E((t - CTA - 0.5 - i * 0.3) / 0.4); $(id).style.opacity = k; $(id).style.transform = `translateY(${{(1 - k) * 40}}px)`; }});
  const mx = t - CTA - 0.7, mola = mx <= 0 ? 0 : Math.exp(-3.2 * mx);
  $('cta-topete').style.transform = `rotate(${{7 * mola * Math.sin(11 * mx)}}deg) scaleY(${{1 + 0.22 * mola * Math.sin(9 * mx + 1.2)}})`;
  $('cta-masc').style.transform = `scale(${{E((t - CTA - 0.2) / 0.4)}})`;
}}
const EVENTOS = [];
TB.forEach((a) => {{ EVENTOS.push({{ t: a, som: 'buzz', v: 0.5 }}); EVENTOS.push({{ t: a + 0.02, som: 'ding', v: 0.35 }}); }});
for (let x = 4.8; x < VIRA; x += Math.max(0.12, 0.42 - (x - 4.8) * 0.12)) EVENTOS.push({{ t: x, som: 'tick', v: 0.5 }});
EVENTOS.push({{ t: VIRA - 0.15, som: 'whoosh', v: 0.55 }}, {{ t: VIRA + 0.15, som: 'snip', v: 0.9 }}, {{ t: VIRA + 0.42, som: 'snip', v: 0.9 }});
EVENTOS.push({{ t: FONE[0], som: 'swish', v: 0.5 }}, {{ t: 10.5, som: 'tap', v: 0.6 }}, {{ t: 11.65, som: 'tap', v: 0.6 }}, {{ t: 12.35, som: 'tap', v: 0.6 }}, {{ t: 12.5, som: 'pop', v: 0.5 }});
EVENTOS.push({{ t: FONE[1], som: 'swish', v: 0.35 }}, {{ t: 14.9, som: 'notif', v: 0.6 }});
EVENTOS.push({{ t: CTA - 0.1, som: 'whoosh', v: 0.5 }}, {{ t: CTA + 0.7, som: 'boing', v: 0.6 }}, {{ t: CTA + 1.3, som: 'brilho', v: 0.45 }});
window.render = render; window.DURACAO = D; window.EVENTOS = EVENTOS; window.FALAS = FALAS;
if (!navigator.webdriver) {{ const t0 = performance.now(); const loop = () => {{ render(((performance.now() - t0) / 1000) % D); requestAnimationFrame(loop); }}; requestAnimationFrame(loop); }}
else render(0);
"""


(AQUI / "K1-whatsapp.html").write_text(html())
print("ok K1-whatsapp.html")
