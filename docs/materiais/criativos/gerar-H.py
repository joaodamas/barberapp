"""Formato "Coisas que todo barbeiro já ouviu" — H1, H2, H3 (humor curto, ~15 s).

H1 · Dá só uma aparadinha  — visto pelo espelho: corta UM fio, "tirou muito!".
H2 · Faz igual a foto      — visão do cliente na cadeira: a foto é dele aos 15, cabeludo.
H3 · Tô na porta           — de dentro, olhando a porta de vidro: "é rapidinho!".

Vozes: barbeiro = voz clonada do dono; cliente = voz do Google (Chirp3 HD).
Falas em scratchpad/formatos/hN/fala{i}.wav (durações medidas abaixo).
Nomes inventados; o Topete só aparece no cartão final.
"""
import humor_barbeiro_base as H

CAFE = "#E0B48A"
CAB = "#3B2A1C"

# ------------------------------------------------------------------ H1 · aparadinha (pelo espelho)
h1_mundo = f'''<defs><clipPath id="refl"><rect x="62" y="282" width="956" height="1196" rx="52"/></clipPath>
<linearGradient id="vidro" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
<rect x="30" y="250" width="1020" height="1260" rx="74" fill="#A8752A"/><rect x="44" y="264" width="992" height="1232" rx="64" fill="#C9963F"/>
<g clip-path="url(#refl)">
<rect x="0" y="250" width="1080" height="1300" fill="#D8CBB3"/>
<rect x="0" y="1300" width="1080" height="260" fill="#3B2F22"/><rect x="0" y="1290" width="1080" height="12" fill="#A8752A"/>
<rect x="110" y="470" width="240" height="16" rx="5" fill="#6E4D1B"/>
{"".join(f'<rect x="{120 + i * 46}" y="{404 - (i % 2) * 14}" width="34" height="{66 + (i % 2) * 14}" rx="8" fill="{c}"/>' for i, c in enumerate(["#16140F", "#C9963F", "#5A554C", "#A8752A", "#16140F"]))}
<rect x="660" y="330" width="250" height="150" rx="12" fill="#16140F"/><text x="785" y="420" text-anchor="middle" font-family="Outfit" font-weight="700" font-size="46" fill="#E0AE58">Zé</text>
{H.avental(700, 890, 320, 620)}
<g id="bbnod">{H.cabeca_barbeiro("bb", 860, 640, 0.72)}</g>
{H.capa_corte(480, 1095, 640, 1560)}
<rect x="300" y="1440" width="360" height="40" rx="14" fill="#16140F"/>
{H.cabeca_cliente("cl", 480, 880, r=172, pele=CAFE, cabelo="longo", cor=CAB, barba=True)}
<path d="M745 960 C700 900 660 800 615 735" stroke="#F4EFE4" stroke-width="44" fill="none" stroke-linecap="round"/>
<circle cx="612" cy="728" r="24" fill="{H.PELE}"/>
{H.tesoura("tes", 590, 712, 1.15)}
<g id="fio"><path d="M560 690 C576 720 570 750 588 790" stroke="#F4EFE4" stroke-width="16" fill="none" stroke-linecap="round" opacity=".7"/><path d="M560 690 C576 720 570 750 588 790" stroke="{CAB}" stroke-width="10" fill="none" stroke-linecap="round"/></g>
<g id="rot1" opacity="0"><rect x="604" y="905" width="168" height="70" rx="20" fill="#16140F"/><text x="688" y="953" text-anchor="middle" font-family="Manrope" font-weight="800" font-size="34" fill="#E0AE58">1 fio ✂️</text></g>
<polygon points="62,282 520,282 140,1478 62,1478" fill="url(#vidro)"/>
</g>'''
h1_js = """
function ep(t) {
  boca('cl-boca', 0.13 * 172, t, 'c'); boca('bb-boca', 14, t, 'b');
  $('bbnod').setAttribute('transform', t > 3.3 && t < 4.5 ? `rotate(${Math.sin((t - 3.3) * 9) * 4} 860 900)` : '');
  // tesoura: dois cortes (4.8 e 5.05); antes e depois, mexendo de leve
  let ab = 16 + Math.sin(t * 6) * 4;
  [4.8, 5.05].forEach((a) => { const x = (t - a) / 0.18; if (x > 0 && x < 1) ab = 22 * Math.abs(Math.cos(x * Math.PI)); });
  $('tes1').setAttribute('transform', `rotate(${ab})`); $('tes2').setAttribute('transform', `rotate(${-ab})`);
  // o fio cai devagar, balançando
  const q = Math.max(0, t - 5.12), cai = Math.min(1, q / 1.5);
  $('fio').setAttribute('transform', q > 0 ? `translate(${Math.sin(q * 5) * 18},${300 * EIO(cai)}) rotate(${Math.sin(q * 4) * 25} 574 735)` : '');
  const kr = E((t - 5.9) / 0.25) * (1 - E((t - 6.7) / 0.2));
  $('rot1').setAttribute('opacity', kr); $('rot1').setAttribute('transform', `translate(688 940) scale(${0.6 + 0.4 * kr + 0.2 * pulo(t - 5.9)}) translate(-688 -940)`);
  // susto do cliente
  const sus = t > 7.85 && t < FIM;
  $('cl-arr').setAttribute('opacity', sus ? 1 : 0); $('cl-on').setAttribute('opacity', sus ? 0 : 1);
  $('cl-br').setAttribute('transform', sus ? 'translate(0,-22)' : '');
  $('bb-tedio').setAttribute('opacity', t > 10.0 ? 1 : 0);
}"""
h1_ev = """
EVENTOS.push({ t: 4.8, som: 'snip', v: 0.9 }, { t: 5.05, som: 'snip', v: 0.9 }, { t: 5.15, som: 'swish', v: 0.2 }, { t: 5.9, som: 'pop', v: 0.5 });
EVENTOS.push({ t: 7.8, som: 'boing', v: 0.3 }, { t: 9.95, som: 'whoosh', v: 0.3 });"""
H.pagina("H1-aparadinha", num=1, titulo_capa="Coisas que todo barbeiro <em>já ouviu</em>",
         mundo=h1_mundo, overlays="",
         falas=[(1.6, "Dá só uma aparadinha, tá?"), (3.3, "Só uma aparadinha."), (6.9, "Pronto."), (7.8, "Nossa… tirou muito! 😱"), (12.3, "")],
         quem=["c", "b", "b", "c", "b"], durs=[1.37, 1.17, 0.64, 2.0, 2.85],
         D=15.8, CAPA=1.3, BADUM=10.25, FIM=11.9,
         CAM=[[0, .01, 540, 900, 1.0], [1.6, .6, 520, 880, 1.12], [3.3, .5, 650, 820, 1.12], [4.55, .45, 595, 745, 2.6],
              [5.15, 1.4, 600, 990, 2.2], [6.75, .45, 540, 900, 1.0], [7.75, .25, 480, 900, 1.75], [9.95, .3, 860, 650, 2.35]],
         TREME=[[7.8, .5, 14], [10.25, .3, 6]],
         fim=("Pra essa a gente não tem solução.", "Pra agenda, tem."),
         ep_js=h1_js, ep_eventos=h1_ev, badum_top=1300)


# ------------------------------------------------------------------ H2 · igual a foto (visão do cliente)
PELE2 = "#B9825A"
h2_mundo = f'''<g id="shotA">
<rect x="0" y="0" width="1080" height="1920" fill="#E4D8C2"/><rect x="0" y="1380" width="1080" height="540" fill="#3B2F22"/>
<rect x="80" y="380" width="64" height="360" rx="32" fill="#C9963F"/><rect x="900" y="420" width="120" height="160" rx="14" fill="#16140F"/>
{H.avental(330, 1000, 420, 760)}
<path d="M350 1080 C300 1200 300 1300 340 1380" stroke="#F4EFE4" stroke-width="56" fill="none" stroke-linecap="round"/><circle cx="342" cy="1390" r="30" fill="{H.PELE}"/>
{H.tesoura("tes", 330, 1400, 1.2)}
<g id="bbA">{H.cabeca_barbeiro("bb", 540, 760, 0.95)}</g>
<path d="M0 1920 L0 1760 C300 1700 780 1700 1080 1760 L1080 1920 Z" fill="#F7F5F0" stroke="#D9D1C1" stroke-width="6"/>
<g id="celA"><path d="M1000 1920 C960 1760 900 1560 820 1460" stroke="{PELE2}" stroke-width="80" fill="none" stroke-linecap="round"/>
<g transform="rotate(-8 740 1330)"><rect x="640" y="1170" width="210" height="350" rx="30" fill="#16140F"/><rect x="654" y="1186" width="182" height="318" rx="20" fill="#BFE0EC"/>
{H.cabeca_cliente("mini", 745, 1350, r=58, pele=PELE2, cabelo="cacheado", cor="#2B1E14")}</g>
<circle cx="806" cy="1450" r="42" fill="{PELE2}"/></g>
</g>
<g id="shotB" opacity="0">
<rect x="0" y="0" width="1080" height="1920" fill="#0E0D0B"/>
<rect x="170" y="290" width="740" height="1260" rx="80" fill="#1C1A16"/><rect x="196" y="316" width="688" height="1208" rx="60" fill="#9FC9DB"/>
<circle cx="760" cy="520" r="70" fill="#FFE9B3" opacity=".8"/>
<rect x="196" y="1180" width="688" height="344" fill="#7DAF6A"/>
{H.cabeca_cliente("jov", 540, 880, r=190, pele=PELE2, cabelo="cacheado", cor="#2B1E14")}
<path d="M300 1180 C330 1120 420 1090 540 1090 C660 1090 750 1120 780 1180 L800 1524 L280 1524 Z" fill="#E5484D"/>
<rect x="250" y="1360" width="580" height="110" rx="26" fill="#16140F" opacity=".82"/>
<text x="540" y="1432" text-anchor="middle" font-family="Outfit" font-weight="700" font-size="54" fill="#F4EFE4">eu, 15 anos 😎</text>
<text x="830" y="372" text-anchor="end" font-family="Manrope" font-weight="800" font-size="30" fill="#16140F" opacity=".55">2009</text>
</g>
<g id="shotC" opacity="0">
<rect x="0" y="0" width="1080" height="1920" fill="#E4D8C2"/><rect x="0" y="1380" width="1080" height="540" fill="#3B2F22"/>
{H.capa_corte(540, 1160, 760, 1920)}
{H.cabeca_cliente("cl", 540, 900, r=230, pele=PELE2, cabelo="entradas", cor="#2B1E14")}
<g id="brilhoC" opacity="0"><path d="M470 600 L482 636 L518 648 L482 660 L470 696 L458 660 L422 648 L458 636 Z" fill="#fff"/></g>
</g>'''
h2_js = """
function ep(t) {
  const A = t < 3.3 || t >= 7.3, B = t >= 3.3 && t < 5.9, C = t >= 5.9 && t < 7.3;
  $('shotA').setAttribute('opacity', A ? 1 : 0); $('shotB').setAttribute('opacity', B ? 1 : 0); $('shotC').setAttribute('opacity', C ? 1 : 0);
  boca('bb-boca', 14, t, 'b');
  // o cliente levanta o celular
  const kc = E((t - 2.0) / 0.6);
  $('celA').setAttribute('transform', `translate(${-60 * kc},${-120 * kc})`);
  $('bbA').setAttribute('transform', t < 3.3 ? `rotate(${Math.sin(t * 2) * 2} 540 900)` : '');
  $('tes1').setAttribute('transform', `rotate(${14 + Math.sin(t * 5) * 4})`); $('tes2').setAttribute('transform', `rotate(${-14 - Math.sin(t * 5) * 4})`);
  // foto: o garoto sorri; o cliente, orgulhoso
  $('jov-sorri').setAttribute('opacity', 1); $('jov-boca').setAttribute('opacity', 0);
  $('cl-sorri').setAttribute('opacity', 1); $('cl-boca').setAttribute('opacity', 0);
  const kb = Math.max(0, Math.sin(cl((t - 6.25) / 0.7) * Math.PI));
  $('brilhoC').setAttribute('opacity', kb); $('brilhoC').setAttribute('transform', `translate(470 648) scale(${0.5 + kb}) rotate(${t * 90}) translate(-470 -648)`);
  $('bb-tedio').setAttribute('opacity', t > 7.45 && t < FIM ? 1 : 0);
}"""
h2_ev = """
EVENTOS.push({ t: 2.0, som: 'swish', v: 0.35 }, { t: 3.3, som: 'whoosh', v: 0.45 }, { t: 3.35, som: 'pop', v: 0.45 });
EVENTOS.push({ t: 5.9, som: 'whoosh', v: 0.35 }, { t: 6.3, som: 'brilho', v: 0.5 }, { t: 7.3, som: 'whoosh', v: 0.3 });"""
H.pagina("H2-igual-a-foto", num=2, titulo_capa="Coisas que todo barbeiro <em>já ouviu</em>",
         mundo=h2_mundo, overlays="",
         falas=[(1.6, "Faz igual a essa foto aqui?"), (3.6, "Sou eu, com quinze anos! 😎"), (7.6, "O corte eu faço. O cabelo… aí é com você."), (12.4, "")],
         quem=["c", "c", "b", "b"], durs=[1.42, 1.97, 2.69, 2.91],
         D=16.0, CAPA=1.3, BADUM=10.45, FIM=12.0,
         CAM=[[0, .01, 540, 960, 1.0], [2.2, .9, 690, 1240, 1.45], [3.28, .02, 540, 900, 1.0], [3.3, 2.4, 540, 880, 1.12],
              [5.88, .02, 540, 900, 1.0], [5.95, 1.2, 540, 840, 1.15], [7.28, .02, 540, 960, 1.0], [7.35, .35, 540, 760, 1.9]],
         TREME=[[3.35, .25, 8], [10.45, .3, 6]],
         fim=("Milagre não é com a gente.", "Agenda organizada, é."),
         ep_js=h2_js, ep_eventos=h2_ev)


# ------------------------------------------------------------------ H3 · tô na porta (olhando a porta de vidro)
PELE3 = "#8D5A3B"
def esperando(i, cx, pele, cabelo, cor, camisa):
    return (f'<rect x="{cx - 80}" y="1300" width="160" height="200" rx="60" fill="{camisa}"/>'
            f'{H.cabeca_cliente(f"e{i}", cx, 1230, r=72, pele=pele, cabelo=cabelo, cor=cor)}'
            f'<g id="n{i}" opacity="0"><circle cx="{cx}" cy="1110" r="40" fill="#E0AE58"/><text x="{cx}" y="1126" text-anchor="middle" font-family="Outfit" font-weight="700" font-size="46" fill="#0E0D0B">{i}</text></g>')


h3_mundo = f'''<defs><clipPath id="vid"><rect x="640" y="460" width="290" height="560" rx="10"/></clipPath></defs>
<rect x="0" y="0" width="1080" height="1920" fill="#E6DAC4"/><rect x="0" y="1360" width="1080" height="560" fill="#3B2F22"/><rect x="0" y="1350" width="1080" height="12" fill="#A8752A"/>
<rect x="610" y="420" width="350" height="940" rx="14" fill="#6E4D1B"/>
<g clip-path="url(#vid)"><rect x="640" y="460" width="290" height="560" fill="#BFE0EC"/><rect x="640" y="900" width="290" height="120" fill="#9C927E"/>
<g id="porta-cli" transform="translate(0,260)">{H.cabeca_cliente("cl", 785, 760, r=118, pele=PELE3, cabelo="curto", cor="#16140F")}
<path d="M690 900 C700 860 870 860 880 900 L890 1020 L680 1020 Z" fill="#1d4ed8"/>
<g id="maoE"><circle cx="672" cy="760" r="32" fill="{PELE3}"/></g><g id="maoD"><circle cx="898" cy="760" r="32" fill="{PELE3}"/></g>
<ellipse id="bafo" cx="785" cy="850" rx="70" ry="28" fill="#fff" opacity="0"/></g>
<rect x="640" y="460" width="290" height="560" fill="#fff" opacity=".14"/><polygon points="660,460 760,460 660,700" fill="#fff" opacity=".25"/></g>
<rect x="715" y="1060" width="140" height="56" rx="10" fill="#16140F"/><text x="785" y="1098" text-anchor="middle" font-family="Manrope" font-weight="800" font-size="26" fill="#4CC38A">ABERTO</text>
{H.avental(70, 900, 230, 560)}
<g id="bbnod">{H.cabeca_barbeiro("bb", 185, 760, 0.56)}</g>
{H.capa_corte(330, 1130, 330, 1500)}
{H.cabeca_cliente("c2", 330, 1020, r=96, pele=CAFE, cabelo="curto", cor=CAB)}
<path d="M250 940 C300 900 330 880 360 870" stroke="#F4EFE4" stroke-width="34" fill="none" stroke-linecap="round"/><circle cx="364" cy="868" r="18" fill="{H.PELE}"/>
{H.tesoura("tes", 380, 860, 0.8)}
<rect x="540" y="1440" width="520" height="40" rx="12" fill="#16140F"/><rect x="560" y="1480" width="24" height="60" fill="#16140F"/><rect x="1010" y="1480" width="24" height="60" fill="#16140F"/>
{esperando(1, 640, "#E8C9A6", "curto", "#6E4D1B", "#5A554C")}{esperando(2, 800, "#6B4430", "cacheado", "#16140F", "#A8752A")}{esperando(3, 960, "#C98F5E", "longo", "#2B1E14", "#2E3A44")}'''
h3_over = '''<div class="ov" id="link" style="left:250px;top:430px;width:580px;height:1000px;background:#0E0D0B;border-radius:70px;padding:16px;box-shadow:0 60px 120px -30px #000c">
<div style="width:100%;height:100%;background:#F4EFE4;border-radius:56px;padding:70px 34px;color:#16140F">
<div style="display:flex;align-items:center;gap:14px"><span style="width:64px;height:64px;border-radius:18px;background:#16140F;color:#E0AE58;display:grid;place-items:center;font:800 32px Outfit">Z</span>
<div><b style="font:800 32px Outfit">Barbearia do Zé</b><br><span style="display:inline-block;background:#E9E1D0;border-radius:999px;padding:8px 16px;font:700 18px Manrope;color:#6B6252">barbeariadoze.topete.com.br</span></div></div>
<p style="font:800 22px Manrope;letter-spacing:.12em;color:#A8752A;margin-top:40px">HOJE · HORÁRIOS LIVRES</p>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:16px">
<span style="background:#fff;border:2.5px solid #E6DDCB;border-radius:20px;padding:22px 0;text-align:center;font:800 32px Manrope;color:#B8AE9C;text-decoration:line-through">14:00</span>
<span id="h15" style="background:#16140F;color:#F4EFE4;border-radius:20px;padding:22px 0;text-align:center;font:800 32px Manrope">15:00</span>
<span style="background:#fff;border:2.5px solid #E6DDCB;border-radius:20px;padding:22px 0;text-align:center;font:800 32px Manrope">16:30</span>
<span style="background:#fff;border:2.5px solid #E6DDCB;border-radius:20px;padding:22px 0;text-align:center;font:800 32px Manrope">17:00</span></div>
<div style="margin-top:40px;background:#16140F;color:#fff;border-radius:24px;padding:26px 0;text-align:center;font:800 30px Manrope">Marcar 15:00</div>
<p style="margin-top:26px;text-align:center;font:700 22px Manrope;color:#6B6252">Sem ligar, sem esperar na porta.</p></div></div>'''
h3_js = """
function ep(t) {
  boca('cl-boca', 0.13 * 118, t, 'c'); boca('bb-boca', 14, t, 'b');
  // o cliente aparece no vidro batendo e acenando
  const kc = E((t - 1.5) / 0.35);
  $('porta-cli').setAttribute('transform', `translate(0,${260 * (1 - kc)})`);
  const bate = [1.6, 1.75, 1.9].some((a) => t > a && t < a + 0.1);
  $('maoD').setAttribute('transform', bate ? 'translate(0,-10)' : `rotate(${t > 2.0 && t < 4.3 ? Math.sin(t * 12) * 18 : 0} 898 800)`);
  $('maoE').setAttribute('transform', t > 6.9 && t < 8.2 ? 'translate(60,40)' : '');
  $('bafo').setAttribute('opacity', t > 7.0 && t < 8.6 ? 0.45 + 0.2 * Math.sin(t * 6) : 0);
  const pede = t > 6.95 && t < FIM;
  $('cl-arr').setAttribute('opacity', pede ? 1 : 0); $('cl-on').setAttribute('opacity', pede ? 0 : 1);
  [['n1', 4.5], ['n2', 4.8], ['n3', 5.1]].forEach(([id, a]) => { const k = E((t - a) / 0.2) * (1 - E((t - 6.9) / 0.3));
    $(id).setAttribute('opacity', k); const cx = +$(id).querySelector('circle').getAttribute('cx');
    $(id).setAttribute('transform', `translate(${cx} 1110) scale(${0.5 + 0.5 * k + 0.25 * pulo(t - a)}) translate(${-cx} -1110)`); });
  let ab = 14 + Math.abs(Math.sin(t * 8)) * 12;
  $('tes1').setAttribute('transform', `rotate(${ab})`); $('tes2').setAttribute('transform', `rotate(${-ab})`);
  $('bbnod').setAttribute('transform', t > 5.5 && t < 6.7 ? `rotate(${Math.sin((t - 5.5) * 8) * 5} 185 900)` : '');
  $('bb-tedio').setAttribute('opacity', t > 8.3 && t < 9.9 ? 1 : 0);
  // o link: da próxima, marca por aqui
  const kl = E((t - 9.8) / 0.45) * (1 - E((t - FIM + 0.25) / 0.25));
  $('link').style.opacity = cl(kl * 1.2); $('link').style.transform = `translateY(${(1 - kl) * 900}px)`;
  $('h15').style.transform = `scale(${1 + 0.12 * pulo(t - 10.9)})`;
}"""
h3_ev = """
[1.6, 1.75, 1.9].forEach((a) => EVENTOS.push({ t: a, som: 'tap', v: 0.8 }));
EVENTOS.push({ t: 4.5, som: 'pop', v: 0.45 }, { t: 4.8, som: 'pop', v: 0.45 }, { t: 5.1, som: 'pop', v: 0.5 });
EVENTOS.push({ t: 9.8, som: 'swish', v: 0.45 }, { t: 10.9, som: 'tap', v: 0.5 }, { t: 11.0, som: 'ding', v: 0.4 });"""
H.pagina("H3-to-na-porta", num=3, titulo_capa="Coisas que todo barbeiro <em>já ouviu</em>",
         mundo=h3_mundo, overlays=h3_over,
         falas=[(1.9, "Tem horário agora? Tô aqui na porta!"), (5.5, "Agora… agora não."), (7.0, "Mas é rapidinho! 🙏"), (10.2, "Da próxima, marca pelo link. 😉")],
         quem=["c", "b", "c", "b"], durs=[2.23, 1.21, 1.09, 1.49],
         D=15.0, CAPA=1.3, BADUM=8.55, FIM=12.3,
         CAM=[[0, .01, 540, 900, 1.0], [1.5, .45, 785, 780, 1.7], [4.3, .35, 660, 1230, 1.9], [4.75, .3, 800, 1230, 1.9],
              [5.05, .3, 940, 1240, 1.9], [5.45, .35, 200, 790, 2.1], [6.95, .3, 785, 790, 1.8], [8.2, .25, 185, 770, 2.6], [9.8, .4, 540, 900, 1.0]],
         TREME=[[1.6, .4, 6], [8.55, .3, 6]],
         fim=("O cliente vê o horário livre", "e marca sozinho."),
         ep_js=h3_js, ep_eventos=h3_ev)
