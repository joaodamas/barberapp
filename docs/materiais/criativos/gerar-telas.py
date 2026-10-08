"""Animações de tela do Topete para a apresentação da prospecção (01/10/2026).

Clipes curtos (1080×1080, sem som, em loop) mostrando cada recurso com dados
FICTÍCIOS: o prospect vê o que a coisa faz. Só recursos que existem
(`disponivel: true` em hub/console/src/lib/topete-oferta.js).

Uma cena só, contínua. Cada elemento diz quando acontece (data-in, segundos) e
como: sobe | pop | aparece | liga (ganha a classe "on") | toque (círculo de dedo).
Gravação: scratchpad/anim/gravar.mjs (mesmo gravador dos stories).
"""
import pathlib

AQUI = pathlib.Path(__file__).parent
ICONE = "../../marca/topete-mascote.svg"

CSS = """
body{width:1080px;height:1080px;overflow:hidden;position:relative;background:#F4EFE4;color:#16140F;font-family:Manrope}
.palco{position:absolute;inset:0}
.cel{position:absolute;left:300px;top:60px;width:480px;height:960px;border-radius:64px;background:#000;padding:14px;box-shadow:0 50px 100px -40px #0008}
.cel .tela{width:100%;height:100%;border-radius:52px;overflow:hidden;background:#F7F6F2;position:relative}
.nav{position:absolute;left:90px;top:90px;width:900px;height:900px;border-radius:28px;background:#fff;box-shadow:0 50px 100px -40px #0007;overflow:hidden}
.nav .barra{background:#EDE7DA;padding:16px 24px;font:600 20px Manrope;color:#8A8170;display:flex;gap:10px;align-items:center}
.nav .barra i{width:13px;height:13px;border-radius:50%;background:#D9CDB4;display:inline-block}
.topo-loja{background:#16140F;color:#F4EFE4;padding:46px 30px 26px;display:flex;gap:16px;align-items:center}
.topo-loja b{font:800 26px Manrope;display:block}.topo-loja span{font:500 16px Manrope;opacity:.7}
.mono{width:58px;height:58px;border-radius:16px;background:#C9963F;color:#16140F;display:grid;place-items:center;font:800 22px Manrope}
.rot{font:800 15px Manrope;letter-spacing:.14em;text-transform:uppercase;color:#8A8170;margin:22px 26px 10px}
.opc{margin:0 22px 12px;padding:18px 20px;border-radius:18px;border:2px solid #E3DED3;background:#fff;display:flex;justify-content:space-between;font:700 22px Manrope;transition:none}
.opc.on{border-color:#16140F;background:#E9E3D3}
.horas{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:0 22px}
.h{border:2px solid #E3DED3;border-radius:14px;padding:16px 0;text-align:center;font:800 22px Outfit;background:#fff}
.h.x{color:#B8B0A0;text-decoration:line-through}.h.on{background:#C9963F;border-color:#C9963F}.h.enc{border:2px dashed #1d4ed8;color:#1d4ed8}
.btn{margin:18px 22px;background:#16140F;color:#fff;border-radius:18px;padding:20px;text-align:center;font:800 22px Manrope}
.btn.on{background:#047857}
.ok{position:absolute;inset:0;background:#F7F6F2;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;text-align:center;padding:40px}
.ok .sel{width:120px;height:120px;border-radius:50%;background:#047857;color:#fff;display:grid;place-items:center;font:800 64px Manrope}
.lin{display:flex;justify-content:space-between;align-items:center;padding:18px 22px;border-radius:16px;background:#F7F3EA;font:600 22px Manrope;margin-bottom:12px}
.tag{font:800 16px Manrope;letter-spacing:.06em;padding:6px 12px;border-radius:999px}
.toque{position:absolute;width:70px;height:70px;border-radius:50%;background:#16140F33;border:3px solid #16140F66;pointer-events:none}
.legenda{position:absolute;right:28px;bottom:18px;font:700 16px Manrope;color:#A89F8C;letter-spacing:.06em;text-transform:uppercase}
"""

MOTOR = """
const E = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : 1 - Math.pow(1 - x, 3));
const els = [...document.querySelectorAll('[data-in]')];
const D = Math.max(...els.map((e) => +e.dataset.in)) + 1.8;
function render(t) {
  els.forEach((e) => {
    const a = +e.dataset.in, tipo = e.dataset.a || 'sobe';
    if (tipo === 'liga') { e.classList.toggle('on', t >= a); return; }
    if (tipo === 'some') { const k = E((t - a) / 0.3); e.style.opacity = 1 - k; e.style.transform = `scale(${1 - 0.06 * k})`; return; }
    if (tipo === 'toque') { const k = (t - a) / 0.5; e.style.opacity = k < 0 || k > 1 ? 0 : 1 - k; e.style.transform = `scale(${0.5 + k})`; return; }
    let k = E((t - a) / (tipo === 'pop' ? 0.3 : 0.4));
    if (e.dataset.sai) k *= 1 - E((t - +e.dataset.sai) / 0.3);
    e.style.opacity = k;
    e.style.transform = tipo === 'pop' ? `scale(${0.7 + 0.3 * k})` : tipo === 'aparece' ? 'none' : `translateY(${(1 - k) * 40}px)`;
  });
}
window.render = render; window.DURACAO = D;
if (!navigator.webdriver) { const t0 = performance.now(); const loop = () => { render(((performance.now() - t0) / 1000) % D); requestAnimationFrame(loop); }; requestAnimationFrame(loop); }
else render(0);
"""


def at(html, t, a="sobe"):
    return html.replace(">", f' data-in="{t}" data-a="{a}">', 1)


def toque(x, y, t):
    return at(f'<span class="toque" style="left:{x}px;top:{y}px">', t, "toque") + "</span>"


def clipe(nome, corpo, legenda):
    (AQUI / f"T-{nome}.html").write_text(f'''<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><link rel="stylesheet" href="base.css"><style>{CSS}</style></head>
<body><div class="palco">{corpo}</div><p class="legenda">Dados fictícios</p><script>{MOTOR}</script></body></html>''')


LOJA = '<div class="topo-loja"><span class="mono">BZ</span><div><b>Barbearia do Zé</b><span>barbeariadoze.topete.com.br</span></div></div>'

# 1 · Agendamento pelo link
clipe("agendamento", f'''<div class="cel"><div class="tela">{LOJA}
<p class="rot">Serviço</p>
{at('<div class="opc"><span>Corte adulto</span><span>R$ 60</span></div>', 0.6, "liga")}
<div class="opc"><span>Corte + barba</span><span>R$ 90</span></div>
<p class="rot">Barbeiro</p>
{at('<div class="opc"><span>Igor</span><span>✓</span></div>', 1.6, "liga")}
<p class="rot">Sábado, 04/10</p>
<div class="horas"><span class="h">09:00</span><span class="h x">09:30</span>{at('<span class="h">10:00</span>', 2.6, "liga")}<span class="h x">10:30</span><span class="h">11:00</span><span class="h">11:30</span></div>
{at('<div class="btn">Confirmar · R$ 60</div>', 3.5, "liga")}
{at('<div class="ok"><div class="sel">✓</div><b style="font:800 34px Outfit">Horário confirmado</b><span style="font:600 22px Manrope;color:#5E5648">Sábado, 04/10 às 10:00<br>Corte adulto com Igor</span></div>', 4.0, "pop")}
</div></div>
{toque(355, 300, 0.45)}{toque(355, 480, 1.45)}{toque(605, 620, 2.45)}{toque(505, 750, 3.35)}''',
      "O cliente marca sozinho, no app com a marca da barbearia.")

# 2 · Encaixe
clipe("encaixe", f'''<div class="cel" style="left:90px"><div class="tela">{LOJA}
<p class="rot">Sábado, 04/10</p>
<div class="horas"><span class="h x">10:00</span><span class="h x">10:30</span>{at('<span class="h x">11:00</span>', 0.7, "liga")}</div>
{at('<div class="btn" style="background:#1d4ed8">Pedir encaixe às 11:00</div>', 1.0)}
{at('<div class="opc" style="margin-top:14px"><span>Pedido enviado</span><span style="color:#8F6B22">aguardando</span></div>', 1.6)}
{at('<div class="opc" style="border-color:#047857;background:#E6F2EC"><span>Encaixe aprovado</span><span style="color:#047857">✓ confirmado</span></div>', 3.9, "pop")}
</div></div>
<div class="cel" style="left:600px;width:400px;height:820px;top:130px"><div class="tela" style="background:#0E1621;color:#fff;padding:40px 20px">
<div style="display:flex;gap:12px;align-items:center;margin-bottom:20px"><span style="width:52px;height:52px;border-radius:50%;background:#E0AE58;display:grid;place-items:center"><img src="{ICONE}" style="width:38px"></span><b style="font:700 22px Manrope">Topete Avisos</b></div>
{at('<div style="background:#182533;border-radius:18px;padding:18px;font:500 20px/1.45 Manrope">🔔 <b>Pedido de encaixe</b><br>Davi · Corte<br>sáb 04/10 às 11:00</div>', 2.2, "pop")}
{at('<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px"><span style="background:#2B3A4A;border-radius:12px;padding:14px 0;text-align:center;font:700 18px Manrope">✅ Aprovar</span><span style="background:#2B3A4A;border-radius:12px;padding:14px 0;text-align:center;font:700 18px Manrope">✖️ Recusar</span></div>', 2.5)}
{at('<div style="margin-top:12px;font:700 18px Manrope;color:#4CC38A">✅ Aprovado por Igor</div>', 3.6)}
</div></div>
{toque(668, 448, 3.2)}''',
      "Horário cheio vira pedido de encaixe — aprovado num toque.")

# 3 · Agenda do dia e caixa
clipe("agenda-caixa", f'''<div class="nav"><div class="barra"><i></i><i></i><i></i><span style="margin-left:14px">barbeariadoze.topete.com.br/painel</span></div>
<div style="padding:34px 40px;display:grid;grid-template-columns:1.6fr 1fr;gap:30px">
<div><b style="font:800 34px Outfit">Hoje · sábado</b><div style="height:18px"></div>
<div class="lin"><span><b>09:00</b> Murilo · Corte + barba</span><span class="tag" style="background:#E6F2EC;color:#047857">Concluído</span></div>
<div class="lin"><span><b>10:00</b> Caio · Corte adulto</span>{at('<span class="tag" style="background:#E6F2EC;color:#047857">Concluído · Pix</span>', 1.9, "pop")}</div>
<div class="lin"><span><b>11:00</b> Davi · Corte</span><span class="tag" style="background:#E8EEFC;color:#1d4ed8">Encaixe</span></div>
<div class="lin"><span><b>14:00</b> Thiago · Corte</span><span class="tag" style="background:#FBF3E4;color:#8F6B22">Mensalista</span></div>
{at('<div style="position:absolute;left:150px;top:420px;width:420px;background:#fff;border-radius:22px;box-shadow:0 30px 60px -20px #0006;padding:26px"><b style="font:800 24px Manrope">Como o cliente pagou?</b><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px;font:700 20px Manrope;text-align:center"><span class="pix" style="border:2px solid #E3DED3;border-radius:14px;padding:16px 0">Pix</span><span style="border:2px solid #E3DED3;border-radius:14px;padding:16px 0">Dinheiro</span><span style="border:2px solid #E3DED3;border-radius:14px;padding:16px 0">Débito</span><span style="border:2px solid #E3DED3;border-radius:14px;padding:16px 0">Crédito</span></div></div>', 0.6, "pop").replace('data-in="0.6" data-a="pop"', 'data-in="0.6" data-a="pop" data-sai="1.65"')}
</div>
<div style="background:#F7F3EA;border-radius:22px;padding:26px"><b style="font:800 22px Manrope;color:#8A8170">CAIXA DE HOJE</b>
<div style="font:800 54px Outfit;margin:10px 0 18px;position:relative;height:66px">{at('<span style="position:absolute">R$ 150</span>', 1.9, "some")}{at('<span style="position:absolute;color:#047857">R$ 210</span>', 1.95, "pop")}</div>
<div class="lin" style="background:#fff"><span>Pix</span><b>R$ 90 {at('<span style="color:#047857">+ 60</span>', 2.0, "pop")}</b></div>
<div class="lin" style="background:#fff"><span>Dinheiro</span><b>R$ 60</b></div>
<div class="lin" style="background:#fff"><span>Comissão Igor</span><b>R$ 54 {at('<span style="color:#047857">+ 24</span>', 2.3, "pop")}</b></div>
</div></div></div>
{toque(282, 600, 1.4)}''',
      "Concluiu, escolheu como pagou: o caixa e a comissão se atualizam. Dados fictícios.")

# 4 · Mensalistas
SEM = ["sex 03/10", "sex 10/10", "sex 17/10", "sex 24/10", "sex 31/10"]
clipe("mensalistas", f'''<div class="nav"><div class="barra"><i></i><i></i><i></i><span style="margin-left:14px">barbeariadoze.topete.com.br/painel/mensal</span></div>
<div style="padding:34px 40px;display:grid;grid-template-columns:1fr 1fr;gap:30px">
<div><b style="font:800 30px Outfit">Thiago · horário fixo</b><p style="font:600 20px Manrope;color:#8A8170;margin:6px 0 18px">Sexta, 17:00 · Corte adulto</p>
''' + "".join(at(f'<div class="lin"><span><b>{d}</b> · 17:00</span><span class="tag" style="background:#FBF3E4;color:#8F6B22">fixo</span></div>', 0.5 + i * 0.3, "pop") for i, d in enumerate(SEM)) + f'''
{at('<div class="lin" style="background:#C9963F"><span><b>qui 02/10</b> · 18:00</span><span class="tag" style="background:#16140F;color:#F4EFE4">remarcado</span></div>', 3.3, "pop")}
</div>
<div><b style="font:800 30px Outfit">Mensalidades · outubro</b><div style="height:18px"></div>
{at('<div class="lin"><span>Thiago · 4x cortes</span><span class="tag" style="background:#E6F2EC;color:#047857">Paga · Pix</span></div>', 2.0)}
{at('<div class="lin"><span>Henrique · 4x cortes</span><span class="tag" style="background:#E6F2EC;color:#047857">Paga · dinheiro</span></div>', 2.2)}
{at('<div class="lin"><span>Rodrigo · ilimitado</span><span class="tag" style="background:#FBF3E4;color:#8F6B22">Em aberto</span></div>', 2.4)}
{at('<div class="lin"><span>Samuel · 4x cortes</span><span class="tag" style="background:#FBF3E4;color:#8F6B22">Em aberto</span></div>', 2.6)}
</div></div></div>''',
      "Horário fixo guardado semanas à frente, e quem pagou o mês. Dados fictícios.")

# 5 · Números e DRE
BARRAS = [52, 61, 47, 70, 66, 88, 94]
clipe("numeros-dre", f'''<div class="nav"><div class="barra"><i></i><i></i><i></i><span style="margin-left:14px">barbeariadoze.topete.com.br/painel/financeiro</span></div>
<div style="padding:34px 40px;display:grid;grid-template-columns:1.2fr 1fr;gap:34px">
<div><b style="font:800 30px Outfit">Faturamento por dia</b>
<div style="display:flex;align-items:flex-end;gap:16px;height:320px;margin-top:24px">''' + "".join(
    at(f'<div style="flex:1;height:{h * 3}px;background:linear-gradient(180deg,#E0AE58,#A8752A);border-radius:10px 10px 4px 4px;transform-origin:bottom"></div>', 0.3 + i * 0.18) for i, h in enumerate(BARRAS)) + '''</div>
<div style="display:flex;gap:16px;font:600 16px Manrope;color:#8A8170;margin-top:8px"><span style="flex:1;text-align:center">seg</span><span style="flex:1;text-align:center">ter</span><span style="flex:1;text-align:center">qua</span><span style="flex:1;text-align:center">qui</span><span style="flex:1;text-align:center">sex</span><span style="flex:1;text-align:center">sáb</span><span style="flex:1;text-align:center">dom</span></div></div>
<div style="background:#F7F3EA;border-radius:22px;padding:26px"><b style="font:800 22px Manrope;color:#8A8170">RESULTADO DO MÊS</b><div style="height:14px"></div>''' + "".join(
    at(f'<div class="lin" style="background:#fff"><span>{a}</span><b style="color:{c}">{b}</b></div>', 1.8 + i * 0.25) for i, (a, b, c) in enumerate([("Atendimentos", "R$ 18.450", "#16140F"), ("Mensalidades", "R$ 5.960", "#16140F"), ("Comissões", "− R$ 9.870", "#9C927E"), ("Despesas", "− R$ 6.200", "#9C927E")])) + at('<div class="lin" style="background:#16140F;color:#F4EFE4"><span>Sobrou</span><b style="font:800 34px Outfit;color:#E0AE58">R$ 8.340</b></div>', 3.0, "pop") + '''
</div></div></div>''',
      "Quanto entrou, quanto saiu e quanto sobrou. Dados fictícios.")

# 6 · Avisos
clipe("avisos", f'''<div class="cel" style="background:#000"><div class="tela" style="background:#0E1621;color:#fff;padding:60px 26px">
<div style="display:flex;gap:14px;align-items:center;margin-bottom:24px"><span style="width:58px;height:58px;border-radius:50%;background:#E0AE58;display:grid;place-items:center"><img src="{ICONE}" style="width:42px"></span><div><b style="font:700 24px Manrope">Topete Avisos</b><span style="display:block;font:500 16px Manrope;color:#7D8B99">bot</span></div></div>
{at('<div style="background:#182533;border-radius:18px;padding:18px;font:500 20px/1.45 Manrope;margin-bottom:14px">☀️ <b>Agenda de hoje</b> · sáb 04/10<br><b>09:00</b> Murilo · Corte + barba<br><b>10:00</b> Caio · Corte<br><b>14:00</b> Thiago · Corte · <i>mensalista</i></div>', 0.4, "pop")}
{at('<div style="background:#182533;border-radius:18px;padding:18px;font:500 20px/1.45 Manrope">🔔 <b>Pedido de encaixe</b><br>Davi · Corte · sáb 11:00</div>', 1.8, "pop")}
{at('<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px"><span style="background:#2B3A4A;border-radius:12px;padding:14px 0;text-align:center;font:700 18px Manrope">✅ Aprovar</span><span style="background:#2B3A4A;border-radius:12px;padding:14px 0;text-align:center;font:700 18px Manrope">✖️ Recusar</span></div>', 2.1)}
{at('<div style="margin-top:12px;font:700 18px Manrope;color:#4CC38A">✅ Aprovado — o cliente já vê</div>', 3.1)}
{at('<div style="background:#182533;border-radius:18px;padding:18px;font:500 20px/1.45 Manrope;margin-top:14px">❌ <b>Cliente cancelou</b><br>Vítor · sex 17:00 — horário livre</div>', 3.9, "pop")}
</div></div>
{toque(355, 586, 2.75)}''',
      "Encaixe, cancelamento e a agenda do dia no Telegram. Grátis.")

print("ok")
