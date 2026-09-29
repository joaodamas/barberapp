"""Criativos de lançamento do Topete. Gera um HTML por peça; render.sh vira PNG."""
import pathlib
AQUI = pathlib.Path(__file__).parent
M = "../../marca/topete-mascote.svg"
MARCA = f'<div class="marca"><img src="../../marca/topete-icone-app.svg" alt="">topete</div>'
def pagina(nome, w, h, corpo):
    (AQUI/f"{nome}.html").write_text(f'''<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><link rel="stylesheet" href="base.css"></head>
<body style="width:{w}px;height:{h}px">{corpo}<div class="poste"></div></body></html>''')

# 1 · Lançamento
pagina("01-lancamento", 1080, 1350, f'''<div class="glow" style="width:900px;height:900px;right:-260px;top:120px"></div>
<img src="{M}" style="position:absolute;right:-40px;top:250px;width:760px">
<div class="peca"><div class="topo">{MARCA}<span class="tag">Chegou</span></div>
<div style="max-width:560px"><h1 style="font-size:118px">Agenda cheia.<br><em>Cadeira girando.</em></h1>
<p class="sub" style="margin-top:34px">O sistema da barbearia que marca, organiza e fecha o mês pra você.</p></div>
<div class="rodape"><span>Agendamento · Mensalistas · Caixa</span><b>@usetopete</b></div></div>''')

# 2 · A dor
bolhas = "".join(f'''<div style="align-self:{'flex-start' if i%2==0 else 'flex-end'};background:{'#1F1C17' if i%2==0 else '#2B2518'};border-radius:30px;padding:24px 32px;font-size:34px;font-weight:600;max-width:640px;opacity:{0.45+i*0.18:.2f}">{t}<span style="display:block;font-size:20px;color:#8A8170;margin-top:6px">{hr}</span></div>'''
    for i,(t,hr) in enumerate([("Tem horário sábado?","08:12"),("E amanhã cedo, tem?","11:47"),("Consegue me encaixar hoje?","14:05"),("Tem horário sábado??","19:38")]))
pagina("02-a-dor", 1080, 1350, f'''<div class="peca"><div class="topo">{MARCA}<span class="tag">Parece com você?</span></div>
<div style="display:flex;flex-direction:column;gap:22px">{bolhas}</div>
<div><h1 style="font-size:78px">Quantas vezes você parou o corte <em>pra responder isso?</em></h1>
<p class="sub" style="margin-top:24px">Com o Topete, o cliente vê os horários livres e marca sozinho, pelo link da sua barbearia.</p></div></div>''')

# 3 · Encaixe
horas = [("09:00",""),("09:30","oc"),("10:00","oc"),("10:30",""),("11:00","enc"),("11:30",""),("14:00","oc"),("14:30",""),("15:00","oc")]
grade = "".join(f'''<div style="border-radius:22px;padding:28px 0;text-align:center;font-family:Outfit;font-size:40px;
{'background:linear-gradient(135deg,#FFE3A3,#E0AE58 45%,#A8752A);color:#0E0D0B' if k=='enc' else ('background:#1F1C17;color:#5C554A;text-decoration:line-through' if k=='oc' else 'background:#16140F;border:2px solid #2E2A22')}">{h}{'<span style="display:block;font-family:Manrope;font-size:20px;font-weight:800;margin-top:4px">ENCAIXE</span>' if k=='enc' else ''}</div>''' for h,k in horas)
pagina("03-encaixe", 1080, 1350, f'''<div class="peca"><div class="topo">{MARCA}<span class="tag">Encaixe</span></div>
<h1 style="font-size:96px">Horário ocupado não é <em>cliente perdido.</em></h1>
<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:18px">{grade}</div>
<p class="sub">O horário cheio vira encaixe: o cliente pede, o Topete mostra se cabe, e você aprova com um toque.</p></div>''')

# 4 · Mensalistas
pagina("04-mensalistas", 1080, 1350, f'''<div class="glow" style="width:800px;height:800px;left:-200px;top:260px"></div>
<div class="peca"><div class="topo">{MARCA}<span class="tag">Mensalistas</span></div>
<div><p style="font-family:Outfit;font-size:300px;line-height:.85;letter-spacing:-12px"><em style="font-style:normal;background:linear-gradient(135deg,#FFE3A3,#E0AE58 45%,#A8752A);-webkit-background-clip:text;color:transparent">40</em></p>
<h1 style="font-size:84px;margin-top:10px">mensalistas =<br>R$ 5.960 garantidos <em>todo mês.</em></h1></div>
<div><p class="sub">Crie seu clube de assinatura, veja quem pagou e quem está em aberto, e deixe o mensalista marcar primeiro.</p>
<p style="margin-top:22px;font-size:20px;color:#6E675B">Exemplo com plano de R$ 149/mês.</p></div></div>''')

# 5 · Fechamento do mês
linhas = [("Atendimentos","R$ 18.450",""),("Mensalidades","R$ 5.960",""),("Loja","R$ 1.320",""),("Maquininha","− R$ 512","n"),("Comissões","− R$ 9.870","n"),("Despesas","− R$ 6.200","n")]
tab = "".join(f'<div style="display:flex;justify-content:space-between;padding:18px 0;border-bottom:1.5px solid #2E2A22;font-size:32px"><span style="color:#CFC6B4">{a}</span><b style="font-family:Outfit;color:{"#9C927E" if c else "#F4EFE4"}">{b}</b></div>' for a,b,c in linhas)
pagina("05-fechamento", 1080, 1350, f'''<div class="peca"><div class="topo">{MARCA}<span class="tag">Financeiro</span></div>
<h1 style="font-size:104px">Quanto sobrou <em>este mês?</em></h1>
<div class="cartao">{tab}<div style="display:flex;justify-content:space-between;padding-top:24px;font-size:38px;font-weight:800"><span>Sobrou</span><b style="font-family:Outfit;font-size:56px;color:#E0AE58">R$ 9.148</b></div></div>
<p class="sub">Cada corte concluído já entra no caixa, com comissão e taxa calculadas. Sem caderno, sem planilha.</p></div>''')

# 6 · Sua marca
fone = '''<div style="width:430px;border-radius:64px;background:#000;padding:16px;box-shadow:0 40px 90px -30px #E0AE5866">
<div style="background:#F7F6F2;border-radius:50px;overflow:hidden;color:#16140F">
<div style="background:#23392F;color:#fff;padding:34px 26px 22px;display:flex;gap:14px;align-items:center"><span style="width:52px;height:52px;border-radius:14px;background:#C8A15A;color:#23392F;display:grid;place-items:center;font-weight:800;font-size:22px">BZ</span><div><b style="font-size:24px;display:block">Barbearia do Zé</b><span style="font-size:15px;opacity:.75">barbeariadoze.topete.com.br</span></div></div>
<div style="padding:22px;display:grid;gap:14px;font-size:20px">
<div style="border:2px solid #23392F;background:#E6EEE9;border-radius:18px;padding:16px;display:flex;justify-content:space-between"><b>Corte + barba</b><b>R$ 90</b></div>
<div style="border:1.5px solid #E3DED3;background:#fff;border-radius:18px;padding:16px;display:flex;justify-content:space-between"><b>Corte</b><b>R$ 50</b></div>
<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;font-weight:800;text-align:center">
<span style="border:1.5px solid #E3DED3;border-radius:12px;padding:12px 0;background:#fff">09:00</span><span style="border-radius:12px;padding:12px 0;background:#C8A15A">10:00</span><span style="border:1.5px dashed #8F6B22;border-radius:12px;padding:12px 0;background:#FBF3E4;color:#8F6B22">11:00</span></div>
<div style="background:#23392F;color:#fff;border-radius:18px;padding:18px;text-align:center;font-weight:800">Confirmar reserva</div></div></div></div>'''
pagina("06-sua-marca", 1080, 1350, f'''<div class="peca"><div class="topo">{MARCA}<span class="tag">Sua marca</span></div>
<div style="display:flex;gap:40px;align-items:center"><div style="flex:1"><h1 style="font-size:84px">O cliente vê a sua barbearia.<br><em>Não a gente.</em></h1>
<p class="sub" style="margin-top:28px;font-size:28px">Seu endereço, seu logo, suas cores. Instala no celular como app.</p></div>{fone}</div>
<div class="rodape"><span>suabarbearia.topete.com.br</span><b>@usetopete</b></div></div>''')

# 7 · Fundadores
pagina("07-fundadores", 1080, 1350, f'''<div class="glow" style="width:900px;height:900px;right:-300px;bottom:-200px"></div>
<img src="{M}" style="position:absolute;right:-60px;bottom:40px;width:520px;opacity:.95">
<div class="peca"><div class="topo">{MARCA}<span class="tag">Vagas limitadas</span></div>
<div><p class="tag" style="font-size:24px">Barbearias fundadoras</p>
<h1 style="font-size:124px;margin-top:14px"><em>20</em> vagas.<br>30% off<br><em>pra sempre.</em></h1></div>
<div style="max-width:560px"><div class="cartao" style="padding:26px 30px"><span style="font-size:22px;color:#9C927E;text-decoration:line-through">R$ 97/mês</span>
<p style="font-family:Outfit;font-size:64px;letter-spacing:-2px">R$ 67,90<span style="font-size:26px;color:#9C927E;font-family:Manrope"> /mês</span></p>
<p style="font-size:22px;color:#CFC6B4">no plano Agenda, enquanto for cliente</p></div>
<p style="margin-top:28px;font-size:30px;font-weight:800">Manda <span style="color:#E0AE58">FUNDADOR</span> no direct.</p></div></div>''')

# 8 · Story de lançamento
pagina("08-story-lancamento", 1080, 1920, f'''<div class="glow" style="width:1100px;height:1100px;left:-10px;top:380px"></div>
<img src="{M}" style="position:absolute;left:140px;top:440px;width:800px">
<div class="peca" style="padding:130px 80px 150px"><div class="topo" style="justify-content:center">{MARCA}</div>
<div style="text-align:center;margin-top:auto"><p class="tag" style="font-size:26px">Chegou o sistema da sua barbearia</p>
<h1 style="font-size:120px;margin-top:20px">Agenda cheia.<br><em>Cadeira girando.</em></h1>
<div style="margin:56px auto 0;display:inline-block;background:linear-gradient(135deg,#FFE3A3,#E0AE58 45%,#A8752A);color:#0E0D0B;border-radius:999px;padding:28px 56px;font-size:36px;font-weight:800">Responda FUNDADOR</div>
<p style="margin-top:28px;font-size:26px;color:#9C927E;font-weight:700">20 vagas com 30% off pra sempre</p></div></div>''')
print("ok")
