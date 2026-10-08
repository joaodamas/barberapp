"""K7 · Cadê o Thiago? — série "Sem Topete × Com Topete".

Cenário próprio: a fachada da barbearia vista da rua. Sem Topete: o Thiago
vinha de 15 em 15 dias (as datas passam no alto), um dia some — e lá dentro
ninguém percebe. Com Topete: na lista de Clientes, "há 47 dias" ao lado do
nome dele; o dono vê e chama, e ele volta.

Promessa conferida no código (02/10/2026):
- web/src/app/painel/(dashboard)/clientes/page.tsx — cada cliente mostra "há N
  dias" desde a última visita ("12 visitas é vaidade; há 47 dias é decisão")
  e o total de visitas.
- web/src/lib/ficha-do-cliente.ts — lista ordenada da visita mais recente para
  a mais antiga: quem sumiu fica no fim (o vídeo rola até ele).
- NÃO há botão de mensagem pronta nessa tela: quem chama é o dono, por conta
  própria (o vídeo mostra ele ligando; nada automático).
Nomes inventados; valores de exemplo.
"""
import cartoon_base as B

_m = B._m


def thiago():
    """Thiago andando: pernas giram no quadril (ids pe1/pe2), jaqueta azul-marinho."""
    return '''<g id="thiago">
<g id="pe1"><rect x="-26" y="0" width="24" height="96" rx="11" fill="#2A2722"/><rect x="-34" y="88" width="40" height="16" rx="8" fill="#16140F"/></g>
<g id="pe2"><rect x="2" y="0" width="24" height="96" rx="11" fill="#3A342A"/><rect x="-2" y="88" width="40" height="16" rx="8" fill="#16140F"/></g>
<path d="M-56 -120 C-56 -150 -30 -164 0 -164 C30 -164 56 -150 56 -120 L60 8 L-60 8 Z" fill="#2B4A6B"/>
<path d="M0 -164 L0 6" stroke="#1F3550" stroke-width="5"/>
<ellipse cx="0" cy="-218" rx="48" ry="54" fill="#C98F5E"/>
<path d="M-50 -228 C-54 -276 -22 -290 4 -290 C36 -290 58 -270 50 -228 C42 -250 24 -258 2 -258 C-22 -258 -42 -250 -50 -228 Z" fill="#16140F"/>
<circle cx="-16" cy="-214" r="5.5" fill="#16140F"/><circle cx="16" cy="-214" r="5.5" fill="#16140F"/>
<path d="M-16 -190 C-6 -180 6 -180 16 -190" stroke="#7A4A2A" stroke-width="6" fill="none" stroke-linecap="round"/>
</g>'''


s = 0.30
CENARIO = f'''<rect width="1080" height="1920" fill="#0E0D0B"/>
<rect x="0" y="300" width="1080" height="1000" fill="#BFE0EC" id="ceu"/>
<circle cx="930" cy="380" r="44" fill="#FFE9B3" id="sol"/>
<rect x="40" y="420" width="1000" height="900" fill="#EADFCB"/>
<rect x="40" y="420" width="1000" height="22" fill="#A8752A"/>
<rect x="150" y="462" width="780" height="96" rx="14" fill="#16140F"/>
<text x="540" y="527" text-anchor="middle" font-family="Outfit" font-weight="700" font-size="54" letter-spacing="2" fill="#E0AE58">BARBEARIA DO ZÉ</text>
<rect x="80" y="580" width="920" height="60" fill="url(#listra)"/><path d="M80 640 Q 103 668 126 640 Q 149 668 172 640 Q 195 668 218 640 Q 241 668 264 640 Q 287 668 310 640 Q 333 668 356 640 Q 379 668 402 640 Q 425 668 448 640 Q 471 668 494 640 Q 517 668 540 640 Q 563 668 586 640 Q 609 668 632 640 Q 655 668 678 640 Q 701 668 724 640 Q 747 668 770 640 Q 793 668 816 640 Q 839 668 862 640 Q 885 668 908 640 Q 931 668 954 640 Q 977 668 1000 640 Z" fill="#C9963F"/>
<g id="vitrine"><rect x="100" y="700" width="560" height="460" rx="12" fill="#C9D7D6" stroke="#6E4D1B" stroke-width="14"/>
<rect x="190" y="1030" width="150" height="26" rx="10" fill="#16140F"/><rect x="258" y="1056" width="16" height="80" fill="#9C927E"/>
<path d="M265 930 C220 936 196 966 186 1030 L344 1030 C334 966 310 936 265 930 Z" fill="#F7F5F0"/>
<ellipse cx="265" cy="900" rx="34" ry="38" fill="#8D5A3B"/><path d="M231 894 C229 862 248 852 266 852 C286 852 302 864 299 894 C292 878 280 874 265 874 C250 874 238 878 231 894 Z" fill="#16140F"/>
<g id="barb-dentro"><path d="M370 940 C370 920 386 910 410 910 C434 910 450 920 450 940 L456 1120 L364 1120 Z" fill="#F4EFE4"/><path d="M380 960 L440 960 L446 1120 L374 1120 Z" fill="#16140F"/>
<g transform="translate({410 - 256 * s},{858 - 300 * s}) scale({s})">{_m.mascote()}</g>
<g id="tes-dentro" transform="translate(320,912)"><path d="M0 0 L-34 -14 L-34 -8 Z" fill="#5A554C"/><path d="M0 0 L-34 14 L-34 8 Z" fill="#5A554C"/><path d="M0 0 L42 10" stroke="#F4EFE4" stroke-width="16" stroke-linecap="round"/></g></g>
<path d="M140 740 L260 740 M140 770 L210 770" stroke="#fff" stroke-width="10" opacity=".5" stroke-linecap="round"/></g>
<rect x="720" y="700" width="220" height="600" rx="10" fill="#6E4D1B"/><rect x="742" y="722" width="176" height="300" rx="8" fill="#C9D7D6" opacity=".8"/>
<circle cx="900" cy="1080" r="10" fill="#C9963F"/>
<g id="placa"><rect x="760" y="1040" width="120" height="44" rx="8" fill="#16140F"/><text x="820" y="1070" text-anchor="middle" font-family="Manrope" font-weight="800" font-size="20" fill="#4CC38A">ABERTO</text></g>
<rect x="968" y="720" width="44" height="260" rx="22" fill="url(#listra)"/>
<rect x="0" y="1300" width="1080" height="230" fill="#9C927E"/><rect x="0" y="1300" width="1080" height="16" fill="#7A7262"/>
<g id="folha" opacity="0"><path d="M0 0 C14 -12 30 -8 34 6 C22 16 6 14 0 0 Z" fill="#A8752A"/></g>
<g id="th-g">{thiago()}</g>'''

DATAS = [("01/08", True, 1.2), ("15/08", True, 2.3), ("29/08", True, 3.4), ("12/09", False, 4.2), ("26/09", False, 5.0), ("10/10", False, 5.8)]
overlays = '<div class="ov" id="datas" style="left:40px;right:40px;top:320px;display:flex;gap:12px;justify-content:center">' + "".join(
    f'<div class="cartao" id="dt{i}" style="padding:12px 14px;font:800 22px/1.25 Manrope;text-align:center;min-width:140px">{d}<br>'
    f'<span style="font-size:20px;color:{"#047857" if veio else "#9C927E"}">{"✓ Thiago" if veio else "—"}</span></div>'
    for i, (d, veio, _) in enumerate(DATAS)) + '</div>' + '''
<div class="ov" id="interroga" style="left:790px;top:740px;font:800 150px/1 Outfit;color:#C2410C">?</div>
<div class="ov cartao" id="ninguem" style="left:110px;top:1180px">lá dentro: ninguém percebeu</div>
<div class="ov cartao" id="ligando" style="left:250px;top:1190px;background:#16140F;color:#F4EFE4">📞 Chamando o Thiago…</div>
<div class="ov cartao" id="voltei" style="left:560px;top:860px;border-radius:30px 30px 8px 30px">Voltei! 😄</div>
<div class="ov cartao" id="volta-dt" style="left:340px;top:330px;background:#047857;color:#fff">17/10 · ✓ Thiago voltou</div>'''

CLIENTES = [("Murilo", "veio hoje", 8), ("Caio", "há 3 dias", 5), ("Henrique", "há 9 dias", 11), ("Samuel", "há 12 dias", 6),
            ("Breno", "há 20 dias", 3), ("Vítor", "há 26 dias", 2), ("Thiago", "há 47 dias", 14)]
TELA = '''<div class="tl" style="overflow:hidden">
<p class="rot">38 cadastrados</p>
<p style="font:800 46px Outfit;letter-spacing:-1px;margin-top:6px">Clientes</p>
<div style="position:absolute;left:34px;right:34px;top:200px;bottom:70px;overflow:hidden"><div id="k7-lista">''' + "".join(
    f'<div class="lin" id="cl{i}" style="margin-top:12px"><span>{n}</span><span style="text-align:right;font:700 22px/1.25 Manrope;color:#6B6252">{d}<br>'
    f'<span style="font-size:17px">{v} visitas</span></span></div>' for i, (n, d, v) in enumerate(CLIENTES)) + '''</div></div>
</div>'''

JS = """
const VISITAS = [[0.15, 1.15], [1.25, 2.25], [2.35, 3.3]], VOLTA = [14.5, 16.2], DT = %s;
function andar(t, a, b) { return -150 + 940 * cl((t - a) / (b - a)); }
function ep(t) {
  const antes = t < VIRA + 0.3;
  $('ceu').setAttribute('fill', antes && t > 4.0 ? '#C7D3DA' : '#BFE0EC'); $('sol').setAttribute('opacity', antes && t > 4.0 ? 0.35 : 1);
  // Thiago vindo de 15 em 15 dias; depois some
  let x = null;
  VISITAS.forEach(([a, b]) => { if (t >= a && t < b + 0.15) x = andar(t, a, b); });
  if (t >= VOLTA[0] && t < CTA) x = Math.min(780, andar(t, VOLTA[0], VOLTA[1]));
  const g = $('th-g');
  if (x === null) g.setAttribute('opacity', 0);
  else {
    const passo = x < 780 ? Math.sin(t * 16) : 0;
    const somePorta = t < VIRA ? 1 - cl((x - 700) / 80) : 1;
    g.setAttribute('opacity', somePorta);
    g.setAttribute('transform', `translate(${x},${1330 - Math.abs(passo) * 6})`);
    $('pe1').setAttribute('transform', `rotate(${passo * 22} 0 0)`); $('pe2').setAttribute('transform', `rotate(${-passo * 22} 0 0)`);
  }
  // barbeiro lá dentro, cortando sem parar
  $('tes-dentro').setAttribute('transform', `translate(320,912) rotate(${Math.sin(t * 9) * 8})`);
  // datas passando no alto
  DT.forEach((a, i) => { const d = $('dt' + i), k = E((t - a) / 0.3), s = E((t - VIRA) / 0.3);
    d.style.opacity = t < a ? 0 : k * (1 - s); d.style.transform = `translateY(${(1 - k) * -20}px) scale(${1 + 0.1 * pulo(t - a)})`; });
  // folha passando na calçada vazia
  const kf = cl((t - 4.4) / 2.4);
  $('folha').setAttribute('opacity', antes && kf > 0 && kf < 1 ? 1 : 0);
  $('folha').setAttribute('transform', `translate(${-60 + 1200 * kf},${1420 - Math.abs(Math.sin(kf * 12)) * 40}) rotate(${kf * 720})`);
  const kq = E((t - 6.1) / 0.3) * (1 - E((t - VIRA) / 0.3));
  $('interroga').style.opacity = kq; $('interroga').style.transform = `rotate(${Math.sin(t * 6) * 10}deg) scale(${0.5 + 0.5 * kq + 0.2 * pulo(t - 6.1)})`;
  const kn = E((t - 5.4) / 0.3) * (1 - E((t - VIRA) / 0.3)); $('ninguem').style.opacity = kn;
  // depois: o dono chama, Thiago volta
  const kl = E((t - 13.8) / 0.3) * (1 - E((t - 15.0) / 0.3)); $('ligando').style.opacity = kl; $('ligando').style.transform = `scale(${0.7 + 0.3 * kl + 0.08 * Math.sin(t * 20) * kl})`;
  const kv = E((t - 15.9) / 0.3) * (1 - E((t - CTA + 0.2) / 0.3)); $('voltei').style.opacity = kv; $('voltei').style.transform = `scale(${0.6 + 0.4 * kv + 0.12 * pulo(t - 15.9)})`;
  const kd = E((t - 16.2) / 0.3) * (1 - E((t - CTA + 0.2) / 0.3)); $('volta-dt').style.opacity = kd; $('volta-dt').style.transform = `scale(${0.6 + 0.4 * kd + 0.12 * pulo(t - 16.2)})`;
  // tela: a lista rola até o Thiago, que fica em destaque
  [0, 1, 2, 3, 4, 5, 6].forEach((i) => { const k = E((t - 9.0 - i * 0.12) / 0.3); $('cl' + i).style.opacity = k; });
  $('k7-lista').style.transform = `translateY(${-210 * EI((t - 10.2) / 1.0)}px)`;
  const kt = E((t - 11.4) / 0.3), th = $('cl6');
  th.style.borderColor = kt > 0 ? '#C9963F' : '#E6DDCB'; th.style.background = kt > 0 ? '#FBF3E4' : '#fff';
  th.style.transform = `scale(${1 + 0.06 * kt + 0.06 * pulo(t - 11.4)})`;
}""" % [d[2] for d in DATAS]

EV = """
VISITAS.forEach(([a, b]) => { for (let x = a + 0.1; x < b; x += 0.19) EVENTOS.push({ t: x, som: 'tick', v: 0.22 }); EVENTOS.push({ t: b, som: 'ding', v: 0.3 }); });
DT.forEach((a) => EVENTOS.push({ t: a, som: 'pop', v: 0.35 }));
EVENTOS.push({ t: 4.4, som: 'swish', v: 0.3 }, { t: 6.1, som: 'boing', v: 0.3 });
[9.0, 9.4].forEach((a) => EVENTOS.push({ t: a, som: 'tap', v: 0.35 }));
EVENTOS.push({ t: 10.2, som: 'swish', v: 0.3 }, { t: 11.4, som: 'ding', v: 0.5 });
for (let x = 13.8; x < 14.9; x += 0.35) EVENTOS.push({ t: x, som: 'buzz', v: 0.3 });
for (let x = VOLTA[0] + 0.1; x < VOLTA[1]; x += 0.19) EVENTOS.push({ t: x, som: 'tick', v: 0.22 });
EVENTOS.push({ t: 15.9, som: 'pop', v: 0.45 }, { t: 16.2, som: 'brilho', v: 0.35 });"""

B.pagina("K7-cliente-sumiu", cenario=CENARIO, overlays=overlays, tela_fone=TELA,
         falas=[(0.5, "O Thiago cortava aqui <em>de quinze em quinze dias.</em>"),
                (4.6, "Um dia, sumiu. <em>E ninguém percebeu.</em>"),
                (8.8, "Com o Topete, a lista mostra <em>há quantos dias cada um não vem.</em>"),
                (14.2, "Você vê, chama… <em>e ele volta.</em>"),
                (17.6, "")],
         durs=[2.36, 2.18, 3.81, 1.67, 2.84], D=22.0, VIRA=7.5, FONE=[8.6, 13.6], CTA=17.0,
         cta=("Nenhum cliente fiel some", "sem você saber.", ["Há quantos dias não vem", "Histórico de visitas"]),
         ep_js=JS, ep_eventos=EV)
