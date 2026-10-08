"""Personagens dos episódios K2 e K4 (cenários próprios).

Tudo é desenhado com a origem nos PÉS (ou na base da cadeira): o episódio
posiciona com translate(x, y) e escala k. Rostos têm duas expressões
(`<id>-f` contente, `<id>-b` bravo) para o episódio alternar a opacidade.
Em SVG, girar sempre com setAttribute('transform', 'rotate(a cx cy)') nas
coordenadas LOCAIS — nada de transform-origin no style.
"""
import cartoon_base as B

PELE = B.PELE


def barbeiro_pe(id_, x, y, k=1.0, mao=""):
    """Barbeiro (cabeça = mascote) em pé, braços ao lado do corpo. Pés em (x, y).
    Local: pés em (660,1470); cabeça gira em torno de (660,905) via id `<id>-cab`.
    `mao`: SVG extra desenhado na altura da mão direita (local ~ 745,1160)."""
    s = 0.56
    return f'''<g id="{id_}" transform="translate({x},{y}) scale({k}) translate(-660,-1470)">
<rect x="612" y="1240" width="40" height="230" rx="18" fill="#16140F"/><rect x="672" y="1240" width="40" height="230" rx="18" fill="#16140F"/>
<path d="M585 960 C585 925 615 905 662 905 C709 905 740 925 740 960 L748 1260 L577 1260 Z" fill="#F4EFE4"/>
<path d="M606 990 L718 990 L730 1262 L594 1262 Z" fill="#16140F"/><rect x="636" y="1060" width="52" height="40" rx="8" fill="#2A2722"/>
<g id="{id_}-bE"><path d="M598 960 C578 1030 572 1100 580 1160" stroke="#F4EFE4" stroke-width="40" fill="none" stroke-linecap="round"/><circle cx="580" cy="1166" r="22" fill="{PELE}"/></g>
<g id="{id_}-bD"><path d="M726 960 C746 1030 752 1100 744 1160" stroke="#F4EFE4" stroke-width="40" fill="none" stroke-linecap="round"/><circle cx="744" cy="1166" r="22" fill="{PELE}"/>{mao}</g>
<g id="{id_}-cab"><g transform="translate({660 - 256 * s},{800 - 300 * s}) scale({s})">{B._m.mascote()}</g></g>
<path id="{id_}-suor" d="M790 730 C782 746 778 756 786 764 C794 772 806 764 802 752 C800 744 794 738 790 730 Z" fill="#7FC4E8" opacity="0"/>
</g>'''


def rosto(id_, cx, cy, cabelo):
    """Olhos + duas bocas/sobrancelhas: <id>-f (contente) e <id>-b (bravo)."""
    return f'''<circle cx="{cx-24}" cy="{cy+6}" r="7" fill="#16140F"/><circle cx="{cx+24}" cy="{cy+6}" r="7" fill="#16140F"/>
<g id="{id_}-b" opacity="0"><path d="M{cx-44} {cy-18} L{cx-10} {cy-8}" stroke="{cabelo}" stroke-width="8" stroke-linecap="round"/><path d="M{cx+44} {cy-18} L{cx+10} {cy-8}" stroke="{cabelo}" stroke-width="8" stroke-linecap="round"/>
<path d="M{cx-18} {cy+44} L{cx+18} {cy+44}" stroke="#7A4A2A" stroke-width="7" stroke-linecap="round"/></g>
<g id="{id_}-f"><path d="M{cx-42} {cy-16} C{cx-32} {cy-22} {cx-20} {cy-22} {cx-12} {cy-18}" stroke="{cabelo}" stroke-width="7" fill="none" stroke-linecap="round"/>
<path d="M{cx+12} {cy-18} C{cx+20} {cy-22} {cx+32} {cy-22} {cx+42} {cy-16}" stroke="{cabelo}" stroke-width="7" fill="none" stroke-linecap="round"/>
<path d="M{cx-24} {cy+36} C{cx-12} {cy+52} {cx+12} {cy+52} {cx+24} {cy+36}" stroke="#7A4A2A" stroke-width="7" fill="none" stroke-linecap="round"/></g>'''


def pessoa(id_, x, y, k=1.0, pele="#C98F5E", cabelo="#2B1E14", camisa="#1d4ed8", calca="#2A2722"):
    """Cliente em pé. Pés em (x, y); local: pés em (0,0), cabeça em (0,-570). Corpo: `<id>-corpo`."""
    return f'''<g id="{id_}" transform="translate({x},{y}) scale({k})"><g id="{id_}-corpo">
<rect x="-62" y="-230" width="48" height="230" rx="20" fill="{calca}"/><rect x="14" y="-230" width="48" height="230" rx="20" fill="{calca}"/>
<path d="M-92 -420 C-92 -470 -60 -490 0 -490 C60 -490 92 -470 92 -420 L84 -200 L-84 -200 Z" fill="{camisa}"/>
<path d="M-88 -440 C-118 -380 -120 -320 -108 -262" stroke="{camisa}" stroke-width="40" fill="none" stroke-linecap="round"/><circle cx="-108" cy="-256" r="20" fill="{pele}"/>
<path d="M88 -440 C118 -380 120 -320 108 -262" stroke="{camisa}" stroke-width="40" fill="none" stroke-linecap="round"/><circle cx="108" cy="-256" r="20" fill="{pele}"/>
<rect x="-18" y="-510" width="36" height="34" fill="{pele}"/>
<ellipse cx="0" cy="-570" rx="68" ry="76" fill="{pele}"/>
<path d="M-70 -584 C-76 -650 -36 -676 4 -676 C46 -676 78 -648 70 -584 C60 -616 34 -628 4 -628 C-30 -628 -58 -616 -70 -584 Z" fill="{cabelo}"/>
<ellipse cx="-68" cy="-562" rx="12" ry="18" fill="{pele}"/><ellipse cx="68" cy="-562" rx="12" ry="18" fill="{pele}"/>
{rosto(id_, 0, -570, cabelo)}</g></g>'''


def cliente_cadeira(id_, x, y, k=1.0, pele="#C98F5E", cabelo="#2B1E14"):
    """Cliente sentado de capa, com a cadeira. Base da cadeira em (x, y); local: base em (380,1450)."""
    return f'''<g id="{id_}" transform="translate({x},{y}) scale({k}) translate(-380,-1450)">
{cadeira_vazia()}
<path d="M380 920 C300 930 240 980 220 1080 L190 1290 L570 1290 L540 1080 C520 980 460 930 380 920 Z" fill="#F7F5F0" stroke="#D9D1C1" stroke-width="6"/>
<path d="M330 930 L380 990 L430 930" fill="none" stroke="#D9D1C1" stroke-width="6"/>
<ellipse cx="380" cy="860" rx="72" ry="80" fill="{pele}"/>
<path d="M306 846 C300 780 340 752 384 752 C430 752 462 784 456 846 C446 812 420 800 384 800 C346 800 318 812 306 846 Z" fill="{cabelo}"/>
<ellipse cx="308" cy="868" rx="12" ry="18" fill="{pele}"/><ellipse cx="452" cy="868" rx="12" ry="18" fill="{pele}"/>
{rosto(id_, 380, 862, cabelo)}</g>'''


def cadeira_vazia():
    """Cadeira de barbeiro em coordenadas locais (base em 380,1450)."""
    return '''<rect x="270" y="1000" width="220" height="250" rx="30" fill="#16140F"/><rect x="250" y="1250" width="260" height="40" rx="16" fill="#16140F"/>
<rect x="232" y="1150" width="40" height="110" rx="14" fill="#2A2722"/><rect x="488" y="1150" width="40" height="110" rx="14" fill="#2A2722"/>
<rect x="362" y="1288" width="36" height="150" fill="#9C927E"/><ellipse cx="380" cy="1450" rx="130" ry="24" fill="#16140F"/>'''


def relogio(cx, cy, r=78, id_h="pont-h", id_m="pont-m"):
    return f'''<g transform="translate({cx},{cy})"><circle r="{r}" fill="#fff" stroke="#16140F" stroke-width="10"/>
<g fill="#16140F">{"".join(f'<rect x="-3" y="{-r + 12}" width="6" height="14" transform="rotate({a})"/>' for a in range(0, 360, 30))}</g>
<rect id="{id_h}" x="-5" y="{-r * 0.5}" width="10" height="{r * 0.56}" rx="5" fill="#16140F"/>
<rect id="{id_m}" x="-3.5" y="{-r * 0.77}" width="7" height="{r * 0.82}" rx="3.5" fill="#C9963F"/><circle r="9" fill="#16140F"/></g>'''
