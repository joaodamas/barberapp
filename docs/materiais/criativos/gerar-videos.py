"""Stories animados do Topete (01/10/2026) — molde do V1, aprovado pelo dono.

Cada vídeo é uma lista de cenas; o tempo é automático: cena de CENA segundos,
cortina de CORT segundos entrando por cima da anterior, última cena segura até
o fim. Dentro da cena, cada elemento diz QUANDO entra (data-in, em segundos
desde o começo da cena) e COMO (data-a: sobe | pop | linha | aparece).

Gravação: scratchpad/anim/gravar.mjs (puppeteer-core + Chrome + ffmpeg).
Regras: nada que o produto não faz; número de exemplo marcado; fundadora 30% no 1º mês.
"""
import pathlib
import re

AQUI = pathlib.Path(__file__).parent
ICONE = "../../marca/topete-mascote.svg"
import sys
sys.path.insert(0, str(AQUI.parent.parent / "marca"))
import mascote as _m  # docs/marca/mascote.py — a mesma fonte do logo

def _mascote_animavel():
    corpo = _m.mascote()
    base, topete = corpo.split("<!-- TOPETE", 1)
    topete = "<!-- TOPETE" + topete
    brilho = ('<linearGradient id="brilho" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/>'
              '<stop offset=".5" stop-color="#fff" stop-opacity=".85"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>'
              '<clipPath id="cTopete">' + re.sub(r'fill="[^"]*"', "", re.sub(r'<path d="M246,196[^>]*>', "", topete.split("-->",1)[1])) + '</clipPath>')
    faisca = lambda x, y, n: (f'<path class="faisca{n}" d="M{x},{y-18} L{x+5},{y-5} L{x+18},{y} L{x+5},{y+5} L{x},{y+18} L{x-5},{y+5} L{x-18},{y} L{x-5},{y-5} Z" fill="#FFE9B3" opacity="0"/>')
    return (f'<svg viewBox="0 0 512 512" style="width:320px;height:320px;overflow:visible"><defs>{_m.DEFS}{brilho}</defs>'
            f'<g transform="translate(0,6)">{base}<g class="topete" style="transform-origin:256px 226px">{topete}'
            f'<g clip-path="url(#cTopete)"><rect class="brilho" x="-220" y="60" width="120" height="200" fill="url(#brilho)" transform="skewX(-20)"/></g></g>'
            f'{faisca(420, 120, 1)}{faisca(190, 92, 2)}</g></svg>')


MASCOTE = "../../marca/topete-mascote.svg"

MASCOTE_SVG = _mascote_animavel()

CSS = """
body{width:1080px;height:1920px;background:#F4EFE4;overflow:hidden;position:relative;color:#16140F}
.cena{position:absolute;inset:0;overflow:hidden;display:none}
.claro{background:#F4EFE4;color:#16140F}
.ouro{background:linear-gradient(160deg,#E7BE6E,#C9963F 55%,#A8752A);color:#0E0D0B}
.escuro{background:radial-gradient(circle at 50% 42%,#2A2017,#0E0D0B 70%);color:#F4EFE4}
.topo{position:absolute;left:0;right:0;display:flex;flex-direction:column;align-items:center;gap:26px}
.logo{display:flex;align-items:center;gap:16px;font-family:Outfit;font-weight:700;font-size:54px;letter-spacing:-1.5px}
.logo img{width:72px;height:72px}
.etq{font:800 24px/1 Manrope;letter-spacing:.18em;text-transform:uppercase;color:#A8752A}.ouro .etq{color:#0E0D0B;opacity:.8}.escuro .etq{color:#E0AE58}
h1{position:absolute;left:0;right:0;font-family:Outfit;font-weight:700;letter-spacing:-3px;line-height:1.02;text-align:center;font-size:118px}
h1 span{display:inline-block}
.cor{color:#A8752A}.ouro .cor{color:#0E0D0B}.escuro .cor{color:#E0AE58}
.chip{position:absolute;background:#fff;color:#16140F;border-radius:999px;padding:16px 30px;font:700 30px Manrope;box-shadow:0 14px 30px -12px #0006;white-space:nowrap}
.chip.esc{background:#16140F;color:#F4EFE4}.chip.dou{background:#C9963F;color:#16140F}.chip.azul{background:#1d4ed8;color:#fff}.chip.verde{background:#047857;color:#fff}
.cartao{position:absolute;background:#fff;border-radius:40px;box-shadow:0 40px 80px -30px #0007;overflow:hidden;color:#16140F}
.tesoura{position:absolute;left:110px;top:230px;width:170px;height:170px}.tesoura .lam{transform-origin:85px 85px}
.leg{position:absolute;left:60px;right:60px;text-align:center;font:600 34px/1.35 Manrope;opacity:.8}
.linha{display:flex;justify-content:space-between;align-items:center;padding:22px 26px;border-radius:18px;background:#F7F3EA;font:600 28px Manrope}
svg{position:absolute;left:0;top:0;overflow:visible}
"""

MOTOR = """
const CENA = 3.8, CORT = 0.4, FIM = 3.6;
const E = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : 1 - Math.pow(1 - x, 3));
const cenas = [...document.querySelectorAll('.cena')];
const D = (cenas.length - 1) * CENA + FIM;
var render = function (t) {
  cenas.forEach((c, i) => {
    const ini = i * CENA, fim = i === cenas.length - 1 ? D + 1 : ini + CENA + CORT;
    if (t < ini || t > fim) { c.style.display = 'none'; return; }
    c.style.display = 'block'; c.style.zIndex = i + 1;
    c.style.clipPath = i === 0 ? 'none' : `inset(${(1 - E((t - ini) / CORT)) * 100}% 0 0 0)`;
    const tl = t - ini - (i === 0 ? 0 : CORT);
    c.querySelectorAll('[data-in]').forEach((e) => {
      const a = +e.dataset.in, tipo = e.dataset.a || 'sobe';
      if (tipo === 'linha') {
        const L = e.getTotalLength(), k = E((tl - a) / 0.8);
        e.setAttribute('stroke-dasharray', `${L * k} ${L}`); e.style.opacity = tl < a ? 0 : 1; return;
      }
      if (tipo === 'tesoura') {
        const k = E((tl - a) / 0.35); e.style.opacity = k; e.style.transform = `scale(${0.6 + 0.4 * k})`;
        const x = Math.max(0, Math.min(1, (tl - a - 0.2) / 0.9));
        const ang = 22 * Math.abs(Math.sin(Math.PI * 2 * x)) * (1 - x * 0.2);
        const [l1, l2] = e.querySelectorAll('.lam'); if (l1) l1.style.transform = `rotate(${-ang}deg)`; if (l2) l2.style.transform = `rotate(${-ang}deg)`;
        return;
      }
      const k = E((tl - a) / (tipo === 'pop' ? 0.35 : 0.45));
      e.style.opacity = k;
      e.style.transform = tipo === 'pop' ? `scale(${0.6 + 0.4 * k})` : tipo === 'aparece' ? 'none' : `translateY(${(1 - k) * 60}px)`;
    });
  });
};
/* final: o topete dá um "boing", passa um brilho e duas faíscas */
const _render = render;
render = function (t) {
  _render(t);
  const ult = cenas[cenas.length - 1]; const ini = (cenas.length - 1) * CENA + CORT;
  const x = t - ini - 0.45;
  const tp = ult.querySelector('.topete');
  if (tp) {
    const mola = x <= 0 ? 0 : Math.exp(-3.2 * x);
    tp.style.transform = `rotate(${7 * mola * Math.sin(11 * x)}deg) scaleY(${1 + 0.22 * mola * Math.sin(9 * x + 1.2)})`;
    const b = ult.querySelector('.brilho'); if (b) b.setAttribute('x', -220 + 760 * E((x - 0.6) / 0.7));
    [['.faisca1', 1.25], ['.faisca2', 1.45]].forEach(([q, a]) => { const f = ult.querySelector(q); if (!f) return; const k = Math.max(0, Math.min(1, (x - a) / 0.5)); f.setAttribute('opacity', k <= 0 || k >= 1 ? 0 : Math.sin(Math.PI * k)); });
  }
};
window.render = render; window.DURACAO = D;
if (!navigator.webdriver) { const t0 = performance.now(); const loop = () => { render(((performance.now() - t0) / 1000) % D); requestAnimationFrame(loop); }; requestAnimationFrame(loop); }
else render(0);
"""


def el(html, entra, a="sobe"):
    return html.replace(">", f' data-in="{entra}" data-a="{a}">', 1)


def titulo(a, b, top=430):
    return f'<h1 style="top:{top}px">{el("<span>" + a + "</span>", 0.15)}<br>{el(chr(60) + "span class=" + chr(34) + "cor" + chr(34) + ">" + b + "</span>", 0.55)}</h1>'


def etiqueta(texto, top=300):
    return f'<div class="topo" style="top:{top}px">{el("<div class=" + chr(34) + "etq" + chr(34) + ">" + texto + "</div>", 0.05)}</div>'


def chip(texto, x, y, entra, cls=""):
    return el(f'<span class="chip {cls}" style="left:{x}px;top:{y}px">{texto}</span>', entra, "pop")


def legenda(texto, y, entra=1.9):
    return el(f'<p class="leg" style="top:{y}px">{texto}</p>', entra)


def mais(entra=0.0):
    """Tesoura que entra dando um corte (abre e fecha) — o nosso sinal, no lugar do "+"."""
    lamina = lambda rot: (f'<g class="lam" style="transform:rotate({rot}deg)">'
        '<path d="M85 85 L160 70 Q166 72 160 78 Z" fill="#C9963F"/>'
        '<circle cx="45" cy="120" r="22" fill="none" stroke="#C9963F" stroke-width="10"/>'
        '<path d="M85 85 L58 106" stroke="#C9963F" stroke-width="10" stroke-linecap="round"/></g>')
    svg = (f'<svg class="tesoura" viewBox="0 0 170 170">{lamina(0)}'
           f'<g style="transform:scaleY(-1);transform-origin:85px 85px">{lamina(0)}</g>'
           '<circle cx="85" cy="85" r="7" fill="#0E0D0B"/></svg>')
    return el(svg, entra, "tesoura")


def cartao(html, x, y, w, entra=0.9, extra=""):
    return el(f'<div class="cartao" style="left:{x}px;top:{y}px;width:{w}px;{extra}">{html}</div>', entra)


def telegram(linhas, botoes=None, hora="14:32"):
    btn = ""
    if botoes:
        btn = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px">' + "".join(
            f'<span style="background:#2B3A4A;color:#fff;border-radius:16px;padding:20px 0;text-align:center;font:700 28px Manrope">{b}</span>' for b in botoes) + "</div>"
    return f'''<div style="background:#0E1621;padding:34px 30px 38px;color:#fff;font:500 30px/1.45 Manrope">
<div style="display:flex;align-items:center;gap:16px;margin-bottom:22px"><span style="width:64px;height:64px;border-radius:50%;background:#E0AE58;display:grid;place-items:center"><img src="{ICONE}" style="width:46px"></span><div><b style="font-size:30px">Topete Avisos</b><span style="display:block;font-size:22px;color:#7D8B99">bot</span></div></div>
<div style="background:#182533;border-radius:22px;padding:24px 26px 14px">{"<br>".join(linhas)}<span style="display:block;text-align:right;font-size:20px;color:#7D8B99;margin-top:8px">{hora}</span></div>{btn}</div>'''


def final(frase, cta):
    return f'''<section class="cena escuro">
<div class="topo" style="top:560px">{el('<div class="etq" style="color:#E0AE58;opacity:1">Sistema para barbearias</div>', 0.05)}</div>
<div style="position:absolute;left:0;right:0;top:680px;display:flex;flex-direction:column;align-items:center;gap:30px">
{el(MASCOTE_SVG, 0.15, "pop")}
{el('<p style="font:600 48px Manrope;opacity:.85">Conheça o</p>', 0.4)}
{el('<p style="font:700 170px/0.9 Outfit;letter-spacing:-6px">topete<span style="color:#E0AE58">.</span></p>', 0.6)}
{el(f'<p style="font:600 36px Manrope;color:#CFC6B4">{frase}</p>', 1.0)}
{el(f'<span style="margin-top:30px;background:#F4EFE4;color:#0E0D0B;border-radius:999px;padding:30px 56px;font:800 34px Manrope">{cta}</span>', 1.35, "pop")}
{el('<p style="margin-top:20px;font:700 30px Manrope;color:#9C927E">topete.com.br</p>', 1.55)}
</div></section>'''


def abertura(a, b, rotulo, corpo):
    """Primeira cena: logo e etiqueta já na tela no quadro 0 (capa nunca vazia)."""
    return f'''<section class="cena claro">
<div class="topo" style="top:150px"><div class="logo"><img src="{ICONE}">topete</div><div class="etq">{rotulo}</div></div>
<h1 style="top:470px"><span>{a}</span><br>{el(chr(60) + 'span class="cor">' + b + "</span>", 0.5)}</h1>
{corpo}</section>'''


def video(nome, cenas):
    (AQUI / f"{nome}.html").write_text(f'''<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><link rel="stylesheet" href="base.css"><style>{CSS}</style></head>
<body>{"".join(cenas)}<script>{MOTOR}</script></body></html>''')


GRADE = lambda itens: '<div style="padding:34px 38px;display:grid;grid-template-columns:repeat(3,1fr);gap:16px;font:800 34px Outfit;text-align:center">' + "".join(
    f'<span style="border-radius:18px;padding:24px 0;{st}">{h}</span>' for h, st in itens) + "</div>"
LIVRE = "border:2px solid #E3DED3"
OCUP = "border:2px solid #E3DED3;color:#B8B0A0;text-decoration:line-through"

# ---------------------------------------------------------------- V2 · Encaixe
video("V2-encaixe", [
    abertura("Horário cheio", "não é não.", "Encaixe", f'''
{cartao(GRADE([("09:00", LIVRE), ("09:30", OCUP), ("10:00", OCUP), ("10:30", OCUP), ("11:00", "background:#1d4ed8;color:#fff"), ("11:30", OCUP)]), 170, 900, 740, 0.9)}
{chip("ENCAIXE", 640, 860, 1.6, "azul")}
{legenda("O horário ocupado vira pedido de encaixe.", 1400, 2.0)}'''),
    f'''<section class="cena ouro">{etiqueta("O cliente pede")}{titulo("Ele pede", "o encaixe.")}
{cartao('<div style="background:#16140F;color:#F4EFE4;padding:30px 38px;font:800 30px Manrope">Barbearia do Zé</div>' + GRADE([("10:30", OCUP), ("11:00", "border:3px dashed #1d4ed8;color:#1d4ed8"), ("11:30", OCUP)]) + '<div style="margin:0 38px 34px;background:#1d4ed8;color:#fff;border-radius:20px;padding:24px;text-align:center;font:800 28px Manrope">Pedir encaixe às 11:00</div>', 170, 820, 740)}
{chip("Corte + barba", 110, 760, 1.5, "esc")}{chip("sáb · 11:00", 700, 1330, 1.8)}
{legenda("O Topete mostra se cabe pelo tempo do serviço.", 1560, 2.1)}</section>''',
    f'''<section class="cena claro">{mais()}{etiqueta("Você aprova")}{titulo("Um toque,", "no Telegram.")}
{cartao(telegram(["🔔 <b>Pedido de encaixe</b>", "Igor · Corte + barba", "sáb 04/10 às 11:00"], ["✅ Aprovar", "✖️ Recusar"]), 170, 800, 740)}
{chip("✅ Aprovado", 600, 1410, 2.0, "verde")}
{legenda("Sem largar a máquina, sem abrir o painel.", 1580, 2.3)}</section>''',
    f'''<section class="cena claro">{mais()}{etiqueta("O cliente vê na hora")}{titulo("Ninguém fica", "sem resposta.")}
{cartao('<div style="padding:44px 46px;display:grid;gap:18px;font:600 30px Manrope"><b style="font:800 40px Outfit">Seus horários</b><div class="linha"><span><b>sáb 11:00</b> · Corte + barba</span><span style="color:#1d4ed8;font-weight:800">ENCAIXE</span></div><div class="linha"><span>Situação</span><span style="color:#047857;font-weight:800">Confirmado</span></div></div>', 150, 860, 780)}
{legenda("Aprovou, aparece confirmado no app da barbearia.", 1420, 1.8)}</section>''',
    final("Encaixe sem bagunça.", "Manda FUNDADOR no direct ↗"),
])

# ---------------------------------------------------------------- V3 · Mensalistas
SEMANAS = lambda destaque=None: '<div style="padding:40px 44px;display:grid;gap:16px">' + "".join(
    f'<div class="linha" style="{"background:#C9963F;color:#16140F" if d == destaque else ""}"><span><b>{d}</b> · 17:00 · Corte</span><span style="color:#A8752A;font-weight:800">{"remarcado" if d == destaque else "fixo"}</span></div>'
    for d in ["sex 03/10", "sex 10/10", "sex 17/10", "sex 24/10"]) + "</div>"
video("V3-mensalistas", [
    abertura("Seu mensalista,", "com dia e hora.", "Mensalistas", f'''
{chip("sex 17h", 150, 960, 0.9, "esc")}{chip("sex 17h", 600, 1010, 1.15, "dou")}{chip("sex 17h", 260, 1150, 1.4)}{chip("sex 17h", 640, 1220, 1.65, "esc")}
{legenda("Toda semana, o mesmo horário — guardado.", 1450, 2.0)}'''),
    f'''<section class="cena ouro">{etiqueta("Horário fixo")}{titulo("Reservado", "semanas à frente.")}
{cartao(SEMANAS(), 150, 820, 780)}
{chip("o sistema completa sozinho", 230, 1420, 1.9, "esc")}</section>''',
    f'''<section class="cena claro">{mais()}{etiqueta("Adiantou ou adiou?")}{titulo("Remarca", "só essa semana.")}
{cartao(SEMANAS("sex 03/10").replace("sex 03/10</b> · 17:00", "qui 02/10</b> · 18:00"), 150, 820, 780)}
{legenda("As outras continuam fixas.", 1420, 1.8)}</section>''',
    f'''<section class="cena claro">{mais()}{etiqueta("Mensalidade")}{titulo("Quem pagou,", "sem caderno.")}
{cartao('<div style="padding:40px 44px;display:grid;gap:16px"><div class="linha"><span>Thiago</span><span style="color:#047857;font-weight:800">Paga · Pix</span></div><div class="linha"><span>Henrique</span><span style="color:#047857;font-weight:800">Paga · dinheiro</span></div><div class="linha"><span>Rodrigo</span><span style="color:#A8752A;font-weight:800">Em aberto</span></div></div>', 150, 840, 780)}
{legenda("Nomes de exemplo.", 1300, 1.8)}</section>''',
    final("Mensalista bem cuidado não cancela.", "Manda FUNDADOR no direct ↗"),
])

# ---------------------------------------------------------------- V4 · Fechamento
video("V4-fechamento", [
    abertura("Fim do dia,", "caixa fechado.", "Financeiro", f'''
{chip("Pix", 160, 960, 0.9, "dou")}{chip("Cartão", 450, 1030, 1.15, "esc")}{chip("Dinheiro", 720, 960, 1.4)}
{el('<p style="position:absolute;left:0;right:0;top:1250px;text-align:center;font:700 96px Outfit">R$ 1.240</p>', 2.1)}
{legenda("Exemplo de um dia.", 1400, 2.3)}'''),
    f'''<section class="cena ouro">{etiqueta("No fechamento")}{titulo("Veio pro corte,", "saiu com barba.")}
{cartao('<div style="padding:40px 44px;display:grid;gap:16px;font:600 30px Manrope"><div class="linha"><span>Corte adulto</span><b>R$ 60</b></div><div class="linha"><span style="color:#A8752A">+ Barba</span><b style="color:#A8752A">R$ 35</b></div><div class="linha" style="background:#16140F;color:#F4EFE4"><span>Corte + barba</span><b style="font:800 40px Outfit">R$ 90</b></div></div>', 150, 820, 780)}
{chip("preço de combo", 640, 1320, 1.9, "esc")}</section>''',
    f'''<section class="cena claro">{mais()}{etiqueta("Equipe")}{titulo("Comissão", "de cada um.")}
{cartao('<div style="padding:40px 44px;display:grid;gap:16px"><div class="linha"><span>Otávio · 86 atendimentos</span><b>R$ 3.096</b></div><div class="linha"><span>Igor · 71 atendimentos</span><b>R$ 2.556</b></div><div class="linha"><span>Breno · 52 atendimentos</span><b>R$ 1.872</b></div></div>', 150, 840, 780)}
{legenda("Calculada a cada corte concluído. Valores de exemplo.", 1300, 1.8)}</section>''',
    f'''<section class="cena claro">{mais()}{etiqueta("Todo dia, 21h")}{titulo("O resumo", "no seu Telegram.")}
{cartao(telegram(["🌙 <b>Fechamento de hoje</b>", "", "✂️ 11 atendimentos concluídos", "💰 R$ 1.240 recebidos", "🚫 1 falta"], None, "21:00"), 170, 800, 740)}
{legenda("Valores de exemplo.", 1560, 1.8)}</section>''',
    final("Sem caderno, sem planilha.", "Manda FUNDADOR no direct ↗"),
])

# ---------------------------------------------------------------- V5 · Barbeiro sozinho
video("V5-barbeiro-solo", [
    abertura("Trabalha sozinho?", "Tem recepção.", "Barbeiro solo", f'''
{el(f'<img src="{MASCOTE}" style="position:absolute;left:330px;top:900px;width:420px">', 0.8, "pop")}
{legenda("O Topete atende enquanto você corta.", 1450, 1.8)}'''),
    f'''<section class="cena ouro">{etiqueta("Agendamento online")}{titulo("O link", "atende por você.")}
{cartao('<div style="background:#16140F;color:#F4EFE4;padding:30px 38px;font:800 30px Manrope">Barbearia do Zé</div>' + GRADE([("08:00", LIVRE), ("09:00", OCUP), ("10:00", "background:#C9963F"), ("14:00", LIVRE), ("15:00", OCUP), ("16:00", LIVRE)]), 170, 820, 740)}
{chip("✓ Confirmado", 120, 760, 1.6, "esc")}{chip("23:47", 760, 1240, 1.9)}
{legenda("Até de madrugada, sem te chamar.", 1460, 2.1)}</section>''',
    f'''<section class="cena claro">{mais()}{etiqueta("No seu celular")}{titulo("Você corta,", "ele avisa.")}
{el('<div style="position:absolute;left:120px;right:120px;top:860px;background:#1C1A16;color:#F4EFE4;border-radius:34px;padding:30px 34px;display:flex;gap:22px;align-items:center;font:500 28px Manrope"><img src="' + ICONE + '" style="width:72px;border-radius:18px"><div><b>📅 Novo agendamento</b><br><span style="color:#CFC6B4">Caio · Corte · sáb 09:30</span></div></div>', 0.9, "pop")}
{el('<div style="position:absolute;left:120px;right:120px;top:1060px;background:#1C1A16;color:#F4EFE4;border-radius:34px;padding:30px 34px;display:flex;gap:22px;align-items:center;font:500 28px Manrope"><img src="' + ICONE + '" style="width:72px;border-radius:18px"><div><b>❌ Cliente cancelou</b><br><span style="color:#CFC6B4">Vítor · sex 17:00 — horário livre</span></div></div>', 1.3, "pop")}
{legenda("Notificação do app ou Telegram — você escolhe.", 1400, 1.9)}</section>''',
    f'''<section class="cena claro">{mais()}{etiqueta("Todo dia, 7h")}{titulo("De manhã,", "a agenda pronta.")}
{cartao(telegram(["☀️ <b>Agenda de hoje</b> · sáb 04/10", "", "<b>09:00</b> Murilo · Corte + barba", "<b>10:00</b> Thiago · Corte · <i>mensalista</i>", "<b>11:00</b> Igor · Corte · <i>encaixe</i>"], None, "07:00"), 170, 800, 740)}</section>''',
    final("Plano Agenda · R$ 97/mês", "Manda FUNDADOR no direct ↗"),
])

# ---------------------------------------------------------------- V1 · Sua agenda no automático (refeito no molde)
video("V1-sua-agenda", [
    abertura("Sua agenda,", "no automático.", "Sistema para barbearias", f'''
{el(f'<img src="{ICONE}" style="position:absolute;width:280px;height:280px;left:400px;top:960px;border-radius:66px;box-shadow:0 40px 80px -30px #A8752A99">', 0.7, "pop")}
{chip("Cliente", 130, 1010, 1.3, "esc")}{chip("Agenda", 760, 1010, 1.55)}{chip("Caixa", 455, 1300, 1.8, "dou")}
{legenda("O cliente marca, a agenda enche, o caixa fecha.", 1480, 2.1)}'''),
    f'''<section class="cena ouro">{etiqueta("Agendamento online")}{titulo("Do link", "à cadeira.")}
{cartao('<div style="background:#16140F;color:#F4EFE4;padding:30px 38px;font:800 30px Manrope">Barbearia do Zé</div>' + GRADE([("09:00", LIVRE), ("09:30", OCUP), ("10:00", LIVRE), ("10:30", "background:#C9963F"), ("11:00", OCUP), ("11:30", LIVRE)]), 170, 820, 740)}
{chip("✓ Confirmado", 120, 760, 1.5, "esc")}{chip("Encaixe", 720, 1250, 1.8, "azul")}{chip("Sem troca de mensagem", 110, 1330, 2.05)}
{legenda("O cliente marca sozinho, pelo link da sua barbearia.", 1560, 2.3)}</section>''',
    f'''<section class="cena claro">{mais()}{etiqueta("Gestão da barbearia")}{titulo("Mais que", "agenda.")}
{cartao('<div style="padding:40px 44px;display:grid;gap:16px"><div class="linha"><span>Mensalistas</span><b style="color:#A8752A">horário fixo</b></div><div class="linha"><span>Caixa do dia</span><b style="color:#A8752A">fechado na hora</b></div><div class="linha"><span>Comissão</span><b style="color:#A8752A">de cada barbeiro</b></div></div>', 150, 840, 780)}
{chip("Pix · cartão · dinheiro", 560, 1260, 1.8, "esc")}
{legenda("Cada corte concluído já entra no caixa.", 1460, 2.1)}</section>''',
    f'''<section class="cena claro">{mais()}{etiqueta("Uma plataforma")}{titulo("Tudo num", "lugar só.")}
{cartao('<div style="background:#EDE7DA;padding:16px 24px;font:600 22px Manrope;color:#8A8170">suabarbearia.topete.com.br/painel</div><div style="padding:30px 36px;display:grid;gap:14px"><b style="font:800 36px Outfit">Hoje · 9 horários</b><div class="linha"><span><b>09:00</b> Murilo · Corte + barba</span><span style="color:#047857">Concluído</span></div><div class="linha"><span><b>10:00</b> Thiago · Corte</span><span style="color:#A8752A">Mensalista</span></div><div class="linha"><span><b>10:30</b> Breno · Barba</span><span style="color:#1d4ed8">Encaixe</span></div></div>', 120, 800, 840)}
{chip("Agenda", 140, 1430, 1.7, "esc")}{chip("Fechamento", 410, 1430, 1.95, "dou")}{chip("Relatório", 760, 1430, 2.2)}
{legenda("Do agendamento ao fim do mês.", 1580, 2.4)}</section>''',
    final("Agenda cheia. Cadeira girando.", "Manda FUNDADOR no direct ↗"),
])

print("ok")
