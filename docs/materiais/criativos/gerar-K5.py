"""K5 · Acerto da comissão — série "Sem Topete × Com Topete".

Cenário próprio: sala dos fundos depois de fechar, mesa com o dono (mascote) e
dois barbeiros, caderninho no meio. Sem Topete: discussão sobre quem fez
quantos cortes. Com Topete: a comissão de cada um já calculada no DRE.

Promessa conferida no código (02/10/2026):
- web/src/app/painel/(dashboard)/financeiro/dre/page.tsx — "Comissões de
  profissionais" por barbeiro: "<pct>% sobre <base> · <n> atendimentos".
- web/src/lib/analytics.ts — comissoesDeServico: rateio POR RESERVA, com a
  comissão congelada na conclusão do atendimento.
- firestore.rules — staff_pay só o DONO lê: quem vê a comissão de cada um é o
  dono (o vídeo não diz que cada barbeiro vê a dos outros).
Nomes inventados; valores de exemplo.
"""
import cartoon_base as B

_m = B._m


def pessoa(id_, cx, cy, pele, cabelo, barba):
    """Cabeça de barbeiro genérico, com rosto bravo (id_-bravo) e contente (id_-feliz)."""
    b = (f'<path d="M{cx-62} {cy+20} C{cx-56} {cy+78} {cx-26} {cy+100} {cx} {cy+100} C{cx+26} {cy+100} {cx+56} {cy+78} {cx+62} {cy+20} '
         f'C{cx+44} {cy+48} {cx+20} {cy+50} {cx} {cy+46} C{cx-20} {cy+50} {cx-44} {cy+48} {cx-62} {cy+20} Z" fill="{barba}"/>') if barba else ""
    return f'''<g id="{id_}">
<ellipse cx="{cx-70}" cy="{cy+6}" rx="12" ry="18" fill="{pele}"/><ellipse cx="{cx+70}" cy="{cy+6}" rx="12" ry="18" fill="{pele}"/>
<ellipse cx="{cx}" cy="{cy}" rx="70" ry="80" fill="{pele}"/>
<path d="M{cx-72} {cy-12} C{cx-78} {cy-82} {cx-36} {cy-104} {cx+4} {cy-104} C{cx+50} {cy-104} {cx+80} {cy-76} {cx+72} {cy-12} C{cx+62} {cy-46} {cx+36} {cy-56} {cx} {cy-56} C{cx-36} {cy-56} {cx-62} {cy-46} {cx-72} {cy-12} Z" fill="{cabelo}"/>
{b}
<circle cx="{cx-24}" cy="{cy+4}" r="7" fill="#16140F"/><circle cx="{cx+24}" cy="{cy+4}" r="7" fill="#16140F"/>
<g id="{id_}-bravo"><path d="M{cx-44} {cy-22} L{cx-12} {cy-12}" stroke="#2B1E14" stroke-width="8" stroke-linecap="round"/><path d="M{cx+44} {cy-22} L{cx+12} {cy-12}" stroke="#2B1E14" stroke-width="8" stroke-linecap="round"/>
<path d="M{cx-22} {cy+52} C{cx-8} {cy+40} {cx+8} {cy+40} {cx+22} {cy+52}" stroke="#2B1E14" stroke-width="7" fill="none" stroke-linecap="round"/></g>
<g id="{id_}-feliz" opacity="0"><path d="M{cx-42} {cy-20} C{cx-32} {cy-28} {cx-20} {cy-28} {cx-12} {cy-22}" stroke="#2B1E14" stroke-width="7" fill="none" stroke-linecap="round"/>
<path d="M{cx+12} {cy-22} C{cx+20} {cy-28} {cx+32} {cy-28} {cx+42} {cy-20}" stroke="#2B1E14" stroke-width="7" fill="none" stroke-linecap="round"/>
<path d="M{cx-24} {cy+40} C{cx-10} {cy+58} {cx+10} {cy+58} {cx+24} {cy+40}" stroke="#2B1E14" stroke-width="7" fill="none" stroke-linecap="round"/></g>
</g>'''


def tronco(cx, top=930):
    return (f'<path d="M{cx-110} {top+60} C{cx-110} {top+20} {cx-70} {top} {cx} {top} C{cx+70} {top} {cx+110} {top+20} {cx+110} {top+60} L{cx+120} 1100 L{cx-120} 1100 Z" fill="#F4EFE4"/>'
            f'<path d="M{cx-70} {top+70} L{cx+70} {top+70} L{cx+80} 1100 L{cx-80} 1100 Z" fill="#16140F"/>')


s = 0.56
CENARIO = f'''<rect width="1080" height="1920" fill="#0E0D0B"/>
<rect x="0" y="300" width="1080" height="1230" fill="#DCCBAE"/>
<rect x="0" y="1300" width="1080" height="230" fill="#3B2F22"/>
<g><rect x="110" y="410" width="220" height="250" rx="16" fill="#14213A" stroke="#A8752A" stroke-width="12" id="ceu"/>
<g id="lua"><circle cx="190" cy="490" r="30" fill="#F4EFE4"/><circle cx="203" cy="481" r="27" fill="#14213A"/></g>
<path d="M220 410 L220 660 M110 535 L330 535" stroke="#A8752A" stroke-width="8"/></g>
<rect x="760" y="420" width="190" height="130" rx="10" fill="#fff" stroke="#16140F" stroke-width="6"/>
<text x="855" y="470" text-anchor="middle" font-family="Manrope" font-weight="800" font-size="24" fill="#A8752A">COMISSÃO</text>
<text x="855" y="520" text-anchor="middle" font-family="Outfit" font-weight="700" font-size="40" fill="#16140F">outubro</text>
<g transform="translate(440,470)"><circle r="62" fill="#fff" stroke="#16140F" stroke-width="9"/>
<g fill="#16140F">{"".join(f'<rect x="-3" y="-52" width="6" height="11" transform="rotate({a})"/>' for a in range(0, 360, 30))}</g>
<rect id="pont-h" x="-4.5" y="-32" width="9" height="36" rx="4.5" fill="#16140F"/><rect id="pont-m" x="-3" y="-48" width="6" height="52" rx="3" fill="#C9963F"/><circle r="7" fill="#16140F"/></g>
<g id="lamp"><path d="M540 300 L540 590" stroke="#16140F" stroke-width="6"/><path d="M480 590 L600 590 L578 548 L502 548 Z" fill="#16140F"/>
<path id="cone" d="M490 594 L590 594 L800 1090 L280 1090 Z" fill="#FFE9B3" opacity=".22"/></g>
{tronco(240)}{tronco(840)}{tronco(540, 940)}
{pessoa("igor", 240, 840, "#8D5A3B", "#16140F", "#16140F")}
{pessoa("davi", 840, 840, "#E8C9A6", "#6E4D1B", None)}
<g id="dono"><g transform="translate({540 - 256 * s},{830 - 300 * s}) scale({s})">{_m.mascote()}</g></g>
<path id="suor" d="M676 760 C668 776 664 786 672 794 C680 802 692 794 688 782 C686 774 680 768 676 760 Z" fill="#7FC4E8" opacity="0"/>
<rect x="40" y="1080" width="1000" height="40" rx="10" fill="#7A5733"/><rect x="70" y="1120" width="940" height="190" fill="#5A4027"/>
<rect x="100" y="1300" width="40" height="160" fill="#4A341F"/><rect x="940" y="1300" width="40" height="160" fill="#4A341F"/>
<g id="cader" transform="rotate(-3 540 1050)"><rect x="410" y="985" width="260" height="110" rx="8" fill="#FBF7EE" stroke="#C9BEA6" stroke-width="4"/>
<path d="M540 985 L540 1095" stroke="#C9BEA6" stroke-width="4"/>
<text x="475" y="1035" text-anchor="middle" font-family="Outfit" font-weight="700" font-size="34" fill="#16140F">23</text>
<text x="475" y="1078" text-anchor="middle" font-family="Outfit" font-weight="700" font-size="34" fill="#16140F">21?</text>
<text x="605" y="1035" text-anchor="middle" font-family="Outfit" font-weight="700" font-size="34" fill="#16140F">19</text>
<text x="605" y="1078" text-anchor="middle" font-family="Outfit" font-weight="700" font-size="34" fill="#16140F">22</text>
<path id="risco1" d="M448 1024 L502 1030" stroke="#C2410C" stroke-width="6" stroke-linecap="round" stroke-dasharray="60" stroke-dashoffset="60"/>
<path id="risco2" d="M445 1068 L508 1072" stroke="#C2410C" stroke-width="6" stroke-linecap="round" stroke-dasharray="70" stroke-dashoffset="70"/>
<path id="risco3" d="M578 1024 L632 1030" stroke="#C2410C" stroke-width="6" stroke-linecap="round" stroke-dasharray="60" stroke-dashoffset="60"/>
<path id="risco4" d="M578 1068 L632 1072" stroke="#C2410C" stroke-width="6" stroke-linecap="round" stroke-dasharray="60" stroke-dashoffset="60"/></g>
<g id="lapis" transform="translate(690,1060) rotate(-30)"><rect x="0" y="-7" width="110" height="14" rx="4" fill="#E0AE58"/><path d="M110 -7 L130 0 L110 7 Z" fill="#16140F"/></g>
<rect x="150" y="1030" width="54" height="56" rx="8" fill="#F4EFE4" stroke="#16140F" stroke-width="5"/><path d="M204 1046 C226 1046 226 1072 204 1072" stroke="#16140F" stroke-width="5" fill="none"/>'''

BALOES = [("Eu fiz 23!", 60, 600, 3.4, "esq"), ("Foram 21!", 700, 600, 4.0, "dir"),
          ("E o encaixe de sábado?", 40, 500, 4.8, "esq"), ("Tá errado isso aí!", 620, 500, 5.4, "dir")]
overlays = "".join(
    f'<div class="ov cartao" id="bal{i}" style="left:{x}px;top:{y}px;border-radius:{"30px 30px 30px 8px" if lado == "esq" else "30px 30px 8px 30px"}">{t}</div>'
    for i, (t, x, y, _, lado) in enumerate(BALOES)) + '''
<div class="ov" id="raiva1" style="left:330px;top:720px;font:800 60px Outfit;color:#C2410C">💢</div>
<div class="ov" id="raiva2" style="left:690px;top:720px;font:800 60px Outfit;color:#C2410C">💢</div>
<div class="ov cartao" id="ok1" style="left:90px;top:620px">Fechou! 👊</div>
<div class="ov cartao" id="ok2" style="left:700px;top:620px">Tudo certo 👍</div>
<div class="ov cartao" id="ok3" style="left:310px;top:1150px;background:#047857;color:#fff">✓ Acerto em 1 minuto</div>'''

TELA = '''<div class="tl">
<p class="rot">DRE · outubro</p>
<p style="font:800 34px/1.1 Outfit;letter-spacing:-.5px;margin-top:12px">Comissões de profissionais</p>
<p id="k5-total" style="font:700 84px/1 Outfit;letter-spacing:-3px;margin-top:12px">R$ 0</p>
<div id="k5-l1" class="lin" style="display:block"><div style="display:flex;justify-content:space-between"><span>Igor</span><span>R$ 3.096</span></div>
<p style="font:600 19px Manrope;color:#6B6252;margin-top:6px">40% sobre R$ 7.740 · 86 atendimentos</p></div>
<div id="k5-l2" class="lin" style="display:block"><div style="display:flex;justify-content:space-between"><span>Davi</span><span>R$ 2.556</span></div>
<p style="font:600 19px Manrope;color:#6B6252;margin-top:6px">40% sobre R$ 6.390 · 71 atendimentos</p></div>
<p id="k5-nota" style="font:700 21px/1.4 Manrope;color:#5A554C;margin-top:22px">Calculada em cada atendimento concluído.</p>
<div id="k5-dono" style="margin-top:16px;display:inline-block;background:#16140F;color:#F4EFE4;border-radius:999px;padding:12px 22px;font:800 21px Manrope">🔒 Só o dono vê</div>
</div>'''

JS = """
const BAL = %s;
function ep(t) {
  const antes = t < VIRA + 0.3;
  // relógio: quase meia-noite antes; depois anda só um minuto
  const m = antes ? 50 + t * 0.8 : 20 + (t - VIRA) * 0.08;
  $('pont-m').setAttribute('transform', `rotate(${m * 6})`); $('pont-h').setAttribute('transform', `rotate(${(antes ? 330 : 270) + m * 0.5})`);
  $('ceu').setAttribute('fill', antes ? '#14213A' : '#1F3357');
  $('lamp').setAttribute('transform', `rotate(${Math.sin(t * 1.5) * 2} 540 300)`);
  // rostos: bravos antes, contentes depois
  ['igor', 'davi'].forEach((p, i) => {
    const br = antes && t > 3.2; $(p + '-bravo').setAttribute('opacity', br ? 1 : 0); $(p + '-feliz').setAttribute('opacity', br ? 0 : 1);
    const cx = i ? 840 : 240;
    $(p).setAttribute('transform', antes && t > 3.2 ? `rotate(${Math.sin(t * 8 + i * 2) * 3} ${cx} 900)` : `rotate(${t > 15 ? Math.sin(t * 2 + i) * 2 : 0} ${cx} 900)`);
  });
  $('dono').setAttribute('transform', antes ? `rotate(${t > 3.4 ? Math.sin(t * 3) * 5 : 0} 540 940)` : `rotate(${Math.sin(t * 1.6) * 2} 540 940)`);
  $('suor').setAttribute('opacity', t > 4.2 && antes ? 1 : 0);
  // caderninho: números riscados um a um
  [['risco1', 1.4], ['risco2', 2.2], ['risco3', 3.0], ['risco4', 5.0]].forEach(([id, a]) => {
    const L = +$(id).getAttribute('stroke-dasharray'); $(id).setAttribute('stroke-dashoffset', L * (1 - E((t - a) / 0.35))); });
  const some = 1 - E((t - VIRA) / 0.5); $('cader').setAttribute('opacity', some); $('lapis').setAttribute('opacity', some);
  const esc = antes && t > 1.2 && t < 5.6 ? Math.sin(t * 14) * 8 : 0;
  $('lapis').setAttribute('transform', `translate(${690 + esc},${1060 - Math.abs(esc)}) rotate(-30)`);
  // discussão
  BAL.forEach((a, i) => { const b = $('bal' + i), k = E((t - a) / 0.3), s = E((t - VIRA) / 0.3);
    b.style.opacity = t < a ? 0 : k * (1 - s); b.style.transform = `scale(${0.6 + 0.4 * k + 0.12 * pulo(t - a)})`; });
  [['raiva1', 4.2], ['raiva2', 4.6]].forEach(([id, a]) => { const k = E((t - a) / 0.25) * (1 - E((t - VIRA) / 0.3));
    $(id).style.opacity = k; $(id).style.transform = `scale(${0.6 + 0.4 * k + 0.25 * Math.abs(Math.sin(t * 6))})`; });
  // depois: acerto feito
  [['ok1', 15.1], ['ok2', 15.5], ['ok3', 16.0]].forEach(([id, a]) => { const k = E((t - a) / 0.3) * (1 - E((t - CTA + 0.2) / 0.3));
    $(id).style.opacity = k; $(id).style.transform = `scale(${0.6 + 0.4 * k + 0.12 * pulo(t - a)})`; });
  // tela do DRE
  $('k5-total').textContent = 'R$ ' + conta(0, 5652, (t - 8.8) / 1.3);
  [['k5-l1', 9.8], ['k5-l2', 10.6], ['k5-nota', 11.6], ['k5-dono', 12.4]].forEach(([id, a]) => { const k = E((t - a) / 0.35);
    $(id).style.opacity = k; $(id).style.transform = `translateY(${(1 - k) * 24}px)`; });
}""" % [b[3] for b in BALOES]

EV = """
BAL.forEach((a) => EVENTOS.push({ t: a, som: 'pop', v: 0.5 }));
EVENTOS.push({ t: 4.2, som: 'buzz', v: 0.25 }, { t: 4.6, som: 'buzz', v: 0.25 });
[1.4, 2.2, 3.0, 5.0].forEach((a) => EVENTOS.push({ t: a, som: 'tap', v: 0.35 }));
for (let x = 0.4; x < VIRA - 0.3; x += 0.5) EVENTOS.push({ t: x, som: 'tick', v: 0.28 });
[9.8, 10.6, 11.6].forEach((a) => EVENTOS.push({ t: a, som: 'tap', v: 0.45 }));
EVENTOS.push({ t: 12.4, som: 'ding', v: 0.45 }, { t: 15.1, som: 'pop', v: 0.45 }, { t: 15.5, som: 'pop', v: 0.45 }, { t: 16.0, som: 'brilho', v: 0.35 });"""

B.pagina("K5-comissao", cenario=CENARIO, overlays=overlays, tela_fone=TELA,
         falas=[(0.5, "Fim do mês, hora de <em>acertar a comissão…</em>"),
                (3.4, "E começa a discussão: <em>quem fez quantos cortes?</em>"),
                (8.1, "Com o Topete, cada atendimento concluído <em>já calcula a comissão.</em>"),
                (15.0, "Acerto em um minuto. <em>Sem briga.</em>"),
                (18.2, "")],
         durs=[2.41, 2.6, 6.07, 1.82, 2.51], D=22.5, VIRA=6.8, FONE=[7.9, 14.6], CTA=17.6,
         cta=("Comissão certa,", "equipe tranquila.", ["Comissão por barbeiro", "Calculada em cada atendimento"]),
         ep_js=JS, ep_eventos=EV)
