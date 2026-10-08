"""Formato "Objeção em 15 segundos" — O1, O2, O3 (02/10/2026), sobre objecao_base.py.

O que cada resposta promete foi conferido no código:
- O1: web/src/app/manifest.ts — manifest POR barbearia (nome e ícone dela), display standalone;
  o link abre no navegador, sem loja de aplicativo.
- O2: functions/src/telegram/convite.ts (link t.me/...?start=), contatos.ts `recebe` (barbeiro
  recebe só a cadeira dele), gatilhos.ts (agenda às 7h; encaixe com botão), webhook.ts (o barbeiro
  aprova encaixe só da cadeira dele).
- O3: ~/JPHub/hub/console/src/lib/topete-oferta.js — PLANOS_TOPETE 97/197/247 (3/6/10 barbeiros),
  BARBEIRO_EXTRA 19, FUNDADORES 30% só na 1ª mensalidade, 20 vagas, e os recursos por plano.
Durações das falas: scratchpad/formatos/oN/fala*.wav (fala 0 = voz do Google, as outras = voz do dono).
"""
import objecao_base as OB

QUEM = "dono de barbearia"

# ---------------------------------------------------------------- O1 · não vai baixar app
o1_palco = '''<div class="ov fone" id="fone" style="opacity:0"><div class="tela">
<div class="tl" id="o1a" style="padding-top:56px">
<div style="background:#E9E1D0;border-radius:18px;padding:12px 16px;font:700 20px Manrope;color:#5A554C;display:flex;gap:8px;align-items:center">🔒 barbeariadoze.topete.com.br</div>
<div style="display:flex;align-items:center;gap:14px;margin-top:30px"><span style="width:70px;height:70px;border-radius:20px;background:#16140F;color:#E0AE58;display:grid;place-items:center;font:800 36px Outfit">Z</span>
<b style="font:800 36px/1.05 Outfit;letter-spacing:-.5px">Barbearia<br>do Zé</b></div>
<div style="margin-top:26px;background:#16140F;color:#F4EFE4;border-radius:22px;padding:24px 0;text-align:center;font:800 28px Manrope">Agendar horário</div>
<div style="margin-top:22px;font:800 20px Manrope;letter-spacing:.12em;color:#A8752A">SERVIÇOS</div>
<div style="display:grid;gap:10px;margin-top:10px;font:700 25px Manrope">
<div style="display:flex;justify-content:space-between;background:#fff;border-radius:18px;padding:18px 20px"><span>Corte</span><span>R$ 50</span></div>
<div style="display:flex;justify-content:space-between;background:#fff;border-radius:18px;padding:18px 20px"><span>Barba</span><span>R$ 35</span></div>
<div style="display:flex;justify-content:space-between;background:#fff;border-radius:18px;padding:18px 20px"><span>Corte + barba</span><span>R$ 80</span></div></div>
<div style="margin-top:22px;font:800 20px Manrope;letter-spacing:.12em;color:#A8752A">LIVRES HOJE</div>
<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:10px;font:800 24px Manrope;text-align:center"><span style="background:#fff;border:2px solid #E6DDCB;border-radius:16px;padding:14px 0">14:00</span><span style="background:#fff;border:2px solid #E6DDCB;border-radius:16px;padding:14px 0">15:00</span><span style="background:#fff;border:2px solid #E6DDCB;border-radius:16px;padding:14px 0">16:30</span><span style="background:#fff;border:2px solid #E6DDCB;border-radius:16px;padding:14px 0">17:00</span><span style="background:#fff;border:2px solid #E6DDCB;border-radius:16px;padding:14px 0">18:00</span><span style="background:#fff;border:2px solid #E6DDCB;border-radius:16px;padding:14px 0">19:30</span></div>
<div id="o1-folha" style="position:absolute;left:0;right:0;bottom:0;background:#fff;border-radius:34px 34px 0 0;padding:26px 26px 70px;box-shadow:0 -20px 50px -20px #0005;transform:translateY(100%)">
<div style="width:60px;height:6px;border-radius:3px;background:#D9D1C1;margin:0 auto 20px"></div>
<div style="font:700 24px Manrope;color:#5A554C;padding:16px 6px;border-bottom:2px solid #F0EAE0">Copiar link</div>
<div id="o1-add" style="font:800 26px Manrope;padding:18px 6px;border-radius:14px;display:flex;justify-content:space-between">Adicionar à Tela de Início <span>⊞</span></div>
<div style="font:700 24px Manrope;color:#5A554C;padding:16px 6px;border-top:2px solid #F0EAE0">Favoritos</div></div></div>
<div class="tl" id="o1b" style="opacity:0;background:linear-gradient(170deg,#2A3B4C,#16202B);padding:110px 40px">
<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:30px 20px">''' + "".join(
    '<div style="display:flex;flex-direction:column;align-items:center;gap:8px"><span style="width:80px;height:80px;border-radius:22px;background:#ffffff26"></span><span style="width:60px;height:10px;border-radius:5px;background:#ffffff33"></span></div>'
    for _ in range(11)) + '''
<div id="o1-icone" style="display:flex;flex-direction:column;align-items:center;gap:8px"><span style="width:80px;height:80px;border-radius:22px;background:#16140F;color:#E0AE58;display:grid;place-items:center;font:800 42px Outfit;box-shadow:0 0 0 4px #E0AE58">Z</span><span style="font:700 16px Manrope;color:#fff;text-align:center;line-height:1.15">Barbearia<br>do Zé</span></div>
</div></div>
<div class="ov toque" id="toque"></div><div class="exemplo">Exemplo</div></div></div>
<div class="ov chip-l" id="o1-c1" style="left:540px;top:425px;opacity:0">✓ Sem loja de aplicativo</div>
<div class="ov chip-l" id="o1-c2" style="left:540px;top:425px;opacity:0">✓ Com a <b>marca da barbearia</b></div>'''
o1_js = """
function ep(t) {
  const kf = E((t - VIRA - 0.3) / 0.5);
  $('fone').style.opacity = kf; $('fone').style.transform = `translateY(${(1 - kf) * 700}px)`;
  const kfo = E((t - 8.9) / 0.4) * (1 - E((t - 10.6) / 0.3));
  $('o1-folha').style.transform = `translateY(${(1 - kfo) * 100}%)`;
  $('o1-add').style.background = t > 9.9 ? '#FBF3E4' : 'transparent';
  const kb = E((t - 10.6) / 0.4); $('o1a').style.opacity = 1 - kb; $('o1b').style.opacity = kb;
  const ki = E((t - 11.2) / 0.35); $('o1-icone').style.opacity = ki; $('o1-icone').style.transform = `scale(${0.4 + 0.6 * ki + 0.25 * pulo(t - 11.2)})`;
  toque(t, [[9.9, 230, 857], [12.3, 385, 515]]);
  const c1 = E((t - 5.0) / 0.3) * (1 - E((t - 8.6) / 0.3)), c2 = E((t - 11.6) / 0.3) * (1 - E((t - CTA) / 0.3));
  $('o1-c1').style.opacity = c1; $('o1-c1').style.transform = `translateX(-50%) scale(${0.7 + 0.3 * c1 + 0.1 * pulo(t - 5.0)})`;
  $('o1-c2').style.opacity = c2; $('o1-c2').style.transform = `translateX(-50%) scale(${0.7 + 0.3 * c2 + 0.1 * pulo(t - 11.6)})`;
}"""
o1_ev = """
EVENTOS.push({ t: VIRA + 0.3, som: 'swish', v: 0.45 }, { t: 5.0, som: 'pop', v: 0.4 }, { t: 8.9, som: 'swish', v: 0.35 },
  { t: 9.9, som: 'tap', v: 0.6 }, { t: 10.6, som: 'whoosh', v: 0.3 }, { t: 11.2, som: 'brilho', v: 0.4 }, { t: 11.6, som: 'pop', v: 0.4 }, { t: 12.3, som: 'tap', v: 0.6 });"""

OB.pagina("O1-nao-baixar-app", rotulo="Dúvida nº 1", objecao="Meu cliente não vai baixar app nenhum.", quem=QUEM,
          carimbo="Nem precisa.", palco=o1_palco,
          falas=[(0.3, "", False),
                 (3.2, "Nem precisa: é <em>um link da sua barbearia</em>, que abre no navegador.", False),
                 (8.8, "Quem quiser, põe na tela de início, <em>com o nome e o ícone da barbearia.</em>", False),
                 (14.0, "", True)],
          durs=[1.98, 5.2, 4.34, 1.59], D=16.8, VIRA=2.7, CTA=13.6,
          cta=("Ficou alguma dúvida?", "Fale com a gente.", ["Chama no direct"]),
          ep_js=o1_js, ep_eventos=o1_ev)


# ---------------------------------------------------------------- O2 · barbeiro não sabe mexer
def msg(id_, html, hora="07:00"):
    return (f'<div id="{id_}" style="max-height:0;overflow:hidden;opacity:0"><div style="background:#182533;border-radius:20px;padding:16px 18px 10px;'
            f'font:500 22px/1.42 Manrope;color:#fff;margin-top:12px">{html}<span style="display:block;text-align:right;font-size:15px;color:#7D8B99">{hora}</span></div></div>')


o2_palco = '''<div class="ov fone" id="fone" style="opacity:0"><div class="tela" style="background:#0E1621">
<div style="position:absolute;left:0;right:0;top:0;padding:56px 24px 18px;background:#17212B;display:flex;gap:14px;align-items:center;color:#fff">
<span style="width:58px;height:58px;border-radius:50%;background:#E0AE58;display:grid;place-items:center"><img src="''' + OB.ICONE + '''" style="width:42px"></span>
<div><b style="font:700 24px Manrope">Topete Avisos</b><span style="display:block;font:500 16px Manrope;color:#7D8B99">bot</span></div></div>
<div style="position:absolute;left:20px;right:20px;top:150px;bottom:150px;display:flex;flex-direction:column;justify-content:flex-end">''' + \
    msg("m1", "✅ <b>Pronto, Davi!</b> Você vai receber os pedidos de encaixe da sua cadeira, cancelamentos, novos agendamentos e a sua agenda do dia às 7h.", "agora") + \
    msg("m2", "☀️ <b>Sua agenda de hoje</b> · sáb 04/10<br><b>09:00</b> Thiago · Corte<br><b>10:30</b> Murilo · Barba<br><b>14:00</b> Caio · Corte + barba", "07:00") + \
    msg("m3", "🔔 <b>Pedido de encaixe</b><br>Vítor · Corte<br>sáb 04/10 às 11:30", "10:12") + '''
<div id="m3b" style="max-height:0;overflow:hidden;opacity:0"><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">
<span id="b-apr" style="background:#2B3A4A;color:#fff;border-radius:14px;padding:16px 0;text-align:center;font:700 22px Manrope">✅ Aprovar</span>
<span style="background:#2B3A4A;color:#fff;border-radius:14px;padding:16px 0;text-align:center;font:700 22px Manrope">✖️ Recusar</span></div></div>
<div id="m4" style="max-height:0;overflow:hidden;opacity:0"><div style="margin-top:10px;font:700 22px Manrope;color:#4CC38A">✅ Aprovado — já está na agenda</div></div>
</div>
<div id="iniciar" style="position:absolute;left:20px;right:20px;bottom:70px;background:#2AABEE;color:#fff;border-radius:18px;padding:22px 0;text-align:center;font:800 26px Manrope;letter-spacing:.06em">INICIAR</div>
<div class="ov toque" id="toque"></div><div class="exemplo">Exemplo</div></div></div>
<div class="ov chip-l" id="o2-c1" style="left:540px;top:425px;opacity:0">Só a cadeira <b>dele</b></div>
<div class="ov chip-l" id="o2-c2" style="left:540px;top:425px;opacity:0"><b>Dois toques.</b> Só isso.</div>'''
o2_js = """
const MSG = [['m1', 6.0], ['m2', 8.5], ['m3', 10.0], ['m3b', 10.15], ['m4', 11.9]];
function ep(t) {
  const kf = E((t - VIRA - 0.3) / 0.5);
  $('fone').style.opacity = kf; $('fone').style.transform = `translateY(${(1 - kf) * 700}px)`;
  MSG.forEach(([id, a]) => { const k = E((t - a) / 0.4); $(id).style.maxHeight = (k * 400) + 'px'; $(id).style.opacity = k; });
  const ki = 1 - E((t - 5.8) / 0.3); $('iniciar').style.opacity = ki;
  $('iniciar').style.transform = `scale(${1 + 0.05 * Math.sin(t * 6) * (t > 4.2 && t < 5.6 ? 1 : 0)})`;
  $('b-apr').style.background = t > 11.6 && t < 11.9 ? '#3E5468' : '#2B3A4A';
  toque(t, [[5.6, 234, 920], [11.6, 120, 790]]);
  const c1 = E((t - 6.6) / 0.3) * (1 - E((t - 8.3) / 0.3)), c2 = E((t - 12.1) / 0.3) * (1 - E((t - CTA) / 0.3));
  $('o2-c1').style.opacity = c1; $('o2-c1').style.transform = `translateX(-50%) scale(${0.7 + 0.3 * c1 + 0.1 * pulo(t - 6.6)})`;
  $('o2-c2').style.opacity = c2; $('o2-c2').style.transform = `translateX(-50%) scale(${0.7 + 0.3 * c2 + 0.1 * pulo(t - 12.1)})`;
}"""
o2_ev = """
EVENTOS.push({ t: VIRA + 0.3, som: 'swish', v: 0.45 }, { t: 5.6, som: 'tap', v: 0.6 }, { t: 6.0, som: 'ding', v: 0.4 }, { t: 6.6, som: 'pop', v: 0.35 },
  { t: 8.5, som: 'notif', v: 0.45 }, { t: 10.0, som: 'notif', v: 0.45 }, { t: 11.6, som: 'tap', v: 0.6 }, { t: 11.9, som: 'ding', v: 0.45 }, { t: 12.1, som: 'pop', v: 0.4 });"""

OB.pagina("O2-barbeiro-nao-sabe", rotulo="Dúvida nº 2", objecao="Meu barbeiro não sabe mexer em sistema.", quem=QUEM,
          carimbo="Nem precisa mexer.", palco=o2_palco,
          falas=[(0.3, "", False),
                 (3.4, "Ele abre um link no Telegram e toca em <em>Iniciar.</em>", False),
                 (8.4, "Recebe a agenda dele às 7h e <em>aprova encaixe com um toque.</em>", False),
                 (13.4, "", True)],
          durs=[2.27, 4.64, 4.15, 1.45], D=16.2, VIRA=3.0, CTA=13.0,
          cta=("Ficou alguma dúvida?", "Fale com a gente.", ["Chama no direct"]),
          ep_js=o2_js, ep_eventos=o2_ev)


# ---------------------------------------------------------------- O3 · quanto custa
def plano(id_, nome, preco, quem, inclui, top, destaque=False):
    borda = "border:4px solid #C9963F;" if destaque else "border:2px solid #E6DDCB;"
    selo = '<span style="position:absolute;right:26px;top:-20px;background:#C9963F;color:#0E0D0B;border-radius:999px;padding:8px 18px;font:800 20px Manrope;letter-spacing:.08em">RECOMENDADO</span>' if destaque else ""
    return (f'<div class="ov" id="{id_}" style="left:100px;right:100px;top:{top}px;background:#fff;color:#16140F;{borda}border-radius:30px;padding:26px 34px;opacity:0">{selo}'
            f'<div style="display:flex;justify-content:space-between;align-items:baseline"><b style="font:800 40px Outfit;letter-spacing:-1px">{nome}</b>'
            f'<span style="font:700 26px Manrope;color:#5A554C"><b id="{id_}-p" style="font:700 60px Outfit;letter-spacing:-2px;color:#16140F">R$ {preco}</b> /mês</span></div>'
            f'<div style="font:700 26px Manrope;color:#A8752A;margin-top:4px">{quem}</div>'
            f'<div style="font:600 23px/1.35 Manrope;color:#5A554C;margin-top:8px">{inclui}</div></div>')


o3_palco = (plano("p1", "Agenda", 97, "até 3 barbeiros", "Link de agendamento, encaixe, caixa do dia e comissão", 470)
            + plano("p2", "Crescimento", 197, "até 6 barbeiros", "Tudo do Agenda + mensalistas, loja e fidelidade", 720, True)
            + plano("p3", "Gestão", 247, "até 10 barbeiros", "Tudo do Crescimento + despesas e DRE", 970)
            + '<div class="ov" id="extra" style="left:0;right:0;top:1208px;text-align:center;font:700 28px Manrope;color:#5A554C;opacity:0">+ R$ 19/mês por barbeiro além do plano · sem taxa de implantação</div>'
            + '<div class="ov" id="fund" style="left:100px;right:100px;top:1280px;background:#16140F;color:#F4EFE4;border-radius:30px;padding:24px 34px;opacity:0">'
              '<b style="font:800 34px/1.15 Outfit;letter-spacing:-.5px">As 20 primeiras barbearias: <span style="color:#E0AE58">30% off no 1º mês.</span></b>'
              '<div style="font:600 24px Manrope;color:#CFC6B4;margin-top:6px">Do 2º mês em diante, mensalidade normal.</div></div>')
o3_js = """
const PL = [['p1', 2.7, 97], ['p2', 7.3, 197], ['p3', 9.6, 247]];
function ep(t) {
  PL.forEach(([id, a, v]) => { const k = E((t - a) / 0.35); $(id).style.opacity = k; $(id).style.transform = `translateY(${(1 - k) * 40}px) scale(${1 + 0.03 * pulo(t - a)})`;
    $(id + '-p').textContent = 'R$ ' + Math.round(v * E((t - a) / 0.8)); });
  const ke = E((t - 11.2) / 0.35); $('extra').style.opacity = ke;
  const kd = E((t - 12.2) / 0.35); $('fund').style.opacity = kd; $('fund').style.transform = `scale(${0.85 + 0.15 * kd + 0.06 * pulo(t - 12.2)})`;
}"""
o3_ev = """
EVENTOS.push({ t: 2.7, som: 'swish', v: 0.4 }, { t: 3.4, som: 'pop', v: 0.35 }, { t: 7.3, som: 'swish', v: 0.4 }, { t: 8.0, som: 'pop', v: 0.35 },
  { t: 9.6, som: 'swish', v: 0.4 }, { t: 10.3, som: 'pop', v: 0.35 }, { t: 11.2, som: 'tap', v: 0.35 }, { t: 12.2, som: 'brilho', v: 0.45 });"""

OB.pagina("O3-quanto-custa", rotulo="Dúvida nº 3", objecao="Tá, mas quanto custa?", quem=QUEM,
          carimbo="Direto ao ponto.", palco=o3_palco,
          falas=[(0.3, "", False),
                 (2.4, "A partir de <em>R$ 97 por mês</em>, com até 3 barbeiros.", False),
                 (6.5, "Até 6: R$ 197. Até 10: R$ 247. <em>Fundadoras: 30% off no 1º mês.</em>", False),
                 (16.0, "", True)],
          durs=[1.24, 3.76, 8.59, 1.5], D=18.6, VIRA=2.0, CTA=15.6,
          cta=("Quer ver funcionando?", "Fale com a gente.", ["Chama no direct"]),
          ep_js=o3_js, ep_eventos=o3_ev)
