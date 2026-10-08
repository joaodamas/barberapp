"""K2 · Sábado lotado — o encaixe (série "Sem Topete × Com Topete").

Cenário próprio: a fachada da barbearia vista da calçada, sábado, fila na porta.
Promessa conferida no código: o cliente pede encaixe pelo link num horário
ocupado (status `fit_in_requested`, functions/src/booking.ts); o pedido chega
com Aprovar/Recusar (functions/src/telegram/gatilhos.ts; agenda em
web/src/components/agenda/acoes-do-atendimento.tsx — "Encaixe aprovado: …
Já está na agenda."); o cliente vê a resposta em Reservas
(web/src/app/(cliente)/reservas/page.tsx).
"""
import cartoon_base as B
import cartoon_pessoas_k2k4 as P

prancheta = '''<g id="prancheta"><rect x="712" y="1050" width="120" height="160" rx="10" fill="#fff" stroke="#6E4D1B" stroke-width="8"/>
<rect x="745" y="1040" width="54" height="22" rx="6" fill="#6E4D1B"/>
<path d="M728 1090 C750 1080 770 1100 812 1086 M728 1120 C760 1132 780 1110 814 1124 M728 1150 C752 1140 790 1162 812 1150" stroke="#16140F" stroke-width="5" fill="none"/>
<path d="M730 1170 L800 1196 M800 1170 L730 1196" stroke="#C2410C" stroke-width="7" stroke-linecap="round"/></g>'''

cenario = f'''<rect width="1080" height="1920" fill="#0E0D0B"/>
<rect x="0" y="300" width="1080" height="200" fill="#BFE0EC"/>
<circle cx="140" cy="360" r="40" fill="#FFE9B3"/>
<rect x="60" y="380" width="960" height="830" fill="#EADFCB"/><rect x="40" y="370" width="1000" height="28" fill="#A8752A"/>
<rect x="250" y="418" width="580" height="96" rx="16" fill="#16140F"/>
<text x="540" y="483" text-anchor="middle" font-family="Outfit" font-weight="700" font-size="50" fill="#E0AE58" letter-spacing="2">BARBEARIA DO ZÉ</text>
<rect x="100" y="540" width="880" height="64" fill="url(#listra)"/>
{"".join(f'<circle cx="{110 + i * 40}" cy="604" r="20" fill="#C9963F"/>' for i in range(22))}
<g id="vitrine"><rect x="110" y="660" width="400" height="430" rx="12" fill="#CFE0E3" stroke="#6E4D1B" stroke-width="14"/>
<g opacity=".8">{P.cliente_cadeira("vc", 270, 1060, k=0.36)}{P.barbeiro_pe("vb", 400, 1078, k=0.36)}</g>
<path d="M150 700 L230 700 M150 724 L190 724" stroke="#fff" stroke-width="10" stroke-linecap="round" opacity=".7"/></g>
<rect x="560" y="650" width="230" height="560" fill="#2A2017" stroke="#6E4D1B" stroke-width="14"/>
<rect x="830" y="680" width="44" height="300" rx="22" fill="url(#listra)"/><rect x="822" y="668" width="60" height="20" rx="8" fill="#A8752A"/><rect x="822" y="972" width="60" height="20" rx="8" fill="#A8752A"/>
<rect x="0" y="1200" width="1080" height="250" fill="#CFC6B4"/>
{"".join(f'<path d="M{i * 120} 1200 L{i * 120 - 40} 1450" stroke="#B8AE9A" stroke-width="4"/>' for i in range(1, 10))}
<rect x="0" y="1440" width="1080" height="22" fill="#9C927E"/><rect x="0" y="1462" width="1080" height="70" fill="#3A3732"/>
{P.pessoa("f3", 1020, 1330, k=0.48, pele="#E8C9A6", cabelo="#6E4D1B", camisa="#047857")}
{P.pessoa("f2", 940, 1370, k=0.52, pele="#8D5A3B", cabelo="#16140F", camisa="#C2410C")}
{P.barbeiro_pe("barb", 675, 1250, k=0.6, mao=prancheta)}
{P.pessoa("cliB", 230, 1440, k=0.6, pele="#E8C9A6", cabelo="#3B2F22", camisa="#5A554C")}
{P.pessoa("cliA", 450, 1440, k=0.6, pele="#C98F5E", cabelo="#2B1E14", camisa="#1d4ed8")}'''

overlays = '''<div class="ov cartao" id="balA" style="left:330px;top:860px;border-radius:30px 30px 30px 8px">Dá pra encaixar? 🙏</div>
<div class="ov cartao" id="balF" style="left:690px;top:900px;border-radius:30px 30px 8px 30px">Tem vaga hoje?</div>
<div class="ov cartao" id="balA2" style="left:330px;top:860px;border-radius:30px 30px 30px 8px">Eu marquei às 10h!</div>
<div class="ov cartao" id="balB" style="left:40px;top:760px;border-radius:30px 30px 30px 8px">Eu também! 😤</div>
<div class="ov" id="bum" style="left:300px;top:930px;font:800 110px/1 Outfit">💥</div>
<div class="ov cartao" id="ok-enc" style="left:250px;top:880px;background:#047857;color:#fff">✓ Encaixe aprovado · 10:30</div>'''

tela = '''<div class="tl" id="tA">
<div style="display:flex;align-items:center;gap:14px"><span style="width:64px;height:64px;border-radius:18px;background:#16140F;color:#E0AE58;display:grid;place-items:center;font:800 32px Outfit">Z</span>
<div><b style="font:800 32px Outfit;letter-spacing:-.5px">Barbearia do Zé</b><br><span style="display:inline-block;background:#E9E1D0;border-radius:999px;padding:8px 18px;font:700 19px Manrope;color:#6B6252">barbeariadoze.topete.com.br</span></div></div>
<p class="rot" style="margin-top:34px">Sábado, 04/10 · Corte</p>
<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-top:14px;font:800 26px Manrope;text-align:center">
<span style="border-radius:18px;padding:16px 0;background:#E6DDCB;color:#9C927E;text-decoration:line-through">09:30</span>
<span style="border-radius:18px;padding:16px 0;background:#E6DDCB;color:#9C927E;text-decoration:line-through">10:00</span>
<span id="h1030" style="border-radius:18px;padding:16px 0;background:#E6DDCB;color:#9C927E;border:3px solid transparent">10:30</span></div>
<p style="font:700 22px/1.4 Manrope;color:#6B6252;margin-top:22px">Horário ocupado? Você pode pedir um encaixe. O barbeiro responde.</p>
<div id="pedir" style="position:absolute;left:34px;right:34px;bottom:70px;border-radius:24px;padding:26px 0;text-align:center;font:800 30px Manrope;background:#D9D1C1;color:#fff">Pedir encaixe</div>
<div id="enviado" style="position:absolute;left:34px;right:34px;top:560px;border-radius:22px;padding:22px;background:#16140F;color:#F4EFE4;font:700 24px/1.4 Manrope;text-align:center">✓ Pedido enviado<br><span style="color:#E0AE58">A resposta aparece em Reservas</span></div>
</div>
<div class="tl" id="tB" style="background:#0E1621;color:#fff;padding-top:80px">
<p style="font:800 22px Manrope;letter-spacing:.12em;color:#7D8B99">CELULAR DO BARBEIRO</p>
<div id="notifB" style="margin-top:22px;background:#182533;border-radius:26px;padding:26px;font:500 28px/1.45 Manrope">
<div style="display:flex;align-items:center;gap:14px;margin-bottom:12px"><img src="../../marca/topete-mascote.svg" style="width:56px;border-radius:14px"><b>Topete</b></div>
🔔 <b>Pedido de encaixe</b><br>Vítor · Corte<br>sáb 04/10 às 10:30</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px">
<span id="aprovar" style="background:#2B3A4A;border-radius:18px;padding:22px 0;text-align:center;font:800 26px Manrope">✅ Aprovar</span>
<span style="background:#2B3A4A;border-radius:18px;padding:22px 0;text-align:center;font:800 26px Manrope">✖️ Recusar</span></div>
<div id="aprovado" style="margin-top:22px;background:#047857;border-radius:22px;padding:22px;font:700 26px/1.4 Manrope">✓ Encaixe aprovado: Vítor, 10:30. Já está na agenda.</div>
<p id="reservas" style="margin-top:18px;font:600 22px/1.4 Manrope;color:#9FB0C0">O cliente vê a resposta em Reservas.</p>
</div>
<div class="ov" id="toque" style="width:90px;height:90px;border-radius:50%;background:#E0AE58;opacity:0;margin:-45px 0 0 -45px"></div>'''

js = """
function face(id, bravo) { $(id + '-b').setAttribute('opacity', bravo ? 1 : 0); $(id + '-f').setAttribute('opacity', bravo ? 0 : 1); }
function bal(id, a, b) { const k = E((t_ - a) / 0.3) * (1 - E((t_ - b) / 0.3)); $(id).style.opacity = k; $(id).style.transform = `scale(${0.6 + 0.4 * k + 0.12 * pulo(t_ - a)})`; }
let t_ = 0;
function ep(t) {
  t_ = t; const antes = t < VIRA + 0.3;
  // cliente B entra pela esquerda na hora da confusão; sai no corte
  const kb = E((t - 4.4) / 0.6), sb = E((t - VIRA) / 0.6);
  $('cliB').setAttribute('transform', `translate(${-200 + 430 * kb - 500 * sb},1440) scale(0.6)`);
  face('cliA', t > 4.9 && antes); face('cliB', t > 5.3 && antes); face('f2', t > 2.8 && antes); face('f3', t > 3.2 && antes);
  // fila impaciente: balança
  ['f2', 'f3'].forEach((id, i) => $(id + '-corpo').setAttribute('transform', antes && t > 2.8 ? `translate(0,${Math.abs(Math.sin(t * 6 + i)) * -14})` : ''));
  $('cliA-corpo').setAttribute('transform', t > 4.9 && antes ? `rotate(${Math.sin(t * 9) * 3} 0 -300)` : '');
  bal('balA', 1.0, 4.6); bal('balF', 2.4, 4.4); bal('balA2', 4.9, VIRA); bal('balB', 5.4, VIRA);
  const kz = E((t - 6.0) / 0.25) * (1 - E((t - VIRA) / 0.3)); $('bum').style.opacity = kz; $('bum').style.transform = `scale(${0.5 + 0.5 * kz + 0.3 * pulo(t - 6.0)}) rotate(${Math.sin(t * 20) * 6}deg)`;
  // barbeiro com a prancheta rabiscada, olhando de um lado pro outro
  $('prancheta').setAttribute('opacity', antes ? 1 : 0);
  $('barb-cab').setAttribute('transform', antes && t > 4.6 ? `rotate(${Math.sin(t * 4) * 12} 660 905)` : `rotate(${Math.sin(t * 1.4) * 2} 660 905)`);
  $('barb-suor').setAttribute('opacity', antes && t > 5.0 ? 1 : 0);
  $('barb-bD').setAttribute('transform', antes && t > 1.0 ? `rotate(${-18 + Math.sin(t * 3) * 3} 726 960)` : '');
  // celular: tela do cliente, depois a do barbeiro
  const kB = E((t - 12.5) / 0.4);
  $('tA').style.opacity = 1 - kB; $('tB').style.opacity = kB;
  const sel = t >= 10.4; $('h1030').style.borderColor = sel ? '#C9963F' : 'transparent'; $('h1030').style.color = sel ? '#16140F' : '#9C927E'; $('h1030').style.background = sel ? '#FBF3E4' : '#E6DDCB';
  $('pedir').style.background = sel ? '#16140F' : '#D9D1C1';
  const ke = E((t - 11.4) / 0.3); $('enviado').style.opacity = ke; $('enviado').style.transform = `translateY(${(1 - ke) * 30}px)`;
  const kn = E((t - 12.8) / 0.35); $('notifB').style.opacity = kn; $('notifB').style.transform = `translateY(${(1 - kn) * -40}px)`;
  $('aprovar').style.background = t >= 14.6 ? '#047857' : '#2B3A4A';
  const ka = E((t - 14.8) / 0.3); $('aprovado').style.opacity = ka; $('aprovado').style.transform = `scale(${0.8 + 0.2 * ka + 0.08 * pulo(t - 14.8)})`;
  $('reservas').style.opacity = E((t - 15.4) / 0.3);
  const toques = [[10.4, 360, 330], [11.2, 234, 870], [14.6, 117, 520]];
  let tq = 0, tx = 0, ty = 0; toques.forEach(([a, px, py]) => { const d = t - a; if (d > -0.05 && d < 0.45) { tq = 1 - cl(d / 0.45); tx = px; ty = py; } });
  $('toque').style.opacity = tq * 0.55; $('toque').style.left = tx + 'px'; $('toque').style.top = ty + 'px'; $('toque').style.transform = `scale(${0.6 + 0.6 * (1 - tq)})`;
  // desfecho: o cliente recebe a resposta
  const ko = E((t - 16.7) / 0.3) * (1 - E((t - CTA + 0.2) / 0.3)); $('ok-enc').style.opacity = ko; $('ok-enc').style.transform = `scale(${0.7 + 0.3 * ko + 0.12 * pulo(t - 16.7)})`;
}"""

ev = """
[1.0, 2.4, 4.9, 5.4].forEach((a) => EVENTOS.push({ t: a, som: 'pop', v: 0.45 }));
EVENTOS.push({ t: 4.4, som: 'swish', v: 0.35 }, { t: 6.0, som: 'boing', v: 0.4 }, { t: 6.02, som: 'buzz', v: 0.25 });
[10.4, 11.2, 14.6].forEach((a) => EVENTOS.push({ t: a, som: 'tap', v: 0.55 }));
EVENTOS.push({ t: 11.4, som: 'pop', v: 0.4 }, { t: 12.8, som: 'notif', v: 0.55 }, { t: 14.8, som: 'ding', v: 0.5 }, { t: 16.7, som: 'pop', v: 0.45 }, { t: 16.75, som: 'brilho', v: 0.3 });"""

B.pagina("K2-sabado-lotado", cenario=cenario, overlays=overlays, tela_fone=tela,
         falas=[(0.4, "Sábado lotado, fila na porta… e todo mundo <em>pedindo encaixe.</em>"),
                (4.3, "Agenda de papel rabiscada, e <em>dois clientes no mesmo horário.</em>"),
                (9.3, "Com o Topete, o cliente <em>pede o encaixe pelo link</em>, e o pedido chega no celular do barbeiro."),
                (14.3, "Um toque, e o encaixe <em>está aprovado.</em>"),
                (18.4, "")],
         durs=[3.48, 3.16, 4.78, 2.18, 1.54], D=21.5, VIRA=8.0, FONE=[9.0, 16.4], CTA=17.8,
         cta=("Encaixe", "sem bagunça.", ["O cliente pede pelo link", "O barbeiro aprova com 1 toque"]),
         ep_js=js, ep_eventos=ev)
