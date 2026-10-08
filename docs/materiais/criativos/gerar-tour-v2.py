"""Tour v2 da apresentação (02/10/2026): o app REAL no computador e no celular, com a voz do dono.

1920×1080. Notebook à esquerda, celular à direita, os dois no mesmo módulo. Os vídeos
são as gravações do app com dados fictícios (scripts/tour-demo, PR #111), em
scratchpad/tour-demo/final; as caixas de zoom/toque vêm do roteiro.json (px da viewport:
computador 1440×900, celular 390×664).

render(t) é ASSÍNCRONO: posiciona o currentTime de cada vídeo e espera o quadro antes da
foto (scratchpad/anim/gravar-tour.mjs). Onde o vídeo rola a página, usamos só o trecho
parado (antes/depois da rolagem): no meio da rolagem o screencast deixa "fantasma" de linhas.
"""
import json
import pathlib
import sys

AQUI = pathlib.Path(__file__).parent
sys.path.insert(0, str(AQUI.parent.parent / "marca"))
import mascote as M  # noqa: E402

SCRATCH = pathlib.Path("/private/tmp/claude-501/-Users-joaodamas-JPHub-barberapp/efc6a70c-2ea9-4820-892b-8bf4da122556/scratchpad")
VID = SCRATCH / "tour-demo/final"
ROT = json.loads((VID / "roteiro.json").read_text())
EV = {(v["aparelho"], v["modulo"]): v["eventos"] for v in ROT["videos"]}
FALA_DUR = [3.02, 4.97, 2.46, 3.95, 4.41, 3.2, 3.11, 3.11, 1.95, 4.32, 3.04]

# ---- cenas -------------------------------------------------------------------
# c/p: lista de trechos (módulo, ini_cena, fim_cena, v0, v1) — v0 == v1 congela o quadro.
# zc/zp: zooms (ini_cena, fim_cena, [x, y, w, h] em px da viewport).
H = 1.0  # quadro "parado" logo depois de a tela ficar pronta
CENAS = [
    dict(kicker="Topete", titulo="A sua barbearia, no celular e no computador", leg="", dur=4.2,
         c=[("vitrine", 0, 99, H, H)], p=[("vitrine", 0, 99, H, H)]),
    dict(kicker="1 · Agendamento", titulo="O cliente marca sozinho, pelo link", dur=7.4, foco="celular",
         leg="O cliente abre o link da barbearia, escolhe o serviço, o barbeiro e o horário. <em>Sozinho.</em>",
         c=[("agendar", 0, 0.25, 0.6, 0.6), ("agendar", 0.25, 7.1, 0.6, 21.6), ("agendar", 7.1, 99, 21.6, 21.6)],
         p=[("agendar", 0, 0.25, 0.6, 0.6), ("agendar", 0.25, 7.1, 0.6, 21.6), ("agendar", 7.1, 99, 21.6, 21.6)],
         toques="agendar"),
    dict(kicker="2 · Hoje", titulo="O dia do barbeiro, numa tela", dur=3.8,
         leg="Você abre o Topete e vê <em>o seu dia inteiro.</em>",
         c=[("hoje", 0, 99, H, H)], p=[("hoje", 0, 99, H, H)], zc=[(0.4, 99, [320, 110, 1070, 470])]),
    dict(kicker="3 · Encaixe", titulo="Encaixe com aprovação num toque", dur=5.1,
         leg="Horário cheio? Chega o pedido de encaixe. <em>Um toque, e está aprovado.</em>",
         c=[("encaixe", 0, 0.2, 1.2, 1.2), ("encaixe", 0.2, 4.9, 1.2, 5.9), ("encaixe", 4.9, 99, 5.9, 5.9)],
         p=[("encaixe", 0, 0.2, 1.2, 1.2), ("encaixe", 0.2, 4.9, 1.2, 5.9), ("encaixe", 4.9, 99, 5.9, 5.9)],
         zc=[(0.3, 99, [300, 400, 620, 200])], toques="encaixe"),
    dict(kicker="4 · Fechamento", titulo="Concluiu, cobrou, entrou no caixa", dur=6.8,
         leg="Terminou o corte? Adiciona o que ele fez a mais, escolhe como pagou, e <em>já entra no caixa.</em>",
         c=[("concluir-atendimento", 0, 0.2, 1.3, 1.3), ("concluir-atendimento", 0.2, 6.5, 1.3, 12.9), ("concluir-atendimento", 6.5, 99, 12.9, 12.9)],
         p=[("concluir-atendimento", 0, 0.2, 1.3, 1.3), ("concluir-atendimento", 0.2, 6.5, 1.3, 12.9), ("concluir-atendimento", 6.5, 99, 12.9, 12.9)],
         zc=[("v2.35", "v11.3", [440, 230, 560, 440])], toques="concluir-atendimento"),
    dict(kicker="5 · Mensalistas", titulo="Horário fixo e mensalidade em dia", dur=4.4,
         leg="Mensalistas com horário fixo, e <em>quem já pagou o mês.</em>",
         c=[("mensalistas", 0, 99, H, H)], p=[("mensalistas", 0, 99, H, H)], zc=[(0.4, 99, [320, 150, 1070, 600])]),
    dict(kicker="6 · Financeiro", titulo="Quanto sobrou, e quanto vai sobrar", dur=5.4,
         leg="No financeiro, <em>o resultado do mês</em> e a projeção do caixa.",
         c=[("dre", 0, 2.7, 0.8, 0.8), ("projecao", 2.7, 99, 0.8, 0.8)],
         p=[("dre", 0, 2.7, 0.8, 0.8), ("projecao", 2.7, 99, 0.8, 0.8)],
         zc=[(0.4, 2.6, [320, 200, 1070, 160]), (3.0, 99, [320, 380, 1070, 420])]),
    dict(kicker="7 · Clientes", titulo="Quem vem, quanto vem, quando sumiu", dur=4.3,
         leg="Seus clientes, com as visitas e <em>há quantos dias não aparecem.</em>",
         c=[("clientes", 0, 99, 6.0, 6.0)], p=[("clientes", 0, 99, 6.0, 6.0)], zc=[(0.4, 99, [300, 330, 1110, 430])]),
    dict(kicker="8 · Avisos", titulo="Avisos no celular e no Telegram", dur=3.4,
         leg="E os avisos <em>chegam no seu celular.</em>",
         c=[("avisos", 0, 99, H, H)], p=[("avisos", 0, 99, H, H)], zc=[(0.4, 99, [280, 150, 920, 330])]),
    dict(kicker="E mais", titulo="Serviços, combos, equipe, horários, loja e link", dur=5.8,
         leg="Serviços, combos, equipe, horários, loja e o seu link. <em>Tudo num lugar só.</em>",
         c=[(m, i * 1.16, (i + 1) * 1.16 if i < 4 else 99, H, H) for i, m in enumerate(["servicos", "equipe", "horarios", "loja", "meu-link"])],
         p=[(m, i * 1.16, (i + 1) * 1.16 if i < 4 else 99, H, H) for i, m in enumerate(["servicos", "equipe", "horarios", "loja", "meu-link"])]),
    dict(kicker="", titulo="", leg="", dur=4.8, cta=True, c=[("meu-link", 0, 99, H, H)], p=[("meu-link", 0, 99, H, H)]),
]


def mapa(trechos, ts):
    """tempo do vídeo em ts (tempo da cena)."""
    for mod, a, b, v0, v1 in trechos:
        if a <= ts < b:
            return mod, v0 if v1 == v0 else v0 + (ts - a) / (b - a) * (v1 - v0)
    mod, a, b, v0, v1 = trechos[-1]
    return mod, v1


def cena_do_video(trechos, v):
    """tempo da cena em que o vídeo passa por v (primeiro trecho que anda)."""
    for mod, a, b, v0, v1 in trechos:
        if v1 != v0 and min(v0, v1) <= v <= max(v0, v1):
            return a + (v - v0) / (v1 - v0) * (b - a)
    return None


# Converte zooms marcados em tempo de vídeo ("v2.35") e calcula os toques e os eventos de som.
inicio, T = [], 0.0
EVENTOS, FALAS = [], []
for k, c in enumerate(CENAS):
    inicio.append(T)
    for chave in ("zc", "zp"):
        zs = []
        for a, b, caixa in c.get(chave, []):
            if isinstance(a, str):
                a = cena_do_video(c["c"], float(a[1:]))
            if isinstance(b, str):
                b = cena_do_video(c["c"], float(b[1:]))
            zs.append([a, b, caixa])
        c[chave] = zs
    c["tq"] = []
    if c.get("toques"):
        for ap, chave in (("computador", "c"), ("celular", "p")):
            for e in EV[(ap, c["toques"])]:
                if e["tipo"] != "clique":
                    continue
                ts = cena_do_video(c[chave], e["t"])
                if ts is not None and ts < c["dur"] - 0.2:
                    c["tq"].append([ap, round(ts, 3), e["caixa"]])
                    if ap == "celular":
                        EVENTOS.append({"t": round(T + ts, 3), "som": "tap", "v": 0.45})
    if k > 0:
        EVENTOS.append({"t": round(T - 0.12, 3), "som": "whoosh", "v": 0.32})
    FALAS.append([round(T + 0.35, 3), f"fala{k}.wav", FALA_DUR[k]])
    T += c["dur"]
D = round(T, 3)
EVENTOS += [{"t": round(inicio[3] + 2.4, 3), "som": "ding", "v": 0.35},
            {"t": round(inicio[4] + 5.6, 3), "som": "ding", "v": 0.3},
            {"t": round(inicio[8] + 0.6, 3), "som": "notif", "v": 0.35},
            {"t": round(inicio[10] + 0.9, 3), "som": "boing", "v": 0.5},
            {"t": round(inicio[10] + 1.5, 3), "som": "brilho", "v": 0.4}]
EVENTOS.sort(key=lambda e: e["t"])

MODS = sorted({m for c in CENAS for ch in ("c", "p") for (m, *_r) in c[ch]})

base, topete = M.mascote().split("<!-- TOPETE")
MASC = (f'<svg viewBox="0 0 512 512" style="width:260px;height:260px;overflow:visible"><defs>{M.DEFS}</defs><g transform="translate(0,6)">'
        f'{base}<g id="cta-topete" style="transform-origin:256px 226px"><!-- TOPETE{topete}</g></g></svg>')

legendas = "".join(f'<div class="leg" id="leg{k}">{c["leg"]}</div>' for k, c in enumerate(CENAS) if c["leg"])
cenas_js = json.dumps([{k: v for k, v in c.items() if k not in ("leg",)} for c in CENAS], ensure_ascii=False)

HTML = f'''<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><link rel="stylesheet" href="base.css"><style>
html,body{{margin:0;width:1920px;height:1080px;overflow:hidden;background:#0E0D0B}}
body{{position:relative;font-family:Manrope;color:#F4EFE4;background:radial-gradient(ellipse at 45% 55%,#2A2017 0%,#14120E 55%,#0B0A08 100%)}}
.marca{{position:absolute;left:56px;top:44px;display:flex;align-items:center;gap:12px;font:700 40px Outfit;letter-spacing:-1px}}
.marca img{{width:52px;height:52px}}
#kicker{{position:absolute;left:0;right:0;top:36px;text-align:center;font:800 20px Manrope;letter-spacing:.16em;text-transform:uppercase;color:#E0AE58}}
#titulo{{position:absolute;left:300px;right:300px;top:66px;text-align:center;font:700 54px/1.05 Outfit;letter-spacing:-1.5px}}
.leg{{position:absolute;left:120px;right:120px;top:1004px;text-align:center;font:700 38px/1.15 Outfit;letter-spacing:-.5px;opacity:0}}
.leg em{{font-style:normal;color:#E0AE58}}
#note{{position:absolute;left:134px;top:149px;width:1264px;height:802px;border-radius:26px;background:#1C1A16;border:2px solid #3A342A;box-shadow:0 40px 90px -30px #000}}
#base{{position:absolute;left:30px;top:951px;width:1472px;height:30px;background:linear-gradient(#3A342A,#1C1A16);clip-path:polygon(4% 0,96% 0,100% 100%,0 100%);border-radius:0 0 18px 18px}}
.tela{{position:absolute;overflow:hidden;background:#F4EFE4}}
#tc{{left:150px;top:165px;width:1232px;height:770px;border-radius:10px}}
#cel{{position:absolute;left:1384px;top:286px;width:356px;height:584px;border-radius:56px;background:#0B0A08;border:2px solid #2E2A22;box-shadow:0 40px 80px -24px #000;transform-origin:50% 50%}}
#tp{{left:16px;top:16px;width:324px;height:552px;border-radius:42px}}
.zoom{{position:absolute;left:0;top:0;transform-origin:0 0}}
#zc{{width:1232px;height:770px}} #zp{{width:324px;height:552px}}
video{{position:absolute;left:0;top:0;width:100%;height:100%;object-fit:fill;display:none}}
.anel{{position:absolute;border-radius:50%;border:6px solid #E0AE58;opacity:0;pointer-events:none}}
.vela{{position:absolute;inset:0;background:#0E0D0B;opacity:0;pointer-events:none}}
#cta{{position:absolute;inset:0;background:radial-gradient(circle at 50% 42%,#2A2017,#0B0A08 70%);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;text-align:center;opacity:0}}
#cta .t1{{font:700 150px/0.9 Outfit;letter-spacing:-6px}} #cta .t1 span{{color:#E0AE58}}
#cta .t2{{font:700 46px Outfit;color:#E0AE58;letter-spacing:-1px}} #cta .t3{{font:700 30px Manrope;color:#CFC6B4}}
#cta .bt{{margin-top:18px;background:#F4EFE4;color:#0E0D0B;border-radius:999px;padding:24px 52px;font:800 32px Manrope}}
</style></head><body>
<div class="marca"><img src="../../marca/topete-mascote.svg">topete</div>
<div id="kicker"></div><div id="titulo"></div>
<div id="base"></div><div id="note"></div>
<div class="tela" id="tc"><div class="zoom" id="zc">{"".join(f'<video id="v-computador-{m}" src="file://{VID}/computador__{m}.mp4" muted preload="auto" playsinline></video>' for m in MODS)}<div id="anel-c" class="anel"></div></div><div class="vela" id="vela-c"></div></div>
<div id="cel"><div class="tela" id="tp"><div class="zoom" id="zp">{"".join(f'<video id="v-celular-{m}" src="file://{VID}/celular__{m}.mp4" muted preload="auto" playsinline></video>' for m in MODS)}<div id="anel-p" class="anel"></div></div><div class="vela" id="vela-p"></div></div></div>
{legendas}
<div id="cta">{MASC}<p class="t1">topete<span>.</span></p><p class="t2">Sistema para barbearias</p>
<p class="t3">Agenda online · encaixe · caixa · mensalistas · financeiro</p><span class="bt">Fale com a gente</span></div>
<script>
const CENAS = {cenas_js}, INICIO = {json.dumps(inicio)}, D = {D};
const EVENTOS = {json.dumps(EVENTOS)}, FALAS = {json.dumps(FALAS)};
const cl = (x) => Math.max(0, Math.min(1, x)), E = (x) => 1 - Math.pow(1 - cl(x), 3), EIO = (x) => {{ x = cl(x); return x < .5 ? 4*x*x*x : 1 - Math.pow(-2*x+2, 3)/2; }};
const $ = (id) => document.getElementById(id);
const VP = {{ computador: [1440, 900, 1232, 770], celular: [390, 664, 324, 552] }};
function mapa(tr, ts) {{ for (const [m, a, b, v0, v1] of tr) if (ts >= a && ts < b) return [m, v0 === v1 ? v0 : v0 + (ts - a) / (b - a) * (v1 - v0)]; const u = tr[tr.length - 1]; return [u[0], u[4]]; }}
function zoomDe(zs, ts, ap) {{
  const [vw, vh, sw, sh] = VP[ap], k = sw / vw;
  for (const [a, b, [x, y, w, h]] of zs) {{
    if (ts < a - 0.01 || ts > (b ?? 99)) continue;
    const zi = E((ts - a) / 0.7) * (1 - E((ts - (b ?? 99) + 0.6) / 0.6));
    const zf = Math.max(1, Math.min(2.3, sw / (w * k * 1.08), sh / (h * k * 1.08)));
    const z = 1 + (zf - 1) * EIO(zi);
    const cx = (x + w / 2) * k, cy = (y + h / 2) * k;
    let tx = sw / 2 - z * cx, ty = sh / 2 - z * cy;
    tx = Math.min(0, Math.max(sw - z * sw, tx)); ty = Math.min(0, Math.max(sh - z * sh, ty));
    return [z, tx, ty];
  }}
  return [1, 0, 0];
}}
const espera = (v, tempo) => new Promise((ok) => {{
  if (Math.abs(v.currentTime - tempo) < 0.004 && v.readyState >= 2) return ok();
  let feito = false; const fim = () => {{ if (!feito) {{ feito = true; ok(); }} }};
  v.addEventListener('seeked', () => {{ if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(() => fim()); setTimeout(fim, 120); }}, {{ once: true }});
  setTimeout(fim, 1500); v.currentTime = tempo;
}});
let ultimo = {{}};
async function render(t) {{
  let k = 0; while (k < CENAS.length - 1 && t >= INICIO[k + 1]) k++;
  const c = CENAS[k], ts = t - INICIO[k];
  $('kicker').textContent = c.kicker; $('titulo').textContent = c.titulo;
  const kt = k === 0 ? 1 : E(ts / 0.4); $('titulo').style.opacity = $('kicker').style.opacity = c.cta ? 0 : kt;
  $('titulo').style.transform = `translateY(${{(1 - kt) * 16}}px)`;
  const promessas = [];
  for (const [ap, ch, zid, zs] of [['computador', 'c', 'zc', c.zc], ['celular', 'p', 'zp', c.zp]]) {{
    const [m, vt] = mapa(c[ch], ts), id = `v-${{ap}}-${{m}}`;
    if (ultimo[ap] !== id) {{ if (ultimo[ap]) $(ultimo[ap]).style.display = 'none'; $(id).style.display = 'block'; ultimo[ap] = id; }}
    promessas.push(espera($(id), vt));
    const [z, tx, ty] = zoomDe(zs || [], ts, ap);
    $(zid).style.transform = `translate(${{tx}}px,${{ty}}px) scale(${{z}})`;
    // anel de toque
    const [vw, vh, sw, sh] = VP[ap], kk = sw / vw, anel = $(ap === 'computador' ? 'anel-c' : 'anel-p');
    let a = 0; for (const [ap2, tq, cx] of (c.tq || [])) {{ const d = ts - tq; if (ap2 === ap && d > -0.05 && d < 0.6) {{
      a = 1 - cl(d / 0.6); const r = (ap === 'celular' ? 34 : 30) * (1 + 0.6 * cl(d / 0.6));
      anel.style.left = ((cx.x + cx.w / 2) * kk - r) + 'px'; anel.style.top = ((cx.y + cx.h / 2) * kk - r) + 'px';
      anel.style.width = anel.style.height = 2 * r + 'px'; }} }}
    anel.style.opacity = a;
  }}
  // véu entre cenas (sai do escuro no começo, entra no fim)
  const vela = Math.max(1 - E(ts / 0.3), k < CENAS.length - 1 ? E((ts - c.dur + 0.25) / 0.25) : 0);
  $('vela-c').style.opacity = $('vela-p').style.opacity = k === 0 ? Math.max(0, E((ts - c.dur + 0.25) / 0.25)) : vela;
  // celular em destaque no agendamento
  const foco = c.foco === 'celular' ? EIO(ts / 0.6) * (1 - EIO((ts - c.dur + 0.6) / 0.6)) : 0;
  $('cel').style.transform = `translate(${{-120 * foco}}px, ${{-40 * foco}}px) scale(${{1 + 0.32 * foco}})`;
  $('tc').style.filter = $('note').style.filter = `brightness(${{1 - 0.35 * foco}})`;
  // legendas
  FALAS.forEach(([a, f, d], i) => {{ const l = $('leg' + i); if (!l) return; const kk2 = E((t - a + 0.15) / 0.25) * (1 - E((t - a - d - 0.35) / 0.25)); l.style.opacity = kk2; }});
  // final
  if (c.cta) {{
    const kc = E(ts / 0.5); $('cta').style.opacity = kc;
    const mx = ts - 0.9, mola = mx <= 0 ? 0 : Math.exp(-3.2 * mx);
    $('cta-topete').style.transform = `rotate(${{7 * mola * Math.sin(11 * mx)}}deg) scaleY(${{1 + 0.22 * mola * Math.sin(9 * mx + 1.2)}})`;
  }} else $('cta').style.opacity = 0;
  await Promise.all(promessas);
}}
window.render = render; window.DURACAO = D; window.EVENTOS = EVENTOS;
window.PRONTO = Promise.all([...document.querySelectorAll('video')].map((v) => v.readyState >= 2 ? 1 : new Promise((ok) => {{ v.addEventListener('loadeddata', ok, {{ once: true }}); setTimeout(ok, 20000); }})));
if (!navigator.webdriver) {{ const t0 = performance.now(); const loop = async () => {{ await render(((performance.now() - t0) / 1000) % D); requestAnimationFrame(loop); }}; requestAnimationFrame(loop); }}
</script></body></html>'''

(AQUI / "TOUR-v2.html").write_text(HTML)
print("ok TOUR-v2.html", D, "s ·", len(EVENTOS), "efeitos ·", len(FALAS), "falas")
print("inicios:", [round(x, 2) for x in inicio])
