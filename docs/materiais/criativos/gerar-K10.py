"""K10 · O serviço a mais — série "Sem Topete × Com Topete".

Cenário próprio: parede de tijolo, cadeira com cliente e o cantinho do caixa.
Sem Topete: marcou corte, pediu a barba junto; na hora de cobrar, conta no
caderninho e ninguém lembra o preço do combo. Com Topete: ao concluir,
"+ Adicionar serviço" → Barba, o total vira o do combo Corte + barba, escolhe a
forma de pagamento e o atendimento entra no caixa.

Promessa conferida: web/src/components/agenda/adicionar-servico.tsx ("+ Adicionar
serviço" no fechamento, prévia com aplicarCombos e " · combo ...") e
functions/src/servicos-extras.ts (adicionarServicosAoAtendimento recalcula com
combos); web/src/lib/combos.ts (Corte + Barba vira "Corte + barba", menor preço).
Preços de exemplo: Corte 50, Barba 35, combo Corte + barba 80.
"""
import cartoon_base as B
import cartoon_pecas_k8a10 as P

TIJOLOS = "".join(f'<rect x="{x + (60 if (y // 60) % 2 else 0)}" y="{y}" width="112" height="52" rx="4" fill="#B8664A" opacity=".55"/>'
                  for y in range(320, 1170, 60) for x in range(-60, 1080, 120))
espelho = '<rect x="170" y="420" width="420" height="440" rx="30" fill="#C9D7D6" stroke="#16140F" stroke-width="16"/><path d="M230 520 C260 470 320 450 380 450" stroke="#fff" stroke-width="14" fill="none" opacity=".55" stroke-linecap="round"/>'
caixa = '''<g id="caixa"><rect x="830" y="1010" width="260" height="170" rx="10" fill="#5A4027"/><rect x="815" y="995" width="280" height="26" rx="8" fill="#7A5733"/>
<g id="caderno"><rect x="850" y="960" width="120" height="40" rx="4" fill="#F4EFE4" stroke="#D9D1C1" stroke-width="3"/><rect x="850" y="960" width="10" height="40" fill="#C2410C"/></g>
<rect x="990" y="940" width="60" height="58" rx="10" fill="#16140F"/><rect x="998" y="948" width="44" height="22" rx="4" fill="#4CC38A"/></g>'''
cenario = (P.parede("#D8C2A6", chao="#2F2620") + TIJOLOS + espelho + caixa
           + P.cadeira(380) + P.cliente_sentado(380, p="cli", cabelo="#2B1E14")
           + P.barbeiro_em_pe(660, p="bb"))

overlays = '''<div class="ov cartao" id="k10-fala" style="left:60px;top:640px;border-radius:30px 30px 30px 8px">Faz a barba também? 🧔</div>
<div class="ov" id="k10-cad" style="left:250px;top:360px;width:580px;background:#FBF8F0;border-radius:18px;padding:30px 36px 30px 70px;box-shadow:0 30px 60px -20px #0009;
background-image:repeating-linear-gradient(#FBF8F0 0 56px,#D6E2EE 56px 58px);font:600 italic 38px/58px Manrope;color:#2B3A55;border-left:10px solid #C2410C">
<div id="cad1">Corte ........... 50</div><div id="cad2">Barba ........... 35</div><div id="cad3">Total = 85 ?</div><div id="cad4" style="color:#C2410C">Combo era 80?? 70??</div></div>
<div class="ov" id="k10-q" style="left:830px;top:330px;font:800 150px/1 Outfit;color:#C2410C">?</div>
<div class="ov cartao" id="k10-ok" style="left:200px;top:1300px;background:#047857;color:#fff">✓ R$ 80 · combo Corte + barba</div>'''

tela = '''<div class="tl">
<p class="rot">Hoje · 14:00</p>
<div class="lin" style="margin-top:14px"><div><b>Samuel</b><br><span id="k10-serv" style="font:700 22px Manrope;color:#6B6252">Corte</span></div><span id="k10-valor" style="font:800 28px Manrope">R$ 50</span></div>
<div id="k10-concluir" style="margin-top:14px;background:#16140F;color:#F4EFE4;border-radius:20px;padding:20px 0;text-align:center;font:800 26px Manrope">Concluir</div>
<div id="k10-sheet" style="margin-top:22px;background:#fff;border:2.5px solid #E6DDCB;border-radius:26px;padding:22px">
<b style="font:800 28px Outfit">Concluir atendimento</b>
<div id="k10-add" style="margin-top:14px;border:2.5px dashed #C9963F;border-radius:18px;padding:16px;text-align:center;font:800 24px Manrope;color:#A8752A">+ Adicionar serviço</div>
<div id="k10-opcoes" style="margin-top:12px;display:flex;gap:10px"><span id="k10-barba" style="flex:1;text-align:center;border:2.5px solid #E6DDCB;border-radius:16px;padding:14px 0;font:800 22px Manrope">Barba · R$ 35</span>
<span style="flex:1;text-align:center;border:2.5px solid #E6DDCB;border-radius:16px;padding:14px 0;font:800 22px Manrope">Sobrancelha · R$ 15</span></div>
<div id="k10-combo" style="margin-top:14px;background:#FBF3E4;border-radius:16px;padding:14px 16px;font:700 22px/1.4 Manrope">Corte + Barba · <b>combo Corte + barba</b><br>
Total <s style="color:#9C927E">R$ 85</s> <b style="font-size:30px;color:#047857">R$ 80</b></div>
<div id="k10-pag" style="margin-top:14px;display:flex;gap:10px"><span id="k10-pix" style="flex:1;text-align:center;border:2.5px solid #E6DDCB;border-radius:16px;padding:14px 0;font:800 22px Manrope">Pix</span>
<span style="flex:1;text-align:center;border:2.5px solid #E6DDCB;border-radius:16px;padding:14px 0;font:800 22px Manrope">Cartão</span><span style="flex:1;text-align:center;border:2.5px solid #E6DDCB;border-radius:16px;padding:14px 0;font:800 22px Manrope">Dinheiro</span></div></div>
</div>
<div id="k10-fim" style="position:absolute;inset:0;background:#F4EFE4;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;text-align:center;opacity:0">
<div id="k10-check" style="width:150px;height:150px;border-radius:50%;background:#047857;color:#fff;display:grid;place-items:center;font:800 84px Manrope">✓</div>
<b style="font:800 44px/1.05 Outfit">Concluído</b><span style="font:700 26px/1.45 Manrope;color:#6B6252">Samuel · Corte + barba<br><b style="color:#16140F">R$ 80 · Pix</b><br>entrou no caixa de hoje</span></div>
<div id="k10-toque" style="position:absolute;width:84px;height:84px;margin:-42px 0 0 -42px;border-radius:50%;background:#E0AE58;opacity:0"></div>'''

ep_js = """
const TOQ = [[8.9, 234, 275], [9.8, 234, 451], [10.5, 144, 541], [11.6, 113, 778]];
function ep(t) {
  const antes = t < VIRA + 0.3;
  // barbeiro corta; no "quanto é?" olha o caderno com a tesoura parada; depois corta tranquilo
  const conta = antes && t > 3.9;
  const sn = !conta ? Math.abs(Math.sin(t * 9)) * 24 : 3;
  $('bb-l1').setAttribute('transform', `rotate(${sn})`); $('bb-l2').setAttribute('transform', `rotate(${-sn})`);
  $('bb-bt').setAttribute('transform', `rotate(${conta ? -70 * E((t - 3.9) / 0.4) : Math.sin(t * 3) * 3} 600 960)`);
  $('bb-cab').setAttribute('transform', conta ? `rotate(${14 * E((t - 3.9) / 0.4)} 660 905)` : (!antes ? `rotate(${Math.sin(t * 1.6) * 3} 660 905)` : ''));
  const bravo = antes && t > 5.2;
  $('cli-bravo').setAttribute('opacity', bravo ? 1 : 0); $('cli-feliz').setAttribute('opacity', bravo ? 0 : 1);
  // balão do cliente e caderninho
  const kf = E((t - 1.3) / 0.3) * (1 - E((t - 3.6) / 0.3)); $('k10-fala').style.opacity = kf; $('k10-fala').style.transform = `scale(${0.7 + 0.3 * kf + 0.1 * pulo(t - 1.3)})`;
  const kc = E((t - 4.1) / 0.35) * (1 - E((t - VIRA) / 0.3)); $('k10-cad').style.opacity = kc; $('k10-cad').style.transform = `rotate(-3deg) translateY(${(1 - kc) * 60}px)`;
  [['cad1', 4.4], ['cad2', 4.8], ['cad3', 5.3], ['cad4', 5.9]].forEach(([id, a]) => { const k = E((t - a) / 0.25); $(id).style.opacity = k; $(id).style.clipPath = `inset(0 ${(1 - k) * 100}% 0 0)`; });
  const kq = E((t - 6.2) / 0.25) * (1 - E((t - VIRA) / 0.3)); $('k10-q').style.opacity = kq; $('k10-q').style.transform = `rotate(${Math.sin(t * 7) * 12}deg) scale(${0.5 + 0.5 * kq + 0.2 * pulo(t - 6.2)})`;
  const ko = E((t - 14.6) / 0.3) * (1 - E((t - CTA + 0.3) / 0.3)); $('k10-ok').style.opacity = ko; $('k10-ok').style.transform = `scale(${0.7 + 0.3 * ko + 0.1 * pulo(t - 14.6)})`;
  // tela: Concluir → + Adicionar serviço → Barba → combo → Pix → concluído
  const sh = E((t - 9.1) / 0.35); $('k10-sheet').style.opacity = sh; $('k10-sheet').style.transform = `translateY(${(1 - sh) * 40}px)`;
  $('k10-opcoes').style.opacity = E((t - 10.0) / 0.3); $('k10-barba').style.borderColor = t > 10.5 ? '#C9963F' : '#E6DDCB'; $('k10-barba').style.background = t > 10.5 ? '#FBF3E4' : '';
  const cb = E((t - 10.75) / 0.35); $('k10-combo').style.opacity = cb; $('k10-combo').style.transform = `scale(${0.9 + 0.1 * cb + 0.06 * pulo(t - 10.75)})`;
  $('k10-pag').style.opacity = E((t - 11.1) / 0.3);
  $('k10-pix').style.background = t > 11.6 ? '#16140F' : ''; $('k10-pix').style.color = t > 11.6 ? '#F4EFE4' : '';
  $('k10-serv').textContent = t > 10.75 ? 'Corte + barba' : 'Corte'; $('k10-valor').textContent = t > 10.75 ? 'R$ 80' : 'R$ 50';
  const fim = E((t - 12.1) / 0.35); $('k10-fim').style.opacity = fim; $('k10-check').style.transform = `scale(${0.4 + 0.6 * fim + 0.2 * pulo(t - 12.15)})`;
  let tq = 0, tx = 0, ty = 0; TOQ.forEach(([a, x, y]) => { const d = t - a; if (d > -0.05 && d < 0.45) { tq = 1 - cl(d / 0.45); tx = x; ty = y; } });
  $('k10-toque').style.opacity = tq * 0.55; $('k10-toque').style.left = tx + 'px'; $('k10-toque').style.top = ty + 'px';
}"""
ep_ev = """
for (let x = 0.4; x < 3.8; x += 0.55) EVENTOS.push({ t: x, som: 'snip', v: 0.35 });
EVENTOS.push({ t: 1.3, som: 'pop', v: 0.45 }, { t: 4.1, som: 'swish', v: 0.4 });
[4.4, 4.8, 5.3, 5.9].forEach((a) => EVENTOS.push({ t: a, som: 'tick', v: 0.45 }));
EVENTOS.push({ t: 6.2, som: 'boing', v: 0.3 });
EVENTOS.push({ t: 8.9, som: 'tap', v: 0.6 }, { t: 9.1, som: 'swish', v: 0.3 }, { t: 9.8, som: 'tap', v: 0.6 }, { t: 10.5, som: 'tap', v: 0.6 }, { t: 10.75, som: 'ding', v: 0.45 });
EVENTOS.push({ t: 11.6, som: 'tap', v: 0.6 }, { t: 12.1, som: 'pop', v: 0.5 }, { t: 12.2, som: 'notif', v: 0.4 });
EVENTOS.push({ t: 14.6, som: 'brilho', v: 0.35 }, { t: 14.2, som: 'snip', v: 0.35 }, { t: 14.8, som: 'snip', v: 0.35 });"""

B.pagina("K10-servico-a-mais", cenario=cenario, overlays=overlays, tela_fone=tela,
         falas=[(0.5, "Marcou só o corte… e, na cadeira, <em>pediu a barba junto.</em>"),
                (4.1, "Na hora de cobrar: <em>quanto é mesmo o combo?</em>"),
                (8.3, "Com o Topete, ao concluir, você adiciona o serviço, e o valor já sai <em>com o preço do combo.</em>"),
                (14.5, "Cobrou certo, e o pagamento <em>já entra no caixa.</em>"),
                (18.2, "")],
         durs=[3.11, 2.28, 4.77, 2.51, 3.05], D=22.8, VIRA=7.0, FONE=[8.1, 14.0], CTA=17.6,
         cta=("Cada atendimento", "cobrado do jeito certo.", ["Adicionar serviço", "Preço de combo automático"]),
         ep_js=ep_js, ep_eventos=ep_ev)
