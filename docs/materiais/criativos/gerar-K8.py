"""K8 · A pomada acabou — série "Sem Topete × Com Topete".

Cenário próprio: a estante da loja da barbearia. Sem Topete: o cliente pede a
pomada de sempre, a prateleira está vazia, ele vai embora — venda perdida. Com
Topete: a Loja mostra o aviso de produto abaixo do estoque mínimo e o "Dar
entrada" repõe antes de acabar.

Promessa conferida em web/src/app/painel/(dashboard)/loja/page.tsx: o aviso é um
cartão NA TELA da Loja (lowStock = stock < minStock, "N produto abaixo do estoque
mínimo" + nomes) e o botão "Dar entrada" abre "Dar entrada no estoque"
(components/entrada-de-estoque.tsx). Não é notificação — o texto não diz que é.
"""
import cartoon_base as B
import cartoon_pecas_k8a10 as P

# ---------------------------------------------------------------- cenário
TABUAS = "".join(f'<rect x="{x}" y="300" width="4" height="880" fill="#D6C7AA"/>' for x in range(60, 1080, 120))


def frasco(x, base, alto, cor, tampa="#16140F", larg=46):
    return (f'<rect x="{x}" y="{base - alto}" width="{larg}" height="{alto}" rx="10" fill="{cor}"/>'
            f'<rect x="{x + larg * 0.25}" y="{base - alto - 16}" width="{larg * 0.5}" height="18" rx="4" fill="{tampa}"/>'
            f'<rect x="{x + 6}" y="{base - alto * 0.62}" width="{larg - 12}" height="{alto * 0.3}" rx="4" fill="#F4EFE4" opacity=".85"/>')


def pote(i, x, base):
    return (f'<g id="pom{i}" opacity="0"><rect x="{x}" y="{base - 52}" width="66" height="52" rx="12" fill="#C9963F"/>'
            f'<rect x="{x - 4}" y="{base - 64}" width="74" height="18" rx="7" fill="#16140F"/>'
            f'<rect x="{x + 10}" y="{base - 38}" width="46" height="18" rx="4" fill="#F4EFE4"/></g>')


ESTANTE_X, ESTANTE_W = 330, 500
prat1, prat2, prat3 = 580, 790, 1000
estante = f'''<g id="estante">
<rect x="{ESTANTE_X - 20}" y="380" width="{ESTANTE_W + 40}" height="740" rx="12" fill="#6E4D1B"/>
<rect x="{ESTANTE_X}" y="400" width="{ESTANTE_W}" height="700" fill="#4A341F"/>
<rect x="{ESTANTE_X + 130}" y="330" width="240" height="64" rx="12" fill="#16140F"/>
<text x="{ESTANTE_X + 250}" y="374" text-anchor="middle" font-family="Outfit" font-weight="700" font-size="40" fill="#E0AE58">loja</text>
{"".join(f'<rect x="{ESTANTE_X}" y="{y}" width="{ESTANTE_W}" height="20" fill="#7A5733"/>' for y in (prat1, prat2, prat3))}
{"".join(frasco(ESTANTE_X + 30 + i * 118, prat1, 120, c) for i, c in enumerate(["#2F4858", "#5A6B4E", "#2F4858", "#8A5A3B"]))}
<g id="vazio"><rect x="{ESTANTE_X + 40}" y="{prat2 - 80}" width="{ESTANTE_W - 80}" height="76" rx="10" fill="none" stroke="#9C927E" stroke-width="5" stroke-dasharray="14 12"/>
<rect x="{ESTANTE_X + 170}" y="{prat2 + 26}" width="160" height="40" rx="6" fill="#F4EFE4"/>
<text x="{ESTANTE_X + 250}" y="{prat2 + 54}" text-anchor="middle" font-family="Manrope" font-weight="800" font-size="22" fill="#16140F">Pomada · R$ 45</text></g>
{"".join(pote(i, ESTANTE_X + 40 + i * 86, prat2) for i in range(5))}
{"".join(frasco(ESTANTE_X + 40 + i * 90, prat3, 80, c, larg=40) for i, c in enumerate(["#8A5A3B", "#8A5A3B", "#5A6B4E", "#8A5A3B", "#5A6B4E"]))}
</g>'''
pote_mao = '<g id="cp-pote" opacity="0"><rect x="290" y="1124" width="56" height="44" rx="10" fill="#C9963F"/><rect x="286" y="1114" width="64" height="16" rx="6" fill="#16140F"/></g>'
cenario = (P.parede("#E8DCC4") + TABUAS + estante
           + P.barbeiro_em_pe(cx=930, p="bb", s=0.5, tesoura=False)
           + P.cliente_em_pe(200, p="cp", camisa="#3F5E4A") + pote_mao)

overlays = '''<div class="ov cartao" id="k8-fala" style="left:70px;top:640px;border-radius:30px 30px 30px 8px">Tem a pomada? 🙂</div>
<div class="ov" id="k8-esgot" style="left:430px;top:735px;border:6px solid #C2410C;color:#C2410C;border-radius:12px;padding:6px 18px;font:800 40px Manrope;letter-spacing:.08em;background:#F4EFE4">ESGOTADO</div>
<div class="ov cartao" id="k8-perdida" style="left:230px;top:1300px;border-left:12px solid #C2410C">Venda perdida · <b>− R$ 45</b></div>
<div class="ov cartao" id="k8-vendeu" style="left:250px;top:1300px;background:#047857;color:#fff">✓ Pomada vendida · <b>+ R$ 45</b></div>'''

tela = '''<div class="tl">
<p class="rot">Loja</p>
<div id="k8-alerta" style="margin-top:16px;display:flex;gap:12px;align-items:flex-start;background:#FDF0EC;border:2.5px solid #E7A58E;border-radius:22px;padding:18px 20px">
<span style="font:800 30px Manrope;color:#C2410C">⚠</span><div><b style="font:800 24px/1.3 Manrope">1 produto abaixo do estoque mínimo</b><br><span style="font:600 22px Manrope;color:#6B6252">Pomada modeladora</span></div></div>
<div id="k8-lista">
<div class="lin" style="flex-wrap:wrap;gap:10px"><div><b>Pomada modeladora</b><br><span id="k8-qtd" style="font:700 22px Manrope;color:#C2410C">2 un · mín. 5</span></div>
<span id="k8-btn" style="background:#16140F;color:#F4EFE4;border-radius:14px;padding:12px 16px;font:800 20px Manrope">Dar entrada</span></div>
<div class="lin"><div><b>Shampoo</b><br><span style="font:700 22px Manrope;color:#6B6252">8 un · mín. 3</span></div></div>
<div class="lin"><div><b>Óleo de barba</b><br><span style="font:700 22px Manrope;color:#6B6252">6 un · mín. 2</span></div></div></div>
<div id="k8-ok" style="margin-top:22px;display:inline-block;background:#047857;color:#fff;border-radius:999px;padding:14px 26px;font:800 26px Manrope">✓ Estoque reposto</div>
</div>
<div id="k8-modal" style="position:absolute;left:0;right:0;bottom:0;background:#fff;border-radius:40px 40px 0 0;padding:34px 34px 60px;box-shadow:0 -20px 50px -20px #0005">
<b style="font:800 32px Outfit">Dar entrada no estoque</b><p style="font:600 22px Manrope;color:#6B6252;margin-top:4px">Pomada modeladora</p>
<p class="rot" style="margin-top:22px">Quantidade</p><div style="margin-top:8px;border:2.5px solid #C9963F;border-radius:18px;padding:16px 20px;font:800 34px Manrope" id="k8-num">&nbsp;</div>
<p class="rot" style="margin-top:18px">Custo unitário</p><div style="margin-top:8px;border:2.5px solid #E6DDCB;border-radius:18px;padding:16px 20px;font:800 30px Manrope">R$ 18</div>
<div id="k8-conf" style="margin-top:26px;background:#16140F;color:#F4EFE4;border-radius:22px;padding:24px 0;text-align:center;font:800 28px Manrope">Confirmar</div></div>
<div id="k8-toque" style="position:absolute;width:84px;height:84px;margin:-42px 0 0 -42px;border-radius:50%;background:#E0AE58;opacity:0"></div>'''

ep_js = """
const TOQUES = [[9.6, 133, 390], [10.9, 234, 873]];
function ep(t) {
  const antes = t < VIRA + 0.3;
  // cliente: pede, fica triste, vai embora; depois volta com o pote
  const sai = E((t - 4.7) / 1.1), volta = E((t - 13.8) / 0.9);
  const dx = antes ? -480 * sai : -480 * (1 - volta);
  const passo = (antes ? (t > 4.7 && t < 5.8) : (t > 13.8 && t < 14.7)) ? Math.abs(Math.sin(t * 14)) * -10 : 0;
  $('cp').setAttribute('transform', `translate(${dx},${passo})`);
  const triste = antes && t > 2.9;
  $('cp-feliz').setAttribute('opacity', triste ? 0 : 1); $('cp-triste').setAttribute('opacity', triste ? 1 : 0);
  $('cp-pote').setAttribute('opacity', !antes && t > 13.8 ? 1 : 0); $('cp-pote').setAttribute('transform', `translate(${dx},${passo})`);
  // braço do cliente aponta para a estante enquanto pergunta
  $('cp-bd').setAttribute('transform', `rotate(${antes && t < 4.6 ? -70 * E((t - 0.6) / 0.4) : 0} 270 970)`);
  // barbeiro: aponta para o vazio e balança a cabeça; depois sorri parado
  $('bb-cab').setAttribute('transform', antes && t > 2.4 && t < 4.6 ? `rotate(${Math.sin(t * 9) * 6} 930 905)` : '');
  $('bb-bt').setAttribute('transform', `rotate(${antes ? 10 : 0} 870 960)`);
  // estante: vazio antes, potes chegando depois do celular
  $('vazio').setAttribute('opacity', antes ? 1 : 1 - E((t - 13.5) / 0.3));
  for (let i = 0; i < 5; i++) { const a = 13.5 + i * 0.12, k = E((t - a) / 0.3);
    $('pom' + i).setAttribute('opacity', t < a ? 0 : k); $('pom' + i).setAttribute('transform', `translate(0,${(1 - k) * -40})`); }
  // carimbo e balões
  const kf = E((t - 0.8) / 0.3) * (1 - E((t - 3.2) / 0.3)); $('k8-fala').style.opacity = kf; $('k8-fala').style.transform = `scale(${0.7 + 0.3 * kf + 0.1 * pulo(t - 0.8)})`;
  const ke = E((t - 2.4) / 0.2) * (1 - E((t - VIRA) / 0.3)); $('k8-esgot').style.opacity = ke; $('k8-esgot').style.transform = `rotate(-8deg) scale(${1.6 - 0.6 * E((t - 2.4) / 0.2)})`;
  const kp = E((t - 4.9) / 0.3) * (1 - E((t - VIRA) / 0.3)); $('k8-perdida').style.opacity = kp; $('k8-perdida').style.transform = `scale(${0.7 + 0.3 * kp + 0.1 * pulo(t - 4.9)})`;
  const kv = E((t - 14.8) / 0.3) * (1 - E((t - CTA + 0.3) / 0.3)); $('k8-vendeu').style.opacity = kv; $('k8-vendeu').style.transform = `scale(${0.7 + 0.3 * kv + 0.1 * pulo(t - 14.8)})`;
  // tela da Loja
  const ka = E((t - 8.1) / 0.35) * (1 - E((t - 11.3) / 0.3));
  $('k8-alerta').style.opacity = ka; $('k8-alerta').style.transform = `scale(${0.85 + 0.15 * E((t - 8.1) / 0.35) + 0.08 * pulo(t - 8.1)})`;
  $('k8-alerta').style.height = t > 11.3 ? `${(1 - E((t - 11.3) / 0.3)) * 110}px` : ''; $('k8-alerta').style.overflow = 'hidden';
  $('k8-lista').style.opacity = E((t - 8.5) / 0.35);
  const mo = E((t - 9.8) / 0.35) * (1 - E((t - 11.05) / 0.3));
  $('k8-modal').style.transform = `translateY(${(1 - mo) * 110}%)`;
  $('k8-num').textContent = t < 10.15 ? '\\u00a0' : t < 10.4 ? '1' : '12';
  const rep = t > 11.15;
  $('k8-qtd').textContent = rep ? '14 un · mín. 5' : '2 un · mín. 5'; $('k8-qtd').style.color = rep ? '#047857' : '#C2410C';
  const ko = E((t - 11.6) / 0.35); $('k8-ok').style.opacity = ko; $('k8-ok').style.transform = `scale(${0.7 + 0.3 * ko + 0.15 * pulo(t - 11.6)})`;
  let tq = 0, tx = 0, ty = 0; TOQUES.forEach(([a, x, y]) => { const d = t - a; if (d > -0.05 && d < 0.45) { tq = 1 - cl(d / 0.45); tx = x; ty = y; } });
  $('k8-toque').style.opacity = tq * 0.55; $('k8-toque').style.left = tx + 'px'; $('k8-toque').style.top = ty + 'px';
}"""
ep_ev = """
EVENTOS.push({ t: 0.8, som: 'pop', v: 0.45 }, { t: 2.4, som: 'snip', v: 0.5 }, { t: 2.45, som: 'buzz', v: 0.3 });
EVENTOS.push({ t: 4.7, som: 'swish', v: 0.4 }, { t: 4.9, som: 'buzz', v: 0.45 }, { t: 4.92, som: 'pop', v: 0.35 });
EVENTOS.push({ t: 8.1, som: 'ding', v: 0.45 }, { t: 9.6, som: 'tap', v: 0.6 }, { t: 9.8, som: 'swish', v: 0.35 }, { t: 10.15, som: 'tap', v: 0.4 }, { t: 10.4, som: 'tap', v: 0.4 });
EVENTOS.push({ t: 10.9, som: 'tap', v: 0.6 }, { t: 11.15, som: 'pop', v: 0.45 }, { t: 11.6, som: 'ding', v: 0.45 });
for (let i = 0; i < 5; i++) EVENTOS.push({ t: 13.5 + i * 0.12, som: 'pop', v: 0.3 });
EVENTOS.push({ t: 13.8, som: 'swish', v: 0.35 }, { t: 14.8, som: 'brilho', v: 0.35 });"""

B.pagina("K8-pomada", cenario=cenario, overlays=overlays, tela_fone=tela,
         falas=[(0.5, "O cliente quer levar <em>a pomada de sempre…</em>"),
                (3.1, "e a prateleira está vazia. <em>Venda perdida.</em>"),
                (7.6, "Com o Topete, a loja avisa quando um produto fica <em>abaixo do estoque mínimo.</em>"),
                (14.0, "Você <em>repõe antes de acabar.</em>"),
                (17.6, "")],
         durs=[2.17, 2.28, 4.16, 1.81, 2.09], D=21.5, VIRA=6.2, FONE=[7.4, 13.4], CTA=17.0,
         cta=("Sua loja", "sempre abastecida.", ["Aviso de estoque mínimo", "Entrada de estoque"]),
         ep_js=ep_js, ep_eventos=ep_ev)
