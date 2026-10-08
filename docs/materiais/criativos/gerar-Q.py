"""Formato "Quanto custa…?" — Q1 cliente sumido, Q2 horário vago, Q3 tempo no WhatsApp.

Contas de exemplo (marcadas no vídeo):
  Q1  R$ 50 a cada 15 dias → 26 visitas/ano → R$ 1.300 por cliente; 5 clientes = R$ 6.500.
  Q2  1 horário vago/dia × R$ 50 × 26 dias = R$ 1.300 por mês.
  Q3  40 mensagens × 1 min = 40 min/dia; × 26 dias = 1.040 min ≈ 17 h/mês ≈ 2 dias de trabalho.
Promessas conferidas no código:
  Q1  clientes/page.tsx mostra "há N dias" por cliente (diasSemVir); não há botão de mensagem — o dono chama.
  Q2  push/gatilhos.ts "❌ Cliente cancelou … O horário ficou livre."; booking.ts: cancelled_by_client
      fica fora de OCUPAM_SLOT (o horário volta a ser oferecido no link).
  Q3  o cliente marca sozinho pelo link da barbearia ((cliente)/agendar); nada de WhatsApp automático.
Durações das falas medidas em scratchpad/formatos/qN/fala*.wav.
"""
import quanto_custa_base as Q
from quanto_custa_base import el, conta

ICONE = Q.ICONE


def linha(html, top, entra, **kw):
    return el(f'<div class="ov linha" style="top:{top}px">{html}</div>', entra, **kw)


def rot(texto, top, entra, **kw):
    return el(f'<div class="ov rot" style="top:{top}px">{texto}</div>', entra, **kw)


def selo(top, entra, sai=None, left=None):
    pos = f"left:{left}px" if left is not None else "left:50%;margin-left:-180px"
    return el(f'<div class="ov" style="top:{top}px;{pos};width:360px;display:flex;justify-content:center"><span class="selo">Conta de exemplo</span></div>', entra, "pop", sai=sai, som="tap", v=0.4)


def chip(texto, top, entra, ouro=False, sai=None, som=None):
    return el(f'<div class="ov linha" style="top:{top}px"><span class="chip{" ouro" if ouro else ""}">{texto}</span></div>', entra, "pop", sai=sai, som=som)


def cartao(cab, linhas, top, entra, passo=0.25, alvo=None, t_alvo=None, sai=None, icone=True, verde=False):
    """Cartão claro com cabeçalho e linhas que entram uma a uma; a linha `alvo` acende em t_alvo."""
    ico = f'<img src="{ICONE}">' if icone else ""
    corpo = ""
    for i, (a, b) in enumerate(linhas):
        luz = el(f'<span class="luz{" verde" if verde else ""}"></span>', t_alvo, "pop", som="ding", v=0.5) if i == alvo else ""
        corpo += el(f'<div class="lin"><span>{a}</span><span>{b}</span>{luz}</div>', round(entra + 0.3 + i * passo, 2), "sobe")
    return el(f'<div class="ov cartao" style="left:140px;width:800px;top:{top}px"><div class="cab">{ico}{cab}</div>{corpo}</div>', entra, "sobe", sai=sai, som="swish", v=0.4)


def moedas(entra, sai, n=9):
    xs = [70, 170, 270, 740, 840, 940, 120, 890, 220][:n]
    out = ""
    for i, x in enumerate(xs):
        out += el(f'<div class="ov" style="left:{x}px;top:{1310 + (i % 3) * 36}px;width:70px;height:70px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#FFE9B3,#E0AE58 55%,#A8752A);box-shadow:0 8px 18px #0008;display:grid;place-items:center;font:800 30px Outfit;color:#7E5820">$</div>',
                  round(entra + i * 0.06, 2), "cai", sai=sai, r=(i % 2 * 2 - 1) * 25, **({"som": "tick", "v": 0.35} if i % 3 == 0 else {}))
    return out


# ------------------------------------------------------------------ Q1 · cliente que sumiu
q1_falas = [(0.3, "Quanto custa um <em>cliente que sumiu?</em>"),
            (2.55, "Ele cortava a cada 15 dias, <em>a R$ 50.</em>"),
            (5.7, "São 26 visitas por ano. <em>R$ 1.300.</em>"),
            (9.15, "Cinco clientes assim? <em>R$ 6.500.</em>"),
            (12.2, "No Topete, você vê <em>há quantos dias</em> cada cliente não vem."),
            (17.3, "")]
q1_dots = "".join(el(f'<div class="ov" style="left:{205 + (i % 13) * 52}px;top:{830 + (i // 13) * 52}px;width:38px;height:38px;border-radius:10px;background:#E0AE58"></div>',
                     round(5.9 + i * 0.05, 2), "pop", sai=9.0, **({"som": "tick", "v": 0.3} if i % 4 == 0 else {})) for i in range(26))
q1_avatares = "".join(el(f'<div class="ov" style="left:{250 + i * 125}px;top:690px;width:96px;height:96px;border-radius:50%;background:#2A2722;border:4px solid #E0AE58;display:grid;place-items:center;font:800 44px Outfit;color:#E0AE58">{n}</div>',
                         round(9.35 + i * 0.12, 2), "pop", sai=12.0, som="pop", v=0.3) for i, n in enumerate("THMCB"))
q1_corpo = (
    linha('<span class="num">✂️ R$ 50</span>', 500, 2.8, sai=9.0, som="pop", v=0.5)
    + rot("a cada 15 dias", 640, 3.6, sai=9.0)
    + linha('<span class="op">×</span><span class="num">26<small>visitas/ano</small></span>', 710, 5.7, sai=9.0, som="swish", v=0.4)
    + q1_dots
    + linha('<span class="op">=</span>', 1000, 7.2, sai=9.0)
    + conta("R$ ", 0, 1300, 7.2, dur=1.1, suf="<small>/ano</small>", cls="res", sai=9.0, estilo="left:0;right:0;top:1100px;text-align:center")
    + rot("por cliente", 1290, 8.4, sai=9.0)
    # segunda conta
    + linha('<span class="num" style="font-size:96px">R$ 1.300</span><span class="op">×</span><span class="num" style="font-size:96px">5<small>clientes</small></span>', 520, 9.2, sai=12.0, som="swish", v=0.4)
    + q1_avatares
    + linha('<span class="op">=</span>', 850, 10.0, sai=12.0)
    + conta("R$ ", 0, 6500, 10.0, dur=1.0, cls="res", sai=12.0, estilo="left:0;right:0;top:950px;text-align:center;font-size:200px")
    + selo(1200, 11.1, sai=12.0)
    + moedas(11.2, 12.0)
    # saída com o Topete
    + chip("No Topete", 470, 12.3, ouro=True, som="pop")
    + cartao("Clientes", [("Henrique", "há 9 dias"), ("Samuel", "há 12 dias"), ("Breno", "há 20 dias"), ("Thiago", "há 47 dias")], 560, 12.5, alvo=3, t_alvo=13.9)
    + chip("Você vê quem sumiu. E chama.", 1150, 14.6, som="pop")
)
Q.pagina("Q1-cliente-sumido", gancho="Quanto custa um <em>cliente que sumiu?</em>", falas=q1_falas,
         durs=[1.9, 2.78, 3.07, 2.65, 4.36, 2.0], D=20.5, CTA=16.9, corpo=q1_corpo,
         cta=("Veja quem está sumindo", "antes de perder.", ["Lista de clientes", "Há quantos dias não vem"]))


# ------------------------------------------------------------------ Q2 · horário vago
q2_falas = [(0.3, "Quanto custa um <em>horário vago?</em>"),
            (2.1, "Um horário vazio por dia, <em>a R$ 50.</em>"),
            (5.0, "Vezes 26 dias de trabalho: <em>R$ 1.300 por mês.</em>"),
            (9.6, "Com o Topete, o cancelamento <em>te avisa na hora</em> e o horário volta pro link."),
            (15.6, "")]
q2_barras = "".join(el(f'<div class="ov" style="left:{170 + i * 28.5}px;top:1000px;width:20px;height:{70 + (i * 37 % 50)}px;border-radius:6px;background:#E0AE58;opacity:.9"></div>',
                       round(5.3 + i * 0.045, 2), "pop", sai=9.4, **({"som": "tick", "v": 0.3} if i % 4 == 0 else {})) for i in range(26))
q2_corpo = (
    linha('<span class="chip" style="background:transparent;border:4px dashed #9C927E;font-size:46px;padding:22px 40px;color:#CFC6B4">17:00 · vago</span>', 480, 2.3, sai=9.4, som="pop", v=0.5)
    + rot("1 horário vazio por dia", 610, 2.8, sai=9.4)
    + linha('<span class="op">×</span><span class="num">R$ 50</span>', 700, 3.6, sai=9.4, som="pop", v=0.45)
    + linha('<span class="op">×</span><span class="num">26<small>dias</small></span>', 860, 5.0, sai=9.4, som="swish", v=0.4)
    + q2_barras
    + linha('<span class="op">=</span>', 1110, 6.8, sai=9.4)
    + conta("R$ ", 0, 1300, 6.8, dur=1.3, suf="<small>/mês</small>", cls="res", sai=9.4, estilo="left:0;right:0;top:1200px;text-align:center")
    + selo(1395, 8.4, sai=9.4, left=650)
    # saída com o Topete
    + chip("No Topete", 470, 9.8, ouro=True, som="pop")
    + el(f'<div class="ov" style="left:120px;right:120px;top:560px;background:#1C1A16;border:2px solid #3A342A;border-radius:34px;padding:28px 32px;display:flex;gap:22px;align-items:center;box-shadow:0 40px 80px -24px #000c">'
         f'<img src="{ICONE}" style="width:84px;height:84px;border-radius:20px"><div style="font:600 30px/1.35 Manrope"><b style="font:800 32px Manrope">❌ Cliente cancelou</b><br>Thiago · hoje 17:00<br><span style="color:#4CC38A">O horário ficou livre.</span></div></div>',
         10.1, "pop", som="notif", v=0.6)
    + el('<div class="ov" style="left:0;right:0;top:830px;text-align:center;font:700 70px Outfit;color:#E0AE58">↓</div>', 11.3, "sobe")
    + cartao("barbeariadoze.topete.com.br", [("16:00 · Corte", "ocupado"), ("17:00 · Corte", "livre ✓"), ("18:00 · Corte", "ocupado")], 920, 11.6, passo=0.2, alvo=1, t_alvo=12.5, verde=True)
    + chip("✓ 17:00 · outro cliente já marcou", 1405, 13.4, ouro=True, som="pop")
)
Q.pagina("Q2-horario-vago", gancho="Quanto custa um <em>horário vago?</em>", falas=q2_falas,
         durs=[1.44, 2.55, 4.13, 5.22, 1.87], D=18.8, CTA=15.2, corpo=q2_corpo,
         cta=("Cancelou?", "O horário volta pro link.", ["Aviso na hora", "Encaixe com aprovação"]))


# ------------------------------------------------------------------ Q3 · tempo no WhatsApp
q3_falas = [(0.3, "Quanto tempo você perde <em>no WhatsApp?</em>"),
            (2.65, "40 mensagens por dia, <em>1 minuto cada.</em>"),
            (5.4, "São 40 minutos por dia. <em>17 horas por mês.</em>"),
            (8.75, "Quase <em>2 dias de trabalho</em>, só respondendo: tem horário?"),
            (12.35, "Com o Topete, o cliente vê os horários livres e <em>marca sozinho.</em>"),
            (17.6, "")]
BAL = [("tem horário?", 120, 640), ("e amanhã?", 690, 600), ("consegue 18h?", 80, 1310), ("oi??", 820, 1330), ("sábado tem?", 700, 1220)]
q3_bal = "".join(el(f'<div class="ov" style="left:{x}px;top:{y}px;background:#F4EFE4;color:#16140F;border-radius:26px 26px 26px 6px;padding:14px 22px;font:700 28px Manrope;opacity:.9">{b}</div>',
                    round(2.9 + i * 0.22, 2), "pop", sai=5.2, som="ding", v=0.3, rot=(i % 2 * 2 - 1) * 4) for i, (b, x, y) in enumerate(BAL))
q3_corpo = (
    conta("", 0, 40, 2.7, dur=1.0, suf="<small>mensagens/dia</small>", cls="num", sai=8.6, estilo="left:0;right:0;top:480px;text-align:center")
    + q3_bal
    + linha('<span class="op">×</span><span class="num">1<small>min</small></span>', 720, 4.0, sai=8.6, som="pop", v=0.45)
    + linha('<span class="op">=</span><span class="num">40<small>min/dia</small></span>', 880, 5.5, sai=8.6, som="swish", v=0.4)
    + linha('<span class="op">×</span><span class="num" style="font-size:96px">26<small>dias</small></span>', 1040, 6.4, sai=8.6, som="pop", v=0.4)
    + conta("", 0, 17, 7.0, dur=1.1, suf=" h<small>por mês</small>", cls="res", sai=8.6, estilo="left:0;right:0;top:1160px;text-align:center")
    # segunda batida
    + conta("≈ ", 0, 2, 8.9, dur=0.8, suf=" dias", cls="res", sai=12.1, estilo="left:0;right:0;top:520px;text-align:center;font-size:220px")
    + rot("de trabalho por mês, só respondendo:", 790, 9.4, sai=12.1)
    + el('<div class="ov" style="left:240px;top:880px;background:#F4EFE4;color:#16140F;border-radius:40px 40px 40px 10px;padding:28px 44px;font:800 64px Manrope;box-shadow:0 30px 70px -20px #000c">tem horário? 🙏</div>', 10.2, "pop", sai=12.1, som="buzz", v=0.4, rot=-3)
    + selo(1120, 10.8, sai=12.1)
    # saída com o Topete
    + chip("No Topete", 470, 12.5, ouro=True, som="pop")
    + cartao("Barbearia do Zé", [("Corte", "R$ 50"), ("Sábado · 15:00", "livre"), ("✓ Horário confirmado", "sáb 15:00")], 560, 12.7, passo=0.45, alvo=2, t_alvo=14.1, verde=True)
    + chip("O cliente marca sozinho, pelo link.", 1080, 15.0, som="pop")
)
Q.pagina("Q3-tempo-no-whatsapp", gancho="Quanto tempo você perde <em>no WhatsApp?</em>", falas=q3_falas,
         durs=[2.0, 2.41, 2.97, 3.2, 4.46, 1.72], D=20.5, CTA=17.2, corpo=q3_corpo,
         cta=("O cliente marca sozinho,", "pelo link da sua barbearia.", ["Link com a sua marca", "Horários livres na hora"]))
