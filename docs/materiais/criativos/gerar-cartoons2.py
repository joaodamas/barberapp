"""Episódios da série "Sem Topete × Com Topete" sobre a base de cartoon_base.py.

K3 — Fim do dia: 22h, papelzinho e calculadora; com o Topete o caixa já está pronto.
K6 — Dá pra pagar o aluguel?: boletos voando; com o Topete, a projeção do mês.
Durações das falas medidas nos arquivos da voz clonada (scratchpad/cartoon/<ep>/fala*.wav).
"""
import cartoon_base as B


def papel(i, x, y, r):
    return (f'<g id="pp{i}" opacity="0"><g transform="translate({x},{y}) rotate({r})"><rect x="-55" y="-38" width="110" height="76" rx="6" fill="#fff" stroke="#D9D1C1" stroke-width="3"/>'
            f'<path d="M-38 -16 H30 M-38 0 H38 M-38 16 H14" stroke="#9C927E" stroke-width="5" stroke-linecap="round"/></g></g>')


# ---------------------------------------------------------------- K3 · fim do dia
K3_PAPEIS = [(230, 1060, -12), (330, 1048, 8), (270, 1030, 18), (410, 1062, -6), (790, 1040, 10), (860, 1060, -14)]
k3_atras = '''<g id="porta"><rect x="770" y="640" width="230" height="530" rx="10" fill="#6E4D1B"/><rect x="790" y="660" width="190" height="230" rx="8" fill="#BFE0EC" opacity=".55"/>
<circle cx="800" cy="930" r="9" fill="#C9963F"/>
<g id="placa" style="transform-origin:885px 965px"><rect x="815" y="935" width="140" height="60" rx="10" fill="#16140F"/>
<text id="placa-t" x="885" y="975" text-anchor="middle" font-family="Manrope" font-weight="800" font-size="26" fill="#4CC38A">ABERTO</text></g></g>
<g id="lamp"><path d="M540 300 L540 400" stroke="#16140F" stroke-width="6"/><path d="M490 400 L590 400 L570 360 L510 360 Z" fill="#16140F"/>
<ellipse id="luz" cx="540" cy="410" rx="60" ry="14" fill="#FFE9B3"/></g>'''
k3_frente = "".join(papel(i, *p) for i, p in enumerate(K3_PAPEIS)) + '''
<g id="moedas" opacity="0"><circle cx="600" cy="1074" r="16" fill="#E0AE58" stroke="#A8752A" stroke-width="4"/><circle cx="628" cy="1078" r="16" fill="#E0AE58" stroke="#A8752A" stroke-width="4"/><circle cx="612" cy="1058" r="16" fill="#E0AE58" stroke="#A8752A" stroke-width="4"/></g>
<g id="calc"><rect x="660" y="975" width="130" height="110" rx="14" fill="#2A2722"/><rect x="672" y="986" width="106" height="34" rx="6" fill="#C9D7B0"/>
<text id="calc-t" x="772" y="1012" text-anchor="end" font-family="Manrope" font-weight="800" font-size="22" fill="#16140F">0</text>
<g fill="#5A554C">''' + "".join(f'<rect x="{672 + c * 27}" y="{1028 + r * 18}" width="22" height="13" rx="3"/>' for c in range(4) for r in range(3)) + '</g></g>'
k3_overlays = '''<div class="ov cartao" id="pensa3" style="left:90px;top:640px;border-radius:30px 30px 30px 8px">Faltou R$ 70? 🤔</div>
<div class="ov" id="q1" style="left:700px;top:690px;font:800 90px Outfit;color:#16140F">?</div>
<div class="ov" id="q2" style="left:330px;top:620px;font:800 70px Outfit;color:#16140F">?</div>
<div class="ov" id="zzz" style="left:640px;top:600px;font:800 46px Outfit;color:#5A554C">z<span style="font-size:34px">z</span><span style="font-size:24px">z</span></div>'''
k3_tela = '''<div class="tl">
<p class="rot">Caixa de hoje · sábado</p>
<p id="k3-total" style="font:700 96px/1 Outfit;letter-spacing:-3px;margin-top:14px;color:#047857">R$ 0</p>
<div id="k3-l1" class="lin"><span>Pix</span><span>R$ 640</span></div>
<div id="k3-l2" class="lin"><span>Cartão</span><span>R$ 450</span></div>
<div id="k3-l3" class="lin"><span>Dinheiro</span><span>R$ 230</span></div>
<p id="k3-at" class="rot" style="margin-top:26px">18 atendimentos concluídos</p>
<div id="k3-c" style="margin-top:10px;font:700 24px/1.6 Manrope;color:#5A554C">Comissão · Otávio <b>R$ 210</b><br>Comissão · Igor <b>R$ 180</b><br>Comissão · Davi <b>R$ 150</b></div>
<div id="k3-ok" style="margin-top:22px;display:inline-block;background:#047857;color:#fff;border-radius:999px;padding:14px 26px;font:800 26px Manrope">✓ Dia fechado</div>
</div>'''
k3_js = """
const PP = [1.0, 1.5, 2.0, 2.6, 3.2, 3.9];
function ep(t) {
  const antes = t < VIRA + 0.3;
  // relógio: 22h antes, 19h depois
  const m = antes ? 2 + t * 1.2 : 3 + (t - VIRA) * 0.8;
  $('pont-m').setAttribute('transform', `rotate(${m * 6})`); $('pont-h').setAttribute('transform', `rotate(${(antes ? 300 : 210) + m * 0.5})`);
  $('ceu').setAttribute('fill', antes ? '#14213A' : '#F2B66B'); $('lua').style.opacity = antes ? 1 : 0;
  $('lamp').setAttribute('transform', `rotate(${Math.sin(t * 1.8) * 3} 540 300)`); $('luz').setAttribute('opacity', antes ? 0.9 : 0.25);
  // papelada chegando e saindo voando no corte
  PP.forEach((a, i) => { const k = E((t - a) / 0.3), s = E((t - VIRA) / 0.5); const g = $('pp' + i);
    g.setAttribute('opacity', t < a ? 0 : k * (1 - s)); g.setAttribute('transform', `translate(0,${(1 - k) * -260 - s * 400})`); });
  $('moedas').setAttribute('opacity', t > 1.8 && antes ? 1 : 0);
  $('calc').setAttribute('opacity', antes ? 1 : 1 - E((t - VIRA) / 0.4));
  const ct = $('calc-t'); ct.textContent = t < 2.2 ? '0' : t < 3.8 ? '1.287,50' : t < 5.6 ? '1.217,50' : 'ERRO'; ct.setAttribute('fill', t >= 5.6 ? '#C2410C' : '#16140F');
  // barbeiro digitando, cansado; depois acena
  const dig = t > 1.0 && t < 6.6 ? Math.abs(Math.sin(t * 12)) * 10 : 0;
  $('bD').setAttribute('transform', `translate(0,${-dig})`);
  $('cab').setAttribute('transform', antes ? `rotate(${t > 4 ? 6 + Math.sin(t * 2) * 3 : 0} 540 940)` : `rotate(${Math.sin(t * 1.6) * 2} 540 940)`);
  $('suor').setAttribute('opacity', t > 4.2 && antes ? 1 : 0);
  const kp = E((t - 4.6) / 0.3) * (1 - E((t - VIRA) / 0.3)); $('pensa3').style.opacity = kp; $('pensa3').style.transform = `scale(${0.7 + 0.3 * kp + 0.1 * pulo(t - 4.6)})`;
  [['q1', 5.6], ['q2', 6.0]].forEach(([id, a]) => { const k = E((t - a) / 0.3) * (1 - E((t - VIRA) / 0.3)); $(id).style.opacity = k; $(id).style.transform = `rotate(${Math.sin(t * 6) * 10}deg) scale(${0.6 + 0.4 * k})`; });
  const kz = E((t - 2.6) / 0.4) * (1 - E((t - 4.4) / 0.3)); $('zzz').style.opacity = kz; $('zzz').style.transform = `translateY(${-(t - 2.6) * 30}px)`;
  // placa da porta vira para FECHADO
  const vira = cl((t - 15.3) / 0.4); $('placa').style.transform = `scaleY(${Math.abs(Math.cos(vira * Math.PI))})`;
  $('placa-t').textContent = vira > 0.5 ? 'FECHADO' : 'ABERTO'; $('placa-t').setAttribute('fill', vira > 0.5 ? '#E0AE58' : '#4CC38A');
  // tela do caixa
  $('k3-total').textContent = 'R$ ' + conta(0, 1320, (t - 9.0) / 1.4);
  [['k3-l1', 9.5], ['k3-l2', 9.9], ['k3-l3', 10.3], ['k3-at', 11.0], ['k3-c', 11.5], ['k3-ok', 12.6]].forEach(([id, a]) => { const k = E((t - a) / 0.35); $(id).style.opacity = k; $(id).style.transform = `translateY(${(1 - k) * 24}px)`; });
  $('k3-ok').style.transform += ` scale(${1 + 0.15 * pulo(t - 12.6)})`;
}"""
k3_ev = """
PP.forEach((a) => EVENTOS.push({ t: a, som: 'swish', v: 0.35 }));
[2.2, 2.35, 2.5, 3.8, 3.95, 5.6].forEach((a) => EVENTOS.push({ t: a, som: 'tap', v: 0.45 }));
EVENTOS.push({ t: 5.6, som: 'buzz', v: 0.35 }, { t: 4.6, som: 'pop', v: 0.4 }, { t: 5.6, som: 'pop', v: 0.35 }, { t: 6.0, som: 'pop', v: 0.35 });
for (let x = 0.3; x < 7.2; x += 0.5) EVENTOS.push({ t: x, som: 'tick', v: 0.3 });
[9.5, 9.9, 10.3, 11.0, 11.5].forEach((a) => EVENTOS.push({ t: a, som: 'tap', v: 0.4 }));
EVENTOS.push({ t: 12.6, som: 'ding', v: 0.5 }, { t: 15.3, som: 'swish', v: 0.45 }, { t: 15.5, som: 'pop', v: 0.4 });"""

B.pagina("K3-fim-do-dia", janela="noite", atras=k3_atras, frente=k3_frente, overlays=k3_overlays, tela_fone=k3_tela,
         falas=[(0.5, "<em>Dez da noite</em>, e a conta do dia ainda não fecha?"),
                (3.6, "Papelzinho, calculadora… e o dinheiro <em>nunca bate.</em>"),
                (8.6, "Com o Topete, cada atendimento concluído <em>já entra no caixa.</em>"),
                (15.0, "Fechou a porta, <em>fechou o caixa.</em>"),
                (18.2, "")],
         durs=[2.49, 3.09, 5.5, 1.95, 2.34], D=22.0, VIRA=7.4, FONE=[8.4, 14.6], CTA=17.6,
         cta=("O caixa do dia", "na palma da mão.", ["Pix, cartão e dinheiro separados", "Comissão calculada"]),
         ep_js=k3_js, ep_eventos=k3_ev)


# ---------------------------------------------------------------- K6 · dá pra pagar o aluguel?
k6_atras = '''<g id="calend"><rect x="600" y="380" width="200" height="230" rx="14" fill="#fff" stroke="#16140F" stroke-width="6"/>
<rect x="600" y="380" width="200" height="60" rx="14" fill="#C2410C" id="cal-topo"/><rect x="600" y="420" width="200" height="20" fill="#C2410C" id="cal-topo2"/>
<text x="700" y="422" text-anchor="middle" font-family="Manrope" font-weight="800" font-size="26" fill="#fff">OUTUBRO</text>
<text x="700" y="560" text-anchor="middle" font-family="Outfit" font-weight="700" font-size="110" fill="#16140F">28</text>
<path id="cal-circ" d="M700 470 C760 470 780 520 778 540 C776 590 740 600 700 600 C650 600 622 580 622 538 C622 496 650 470 704 474" fill="none" stroke="#C2410C" stroke-width="9" stroke-linecap="round" stroke-dasharray="520" stroke-dashoffset="520"/>
<g id="cal-ok" opacity="0"><circle cx="782" cy="400" r="34" fill="#047857"/><path d="M766 400 L778 412 L800 388" stroke="#fff" stroke-width="8" fill="none" stroke-linecap="round"/></g></g>'''
BOLETOS = [("Aluguel", "R$ 1.800", 60, 640, 1.1), ("Luz", "R$ 320", 740, 700, 1.6), ("Produtos", "R$ 540", 40, 820, 2.1),
           ("Água", "R$ 90", 770, 830, 2.6), ("Internet", "R$ 120", 90, 960, 3.0)]
k6_overlays = "".join(f'<div class="ov cartao" id="bol{i}" style="left:{x}px;top:{y}px;border-left:12px solid #C2410C">🧾 {n} · <b>{v}</b></div>'
                      for i, (n, v, x, y, _) in enumerate(BOLETOS)) + \
    '<div class="ov" id="interroga" style="left:470px;top:440px;width:140px;text-align:center;font:800 180px/1 Outfit;color:#C2410C">?</div>' + \
    '<div class="ov cartao" id="k6-alivio" style="left:300px;top:1000px;background:#047857;color:#fff">✓ Mês sob controle</div>'
k6_tela = '''<div class="tl">
<p class="rot">Projeção · outubro</p>
<p style="font:700 26px Manrope;color:#5A554C;margin-top:18px">Previsão de fechamento</p>
<p id="k6-total" style="font:700 92px/1 Outfit;letter-spacing:-3px;margin-top:6px;color:#047857">R$ 0</p>
<div id="k6-b1" style="margin-top:26px"><div style="display:flex;justify-content:space-between;font:700 24px Manrope"><span>Já entrou</span><span>R$ 9.420</span></div>
<div style="height:22px;background:#E6DDCB;border-radius:11px;margin-top:8px"><div id="k6-w1" style="height:100%;width:0;background:#047857;border-radius:11px"></div></div></div>
<div id="k6-b2" style="margin-top:20px"><div style="display:flex;justify-content:space-between;font:700 24px Manrope"><span>Agendado até o dia 31</span><span>R$ 3.150</span></div>
<div style="height:22px;background:#E6DDCB;border-radius:11px;margin-top:8px"><div id="k6-w2" style="height:100%;width:0;background:#C9963F;border-radius:11px"></div></div></div>
<div id="k6-b3" style="margin-top:20px"><div style="display:flex;justify-content:space-between;font:700 24px Manrope"><span>Despesas do mês</span><span>− R$ 4.300</span></div>
<div style="height:22px;background:#E6DDCB;border-radius:11px;margin-top:8px"><div id="k6-w3" style="height:100%;width:0;background:#5A554C;border-radius:11px"></div></div></div>
<div id="k6-ok" style="margin-top:34px;display:inline-block;background:#047857;color:#fff;border-radius:999px;padding:14px 26px;font:800 26px Manrope">✓ Aluguel coberto</div>
</div>'''
k6_js = """
const BOL = %s;
function ep(t) {
  const antes = t < VIRA + 0.3;
  $('pont-m').setAttribute('transform', `rotate(${(10 + t) * 6})`); $('pont-h').setAttribute('transform', `rotate(${120 + t * 0.5})`);
  $('cal-circ').setAttribute('stroke-dashoffset', 520 * (1 - E((t - 0.6) / 0.8)));
  const ok = E((t - 14.8) / 0.35);
  $('cal-circ').setAttribute('stroke', t > 14.8 ? '#047857' : '#C2410C'); $('cal-ok').setAttribute('opacity', ok);
  $('cal-ok').setAttribute('transform', `translate(782,400) scale(${0.4 + 0.6 * ok + 0.2 * pulo(t - 14.8)}) translate(-782,-400)`);
  BOL.forEach((a, i) => { const b = $('bol' + i), k = E((t - a) / 0.3), s = E((t - VIRA) / 0.5);
    b.style.opacity = t < a ? 0 : k * (1 - s); b.style.transform = `translateY(${s * -500}px) rotate(${(i %% 2 ? 4 : -4) + Math.sin(t * 5 + i) * 3}deg) scale(${0.6 + 0.4 * k + 0.12 * pulo(t - a)})`; });
  const kq = E((t - 3.6) / 0.25) * (1 - E((t - VIRA) / 0.3));
  $('interroga').style.opacity = kq; $('interroga').style.transform = `rotate(${Math.sin(t * 7) * 12}deg) scale(${0.5 + 0.5 * kq + 0.2 * pulo(t - 3.6)})`;
  $('cab').setAttribute('transform', antes ? `rotate(${t > 1.2 ? Math.sin(t * 5) * 5 : 0} 540 940)` : `rotate(${t > 14.6 ? -4 * E((t - 14.6) / 0.4) : 0} 540 940)`);
  $('suor').setAttribute('opacity', t > 2.4 && antes ? 1 : 0);
  // mãos na cabeça antes; depois, joinha
  const maos = antes && t > 3.4 ? E((t - 3.4) / 0.3) : 0;
  
  const ka = E((t - 15.0) / 0.35) * (1 - E((t - CTA + 0.2) / 0.3)); $('k6-alivio').style.opacity = ka; $('k6-alivio').style.transform = `scale(${0.7 + 0.3 * ka + 0.1 * pulo(t - 15.0)})`;
  // tela da projeção
  $('k6-total').textContent = 'R$ ' + conta(0, 8270, (t - 8.6) / 1.4);
  [['k6-b1', 9.4, 'k6-w1', 100], ['k6-b2', 10.2, 'k6-w2', 33], ['k6-b3', 11.0, 'k6-w3', 46]].forEach(([id, a, w, pct]) => {
    const k = E((t - a) / 0.35); $(id).style.opacity = k; $(w).style.width = (pct * E((t - a - 0.15) / 0.8)) + '%%'; });
  const ko = E((t - 12.2) / 0.35); $('k6-ok').style.opacity = ko; $('k6-ok').style.transform = `scale(${0.7 + 0.3 * ko + 0.15 * pulo(t - 12.2)})`;
}""" % [b[4] for b in BOLETOS]
k6_ev = """
BOL.forEach((a) => { EVENTOS.push({ t: a, som: 'pop', v: 0.45 }); EVENTOS.push({ t: a, som: 'swish', v: 0.25 }); });
EVENTOS.push({ t: 0.6, som: 'swish', v: 0.3 }, { t: 3.6, som: 'boing', v: 0.35 });
[9.4, 10.2, 11.0].forEach((a) => EVENTOS.push({ t: a, som: 'tap', v: 0.45 }));
EVENTOS.push({ t: 12.2, som: 'ding', v: 0.5 }, { t: 14.8, som: 'pop', v: 0.45 }, { t: 15.0, som: 'brilho', v: 0.35 });"""

B.pagina("K6-aluguel", janela="dia", atras=k6_atras, frente="", overlays=k6_overlays, tela_fone=k6_tela,
         falas=[(0.5, "Fim do mês chegando… e a <em>dúvida de sempre:</em>"),
                (3.6, "Será que dá pra pagar <em>o aluguel?</em>"),
                (7.9, "Com o Topete, você vê <em>a projeção do mês.</em>"),
                (14.6, "E sabe quanto vai fechar, <em>antes do mês acabar.</em>"),
                (18.2, "")],
         durs=[2.6, 1.76, 5.69, 2.37, 2.79], D=22.5, VIRA=6.6, FONE=[7.7, 14.3], CTA=17.6,
         cta=("O financeiro da barbearia,", "sem susto.", ["Projeção do mês", "Despesas e DRE"]),
         ep_js=k6_js, ep_eventos=k6_ev)
