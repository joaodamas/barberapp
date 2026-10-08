"""Destaques do perfil @usetopete (01/10/2026): capas + stories de cada destaque.

O Instagram não cria destaque pela API: os stories saem pelo
publicar-instagram.py e o dono toca em "Adicionar ao destaque" no app.
Capas: o Instagram recorta um círculo no centro — o símbolo fica no meio.
Nada aqui promete o que o produto não faz; desconto de fundadora = 30% no 1º mês.
"""
import pathlib

AQUI = pathlib.Path(__file__).parent
M = "../../marca/topete-mascote.svg"
MARCA = '<div class="marca"><img src="../../marca/topete-mascote.svg" alt="">topete</div>'
OURO = "linear-gradient(135deg,#FFE3A3,#E0AE58 45%,#A8752A)"


def pagina(nome, corpo, w=1080, h=1920, poste=True):
    (AQUI / f"{nome}.html").write_text(
        f'''<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><link rel="stylesheet" href="base.css"></head>
<body style="width:{w}px;height:{h}px">{corpo}{'<div class="poste"></div>' if poste else ''}</body></html>'''
    )


# ---------------------------------------------------------------------------
# Capas (1080×1920, símbolo no centro)
# ---------------------------------------------------------------------------
CAPAS = {
    "como-funciona": f'<img src="{M}" style="width:520px">',
    "encaixe": '<span style="font-family:Outfit;font-size:420px;line-height:1">+</span>',
    "mensalistas": '<span style="font-family:Outfit;font-size:360px;line-height:1">↻</span>',
    "financeiro": '<span style="font-family:Outfit;font-size:300px;line-height:1;letter-spacing:-12px">R$</span>',
    "avisos": '<span style="font-family:Outfit;font-size:380px;line-height:1">!</span>',
    "planos": '<span style="font-family:Outfit;font-size:380px;line-height:1">3</span>',
    "fundadores": '<span style="font-family:Outfit;font-size:330px;line-height:1">%</span>',
    "duvidas": '<span style="font-family:Outfit;font-size:400px;line-height:1">?</span>',
}
for nome, simbolo in CAPAS.items():
    cor = "" if nome == "como-funciona" else f"background:{OURO};-webkit-background-clip:text;color:transparent;"
    pagina(f"D-capa-{nome}", f'''<div style="position:absolute;inset:0;display:grid;place-items:center">
<div style="width:720px;height:720px;border-radius:50%;border:6px solid #2E2A22;display:grid;place-items:center;{cor}">{simbolo}</div></div>''', poste=False)


# ---------------------------------------------------------------------------
# Stories dos destaques
# ---------------------------------------------------------------------------
def story(nome, etiqueta, titulo, texto="", extra=""):
    pagina(nome, f'''<div class="peca" style="padding:150px 80px 170px"><div class="topo">{MARCA}<span class="tag">{etiqueta}</span></div>
<div><h1 style="font-size:104px">{titulo}</h1>{f'<p class="sub" style="margin-top:36px;font-size:36px">{texto}</p>' if texto else ''}</div>
{extra or '<span></span>'}</div>''')


def lista(itens):
    return '<div style="display:grid;gap:22px">' + "".join(
        f'<div class="cartao" style="padding:28px 32px;font-size:32px;display:flex;gap:22px;align-items:center"><b style="font-family:Outfit;font-size:44px;color:#E0AE58;width:48px">{i}</b><span>{t}</span></div>'
        for i, t in itens) + "</div>"


# Como funciona
story("D-como-1", "Como funciona", "O cliente abre <em>o link da sua barbearia.</em>",
      "Com o seu nome, o seu logo e as suas cores. Sem baixar nada — e dá para instalar como app.")
story("D-como-2", "Como funciona", "Escolhe o serviço, o barbeiro <em>e um horário livre.</em>",
      "Só aparece o que cabe de verdade na agenda. Horário cheio vira pedido de encaixe.")
story("D-como-3", "Como funciona", "Você recebe o aviso <em>e só corta.</em>",
      "No painel, no celular ou no Telegram. No fim do dia, o caixa já está fechado.",
      '<div class="rodape"><span>topete.com.br</span><b>@usetopete</b></div>')

# Encaixe
story("D-encaixe-1", "Encaixe", "Horário cheio <em>não é cliente perdido.</em>",
      "O cliente pede encaixe, o Topete mostra se cabe pelo tempo do serviço, e você aprova ou recusa num toque.")
story("D-encaixe-2", "Encaixe", "Chegou sem marcar? <em>Você encaixa.</em>",
      "No balcão, escolha qualquer horário — até por cima de outro. Fica confirmado e marcado como encaixe.")

# Mensalistas
story("D-mensalistas-1", "Mensalistas", "Seu clube de assinatura, <em>organizado.</em>",
      "Plano mensal, quem pagou e quem está em aberto, sem caderno.")
story("D-mensalistas-2", "Mensalistas", "Horário fixo <em>de verdade.</em>",
      "Reservado semanas à frente. Adiantou ou adiou? Remarca só aquela semana.")

# Financeiro
story("D-financeiro-1", "Financeiro", "Cada corte concluído <em>já entra no caixa.</em>",
      "Com a forma de pagamento, a taxa da maquininha e a comissão de quem atendeu.")
story("D-financeiro-2", "Financeiro", "Quanto sobrou <em>no mês?</em>",
      "Entradas, saídas e o resultado — e o relatório da agenda em PDF.")

# Avisos
story("D-avisos-1", "Avisos", "Encaixe com botão <em>no Telegram.</em>",
      "Aprova sem abrir o painel. De manhã chega a agenda do dia; à noite, o fechamento. Grátis.")
story("D-avisos-2", "Avisos", "Ou notificação <em>no celular.</em>",
      "Cliente cancelou, marcou ou pediu encaixe: você fica sabendo na hora.")

# Planos
story("D-planos-1", "Planos", "Três planos, <em>sem taxa de implantação.</em>", "",
      lista([("1", "Agenda · R$ 97/mês · até 3 barbeiros"), ("2", "Crescimento · R$ 197/mês · até 6"), ("3", "Gestão · R$ 247/mês · até 10")]))
story("D-planos-2", "Planos", "Cresceu? <em>Muda de plano.</em>",
      "Barbeiro acima do teto: + R$ 19/mês cada. A mudança é pedida pelo próprio painel.")

# Fundadores
story("D-fundadores-1", "Fundadores", "20 vagas. <em>30% off no 1º mês.</em>",
      "Depois, mensalidade normal. Em troca, o seu feedback para construir junto.",
      '<p style="font-size:40px;font-weight:800">Manda <span style="color:#E0AE58">FUNDADOR</span> no direct.</p>')

# Dúvidas
story("D-duvidas-1", "Dúvidas", "O cliente precisa <em>baixar app?</em>",
      "Não. Ele abre pelo link. Se quiser, instala no celular como app, com o ícone da sua barbearia.")
story("D-duvidas-2", "Dúvidas", "Funciona com <em>mais de um barbeiro?</em>",
      "Sim. Cada um com a própria agenda, serviços e comissão.")
story("D-duvidas-3", "Dúvidas", "E se eu quiser <em>sair?</em>",
      "Você pede o cancelamento pelo painel e pode exportar os seus dados.",
      '<p style="font-size:36px;font-weight:800">Outra dúvida? <span style="color:#E0AE58">Manda no direct.</span></p>')

print("ok")
