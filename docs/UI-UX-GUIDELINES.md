# JP Barber — UI/UX Guidelines

> **Contrato de produto.** Vale o mesmo que os contratos financeiros: quando a
> implementação divergir daqui, a implementação está errada.

Definido pelo dono do produto em 17/08/2026. Ninguém — pessoa ou agente — tem
autonomia para criar identidade visual nova. Este documento existe para que a
identidade não dependa de alguém lembrar o que foi combinado.

---

## 1 · Identidade

```
PROFISSIONAL    PREMIUM      CONFIÁVEL
CONTEMPORÂNEO   ELEGANTE     OPERACIONAL     ORIGINAL
```

**Alguém deve ver uma tela sem o logo e reconhecer: "isso é JP Barber".**

A diferenciação vem de tipografia, espaçamento, composição, hierarquia,
proporção, densidade, componentes, microinterações, linguagem e consistência —
**não de uma cor extravagante**.

---

## 2 · Princípios

```
Elegância        >  efeito visual
Clareza          >  tendência
Personalidade    >  cópia
Hierarquia       >  quantidade
Profissionalismo >  espetáculo
```

E a régua que governa o produto inteiro:

> **A interface não deve mostrar tudo que o sistema sabe. Deve mostrar o que o
> dono precisa decidir.**

### As cinco perguntas — antes de qualquer alteração visual

1. Isso melhora a **compreensão**?
2. Isso melhora a **operação**?
3. Isso reforça a **identidade própria** do JP Barber?
4. Isso poderia ser confundido com **cópia de outro SaaS**?
5. Estou usando cor por **função** ou por **decoração**?

**Se 4 for "sim" → recomece a solução.**
**Se 5 for "decoração" → simplifique.**

---

## 3 · Cores

A paleta é **desenvolvida internamente**. Proibido escolher a partir de "cores
populares de SaaS", "cores de sistema de barbearia", "melhores paletas para
dashboard" ou qualquer concorrente.

**Cor tem função semântica.** Ela não domina a interface.

### A paleta atual — em `globals.css`

| token | valor | função |
|---|---|---|
| `--color-surface` | `#f8f5ee` | fundo da página |
| `--color-surface-raised` | `#efe9dc` | superfície elevada, campos |
| `--color-border` | `#e1d8c5` | divisão sutil |
| `--color-border-strong` | `#a1937a` | divisão que precisa ser vista |
| `--color-gold` | `#b8863a` | acento da marca |
| `--color-gold-light` | `#8c5f1e` | **mais escuro** que `gold` — para texto |
| `--color-gold-hover` | `#c99a52` | estado de hover |
| `--color-ivory` | `#17140f` | texto principal (quase preto) |
| `--color-ivory-muted` | `#6b6355` | texto secundário |
| `--color-success` | `#43733a` | resultado positivo |
| `--color-danger` | `#ab4a3a` | erro, perda, ação destrutiva |

⚠️ **A nomenclatura engana e é deliberada.** `ivory` é o texto quase preto;
`gold-light` é **mais escuro** que `gold`, e existe para ter contraste como
texto sobre fundo claro. Não "corrija" os nomes sem coordenação: `--color-gold`
é sobrescrito por barbearia em tempo de execução.

### Regras de cor

- Verde e vermelho **só** para resultado financeiro e estado — nunca decorativos.
- Nenhum elemento depende só de cor para ser compreendido (daltonismo).
- Contraste **WCAG AA**: 4,5:1 em texto normal, 3:1 em texto grande e ícones.

---

## 4 · Tipografia

Fontes **auto-hospedadas** via `next/font/local` — nunca `next/font/google`,
que baixa em tempo de build e já quebrou o deploy em 11/08.

- `--font-display` (Manrope) em `h1..h4` e `.font-display` — números grandes e
  títulos.
- A fonte de corpo cuida do resto.

**Números financeiros usam `font-display`.** É o que dá o peso de "isto é um
valor", e é parte da identidade.

Hierarquia por **tamanho e peso**, não por cor.

---

## 5 · Espaçamento

Escala do Tailwind, sem valores mágicos. Generoso: **espaço é o principal
recurso de elegância** do produto, e é de graça.

Densidade é decisão de conteúdo, não de estética: a tela de operação (Hoje,
Loja) é mais densa porque o dono opera em pé; a tela de análise (Financeiro,
Números) respira mais porque ele lê sentado.

---

## 6 · Componentes

Vivem em `web/src/components/ui/**`. **UX-04 é a dona** — quem precisar de
componente novo pede, não cria.

Regra: se a mesma coisa aparece em duas telas, é componente. Se aparece uma vez,
não é.

Alvo de toque **≥ 44px**. O dono usa no balcão, em pé, com o celular na mão.

---

## 7 · Estados

Todo componente que mostra dado precisa dos **três**:

| estado | o que dizer |
|---|---|
| **vazio** | o que é isso, e o que fazer para preencher |
| **carregando** | esqueleto com a forma do conteúdo, não spinner |
| **erro** | *"não consegui ler"* — nunca *"nenhum registro"* |

**Erro nunca pode parecer vazio.** Foi o D27: a tela dizia "nenhuma despesa"
quando o listener falhava, e o dono concluía que não havia despesa.

---

## 8 · Navegação

**UX-01 é a dona** de `layout.tsx` e `nav-items.ts`.

Nome de menu é **nome de negócio**, não de sistema. "DRE Gerencial" é linguagem
de contador; o dono pensa em "quanto sobrou".

Uma informação mora em **um** lugar. Duas telas mostrando o mesmo número com
nomes diferentes é defeito, não conveniência.

---

## 9 · Microcopy

- Português **com acentuação correta**, sempre.
- Diga a **consequência**, não o estado interno: *"Sem indicar quem vendeu, a
  venda não gera comissão"* — não *"staffId nulo"*.
- Concordância importa: *"1 un. voltou"*, *"2 un. voltaram"*.
- Nunca afirme o que não aconteceu. Essa é a régua do produto inteiro:

> **O sistema não pode afirmar que algo aconteceu quando não aconteceu. E não
> pode deixar de reconhecer algo que aconteceu.**

---

## 10 · Acessibilidade

- Contraste **WCAG AA**.
- `prefers-reduced-motion` respeitado — sem exceção.
- Foco visível em tudo que é focável.
- `aria-pressed` em toggle, `role="alert"` em erro, label em todo campo.
- Ordem de tabulação segue a ordem visual.

---

## 10.5 · UI/UX É PARTE DO PRODUTO

Não existe "backend bom + tela bonita". Existe:

```
produto bom = motor confiável + experiência confiável
```

Achado de tela é **defeito de produto**, não pedido de melhoria. O CMV provou:
o cálculo estava certo, o dono via R$ 18,00 no cabeçalho e R$ 180,00 no filho, e
o produto estava errado.

---

## 10.6 · A identidade se REFORÇA, não se inventa

Ninguém — pessoa ou agente — cria identidade visual nova. A assinatura do JP
Barber vai aparecer quando o Design System existente for aplicado com
consistência, a densidade cair e a hierarquia melhorar. Não quando alguém
escolher uma cor que ninguém usa.

### PROIBIDO

- dark mode · `prefers-color-scheme: dark` · versão alternativa da interface
- neon · gradiente decorativo · glassmorphism gratuito
- estética "AI SaaS"
- copiar Linear, Stripe, Notion, Nubank ou qualquer concorrente
- trocar a paleta porque "parece mais moderna"
- cor fora dos tokens
- cor como decoração, sem função

### DESEJADO

- tipografia mais forte
- hierarquia mais clara
- melhor uso de espaço · proporções próprias
- componentes mais refinados · melhor densidade
- microinterações discretas
- estados mais bem construídos · ícones consistentes
- composição visual reconhecível

**A diferença mora no sistema, não no efeito visual.**

### E o que NÃO dá para travar por teste

Light-only, contraste AA, alvo de toque e `prefers-reduced-motion` já reprovam o
build. Esses são o **negativo** — o que não pode existir.

O **positivo** — *"isso é reconhecivelmente JP Barber"* — nenhuma regra
automatizada verifica. Nenhum teste distingue um cartão sóbrio de um cartão
genérico. Isso é a regra 19 aplicada à identidade: um agente implementa e testa;
**quem decide se ficou com cara de JP Barber é o dono, olhando a tela.**

---

## 11 · Anti-patterns — proibidos

- ❌ **Dark mode**, `prefers-color-scheme: dark`, ou qualquer versão alternativa
- ❌ Neon, gradiente decorativo, glassmorphism, sombra colorida
- ❌ "Dashboard de startup": 14 cards competindo, cada um com um ícone colorido
- ❌ Cor como decoração
- ❌ Emoji como ícone de interface
- ❌ Animação que não comunica estado
- ❌ Copiar referência de mercado
- ❌ Número na tela sem origem rastreável num fato

---

## 12 · Exemplos aprovados

- **Árvore da receita no DRE** — os filhos somam o cabeçalho, e a devolução
  aparece como dedução negativa em vez de sumir.
- **"Quem vendeu (opcional)"** na venda — diz a consequência de deixar em branco.
- **`ErroAoCarregar`** — separa "não consegui ler" de "não há nada".
- **Livro caixa** — a tela declara o que **não** está mostrando: *"Atendimentos,
  vendas e mensalidades já entram pelo próprio pagamento e não são lançados
  aqui."*

## 13 · Exemplos proibidos

- **Simulador da Loja anunciando 40%** numa barbearia onde ninguém tem 40%
  (era o P1-7).
- **Composição da receita somando 123%** com a devolução em 0%.
- **KPI "Despesas"** exibindo o custo total, imposto incluído.
- **"Previsto hoje" e "Previsão do dia"** — o mesmo número, dois nomes.

---

## Quando parar

Se uma melhoria exigir **decisão de identidade visual**, não implemente. Reporte:

```
UI DECISION REQUIRED
- contexto:
- problema:
- proposta:
- impacto:
- componentes afetados:
```
