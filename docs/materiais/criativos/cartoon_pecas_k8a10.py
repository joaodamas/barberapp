"""Peças de cenário dos episódios K8–K10 (módulo do fork K8–K10; nome exclusivo para não colidir) (cenários próprios, além do balcão da base).

Tudo devolve SVG para o `cenario=` de cartoon_base.pagina. Cada peça leva um
prefixo nos ids para o episódio animar (setAttribute('transform', ...)).
Pessoas são inventadas; o barbeiro tem a cabeça do mascote.
"""
import cartoon_base as B

PELE_CLI = "#C98F5E"


def parede(cor="#EADFCB", chao="#3B2F22", linha="#A8752A"):
    return (f'<rect width="1080" height="1920" fill="#0E0D0B"/><rect x="0" y="300" width="1080" height="1230" fill="{cor}"/>'
            f'<rect x="0" y="1180" width="1080" height="350" fill="{chao}"/><rect x="0" y="1170" width="1080" height="14" fill="{linha}"/>')


def poste(x=56):
    return (f'<rect x="{x}" y="470" width="64" height="360" rx="32" fill="url(#listra)"/>'
            f'<rect x="{x - 10}" y="452" width="84" height="26" rx="10" fill="#A8752A"/><rect x="{x - 10}" y="822" width="84" height="26" rx="10" fill="#A8752A"/>')


def relogio(x, y, r=78, p="rel"):
    marcas = "".join(f'<rect x="-3" y="{-r + 12}" width="6" height="14" transform="rotate({a})"/>' for a in range(0, 360, 30))
    return (f'<g transform="translate({x},{y})"><circle r="{r}" fill="#fff" stroke="#16140F" stroke-width="10"/><g fill="#16140F">{marcas}</g>'
            f'<rect id="{p}-h" x="-5" y="{-r * 0.52}" width="10" height="{r * 0.56}" rx="5" fill="#16140F"/>'
            f'<rect id="{p}-m" x="-3.5" y="{-r * 0.77}" width="7" height="{r * 0.82}" rx="3.5" fill="#C9963F"/><circle r="9" fill="#16140F"/></g>')


def cadeira(cx=380):
    return (f'<rect x="{cx - 130}" y="1250" width="260" height="40" rx="16" fill="#16140F"/>'
            f'<rect x="{cx - 18}" y="1288" width="36" height="150" fill="#9C927E"/><ellipse cx="{cx}" cy="1450" rx="130" ry="24" fill="#16140F"/>')


def _rosto(cx, cy, p, cabelo="#2B1E14", pele=PELE_CLI):
    """Cabeça de cliente com três expressões: {p}-feliz (visível), {p}-triste, {p}-bravo."""
    return f'''<g id="{p}-cab"><ellipse cx="{cx}" cy="{cy}" rx="72" ry="80" fill="{pele}"/>
<path d="M{cx-74} {cy-14} C{cx-80} {cy-80} {cx-40} {cy-108} {cx+4} {cy-108} C{cx+50} {cy-108} {cx+82} {cy-76} {cx+76} {cy-14} C{cx+66} {cy-48} {cx+40} {cy-60} {cx+4} {cy-60} C{cx-34} {cy-60} {cx-62} {cy-48} {cx-74} {cy-14} Z" fill="{cabelo}"/>
<ellipse cx="{cx-72}" cy="{cy+8}" rx="12" ry="18" fill="#B57C4E"/><ellipse cx="{cx+72}" cy="{cy+8}" rx="12" ry="18" fill="#B57C4E"/>
<circle cx="{cx-26}" cy="{cy+6}" r="7" fill="#16140F"/><circle cx="{cx+26}" cy="{cy+6}" r="7" fill="#16140F"/>
<g id="{p}-feliz"><path d="M{cx-42} {cy-16} C{cx-32} {cy-22} {cx-20} {cy-22} {cx-12} {cy-18}" stroke="{cabelo}" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M{cx+12} {cy-18} C{cx+20} {cy-22} {cx+32} {cy-22} {cx+42} {cy-16}" stroke="{cabelo}" stroke-width="7" fill="none" stroke-linecap="round"/>
<path d="M{cx-24} {cy+38} C{cx-12} {cy+54} {cx+12} {cy+54} {cx+24} {cy+38}" stroke="#7A4A2A" stroke-width="7" fill="none" stroke-linecap="round"/></g>
<g id="{p}-triste" opacity="0"><path d="M{cx-42} {cy-12} L{cx-14} {cy-20}" stroke="{cabelo}" stroke-width="7" stroke-linecap="round"/><path d="M{cx+42} {cy-12} L{cx+14} {cy-20}" stroke="{cabelo}" stroke-width="7" stroke-linecap="round"/>
<path d="M{cx-20} {cy+50} C{cx-10} {cy+38} {cx+10} {cy+38} {cx+20} {cy+50}" stroke="#7A4A2A" stroke-width="7" fill="none" stroke-linecap="round"/></g>
<g id="{p}-bravo" opacity="0"><path d="M{cx-44} {cy-18} L{cx-10} {cy-8}" stroke="{cabelo}" stroke-width="8" stroke-linecap="round"/><path d="M{cx+44} {cy-18} L{cx+10} {cy-8}" stroke="{cabelo}" stroke-width="8" stroke-linecap="round"/>
<path d="M{cx-18} {cy+46} L{cx+18} {cy+46}" stroke="#7A4A2A" stroke-width="7" stroke-linecap="round"/></g></g>'''


def cliente_sentado(cx=380, p="cli", cabelo="#2B1E14", pele=PELE_CLI):
    return f'''<g id="{p}">
<path d="M{cx} 920 C{cx-80} 930 {cx-140} 980 {cx-160} 1080 L{cx-190} 1290 L{cx+190} 1290 L{cx+160} 1080 C{cx+140} 980 {cx+80} 930 {cx} 920 Z" fill="#F7F5F0" stroke="#D9D1C1" stroke-width="6"/>
<path d="M{cx-50} 930 L{cx} 990 L{cx+50} 930" fill="none" stroke="#D9D1C1" stroke-width="6"/>
{_rosto(cx, 860, p, cabelo, pele)}</g>'''


def cliente_em_pe(cx, p="cp", camisa="#3F5E4A", cabelo="#2B1E14", pele=PELE_CLI, calca="#2A2722"):
    """Cliente de pé, de frente. Braço direito (do leitor, à direita) em {p}-bd, pivô no ombro (cx+70, 960)."""
    return f'''<g id="{p}"><rect x="{cx-50}" y="1180" width="42" height="290" rx="18" fill="{calca}"/><rect x="{cx+8}" y="1180" width="42" height="290" rx="18" fill="{calca}"/>
<path d="M{cx-80} 990 C{cx-80} 950 {cx-50} 930 {cx} 930 C{cx+50} 930 {cx+80} 950 {cx+80} 990 L{cx+86} 1200 L{cx-86} 1200 Z" fill="{camisa}"/>
<path d="M{cx-74} 970 C{cx-110} 1040 {cx-112} 1110 {cx-96} 1170" stroke="{camisa}" stroke-width="38" fill="none" stroke-linecap="round"/><circle cx="{cx-96}" cy="1176" r="20" fill="{pele}"/>
<g id="{p}-bd"><path d="M{cx+74} 970 C{cx+110} 1040 {cx+112} 1110 {cx+96} 1170" stroke="{camisa}" stroke-width="38" fill="none" stroke-linecap="round"/><circle cx="{cx+96}" cy="1176" r="20" fill="{pele}"/></g>
<rect x="{cx-22}" y="900" width="44" height="40" fill="{pele}"/>
{_rosto(cx, 840, p, cabelo, pele)}</g>'''


def barbeiro_em_pe(cx=660, p="bb", s=0.56, tesoura=True):
    """Barbeiro de pé (como no K1). Braço da tesoura em {p}-bt (pivô cx-60, 960); cabeça em {p}-cab (pivô cx, 905)."""
    hy = 800
    tes = (f'<g transform="translate({cx-190},880)"><g id="{p}-l1"><path d="M0 0 L-70 -30 Q-76 -28 -70 -22 Z" fill="#9C927E"/><circle cx="18" cy="16" r="12" fill="none" stroke="#C9963F" stroke-width="6"/></g>'
           f'<g id="{p}-l2"><path d="M0 0 L-70 30 Q-76 28 -70 22 Z" fill="#9C927E"/><circle cx="18" cy="-16" r="12" fill="none" stroke="#C9963F" stroke-width="6"/></g></g>') if tesoura else ""
    return f'''<g id="{p}">
<rect x="{cx-48}" y="1240" width="40" height="230" rx="18" fill="#16140F"/><rect x="{cx+12}" y="1240" width="40" height="230" rx="18" fill="#16140F"/>
<path d="M{cx-75} 960 C{cx-75} 925 {cx-45} 905 {cx+2} 905 C{cx+49} 905 {cx+80} 925 {cx+80} 960 L{cx+88} 1260 L{cx-83} 1260 Z" fill="#F4EFE4"/>
<path d="M{cx-54} 990 L{cx+58} 990 L{cx+70} 1262 L{cx-66} 1262 Z" fill="#16140F"/><rect x="{cx-24}" y="1060" width="52" height="40" rx="8" fill="#2A2722"/>
<g id="{p}-bt"><path d="M{cx-60} 960 C{cx-100} 980 {cx-140} 960 {cx-160} 920" stroke="#F4EFE4" stroke-width="40" fill="none" stroke-linecap="round"/>
<circle cx="{cx-162}" cy="916" r="22" fill="{B.PELE}"/>{tes}</g>
<g id="{p}-be"><path d="M{cx+65} 960 C{cx+100} 1040 {cx+100} 1110 {cx+80} 1160" stroke="#F4EFE4" stroke-width="40" fill="none" stroke-linecap="round"/><circle cx="{cx+78}" cy="1166" r="22" fill="{B.PELE}"/></g>
<g id="{p}-cab"><g transform="translate({cx - 256 * s},{hy - 300 * s}) scale({s})">{B._m.mascote()}</g></g></g>'''
