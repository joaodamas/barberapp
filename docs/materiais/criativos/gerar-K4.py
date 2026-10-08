"""K4 · O mensalista esquecido (série "Sem Topete × Com Topete").

Cenário próprio: salão com duas cadeiras, sexta 17h.
Promessa conferida no código: o horário fixo do mensalista é reservado sozinho
toda semana pela rotina do fixo (functions/src/horario-fixo.ts,
garantirReservasDoFixo) e aparece na agenda com a etiqueta Mensalista
(web/src/components/agenda/etiqueta-mensalista.tsx); remarcar mexe só naquela
semana — "As outras semanas não mudam" (web/src/components/mensalista-acoes.tsx,
rescheduleBooking + semanaJaResolvida).
"""
import cartoon_base as B
import cartoon_pessoas_k2k4 as P

caderno = '''<g id="caderno"><rect x="706" y="1070" width="120" height="150" rx="8" fill="#F4EFE4" stroke="#6E4D1B" stroke-width="8"/>
<path d="M722 1104 C744 1096 772 1110 808 1100 M722 1134 C752 1144 780 1126 810 1136 M722 1164 C740 1158 760 1170 790 1162" stroke="#16140F" stroke-width="5" fill="none"/>
<path d="M720 1190 L812 1180" stroke="#C2410C" stroke-width="7" stroke-linecap="round"/></g>'''

cenario = f'''<rect width="1080" height="1920" fill="#0E0D0B"/>
<rect x="0" y="300" width="1080" height="890" fill="#EADFCB"/>
<rect x="0" y="1180" width="1080" height="350" fill="#3B2F22"/><rect x="0" y="1170" width="1080" height="14" fill="#A8752A"/>
<rect x="80" y="440" width="320" height="470" rx="160" fill="#C9D7D6" stroke="#A8752A" stroke-width="14"/>
<rect x="680" y="440" width="320" height="470" rx="160" fill="#C9D7D6" stroke="#A8752A" stroke-width="14"/>
<path d="M130 560 C150 510 190 488 236 484" stroke="#fff" stroke-width="12" fill="none" opacity=".5" stroke-linecap="round"/>
<path d="M730 560 C750 510 790 488 836 484" stroke="#fff" stroke-width="12" fill="none" opacity=".5" stroke-linecap="round"/>
{P.relogio(540, 440, r=70)}
<rect x="462" y="540" width="156" height="58" rx="12" fill="#16140F"/>
<text x="540" y="580" text-anchor="middle" font-family="Manrope" font-weight="800" font-size="28" fill="#E0AE58" letter-spacing="3">SEXTA</text>
<g transform="translate(830,1460) scale(0.78) translate(-380,-1450)">{P.cadeira_vazia()}</g>
<g id="thiS-g" opacity="0">{P.cliente_cadeira("thiS", 830, 1460, k=0.78, pele="#8D5A3B", cabelo="#16140F")}</g>
{P.cliente_cadeira("sam", 250, 1460, k=0.78, pele="#E8C9A6", cabelo="#6E4D1B")}
{P.barbeiro_pe("barb", 545, 1490, k=0.72, mao=caderno)}
{P.pessoa("thi", 985, 1500, k=0.72, pele="#8D5A3B", cabelo="#16140F", camisa="#047857")}'''

overlays = '''<div class="ov cartao" id="balT" style="left:560px;top:760px;border-radius:30px 30px 8px 30px">Sexta 17h é o meu<br>horário fixo! 😠</div>
<div class="ov cartao" id="balS" style="left:40px;top:740px;border-radius:30px 30px 30px 8px">Mas eu marquei<br>às 17h! 😤</div>
<div class="ov" id="interr" style="left:480px;top:780px;width:120px;text-align:center;font:800 130px/1 Outfit;color:#C2410C">?</div>
<div class="ov cartao" id="chipM" style="left:640px;top:820px;background:#FBF3E4;color:#8F6B22;border:3px solid #C9963F">Mensalista · sex 17h</div>'''

tag = lambda txt, bg, cor, id_="": f'<span {id_} style="border-radius:999px;padding:6px 14px;font:800 17px Manrope;letter-spacing:.06em;background:{bg};color:{cor}">{txt}</span>'
tela = f'''<div class="tl">
<p class="rot">Agenda · sexta, 03/10</p>
<div class="lin"><span>16:00 Samuel · Corte</span></div>
<div class="lin" style="border-color:#C9963F"><span>17:00 Thiago · Corte</span>{tag("MENSALISTA", "#FBF3E4", "#8F6B22")}</div>
<div class="lin"><span>18:00 Murilo · Barba</span></div>
<p class="rot" style="margin-top:28px">Horário fixo do Thiago</p>
<div class="lin" id="w1" style="gap:10px"><span id="w1t" style="font-size:24px">sex 10/10 · 17:00</span>{tag("FIXO", "#F4EFE4", "#8F6B22", 'id="w1g"')}</div>
<div class="lin" id="w2"><span>sex 17/10 · 17:00</span>{tag("FIXO", "#F4EFE4", "#8F6B22")}</div>
<div class="lin" id="w3"><span>sex 24/10 · 17:00</span>{tag("FIXO", "#F4EFE4", "#8F6B22")}</div>
<p id="outras" style="margin-top:14px;font:700 22px Manrope;color:#047857">As outras semanas não mudam.</p>
<div id="sheet" style="position:absolute;left:16px;right:16px;bottom:60px;background:#16140F;color:#F4EFE4;border-radius:30px;padding:26px 24px">
<p style="font:800 26px Manrope">Remarcar só esta semana</p>
<div id="opt" style="margin-top:14px;border-radius:18px;padding:18px 20px;background:#2A2722;font:700 24px Manrope">qui 09/10 · 18:00</div>
<div style="margin-top:10px;border-radius:18px;padding:18px 20px;background:#2A2722;font:700 24px Manrope">sáb 11/10 · 10:00</div></div>
</div>
<div class="ov" id="toque" style="width:90px;height:90px;border-radius:50%;background:#E0AE58;opacity:0;margin:-45px 0 0 -45px"></div>'''

js = """
function face(id, bravo) { $(id + '-b').setAttribute('opacity', bravo ? 1 : 0); $(id + '-f').setAttribute('opacity', bravo ? 0 : 1); }
function bal(id, a, b, t) { const k = E((t - a) / 0.3) * (1 - E((t - b) / 0.3)); $(id).style.opacity = k; $(id).style.transform = `scale(${0.6 + 0.4 * k + 0.12 * pulo(t - a)})`; }
function ep(t) {
  const antes = t < VIRA + 0.3, final = t >= FONE[1] - 0.2;
  $('pont-m').setAttribute('transform', `rotate(${t * 2})`); $('pont-h').setAttribute('transform', `rotate(${150 + t * 0.2})`);
  // Thiago chega contente; descobre que o horário dele foi dado a outro
  const kc = E((t - 1.0) / 0.9);
  $('thi').setAttribute('transform', `translate(${1260 - 275 * kc},1500) scale(0.72)`);
  $('thi').setAttribute('opacity', final ? 0 : 1);
  $('thi-corpo').setAttribute('transform', t > 3.8 && antes ? `rotate(${Math.sin(t * 8) * 3} 0 -300)` : '');
  face('thi', t > 3.8 && antes); face('sam', t > 4.5 && antes); face('thiS', false);
  bal('balT', 3.8, VIRA, t); bal('balS', 4.5, VIRA, t);
  const kq = E((t - 5.0) / 0.25) * (1 - E((t - VIRA) / 0.3));
  $('interr').style.opacity = kq; $('interr').style.transform = `rotate(${Math.sin(t * 7) * 12}deg) scale(${0.5 + 0.5 * kq + 0.2 * pulo(t - 5.0)})`;
  // barbeiro com o caderninho, olhando um e outro
  $('caderno').setAttribute('opacity', antes ? 1 : 0);
  $('barb-bD').setAttribute('transform', antes && t > 0.8 ? 'rotate(-22 726 960)' : '');
  $('barb-cab').setAttribute('transform', antes && t > 4.2 ? `rotate(${Math.sin(t * 4) * 12} 660 905)` : `rotate(${Math.sin(t * 1.4) * 2} 660 905)`);
  $('barb-suor').setAttribute('opacity', antes && t > 4.8 ? 1 : 0);
  // desfecho: cada um na sua cadeira
  $('thiS-g').setAttribute('opacity', final ? 1 : 0);
  const km = E((t - 16.0) / 0.3) * (1 - E((t - CTA + 0.2) / 0.3)); $('chipM').style.opacity = km; $('chipM').style.transform = `scale(${0.7 + 0.3 * km + 0.12 * pulo(t - 16.0)})`;
  // celular: agenda com o fixo; remarca só uma semana
  const ks = E((t - 13.1) / 0.35) * (1 - E((t - 14.0) / 0.3));
  $('sheet').style.opacity = ks; $('sheet').style.transform = `translateY(${(1 - ks) * 200}px)`;
  $('opt').style.background = t >= 13.7 ? '#C9963F' : '#2A2722'; $('opt').style.color = t >= 13.7 ? '#16140F' : '#F4EFE4';
  const rem = t >= 14.0;
  $('w1t').textContent = rem ? 'qui 09/10 · 18:00' : 'sex 10/10 · 17:00';
  $('w1g').textContent = rem ? 'REMARCADO' : 'FIXO'; $('w1g').style.background = rem ? '#C9963F' : '#F4EFE4'; $('w1g').style.color = rem ? '#16140F' : '#8F6B22';
  $('w1').style.background = rem ? '#FBF3E4' : '#fff'; $('w1').style.transform = `scale(${1 + 0.05 * pulo(t - 14.0)})`;
  const ko = E((t - 14.4) / 0.3); $('outras').style.opacity = ko;
  ['w2', 'w3'].forEach((id, i) => { $(id).style.borderColor = t > 14.4 + i * 0.15 && t < 15.4 ? '#047857' : '#E6DDCB'; });
  const toques = [[12.9, 234, 456], [13.7, 200, 832]];
  let tq = 0, tx = 0, ty = 0; toques.forEach(([a, px, py]) => { const d = t - a; if (d > -0.05 && d < 0.45) { tq = 1 - cl(d / 0.45); tx = px; ty = py; } });
  $('toque').style.opacity = tq * 0.55; $('toque').style.left = tx + 'px'; $('toque').style.top = ty + 'px'; $('toque').style.transform = `scale(${0.6 + 0.6 * (1 - tq)})`;
}"""

ev = """
EVENTOS.push({ t: 1.0, som: 'swish', v: 0.3 }, { t: 3.8, som: 'pop', v: 0.45 }, { t: 4.5, som: 'pop', v: 0.45 }, { t: 5.0, som: 'boing', v: 0.35 });
for (let x = 0.3; x < 6.2; x += 0.5) EVENTOS.push({ t: x, som: 'tick', v: 0.25 });
EVENTOS.push({ t: 12.9, som: 'tap', v: 0.55 }, { t: 13.1, som: 'swish', v: 0.3 }, { t: 13.7, som: 'tap', v: 0.55 }, { t: 14.0, som: 'ding', v: 0.5 });
EVENTOS.push({ t: 16.0, som: 'pop', v: 0.45 }, { t: 16.05, som: 'brilho', v: 0.3 });"""

B.pagina("K4-mensalista-esquecido", cenario=cenario, overlays=overlays, tela_fone=tela,
         falas=[(0.4, "Sexta, cinco da tarde. <em>O horário do mensalista…</em>"),
                (3.7, "foi dado pra outro cliente. <em>E agora?</em>"),
                (7.8, "Com o Topete, o horário fixo <em>aparece sozinho na agenda</em>, toda semana."),
                (13.0, "Precisou trocar? <em>Muda só aquela semana.</em>"),
                (17.8, "")],
         durs=[2.97, 2.04, 4.67, 2.25, 2.25], D=21.6, VIRA=6.4, FONE=[7.4, 15.8], CTA=17.2,
         cta=("Mensalista", "sempre no lugar.", ["Horário fixo toda semana", "Remarca só aquela semana"]),
         ep_js=js, ep_eventos=ev)
