"""Criativos do Topete — segunda leva (01/10/2026).

Cenários de barbearia de verdade e as funções que entraram nesta semana
(Telegram, notificação no celular, semana do mensalista, adicionar serviço,
encaixe pelo balcão). Mesmo padrão visual de gerar.py; render.sh vira PNG.

Regras que valem para toda peça:
- nada que o produto não faz (sem "lembrete automático no WhatsApp");
- número de exemplo marcado como exemplo;
- desconto de fundadora: 30% só no 1º mês.
"""
import pathlib

AQUI = pathlib.Path(__file__).parent
M = "../../marca/topete-mascote.svg"
MARCA = '<div class="marca"><img src="../../marca/topete-mascote.svg" alt="">topete</div>'
OURO = "linear-gradient(135deg,#FFE3A3,#E0AE58 45%,#A8752A)"


def pagina(nome, corpo, w=1080, h=1350):
    (AQUI / f"{nome}.html").write_text(
        f'''<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><link rel="stylesheet" href="base.css"></head>
<body style="width:{w}px;height:{h}px">{corpo}<div class="poste"></div></body></html>'''
    )


def celular(conteudo, largura=440):
    return f'''<div style="width:{largura}px;border-radius:64px;background:#000;padding:16px;box-shadow:0 40px 90px -30px #E0AE5866;flex:none">
<div style="border-radius:50px;overflow:hidden">{conteudo}</div></div>'''


def telegram(linhas, botoes=None, hora="14:32"):
    """Mensagem do bot @TopeteAvisos_bot, como aparece no Telegram."""
    btns = ""
    if botoes:
        btns = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px">' + "".join(
            f'<span style="background:#2B3A4A;color:#fff;border-radius:12px;padding:14px 0;text-align:center;font-weight:700;font-size:19px">{b}</span>'
            for b in botoes) + "</div>"
    corpo = "<br>".join(linhas)
    return f'''<div style="background:#0E1621;padding:26px 18px 30px;font-size:21px;color:#fff">
<div style="display:flex;align-items:center;gap:12px;margin-bottom:18px"><span style="width:46px;height:46px;border-radius:50%;background:#E0AE58;display:grid;place-items:center"><img src="../../marca/topete-mascote.svg" style="width:34px"></span>
<div><b style="font-size:21px">Topete Avisos</b><span style="display:block;font-size:15px;color:#7D8B99">bot</span></div></div>
<div style="background:#182533;border-radius:18px;padding:18px 18px 12px;line-height:1.45">{corpo}<span style="display:block;text-align:right;font-size:14px;color:#7D8B99;margin-top:6px">{hora}</span></div>{btns}</div>'''


# ---------------------------------------------------------------------------
# Peças únicas (09–20)
# ---------------------------------------------------------------------------

pagina("09-telegram-encaixe", f'''<div class="glow" style="width:800px;height:800px;right:-260px;top:300px"></div>
<div class="peca"><div class="topo">{MARCA}<span class="tag">Novo · Telegram</span></div>
<div style="display:flex;gap:44px;align-items:center"><div style="flex:1"><h1 style="font-size:82px">Aprova o encaixe <em>sem largar a máquina.</em></h1>
<p class="sub" style="margin-top:26px;font-size:28px">O pedido chega no Telegram com o botão. Um toque e o cliente já vê a resposta.</p></div>
{celular(telegram(["🔔 <b>Pedido de encaixe</b>", "Igor · Corte + barba", "sáb 04/10 às 11:30 · Otávio", "", "O horário está ocupado. Dá para encaixar?"], ["✅ Aprovar", "✖️ Recusar"]), 430)}</div>
<div class="rodape"><span>Grátis, para o dono e cada barbeiro</span><b>@usetopete</b></div></div>''')

pagina("10-sabado-9h", f'''<div class="peca"><div class="topo">{MARCA}<span class="tag">Sábado</span></div>
<div><p style="font-family:Outfit;font-size:220px;line-height:.85;letter-spacing:-10px"><em style="font-style:normal;background:{OURO};-webkit-background-clip:text;color:transparent">9h</em></p>
<h1 style="font-size:88px;margin-top:14px">3 clientes na cadeira de espera.<br><em>14 no WhatsApp.</em></h1></div>
<div><p class="sub">No sábado, quem responde mensagem não corta. Com o Topete, o cliente vê os horários livres e marca sozinho pelo link.</p>
<p style="margin-top:20px;font-size:20px;color:#6E675B">Cena de exemplo.</p></div></div>''')

pagina("11-adicionar-servico", f'''<div class="peca"><div class="topo">{MARCA}<span class="tag">Fechamento</span></div>
<h1 style="font-size:104px">Veio pro corte.<br><em>Saiu com barba.</em></h1>
<div class="cartao" style="font-size:32px">
<div style="display:flex;justify-content:space-between;padding:14px 0;border-bottom:1.5px solid #2E2A22"><span style="color:#CFC6B4">Corte adulto</span><b style="font-family:Outfit">R$ 60</b></div>
<div style="display:flex;justify-content:space-between;padding:14px 0;border-bottom:1.5px solid #2E2A22"><span style="color:#E0AE58">+ Barba</span><b style="font-family:Outfit;color:#E0AE58">R$ 35</b></div>
<div style="display:flex;justify-content:space-between;padding-top:20px;font-weight:800"><span>Total</span><b style="font-family:Outfit;font-size:52px">R$ 95</b></div></div>
<p class="sub">Na hora de concluir, some o serviço extra. Preço do seu cadastro, comissão do barbeiro certa, caixa certo.</p></div>''')

pagina("12-mensalista-remarca", f'''<div class="peca"><div class="topo">{MARCA}<span class="tag">Mensalistas</span></div>
<div><p style="font-size:40px;color:#CFC6B4;font-weight:600">"Essa sexta não vou conseguir. Pode ser amanhã?"</p>
<h1 style="font-size:96px;margin-top:30px">Remarca só essa semana. <em>As outras continuam fixas.</em></h1></div>
<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;font-family:Outfit;font-size:30px;text-align:center">
<span style="border-radius:20px;padding:24px 0;background:#16140F;border:2px solid #2E2A22">sex 03</span>
<span style="border-radius:20px;padding:24px 0;background:{OURO};color:#0E0D0B">qui 02</span>
<span style="border-radius:20px;padding:24px 0;background:#16140F;border:2px solid #2E2A22">sex 10</span>
<span style="border-radius:20px;padding:24px 0;background:#16140F;border:2px solid #2E2A22">sex 17</span></div>
<p class="sub">O horário fixo do mensalista fica reservado semanas à frente. Adiantou ou adiou? Um toque.</p></div>''')

pagina("13-agenda-7h", f'''<div class="glow" style="width:800px;height:800px;left:-240px;top:200px"></div>
<div class="peca"><div class="topo">{MARCA}<span class="tag">Todo dia, 7h</span></div>
<div style="display:flex;gap:44px;align-items:center">{celular(telegram(["☀️ <b>Agenda de hoje</b> · sex 03/10", "9 horários", "", "<b>09:00</b> Murilo · Corte + barba", "<b>10:00</b> Thiago · Corte · <i>mensalista</i>", "<b>11:00</b> Samuel · Corte + infantil", "<b>15:00</b> Marina · Corte infantil", "…"], None, "07:00"), 430)}
<div style="flex:1"><h1 style="font-size:84px">Antes do café, <em>a agenda do dia.</em></h1>
<p class="sub" style="margin-top:26px;font-size:28px">Cada barbeiro recebe a dele. O dono recebe a de todos — e o fechamento às 21h.</p></div></div>
<div class="rodape"><span>Avisos no Telegram · grátis</span><b>@usetopete</b></div></div>''')

pagina("14-notificacao", f'''<div class="peca"><div class="topo">{MARCA}<span class="tag">No celular</span></div>
<h1 style="font-size:96px">Cliente cancelou? <em>Você fica sabendo na hora.</em></h1>
<div style="display:grid;gap:18px">
<div style="background:#1C1A16cc;border:1.5px solid #2E2A22;border-radius:30px;padding:26px 30px;display:flex;gap:20px;align-items:center"><img src="../../marca/topete-mascote.svg" style="width:64px;border-radius:16px"><div style="font-size:26px"><b>❌ Cliente cancelou</b><span style="display:block;color:#CFC6B4">Vítor · sex 03/10 às 17:00 — o horário ficou livre.</span></div></div>
<div style="background:#1C1A16cc;border:1.5px solid #2E2A22;border-radius:30px;padding:26px 30px;display:flex;gap:20px;align-items:center;opacity:.7"><img src="../../marca/topete-mascote.svg" style="width:64px;border-radius:16px"><div style="font-size:26px"><b>📅 Novo agendamento</b><span style="display:block;color:#CFC6B4">Caio · Corte adulto · sáb 04/10 às 09:30</span></div></div></div>
<p class="sub">Notificação do próprio app da barbearia, no Android e no iPhone (com o app na tela de início). Toca e abre a agenda.</p></div>''')

pagina("15-cliente-sumiu", f'''<div class="peca"><div class="topo">{MARCA}<span class="tag">Clientes</span></div>
<div><p style="font-family:Outfit;font-size:240px;line-height:.85;letter-spacing:-10px"><em style="font-style:normal;background:{OURO};-webkit-background-clip:text;color:transparent">47</em></p>
<h1 style="font-size:86px;margin-top:10px">dias que o Davi <em>não aparece.</em></h1></div>
<div><p class="sub">Ele cortava a cada 3 semanas. O Topete mostra quem está esfriando — antes de virar cliente do concorrente.</p>
<p style="margin-top:20px;font-size:20px;color:#6E675B">Cliente e números de exemplo.</p></div></div>''')

pagina("16-desconto", f'''<div class="peca"><div class="topo">{MARCA}<span class="tag">Fechamento</span></div>
<h1 style="font-size:100px">Desconto pro amigo? <em>Pode. Registrado.</em></h1>
<div style="display:flex;gap:18px;font-family:Outfit;font-size:44px">
<span style="flex:1;border-radius:24px;padding:30px;text-align:center;background:{OURO};color:#0E0D0B">R$ 10</span>
<span style="flex:1;border-radius:24px;padding:30px;text-align:center;background:#16140F;border:2px solid #2E2A22">ou 10%</span></div>
<p class="sub">Desconto em reais ou porcentagem na hora de concluir. A comissão sai sobre o que entrou, e o caixa não mente.</p></div>''')

pagina("17-comissao", f'''<div class="peca"><div class="topo">{MARCA}<span class="tag">Equipe</span></div>
<h1 style="font-size:100px">Acerto com o barbeiro <em>sem conta de padaria.</em></h1>
<div class="cartao" style="font-size:30px">
''' + "".join(f'<div style="display:flex;justify-content:space-between;padding:16px 0;border-bottom:1.5px solid #2E2A22"><span style="color:#CFC6B4">{n}</span><b style="font-family:Outfit">{v}</b></div>' for n, v in [("Otávio · 86 atendimentos", "R$ 3.096"), ("Igor · 71 atendimentos", "R$ 2.556"), ("Breno · 52 atendimentos", "R$ 1.872")]) + f'''</div>
<div><p class="sub">Cada corte concluído já calcula a comissão de quem atendeu. No fim do mês, é só conferir e pagar.</p>
<p style="margin-top:20px;font-size:20px;color:#6E675B">Valores de exemplo.</p></div></div>''')

pagina("18-relatorio-pdf", f'''<div class="glow" style="width:760px;height:760px;right:-200px;top:320px"></div>
<div class="peca"><div class="topo">{MARCA}<span class="tag">Relatório</span></div>
<h1 style="font-size:100px">O mês inteiro da agenda <em>num PDF.</em></h1>
<div style="align-self:center;width:520px;background:#F4EFE4;color:#16140F;border-radius:18px;padding:36px;box-shadow:0 40px 90px -30px #E0AE5866;font-size:20px">
<b style="font-family:Outfit;font-size:30px">Agenda · setembro</b><div style="margin:16px 0;height:2px;background:#E0AE58"></div>
<div style="display:flex;justify-content:space-between"><span>Concluídos</span><b>312</b></div>
<div style="display:flex;justify-content:space-between"><span>Faltas</span><b>9</b></div>
<div style="display:flex;justify-content:space-between"><span>Cancelados</span><b>14</b></div>
<div style="display:flex;justify-content:space-between"><span>Cobertos pelo plano</span><b>48</b></div></div>
<p class="sub">Um toque e sai o relatório do mês, dia a dia, pronto para guardar ou mandar. Valores de exemplo.</p></div>''')

pagina("19-barbeiro-sozinho", f'''<img src="{M}" style="position:absolute;right:-80px;bottom:30px;width:560px">
<div class="peca"><div class="topo">{MARCA}<span class="tag">Barbeiro solo</span></div>
<div style="max-width:620px"><h1 style="font-size:100px">Trabalha sozinho? <em>O Topete é a sua recepção.</em></h1>
<p class="sub" style="margin-top:30px">Ele mostra os horários, recebe o agendamento e avisa você. Você corta.</p></div>
<div class="rodape"><span>Plano Agenda · R$ 97/mês</span><b>@usetopete</b></div></div>''')

pagina("20-balcao-encaixe", f'''<div class="peca"><div class="topo">{MARCA}<span class="tag">No balcão</span></div>
<h1 style="font-size:96px">Chegou sem marcar? <em>Encaixa você mesmo.</em></h1>
<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;font-family:Outfit;font-size:38px;text-align:center">
<span style="border-radius:22px;padding:28px 0;background:#1F1C17;color:#5C554A;text-decoration:line-through">16:00</span>
<span style="border-radius:22px;padding:28px 0;background:#1B2B57;color:#fff;border:3px solid #3B6BE0">16:15<span style="display:block;font-family:Manrope;font-size:18px;font-weight:800">ENCAIXE</span></span>
<span style="border-radius:22px;padding:28px 0;background:#1F1C17;color:#5C554A;text-decoration:line-through">16:30</span></div>
<p class="sub">Na hora de marcar, escolha qualquer horário — até por cima de outro. Fica confirmado e marcado como encaixe na agenda.</p></div>''')


# ---------------------------------------------------------------------------
# Carrosséis (C1–C5): 6 slides de 1080×1350 cada
# ---------------------------------------------------------------------------

def carrossel(codigo, slides):
    total = len(slides)
    for i, (titulo, texto) in enumerate(slides, 1):
        primeiro, ultimo = i == 1, i == total
        mascote = f'<img src="{M}" style="position:absolute;right:-60px;bottom:40px;width:{560 if primeiro else 420}px;opacity:{1 if primeiro or ultimo else 0}">'
        cta = '<p style="margin-top:34px;font-size:34px;font-weight:800">Manda <span style="color:#E0AE58">FUNDADOR</span> no direct.</p>' if ultimo else ""
        seta = '<span style="color:#E0AE58">arrasta →</span>' if i < total else '<b>@usetopete</b>'
        pagina(f"{codigo}-{i}", f'''{mascote}<div class="peca"><div class="topo">{MARCA}<span class="tag">{i}/{total}</span></div>
<div style="max-width:{640 if (primeiro or ultimo) else 900}px"><h1 style="font-size:{108 if primeiro else 84}px">{titulo}</h1>
{f'<p class="sub" style="margin-top:30px">{texto}</p>' if texto else ""}{cta}</div>
<div class="rodape"><span></span>{seta}</div></div>''')


carrossel("C1", [
    ("Você corta cabelo ou <em>responde mensagem?</em>", ""),
    ("09h12 · <em>\"tem horário hoje?\"</em>", "09h40 · \"e amanhã?\"<br>10h05 · \"pode ser 17h?\""),
    ("Cada mensagem é <em>uma pausa no corte.</em>", "E um cliente esperando resposta do outro lado."),
    ("E quando você responde, <em>o horário já foi.</em>", ""),
    ("O cliente vê os horários livres <em>e marca sozinho.</em>", "Pelo link com o nome e a marca da sua barbearia."),
    ("Você só abre o celular pra ver <em>a agenda pronta.</em>", ""),
])
carrossel("C2", [
    ("Seu mensalista tem dia e hora. <em>Sua agenda sabe?</em>", ""),
    ("Toda sexta, 17h. <em>Mas alguém marcou por cima.</em>", ""),
    ("No Topete, o horário fixo fica <em>reservado semanas à frente.</em>", "E o sistema completa sozinho, toda madrugada."),
    ("Adiantou ou adiou? <em>Remarca só aquela semana.</em>", "As outras continuam fixas."),
    ("A mensalidade do mês: <em>quem pagou, quem está em aberto.</em>", "Sem caderno."),
    ("Mensalista bem cuidado <em>não cancela.</em>", ""),
])
carrossel("C3", [
    ("Um horário vazio por dia <em>custa mais que o sistema.</em>", ""),
    ("Exemplo: <em>corte a R$ 50.</em>", ""),
    ("1 horário vazio por dia × 26 dias <em>= 26 cortes</em>", "que não aconteceram."),
    ("26 × R$ 50 = <em>R$ 1.300 por mês</em>", "deixados na mesa."),
    ("O Topete Agenda custa <em>R$ 97 por mês.</em>", "E o cliente marca até de madrugada."),
    ("Faz a conta com o seu preço <em>e comenta aqui.</em>", "É exemplo, não promessa."),
])
carrossel("C4", [
    ("Três jeitos de cuidar da agenda. <em>Só um trabalha enquanto você corta.</em>", ""),
    ("Caderno: <em>não some, mas só você enxerga.</em>", "O cliente precisa ligar."),
    ("WhatsApp: <em>rápido, mas cada horário é uma conversa.</em>", "E uma interrupção."),
    ("Topete: <em>o cliente vê o livre e marca.</em>", "Você confirma, encaixa ou remarca num toque."),
    ("E no fim do dia: <em>quanto entrou, por forma de pagamento.</em>", ""),
    ("Qual desses é o seu hoje? <em>Comenta.</em>", ""),
])
carrossel("C5", [
    ("Do barbeiro sozinho <em>à barbearia com 10 cadeiras.</em>", ""),
    ("Agenda · <em>R$ 97/mês</em>", "Até 3 barbeiros. Link com sua marca, encaixe, agenda do dia e fechamento."),
    ("Crescimento · <em>R$ 197/mês</em>", "Até 6. + mensalistas, loja, fidelidade e projeção de caixa."),
    ("Gestão · <em>R$ 247/mês</em>", "Até 10. + despesas, DRE e o fechamento completo do mês."),
    ("Sem taxa de implantação. <em>Barbeiro extra: R$ 19/mês.</em>", ""),
    ("Fundadoras: <em>30% off no 1º mês.</em>", "20 vagas. Depois, mensalidade normal."),
])

print("ok")
