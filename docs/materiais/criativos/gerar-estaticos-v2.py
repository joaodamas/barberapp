"""Estáticos renovados (02/10/2026): 20, 13, 16, 19, 18 e 10 com ilustração no estilo dos cartoons.

Mesma mensagem dos originais de gerar2.py, enxuta, mas com uma cena desenhada
(barbeiro = mascote, clientes inventados, cenários dos cartoons) para o feed não
virar uma parede preta. Fundo alterna claro e escuro. 1080×1350.

Promessas conferidas no código:
- 20 encaixe no balcão: createBookingAtCounter com seOcupado "encaixar" (functions/src/booking.ts, #106).
- 13 agenda às 7h / fechamento às 21h: functions/src/telegram/gatilhos.ts ("0 7 * * *", "0 21 * * *").
- 16 desconto em R$ ou %: TipoDeDesconto = "valor" | "pct" (web/src/lib/domain.ts; acoes-do-atendimento.tsx).
- 18 relatório do mês em PDF: web/src/components/agenda/relatorio-do-mes.tsx (window.print → "Salvar como PDF").
- 19 plano Agenda R$ 97 até 3 barbeiros: ~/JPHub/hub/console/src/lib/topete-oferta.js (PLANOS_TOPETE).
- 10 o cliente vê os horários livres e marca sozinho pelo link: web/src/app/(cliente)/agendar.

Saída: <nome>-v2.html (render para ~/Desktop/Topete/criativos/<nome>.png).
"""
import pathlib
import subprocess

import cartoon_base as B
import cartoon_pecas_k8a10 as P

AQUI = pathlib.Path(__file__).parent
DEST = pathlib.Path.home() / "Desktop/Topete/criativos"
JPG = pathlib.Path("/private/tmp/claude-501/-Users-joaodamas-JPHub-barberapp/efc6a70c-2ea9-4820-892b-8bf4da122556/scratchpad/jpg-pub")
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
MASCOTE = "../../marca/topete-mascote.svg"

CSS = """
*{box-sizing:border-box;margin:0;padding:0}
body{width:1080px;height:1350px;overflow:hidden;position:relative;font-family:Manrope}
.claro{background:#F4EFE4;color:#16140F}.escuro{background:#0E0D0B;color:#F4EFE4}
.topo{position:absolute;left:64px;right:64px;top:52px;display:flex;justify-content:space-between;align-items:center;z-index:3}
.marca{display:flex;align-items:center;gap:12px;font:700 42px Outfit;letter-spacing:-1px}.marca img{width:58px;height:58px}
.tag{font:800 20px Manrope;letter-spacing:.16em;text-transform:uppercase;color:#A8752A}.escuro .tag{color:#E0AE58}
.ilustra{position:absolute;left:0;top:140px;width:1080px;height:700px;overflow:hidden}
.ilustra svg{width:100%;height:100%}
.texto{position:absolute;left:64px;right:64px;top:870px}
h1{font:700 74px/1.02 Outfit;letter-spacing:-2.5px}
h1 em{font-style:normal;color:#A8752A}.escuro h1 em{color:#E0AE58}
.sub{margin-top:20px;font:500 28px/1.4 Manrope;color:#5A554C}.escuro .sub{color:#CFC6B4}
.rodape{position:absolute;left:64px;right:64px;bottom:58px;display:flex;justify-content:space-between;align-items:flex-end;font:700 22px Manrope;color:#9C927E}
.rodape b{color:#A8752A}.escuro .rodape b{color:#E0AE58}
.poste{position:absolute;left:0;right:0;bottom:0;height:18px;background:repeating-linear-gradient(-45deg,#E0AE58 0 18px,#0E0D0B 18px 36px,#F4EFE4 36px 54px,#0E0D0B 54px 72px)}
.card{position:absolute;background:#fff;color:#16140F;border-radius:26px;box-shadow:0 26px 50px -20px #0009;font:700 26px/1.3 Manrope}
.chip{display:inline-block;border-radius:999px;padding:10px 20px;font:800 20px Manrope;letter-spacing:.06em}
.ex{position:absolute;font:800 15px Manrope;letter-spacing:.14em;text-transform:uppercase;color:#9C927E}
"""


def svg(cena, vb):
    return (f'<svg viewBox="{vb}" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg"><defs>{B._m.DEFS}'
            '<pattern id="listra" width="60" height="60" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">'
            '<rect width="60" height="60" fill="#F4EFE4"/><rect width="20" height="60" fill="#C9963F"/><rect x="30" width="10" height="60" fill="#0E0D0B"/></pattern>'
            f'</defs>{cena}</svg>')


def peca(nome, tom, tag, cena, vb, sobre, titulo, sub, rodape_esq, rodape_dir="@usetopete"):
    html = f'''<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><link rel="stylesheet" href="base.css"><style>{CSS}</style></head>
<body class="{tom}"><div class="topo"><div class="marca"><img src="{MASCOTE}" alt="">topete</div><span class="tag">{tag}</span></div>
<div class="ilustra">{svg(cena, vb)}{sobre}</div>
<div class="texto"><h1>{titulo}</h1><p class="sub">{sub}</p></div>
<div class="rodape"><span>{rodape_esq}</span><b>{rodape_dir}</b></div><div class="poste"></div></body></html>'''
    (AQUI / f"{nome}-v2.html").write_text(html)
    png = DEST / f"{nome}.png"
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files",
                    "--force-device-scale-factor=1", "--window-size=1080,1350", "--virtual-time-budget=3000",
                    f"--screenshot={png}", f"file://{AQUI / (nome + '-v2.html')}"], check=True, capture_output=True)
    JPG.mkdir(parents=True, exist_ok=True)
    subprocess.run(["sips", "-s", "format", "jpeg", "-s", "formatOptions", "92", str(png), "--out", str(JPG / f"{nome}.jpg")],
                   check=True, capture_output=True)
    print("ok", nome)


def telegram(linhas, hora="07:00"):
    return (f'<div style="background:#0E1621;color:#fff;border-radius:30px;padding:22px 20px;font:500 22px/1.45 Manrope;box-shadow:0 30px 60px -20px #000c">'
            f'<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px"><span style="width:48px;height:48px;border-radius:50%;background:#E0AE58;display:grid;place-items:center"><img src="{MASCOTE}" style="width:38px"></span>'
            f'<div><b style="font-size:22px">Topete Avisos</b><span style="display:block;font-size:15px;color:#7D8B99">bot</span></div></div>'
            f'<div style="background:#182533;border-radius:18px;padding:16px 18px 10px">{"<br>".join(linhas)}<span style="display:block;text-align:right;font-size:14px;color:#7D8B99;margin-top:4px">{hora}</span></div></div>')


# ── 20 · encaixe no balcão ───────────────────────────────────────────────────
cena20 = (P.parede() + P.poste() + P.relogio(900, 520) + '<rect x="790" y="640" width="200" height="530" rx="10" fill="#6E4D1B"/>'
          '<rect x="808" y="660" width="164" height="220" rx="8" fill="#BFE0EC" opacity=".6"/>'
          + P.cadeira(330) + P.cliente_sentado(330, "c20") + P.barbeiro_em_pe(600, "b20", tesoura=True)
          + P.cliente_em_pe(880, "p20", camisa="#1d4ed8"))
sobre20 = ('<div class="card" style="left:40px;top:22px;width:300px;padding:18px 20px;font-size:22px">'
           '<div style="display:flex;justify-content:space-between;color:#9C927E;text-decoration:line-through"><span>16:00</span><span>Samuel</span></div>'
           '<div style="display:flex;justify-content:space-between;align-items:center;margin:10px 0;background:#1d4ed8;color:#fff;border-radius:14px;padding:10px 14px"><b>16:15</b><span class="chip" style="background:#fff;color:#1d4ed8;padding:6px 12px;font-size:15px">ENCAIXE</span></div>'
           '<div style="display:flex;justify-content:space-between;color:#9C927E"><span>16:30</span><span>Breno</span></div></div>'
           '<div class="card" style="left:690px;top:100px;padding:12px 18px;font-size:22px;border-radius:22px 22px 6px 22px">Dá pra encaixar? 🙏</div>')
peca("20-balcao-encaixe", "claro", "No balcão", cena20, "0 400 1080 1000", sobre20,
     "Chegou sem marcar? <em>Encaixa você mesmo.</em>",
     "Na hora de marcar, escolha qualquer horário, até por cima de outro. Fica confirmado e marcado como encaixe na agenda.",
     "Encaixe pelo balcão")

# ── 13 · agenda às 7h ────────────────────────────────────────────────────────
cena13 = (P.parede("#E6D6BC") + '<g><rect x="140" y="420" width="300" height="320" rx="18" fill="#F2B66B" stroke="#A8752A" stroke-width="14"/>'
          '<circle cx="290" cy="640" r="70" fill="#FFE3A3"/><path d="M290 420 L290 740 M140 580 L440 580" stroke="#A8752A" stroke-width="10"/></g>'
          + P.relogio(900, 520) + P.barbeiro_em_pe(620, "b13", tesoura=False)
          + '<g transform="translate(700,1120)"><rect x="-6" y="-70" width="70" height="80" rx="12" fill="#F4EFE4" stroke="#16140F" stroke-width="6"/>'
          '<path d="M64 -50 C96 -50 96 -6 64 -6" fill="none" stroke="#16140F" stroke-width="6"/>'
          '<path d="M10 -92 C0 -110 22 -118 12 -136 M34 -92 C24 -110 46 -118 36 -136" stroke="#9C927E" stroke-width="5" fill="none" stroke-linecap="round"/></g>')
sobre13 = (f'<div style="position:absolute;left:60px;top:170px;width:440px">' + telegram(
    ["☀️ <b>Agenda de hoje</b> · sex", "", "<b>09:00</b> Murilo · Corte + barba", "<b>10:00</b> Thiago · Corte · <i>mensalista</i>",
     "<b>11:00</b> Samuel · Corte infantil", "<b>15:00</b> Caio · Barba", "…"]) + '</div>')
peca("13-agenda-7h", "escuro", "Todo dia, 7h", cena13, "0 420 1080 1060", sobre13,
     "Antes do café, <em>a agenda do dia.</em>",
     "Às 7h, cada barbeiro recebe a dele no Telegram. O dono recebe a de todos, e o fechamento às 21h.",
     "Avisos no Telegram · grátis")

# ── 16 · desconto pro amigo ──────────────────────────────────────────────────
cena16 = (P.parede() + P.poste() + P.relogio(900, 520) + P.cadeira(380) + P.cliente_sentado(380, "c16", cabelo="#3A2A1C")
          + P.barbeiro_em_pe(700, "b16", tesoura=True))
sobre16 = ('<div class="card" style="left:640px;top:330px;width:400px;padding:20px 24px">'
           '<p style="font:800 18px Manrope;letter-spacing:.12em;color:#A8752A">CONCLUIR ATENDIMENTO</p>'
           '<div style="display:flex;justify-content:space-between;margin-top:12px"><span>Corte + barba</span><span>R$ 80</span></div>'
           '<p style="font:800 18px Manrope;letter-spacing:.12em;color:#A8752A;margin-top:16px">DESCONTO</p>'
           '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px"><span style="text-align:center;border-radius:16px;padding:12px 0;background:#16140F;color:#F4EFE4">R$ 10</span>'
           '<span style="text-align:center;border-radius:16px;padding:12px 0;border:2.5px solid #E6DDCB">ou 10%</span></div>'
           '<div style="display:flex;justify-content:space-between;margin-top:16px;font-size:30px"><b>Total</b><b style="color:#047857">R$ 70</b></div><p style="margin-top:10px;font:800 14px Manrope;letter-spacing:.14em;color:#9C927E">VALORES DE EXEMPLO</p></div>'
           '<div class="card" style="left:90px;top:110px;padding:12px 18px;font-size:22px;border-radius:22px 22px 6px 22px">Faz um precinho, parceiro? 😄</div>'
           '')
peca("16-desconto", "claro", "Fechamento", cena16, "0 420 1080 980", sobre16,
     "Desconto pro amigo? <em>Pode. Registrado.</em>",
     "Em reais ou em porcentagem, na hora de concluir. A comissão sai sobre o que entrou, e o caixa não mente.",
     "Desconto no fechamento")

# ── 19 · barbeiro sozinho ────────────────────────────────────────────────────
cena19 = (P.parede("#E6D6BC") + P.poste(940) + P.cadeira(330) + P.cliente_sentado(330, "c19", cabelo="#5A3A22", pele="#E0B48A")
          + P.barbeiro_em_pe(600, "b19", tesoura=True)
          + '<g transform="translate(850,820)"><rect x="-70" y="0" width="140" height="190" rx="14" fill="#16140F"/>'
          '<rect x="-58" y="14" width="116" height="160" rx="8" fill="#F4EFE4"/>'
          '<rect x="-44" y="34" width="88" height="22" rx="6" fill="#E0AE58"/><rect x="-44" y="70" width="88" height="16" rx="5" fill="#D9D1C1"/>'
          '<rect x="-44" y="96" width="88" height="16" rx="5" fill="#D9D1C1"/><rect x="-44" y="122" width="88" height="30" rx="8" fill="#16140F"/></g>')
sobre19 = ('<div class="card" style="left:760px;top:40px;width:290px;padding:18px 22px;font-size:22px">'
           '<b style="font-size:24px">🔔 Nova reserva</b><br>Vítor · Corte<br><span style="color:#A8752A">sáb 15:00</span></div>'
           '<div class="card" style="left:40px;top:40px;padding:14px 20px;font-size:22px;background:#16140F;color:#F4EFE4">📍 Recepção aberta 24h:<br><b style="color:#E0AE58">o link da sua barbearia</b></div>')
peca("19-barbeiro-sozinho", "escuro", "Barbeiro solo", cena19, "0 420 1080 980", sobre19,
     "Trabalha sozinho? <em>O Topete é a sua recepção.</em>",
     "Mostra os horários, recebe o agendamento e te avisa. Você só corta.",
     "Plano Agenda · R$ 97/mês, até 3 barbeiros")

# ── 18 · relatório do mês em PDF ─────────────────────────────────────────────
cena18 = (B.fundo("dia") + B.barbeiro_balcao() + B.balcao()
          + '<g transform="translate(700,960) rotate(-8)"><rect x="0" y="0" width="190" height="240" rx="8" fill="#fff" stroke="#D9D1C1" stroke-width="4"/>'
          '<rect x="18" y="20" width="110" height="16" rx="5" fill="#16140F"/>' + "".join(
              f'<rect x="18" y="{56 + i * 30}" width="154" height="12" rx="4" fill="#E6DDCB"/>' for i in range(6)) + '</g>')
sobre18 = ('<div class="card" style="left:690px;top:40px;width:360px;padding:22px 26px;font-size:24px">'
           '<p style="font:800 18px Manrope;letter-spacing:.12em;color:#A8752A">AGENDA · SETEMBRO</p>'
           + "".join(f'<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:2px solid #F0EADC"><span>{a}</span><b>{b}</b></div>'
                     for a, b in [("Concluídos", "312"), ("Faltas", "9"), ("Cancelados", "14"), ("Cobertos pelo plano", "48")])
           + '<div style="margin-top:14px;text-align:center;border-radius:16px;padding:12px 0;background:#16140F;color:#F4EFE4">🖨️ Salvar em PDF</div><p style="margin-top:10px;font:800 14px Manrope;letter-spacing:.14em;color:#9C927E">VALORES DE EXEMPLO</p></div>'
           '')
peca("18-relatorio-pdf", "claro", "Relatório", cena18, "0 420 1080 1100", sobre18,
     "O mês inteiro da agenda <em>num PDF.</em>",
     "Um toque e sai o relatório do mês, dia a dia, pronto pra imprimir, guardar ou mandar pro contador.",
     "Relatório da agenda")

# ── 10 · sábado, 9h ──────────────────────────────────────────────────────────
banco = '<rect x="620" y="1150" width="440" height="40" rx="12" fill="#6E4D1B"/><rect x="640" y="1190" width="24" height="120" fill="#4A341F"/><rect x="1010" y="1190" width="24" height="120" fill="#4A341F"/>'
cena10 = (P.parede() + P.poste() + P.relogio(560, 470, 64) + P.cadeira(250) + P.cliente_sentado(250, "c10")
          + P.barbeiro_em_pe(520, "b10", tesoura=True) + banco
          + f'<g transform="translate(140,10) scale(.85)">{P.cliente_em_pe(760, "e1", camisa="#3F5E4A")}</g>'
          + f'<g transform="translate(150,40) scale(.85)">{P.cliente_em_pe(900, "e2", camisa="#8A3B2E", cabelo="#5A3A22", pele="#E0B48A")}</g>'
          + f'<g transform="translate(160,20) scale(.85)">{P.cliente_em_pe(1040, "e3", camisa="#2E4A7A")}</g>')
sobre10 = ('<div style="position:absolute;left:60px;top:40px;font:700 190px/0.85 Outfit;letter-spacing:-8px;background:linear-gradient(135deg,#FFE3A3,#E0AE58 45%,#A8752A);-webkit-background-clip:text;color:transparent">9h</div>'
           '<div class="card" style="left:790px;top:330px;width:260px;padding:14px 16px;font-size:19px;background:#0E1621;color:#fff">'
           '<b>💬 WhatsApp</b> <span class="chip" style="background:#E5484D;color:#fff;padding:4px 12px;font-size:16px;margin-left:6px">14</span>'
           '<div style="margin-top:10px;display:grid;gap:6px"><span style="background:#182533;border-radius:10px;padding:6px 10px">Tem horário hoje?</span>'
           '<span style="background:#182533;border-radius:10px;padding:6px 10px">E às 11h?</span><span style="background:#182533;border-radius:10px;padding:6px 10px">Oi?? 👀</span></div></div>'
           '<span class="ex" style="left:150px;top:250px;color:#6B6252;background:#EADFCB;padding:4px 10px;border-radius:8px">Cena de exemplo</span>')
peca("10-sabado-9h", "escuro", "Sábado", cena10, "0 340 1080 1060", sobre10,
     "3 clientes na espera. <em>14 no WhatsApp.</em>",
     "No sábado, quem responde mensagem não corta. Com o Topete, o cliente vê os horários livres e marca sozinho pelo link.",
     "Agenda online")
