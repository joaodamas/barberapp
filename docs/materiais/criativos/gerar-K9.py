"""K9 · Cancelou e ninguém soube — série "Sem Topete × Com Topete".

Cenário próprio: a cadeira vazia às 17h. Sem Topete: o cliente avisou numa
mensagem que se perdeu no meio de dezenas; o barbeiro espera e o horário se
perde. Com Topete: o cliente cancela pelo link, chega no celular "❌ Cliente
cancelou · O horário ficou livre", o horário aparece livre no link e outro
cliente marca.

Promessas conferidas: functions/src/push/gatilhos.ts (título "❌ Cliente
cancelou", corpo "...O horário ficou livre.") e telegram/gatilhos.ts (só o
cancelamento do cliente avisa); functions/src/booking.ts — `cancelled_by_client`
não está em OCUPAM_SLOT, então o horário volta a ser oferecido.
"""
import cartoon_base as B
import cartoon_pecas_k8a10 as P

janela = '''<g><rect x="150" y="430" width="300" height="330" rx="18" fill="#F2B66B" stroke="#A8752A" stroke-width="14"/>
<circle cx="380" cy="700" r="60" fill="#F7D08A"/><path d="M300 430 L300 760 M150 595 L450 595" stroke="#A8752A" stroke-width="10"/></g>'''
cenario = (P.parede("#E4D8C4") + P.poste(40) + janela + P.relogio(880, 520, r=105, p="rel")
           + '<rect x="740" y="660" width="280" height="20" rx="6" fill="#6E4D1B"/>'
           + P.cadeira(380)
           + '<g id="capa-vazia"><rect x="290" y="930" width="180" height="300" rx="40" fill="#2A2722"/><rect x="306" y="946" width="148" height="268" rx="30" fill="none" stroke="#C9963F" stroke-width="4" stroke-dasharray="10 8"/>'
           '<rect x="232" y="1150" width="70" height="26" rx="12" fill="#16140F"/><rect x="458" y="1150" width="70" height="26" rx="12" fill="#16140F"/></g>'
           + P.cliente_sentado(380, p="cli", cabelo="#3A2A1C")
           + P.barbeiro_em_pe(660, p="bb"))

CONVERSAS = [("Promo de pomada 🔥", "Fornecedor"), ("Bom dia!! 🙌", "Grupo da família"), ("Tem horário sábado?", "Marina"),
             ("Não vou conseguir ir hoje 😕", "Thiago"), ("Foto do corte ✂️", "Caio"), ("Chegou o boleto", "Contador"),
             ("Kkkkk", "Grupo do futebol"), ("Amanhã 10h?", "Breno"), ("Áudio 0:47", "Murilo")]
T_CONV = [0.9, 1.4, 1.9, 2.5, 3.6, 4.0, 4.4, 4.8, 5.2]
linhas = "".join(f'<div class="ov" id="cv{i}" style="left:0;right:0;display:flex;gap:14px;align-items:center;padding:12px 18px;background:#fff;border-bottom:2px solid #EEE7DA">'
                 f'<span style="width:48px;height:48px;border-radius:50%;background:#D9D1C1;flex:none"></span><div style="font:600 22px/1.25 Manrope;color:#16140F;min-width:0">'
                 f'<b>{q}</b><br><span style="color:#6B6252">{m}</span></div></div>' for i, (m, q) in enumerate(CONVERSAS))
overlays = f'''<div class="ov" id="k9-chat" style="left:90px;top:330px;width:460px;height:520px;background:#F4EFE4;border-radius:34px;overflow:hidden;box-shadow:0 30px 60px -24px #000a">
<div style="background:#16140F;color:#F4EFE4;padding:20px 22px;font:800 26px Manrope;display:flex;justify-content:space-between">Conversas<span id="k9-nlidas" style="background:#E5484D;border-radius:999px;padding:2px 14px;font-size:22px">48</span></div>
<div style="position:relative;height:440px">{linhas}</div></div>
<div class="ov cartao" id="k9-perdido" style="left:200px;top:1300px;border-left:12px solid #C2410C">Horário das 17:00 · <b>perdido</b></div>
<div class="ov cartao" id="k9-ok" style="left:250px;top:1300px;background:#047857;color:#fff">✓ 17:00 · Vítor marcou</div>'''

tela = f'''<div class="tl" id="k9-A" style="background:linear-gradient(180deg,#2A2017,#0E0D0B);color:#F4EFE4;padding-top:120px">
<p style="text-align:center;font:700 120px/1 Outfit;letter-spacing:-4px">16:42</p><p style="text-align:center;font:600 26px Manrope;opacity:.8;margin-top:6px">sábado, 4 de outubro</p>
<div id="k9-push" style="margin-top:60px;background:#F4EFE4;color:#16140F;border-radius:28px;padding:22px;display:flex;gap:16px;align-items:flex-start">
<img src="{B.ICONE}" style="width:62px;height:62px;border-radius:16px"><div style="font:600 24px/1.35 Manrope"><b style="font:800 26px Manrope">❌ Cliente cancelou</b><br>Thiago · hoje às 17:00<br><span style="color:#047857;font-weight:800">O horário ficou livre.</span></div></div></div>
<div class="tl" id="k9-B" style="opacity:0">
<div style="display:flex;align-items:center;gap:14px"><span style="width:64px;height:64px;border-radius:18px;background:#16140F;color:#E0AE58;display:grid;place-items:center;font:800 32px Outfit">Z</span>
<div><b style="font:800 32px Outfit;letter-spacing:-.5px">Barbearia do Zé</b><br><span style="display:inline-block;background:#E9E1D0;border-radius:999px;padding:6px 16px;font:700 18px Manrope;color:#6B6252">barbeariadoze.topete.com.br</span></div></div>
<p class="rot" style="margin-top:34px">Hoje · Corte</p>
<div style="margin-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:12px">
<span class="lin" style="margin:0;color:#B8AF9E;text-decoration:line-through">15:00</span><span class="lin" style="margin:0;color:#B8AF9E;text-decoration:line-through">16:00</span>
<span class="lin" id="k9-17" style="margin:0;border-color:#C9963F;background:#FBF3E4">17:00 <small style="font:800 16px Manrope;color:#A8752A">LIVRE</small></span><span class="lin" style="margin:0;color:#B8AF9E;text-decoration:line-through">18:00</span></div>
<div id="k9-conf" style="margin-top:40px;text-align:center;opacity:0"><div style="width:130px;height:130px;margin:0 auto;border-radius:50%;background:#047857;color:#fff;display:grid;place-items:center;font:800 72px Manrope">✓</div>
<b style="display:block;margin-top:16px;font:800 38px/1.1 Outfit">Horário confirmado</b><span style="font:700 24px/1.4 Manrope;color:#6B6252">Vítor · hoje às 17:00 · Corte</span></div></div>
<div id="k9-toque" style="position:absolute;width:84px;height:84px;margin:-42px 0 0 -42px;border-radius:50%;background:#E0AE58;opacity:0"></div>'''

ep_js = f"""
const TC = {T_CONV};
function ep(t) {{
  const antes = t < VIRA + 0.3;
  // relógio: 17:00 → 17:25 correndo antes; volta às 17:00 com o cliente novo
  const min = antes ? 25 * E((t - 1.0) / 6) : (t < 14.8 ? 18 : 0 + (t - 14.8) * 0.3);
  $('rel-m').setAttribute('transform', `rotate(${{min * 6}})`); $('rel-h').setAttribute('transform', `rotate(${{150 + min * 0.5}})`);
  // conversas empilhando; a do Thiago afunda e some
  const chat = E((t - 0.6) / 0.35) * (1 - E((t - VIRA) / 0.3));
  $('k9-chat').style.opacity = chat; $('k9-chat').style.transform = `scale(${{0.8 + 0.2 * chat}})`;
  TC.forEach((a, i) => {{ const el = $('cv' + i), k = E((t - a) / 0.25); const acima = TC.filter((x) => t >= x && x > a).length;
    el.style.top = (acima * 78) + 'px'; el.style.opacity = t < a ? 0 : k; el.style.background = (i === 3 && t > 2.5 && t < 3.6) ? '#FFF3D6' : '#fff'; }});
  $('k9-nlidas').textContent = 40 + TC.filter((x) => t >= x).length;
  const kp = E((t - 6.2) / 0.3) * (1 - E((t - VIRA) / 0.3)); $('k9-perdido').style.opacity = kp; $('k9-perdido').style.transform = `scale(${{0.7 + 0.3 * kp + 0.1 * pulo(t - 6.2)}})`;
  // cadeira vazia antes; cliente sentado depois do celular
  const senta = !antes && t > 14.8; const ks = E((t - 14.8) / 0.4);
  $('cli').setAttribute('opacity', senta ? ks : 0); $('capa-vazia').setAttribute('opacity', senta ? 1 - ks : 1);
  // barbeiro: esperando (tesoura parada, olha o relógio, pé batendo); depois corta
  const corta = senta; const sn = corta ? Math.abs(Math.sin(t * 9)) * 24 : 3;
  $('bb-l1').setAttribute('transform', `rotate(${{sn}})`); $('bb-l2').setAttribute('transform', `rotate(${{-sn}})`);
  $('bb-bt').setAttribute('transform', `rotate(${{corta ? Math.sin(t * 3) * 3 : -70}} 600 960)`);
  $('bb-cab').setAttribute('transform', antes ? `rotate(${{t > 1.2 ? 12 * E((t - 1.2) / 0.5) + (t > 4.5 ? Math.sin(t * 2) * 3 : 0) : 0}} 660 905)` : '');
  $('bb').setAttribute('transform', antes && t > 2 ? `translate(0,${{-Math.abs(Math.sin(t * 6)) * 4}})` : '');
  const kv = E((t - 15.4) / 0.3) * (1 - E((t - CTA + 0.3) / 0.3)); $('k9-ok').style.opacity = kv; $('k9-ok').style.transform = `scale(${{0.7 + 0.3 * kv + 0.1 * pulo(t - 15.4)}})`;
  // celular: aviso de cancelamento → link com o horário livre → outro cliente marca
  const kpush = E((t - 9.4) / 0.35); $('k9-push').style.opacity = kpush; $('k9-push').style.transform = `translateY(${{(1 - kpush) * -60}}px) scale(${{1 + 0.05 * pulo(t - 9.4)}})`;
  const kb = E((t - 11.8) / 0.4); $('k9-A').style.opacity = 1 - kb; $('k9-B').style.opacity = kb;
  $('k9-17').style.transform = `scale(${{1 + 0.08 * pulo(t - 12.2)}})`;
  const kc = E((t - 13.1) / 0.35); $('k9-conf').style.opacity = kc;
  const tq = t > 12.65 && t < 13.1 ? 1 - cl((t - 12.65) / 0.45) : 0;
  $('k9-toque').style.opacity = tq * 0.55; $('k9-toque').style.left = '129px'; $('k9-toque').style.top = '353px';
}}"""
ep_ev = """
TC.forEach((a) => EVENTOS.push({ t: a, som: 'ding', v: 0.3 }));
for (let x = 0.4; x < 7.4; x += Math.max(0.18, 0.5 - x * 0.04)) EVENTOS.push({ t: x, som: 'tick', v: 0.35 });
EVENTOS.push({ t: 6.2, som: 'buzz', v: 0.45 }, { t: 6.22, som: 'pop', v: 0.35 });
EVENTOS.push({ t: 9.4, som: 'notif', v: 0.6 }, { t: 11.8, som: 'swish', v: 0.3 }, { t: 12.65, som: 'tap', v: 0.6 }, { t: 13.1, som: 'pop', v: 0.5 });
EVENTOS.push({ t: 14.85, som: 'swish', v: 0.35 }, { t: 15.0, som: 'snip', v: 0.5 }, { t: 15.35, som: 'snip', v: 0.5 }, { t: 15.4, som: 'brilho', v: 0.35 });"""

B.pagina("K9-cancelou", cenario=cenario, overlays=overlays, tela_fone=tela,
         falas=[(0.5, "Cinco da tarde. E a cadeira, <em>vazia…</em>"),
                (3.3, "O cliente avisou que não vinha, numa mensagem <em>perdida no meio de tantas.</em>"),
                (9.0, "Com o Topete, o cliente cancela pelo link, e chega no seu celular: <em>o horário ficou livre.</em>"),
                (15.2, "E outro cliente <em>já pode marcar.</em>"),
                (18.4, "")],
         durs=[2.41, 3.9, 5.29, 1.83, 2.02], D=22.2, VIRA=7.8, FONE=[8.8, 14.8], CTA=17.8,
         cta=("A sua agenda", "sempre em dia.", ["Aviso de cancelamento", "Horário livre na hora"]),
         ep_js=ep_js, ep_eventos=ep_ev)
