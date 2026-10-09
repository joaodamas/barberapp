"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Eraser, ImagePlus, Loader2, ScanSearch, Sparkles, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RecorteDoLogo, XADREZ } from "@/components/marca/recorte-do-logo";
import { PreviaDaMarca } from "@/components/marca/previa-da-marca";
import { PreviaEmTamanhoReal } from "@/components/marca/previa-em-tamanho-real";
import { useTenant } from "@/lib/tenant-context";
import { salvarMarca } from "@/lib/db/repository";
import {
  carregarImagem,
  apagamentoDoLogo,
  corDoRecorte,
  desenharMonograma,
  desenharRecorte,
  enviarMarca,
  gerarArquivosDaMarca,
  foraDoCirculoDoRecorte,
  liberarCanvas,
  montarFonte,
  prepararBase,
  type BaseDoLogo,
} from "@/lib/db/enviar-logo";
import { avisosDoLogo, temSobraRelevante, type FundoDetectado } from "@/lib/analise-do-logo";
import {
  FORMATOS_DE_LOGO,
  FUNDOS_DO_ICONE,
  iconesDoLogo,
  mensagemDeFalhaNaMarca,
  problemaNoArquivo,
  type FundoDoIcone,
} from "@/lib/logo-da-marca";
import {
  ENQUADRAMENTO_INICIAL,
  enquadramentoInicial,
  tamanhoDaFonte,
  type Enquadramento,
} from "@/lib/recorte-do-logo";

/** Fundo "transparente" para medir o círculo: nenhuma cor é descartada, só o vazio. */
const SEM_FUNDO: FundoDetectado = { transparente: true, cor: { r: 0, g: 0, b: 0 }, solidez: 1 };
import {
  avaliarCor,
  CORES_PRONTAS,
  formatarContraste,
  NOME_CURTO_MAXIMO,
  NOME_MAXIMO,
  normalizarHex,
  problemaNoNome,
  problemaNoNomeCurto,
} from "@/lib/marca-editavel";
import {
  MARCA_GERADA,
  svgDoMonograma,
} from "@/lib/monograma";
import { cn } from "@/lib/cn";

/**
 * Sua marca — logo, cor e nome da barbearia.
 *
 * ## Por que esta tela nasce
 *
 * O logo já aparecia em todo lugar — login, topo do painel, app do cliente,
 * ícone da tela inicial — mas nada disso era do dono: a cor só era escolhida
 * no cadastro, e o logo só entrava se a plataforma subisse por ele. Toda
 * barbearia ficava com o monograma das iniciais. White-label em que a marca
 * não é a do cliente é só metade da promessa.
 *
 * ## O que a tela garante
 *
 * - O dono VÊ antes de salvar como fica nos três lugares que o cliente dele
 *   enxerga: o topo do app, a tela de entrar e o ícone do celular.
 * - O recorte é quadrado, com a máscara do círculo por cima (o selo do app é redondo), e o que aparece na área de recorte é exatamente o
 *   que sobe (mesma conta, `retanguloNoQuadrado`).
 * - A cor sai sugerida do próprio logo, mas é sugestão. A conferência de
 *   contraste mostra o número e o que o app vai fazer com ele.
 * - Nada é gravado até "Salvar". Escolher um arquivo só prepara.
 *
 * Mesmo padrão de rascunho de Taxas e regras: sem rascunho, a tela mostra a
 * ficha ao vivo (`TenantLive`); com rascunho, o que o dono escolheu vence até
 * salvar.
 */

const ACEITOS = FORMATOS_DE_LOGO.join(",");

/** Lado da miniatura usada nas prévias — o arquivo final é gerado à parte. */
const LADO_DA_PREVIA = 192;

export default function SuaMarcaPage() {
  const tenant = useTenant();
  const { brand } = tenant;
  const entrada = useRef<HTMLInputElement>(null);

  /* O arquivo escolhido (`original`) e, derivado dele, o canvas que o recorte
   * enquadra (`imagem`): aparado nas sobras, com ou sem fundo. O monograma
   * entra pelo mesmo `imagem`, e dali segue o caminho do logo enviado. */
  const [original, setOriginal] = useState<HTMLImageElement | null>(null);
  const [vetorial, setVetorial] = useState(false);
  /* `null` = automático: aparar só quando há sobra relevante (ver `aparando`). */
  const [aparar, setAparar] = useState<boolean | null>(null);
  const [semFundo, setSemFundo] = useState(false);
  const [noSimbolo, setNoSimbolo] = useState(false);
  const [usandoMonograma, setUsandoMonograma] = useState(false);
  const [canvasMonograma, setCanvasMonograma] = useState<HTMLCanvasElement | null>(null);
  /* O enquadramento vale para UMA fonte: trocou a fonte (aparar, tirar o
   * fundo, outro arquivo), volta ao inicial — sem efeito, comparando. */
  const [ajuste, setAjuste] = useState<{ fonte: unknown; valor: Enquadramento }>({
    fonte: null,
    valor: ENQUADRAMENTO_INICIAL,
  });
  const [fundo, setFundo] = useState<FundoDoIcone>("claro");
  const [remover, setRemover] = useState(false);

  const [rascunhoNome, setRascunhoNome] = useState<string | null>(null);
  const [rascunhoCurto, setRascunhoCurto] = useState<string | null>(null);
  const [rascunhoCor, setRascunhoCor] = useState<string | null>(null);
  const [hexDigitado, setHexDigitado] = useState<string | null>(null);

  const [preparando, setPreparando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  /* A imagem escolhida vive num `blob:` — memória do navegador que só volta
   * quando alguém a revoga. Trocar de arquivo ou sair da tela revoga. */
  useEffect(() => {
    if (!original) return;
    return () => URL.revokeObjectURL(original.src);
  }, [original]);

  /* O que dá para saber do arquivo: fundo, caixa do conteúdo, símbolo. */
  const base = useMemo<BaseDoLogo | null>(() => {
    if (!original) return null;
    try {
      return prepararBase(original, vetorial);
    } catch (e) {
      console.error("[marca] não consegui analisar a imagem", e);
      return null;
    }
  }, [original, vetorial]);

  /* Canvas é memória que o Safari do iPhone não solta sozinho: devolve o da
   * base quando ela é trocada, e o monograma antigo quando é redesenhado. */
  useEffect(() => {
    if (!base) return;
    return () => liberarCanvas(base.canvas);
  }, [base]);
  useEffect(() => {
    if (!canvasMonograma) return;
    return () => liberarCanvas(canvasMonograma);
  }, [canvasMonograma]);

  const aparando =
    aparar ??
    (base?.analise?.caixa
      ? temSobraRelevante(base.analise.caixa, base.canvas.width, base.canvas.height)
      : false);
  const caixaAparada = aparando && base?.analise?.caixa ? base.analise.caixa : null;
  const caixaEscolhida = noSimbolo && base?.simbolo ? base.simbolo.caixa : caixaAparada;
  const podeRemoverFundo = base?.analise?.podeRemoverFundo ?? false;

  /* Se o aparelho não der canvas (memória do Safari), o logo segue inteiro,
   * como escolhido, e a tela avisa de leve que as ajudas não rodaram. */
  const montada = useMemo<{ fonte: HTMLImageElement | HTMLCanvasElement | null; falhou: boolean }>(() => {
    if (usandoMonograma) return { fonte: canvasMonograma, falhou: false };
    if (!original) return { fonte: null, falhou: false };
    if (!base) return { fonte: original, falhou: true };
    try {
      return {
        fonte: montarFonte(base, { caixa: caixaEscolhida, semFundo: semFundo && podeRemoverFundo }),
        falhou: false,
      };
    } catch (e) {
      console.error("[marca] não consegui montar o recorte", e);
      return { fonte: original, falhou: true };
    }
  }, [usandoMonograma, canvasMonograma, original, base, caixaEscolhida, semFundo, podeRemoverFundo]);
  const imagem = montada.fonte;

  /* Recortes derivados (aparados, sem fundo) saem de cena quando a fonte muda. */
  useEffect(() => {
    if (!(imagem instanceof HTMLCanvasElement)) return;
    return () => {
      if (imagem !== base?.canvas && imagem !== canvasMonograma) liberarCanvas(imagem);
    };
  }, [imagem, base, canvasMonograma]);

  /* O fundo que NÃO conta como logo ao medir o que o círculo corta: o da
   * imagem original, a menos que tenha sido removido (ou seja monograma). */
  const fundoDaFonte = useMemo<FundoDetectado>(
    () =>
      usandoMonograma || (semFundo && podeRemoverFundo) || !base?.analise
        ? SEM_FUNDO
        : base.analise.fundo,
    [usandoMonograma, semFundo, podeRemoverFundo, base]
  );

  /* Abre já encaixado no círculo: se os cantos têm logo, ele encolhe até a
   * caixa caber no círculo inscrito; logo redondo abre como está. */
  const enquadramentoAutomatico = useMemo(() => {
    if (!imagem) return ENQUADRAMENTO_INICIAL;
    const { largura, altura } = tamanhoDaFonte(imagem);
    return enquadramentoInicial(largura, altura, foraDoCirculoDoRecorte(imagem, ENQUADRAMENTO_INICIAL, fundoDaFonte));
  }, [imagem, fundoDaFonte]);
  const enquadramento = ajuste.fonte === imagem ? ajuste.valor : enquadramentoAutomatico;
  const setEnquadramento = (valor: Enquadramento) => setAjuste({ fonte: imagem, valor });

  /* A miniatura das prévias acompanha o recorte. 192 px custam pouco para
   * redesenhar a cada arraste. */
  const recortePrevia = useMemo(
    () => (imagem ? desenharRecorte(imagem, enquadramento, LADO_DA_PREVIA).toDataURL("image/png") : null),
    [imagem, enquadramento]
  );

  const nome = rascunhoNome ?? brand.name;
  const nomeCurto = rascunhoCurto ?? brand.shortName;
  const cor = rascunhoCor ?? brand.accentColor;

  /* O monograma acompanha o nome e a cor do rascunho. */
  useEffect(() => {
    if (!usandoMonograma) return;
    let vivo = true;
    desenharMonograma(nome, cor)
      .then((c) => vivo && setCanvasMonograma(c))
      .catch((e) => console.error("[marca] monograma", e));
    return () => {
      vivo = false;
    };
  }, [usandoMonograma, nome, cor]);

  /* Cor sugerida a partir do que vai subir (já sem o fundo, se foi removido). */
  const corSugerida = useMemo(
    () => (original && imagem ? corDoRecorte(desenharRecorte(imagem, ENQUADRAMENTO_INICIAL, 64)) : null),
    [original, imagem]
  );

  /* Avisos antes de salvar: orientam, não bloqueiam. */
  const avisosDoEnvio = useMemo(() => {
    if (!imagem) return [];
    const apagamento = imagem instanceof HTMLCanvasElement ? apagamentoDoLogo(imagem) : { claro: 0, escuro: 0 };
    const caixa = usandoMonograma ? null : noSimbolo && base?.simbolo ? base.simbolo.caixa : caixaAparada;
    /* Medidas em pixels do ARQUIVO: a base de trabalho pode estar reduzida. */
    const escala = base?.escala ?? 1;
    const largura = usandoMonograma ? 512 : (caixa?.w ?? base?.canvas.width ?? original?.naturalWidth ?? 0) / escala;
    const altura = usandoMonograma ? 512 : (caixa?.h ?? base?.canvas.height ?? original?.naturalHeight ?? 0) / escala;
    return avisosDoLogo({
      vetorial: vetorial && !usandoMonograma,
      largura,
      altura,
      apagadoNoClaro: apagamento.claro,
      apagadoNoEscuro: apagamento.escuro,
      foraDoCirculo: foraDoCirculoDoRecorte(imagem, enquadramento, fundoDaFonte),
    });
  }, [imagem, usandoMonograma, noSimbolo, base, caixaAparada, original, vetorial, enquadramento, fundoDaFonte]);
  const avaliacao = avaliarCor(cor);

  const temLogoProprio = brand.logo !== MARCA_GERADA;
  /* Só o logo que veio por esta tela pode ser removido por ela. O logo que a
   * plataforma pôs (o do piloto, em `/tenants/…`) não tem volta pelo painel —
   * remover o apagaria de vez. Trocar continua possível. */
  const logoEnviado = iconesDoLogo(brand.logo) !== null;
  /* O monograma é desenhado aqui, e não lido de `/marca.svg`: aquele usa a cor
   * e o nome SALVOS, e a prévia acompanha o rascunho. */
  const monograma = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgDoMonograma(nome, cor))}`;
  const logoNaPrevia = remover ? monograma : recortePrevia ?? (temLogoProprio ? brand.logo : monograma);
  const vaiTerLogo = !remover && (imagem !== null || temLogoProprio);

  const problemaNome = problemaNoNome(nome);
  const problemaCurto = problemaNoNomeCurto(nomeCurto);
  const nomeMudou = nome.trim() !== brand.name;
  const curtoMudou = nomeCurto.trim() !== brand.shortName;
  const corMudou = cor.toLowerCase() !== brand.accentColor.toLowerCase();
  const logoMudou = imagem !== null || remover;
  const mudou = nomeMudou || curtoMudou || corMudou || logoMudou;
  const podeSalvar = mudou && !problemaNome && !problemaCurto && !!avaliacao && !salvando && !preparando;

  function limparAvisos() {
    setAviso(null);
    setErro(null);
  }

  async function escolherArquivo(arquivo: File | undefined) {
    if (entrada.current) entrada.current.value = "";
    if (!arquivo) return;
    limparAvisos();
    const problema = problemaNoArquivo(arquivo);
    if (problema) {
      setErro(problema);
      return;
    }
    setPreparando(true);
    try {
      const nova = await carregarImagem(arquivo);
      setOriginal(nova);
      setVetorial(arquivo.type === "image/svg+xml");
      setUsandoMonograma(false);
      setCanvasMonograma(null);
      setAparar(null);
      setSemFundo(false);
      setNoSimbolo(false);
      setRemover(false);
    } catch (e) {
      console.error("[marca] não consegui ler a imagem", e);
      setErro("Não consegui abrir essa imagem. Tente outro arquivo — PNG costuma funcionar melhor.");
    } finally {
      setPreparando(false);
    }
  }

  /** Desiste do arquivo (ou do monograma) escolhido: volta o logo que está no ar. */
  function cancelarArquivo() {
    limparAvisos();
    setOriginal(null);
    setUsandoMonograma(false);
    setCanvasMonograma(null);
    setNoSimbolo(false);
    setSemFundo(false);
  }

  function usarMonograma() {
    limparAvisos();
    setOriginal(null);
    setNoSimbolo(false);
    setSemFundo(false);
    setRemover(false);
    setUsandoMonograma(true);
  }

  function removerLogo() {
    cancelarArquivo();
    setRemover(true);
  }

  function escolherCor(hex: string) {
    limparAvisos();
    setRascunhoCor(hex);
    setHexDigitado(null);
  }

  function descartar() {
    cancelarArquivo();
    setRemover(false);
    setRascunhoNome(null);
    setRascunhoCurto(null);
    setRascunhoCor(null);
    setHexDigitado(null);
  }

  async function salvar() {
    if (!podeSalvar) return;
    setSalvando(true);
    limparAvisos();
    try {
      /* Ordem importa: os arquivos sobem primeiro, e só com a URL em mãos a
       * ficha muda. Ao contrário, uma queda no meio deixaria a ficha
       * apontando para um logo que não existe — e o topo do app, vazio. */
      let logo: string | null | undefined;
      if (remover) logo = null;
      else if (imagem) {
        const arquivos = await gerarArquivosDaMarca(desenharRecorte(imagem, enquadramento), fundo);
        logo = await enviarMarca(tenant.id, arquivos);
      }
      await salvarMarca(tenant.id, {
        name: nomeMudou ? nome.trim() : undefined,
        shortName: curtoMudou ? nomeCurto.trim() : undefined,
        accentColor: corMudou ? cor.toLowerCase() : undefined,
        logo,
      });
      setAviso(
        remover
          ? "Pronto. Sua barbearia voltou a usar as iniciais como marca."
          : imagem
            ? "Pronto, sua marca foi salva. Quem já instalou o app pode levar um tempo para ver o ícone novo."
            : !temLogoProprio && (nomeMudou || corMudou)
              ? /* O monograma muda com o nome e a cor. O painel acompanha na
                 * hora; o ícone na tela de início e a tela de entrar vêm do
                 * servidor, que leva alguns minutos para reler a ficha. */
                "Pronto, sua marca foi salva. O ícone do app no celular pode levar alguns minutos para mudar."
              : "Pronto, sua marca foi salva."
      );
      cancelarArquivo();
      setRemover(false);
      setRascunhoNome(null);
      setRascunhoCurto(null);
      setRascunhoCor(null);
      setHexDigitado(null);
    } catch (e) {
      console.error("[marca] falha ao salvar", e);
      setErro(mensagemDeFalhaNaMarca(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 pt-1 md:gap-10 md:pt-2">
      <header className="flex flex-col gap-1">
        <p className="text-sm text-ink-muted">Ajustes</p>
        <h1 className="font-display text-3xl text-ink md:text-4xl">Sua marca</h1>
        <p className="max-w-2xl text-sm text-ink-muted">
          O logo, a cor e o nome que seus clientes veem no app, na tela de entrar e no ícone do celular.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-[1.15fr_1fr] md:items-start md:gap-8">
        <div className="flex min-w-0 flex-col gap-4 md:gap-6">
          {/* ── Logo ─────────────────────────────────────────────── */}
          <Card className="flex flex-col gap-4 md:p-6">
            <div>
              <h2 className="text-sm font-semibold text-ink md:text-base">Logo</h2>
              <p className="mt-1 text-xs text-ink-muted md:text-sm">
                PNG, JPG, WEBP ou SVG, até 2 MB. Fundo transparente fica mais bonito.
              </p>
            </div>

            <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
              {imagem ? (
                <RecorteDoLogo imagem={imagem} enquadramento={enquadramento} onChange={setEnquadramento} />
              ) : (
                <div
                  className="flex h-[240px] w-[240px] shrink-0 items-center justify-center overflow-hidden rounded-full border border-border"
                  style={XADREZ}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={logoNaPrevia} alt="Seu logo" className="h-full w-full object-cover" />
                </div>
              )}

              <div className="flex min-w-0 flex-col gap-3">
                <p className="text-xs text-ink-muted">
                  {remover
                    ? "O logo sai ao salvar, e as iniciais voltam no lugar."
                    : usandoMonograma
                      ? "Ícone gerado com as iniciais e a cor da sua marca. Ele muda junto com o nome e a cor."
                      : imagem
                      ? "Arraste para posicionar e use o controle para aproximar. O que está dentro do círculo aparece no app; o quadrado inteiro vai para o ícone do celular."
                      : temLogoProprio
                        ? "Este é o logo que está no ar."
                        : "Por enquanto sua barbearia usa as iniciais como marca."}
                </p>
                <div className="flex flex-wrap gap-2">
                  <input
                    ref={entrada}
                    id="arquivo-do-logo"
                    type="file"
                    accept={ACEITOS}
                    tabIndex={-1}
                    aria-hidden
                    className="sr-only"
                    onChange={(e) => void escolherArquivo(e.target.files?.[0])}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={preparando || salvando}
                    onClick={() => entrada.current?.click()}
                  >
                    {preparando ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
                    {preparando ? "Abrindo…" : temLogoProprio || imagem ? "Trocar logo" : "Enviar logo"}
                  </Button>
                  {(imagem || (logoEnviado && !remover)) && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={preparando || salvando}
                      onClick={imagem ? cancelarArquivo : removerLogo}
                    >
                      <Trash2 size={14} />
                      {imagem ? "Cancelar" : "Remover logo"}
                    </Button>
                  )}
                </div>

                {imagem && (
                  <fieldset className="flex flex-col gap-2">
                    <legend className="text-xs font-medium text-ink">Fundo do ícone do celular</legend>
                    <div className="flex gap-2">
                      {(Object.keys(FUNDOS_DO_ICONE) as FundoDoIcone[]).map((f) => (
                        <button
                          key={f}
                          type="button"
                          aria-pressed={fundo === f}
                          onClick={() => setFundo(f)}
                          className={cn(
                            "flex min-h-11 items-center gap-2 rounded-xl border px-3 text-xs font-medium text-ink transition-colors",
                            fundo === f ? "border-ink bg-surface-raised" : "border-border hover:border-gold/60"
                          )}
                        >
                          <span
                            aria-hidden
                            className="h-5 w-5 rounded-md border border-border"
                            style={{ backgroundColor: FUNDOS_DO_ICONE[f] }}
                          />
                          {f === "claro" ? "Claro" : "Escuro"}
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px] text-ink-muted">
                      Logo branco pede fundo escuro; logo escuro, fundo claro.
                    </p>
                  </fieldset>
                )}
              </div>
            </div>

            {original && (base?.analise?.caixa || podeRemoverFundo || noSimbolo) && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium text-ink">Ajudas automáticas</p>
                <div className="flex flex-wrap gap-2">
                  {base?.analise?.caixa && (
                    <AjudaBotao ativo={aparando} onClick={() => setAparar(!aparando)}>
                      <ScanSearch size={14} aria-hidden /> Recortar as sobras
                    </AjudaBotao>
                  )}
                  {podeRemoverFundo && (
                    <AjudaBotao ativo={semFundo} onClick={() => setSemFundo((v) => !v)}>
                      <Eraser size={14} aria-hidden /> Remover fundo
                    </AjudaBotao>
                  )}
                  {noSimbolo && (
                    <AjudaBotao ativo={false} onClick={() => setNoSimbolo(false)}>
                      Voltar ao logo inteiro
                    </AjudaBotao>
                  )}
                </div>
                <p className="text-[11px] text-ink-muted">
                  Tudo aqui é sugestão: o resultado aparece no recorte e na prévia, e você pode desligar.
                  {semFundo && " O fundo é apagado pela cor das bordas; se comer parte do desenho, desligue."}
                </p>
              </div>
            )}

            {montada.falhou && (
              <p role="status" className="text-xs text-ink-muted">
                Neste aparelho não consegui aplicar as ajudas automáticas. O logo vai inteiro, como você escolheu.
              </p>
            )}

            {avisosDoEnvio.length > 0 && (
              <ul className="flex flex-col gap-2" aria-label="Avisos sobre o logo">
                {avisosDoEnvio.map((a) => (
                  <li
                    key={a.id}
                    className="flex flex-wrap items-center gap-3 rounded-xl border border-gold/40 bg-gold/10 p-3"
                  >
                    <AlertTriangle size={16} className="shrink-0 text-gold-strong" aria-hidden />
                    <p className="min-w-0 flex-1 text-xs text-ink">{a.texto}</p>
                    {a.acao === "simbolo" && (
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" size="sm" onClick={() => setNoSimbolo(true)}>
                          Aproximar no símbolo
                        </Button>
                        <Button type="button" size="sm" variant="secondary" onClick={() => usarMonograma()}>
                          Usar monograma
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {noSimbolo && base?.simbolo && !base.simbolo.confiavel && (
              <p role="status" className="text-xs text-ink-muted">
                Não achei um símbolo separado do nome. Aproximei no centro, pela altura do logo: confira o recorte
                e arraste se precisar.
              </p>
            )}

            <div className="flex flex-col gap-2 border-t border-border pt-4">
              <p className="text-xs font-medium text-ink">Sem logo pronto? Gere um ícone com as iniciais</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  aria-pressed={usandoMonograma}
                  disabled={preparando || salvando}
                  onClick={() => usarMonograma()}
                  className={cn(
                    "flex min-h-11 items-center gap-2 rounded-controle border px-3 text-xs font-medium text-ink transition-colors",
                    usandoMonograma ? "border-ink bg-surface-raised" : "border-border hover:border-gold/60"
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={monograma} alt="" width={28} height={28} className="h-7 w-7 rounded-full" />
                  Gerar monograma
                </button>
              </div>
              <p className="text-[11px] text-ink-muted">
                Usa as iniciais do nome e a cor de destaque. Sobe como qualquer logo, com os mesmos ícones do celular.
              </p>
            </div>
          </Card>

          {/* ── Nome ─────────────────────────────────────────────── */}
          <Card className="flex flex-col gap-4 md:p-6">
            <h2 className="text-sm font-semibold text-ink md:text-base">Nome</h2>
            <Campo
              id="nome"
              label="Nome da barbearia"
              dica="Aparece na tela de entrar, nas mensagens e no título do app."
              valor={nome}
              maximo={NOME_MAXIMO}
              problema={problemaNome}
              onChange={(v) => {
                limparAvisos();
                setRascunhoNome(v);
              }}
            />
            <Campo
              id="nome-curto"
              label="Nome curto"
              dica="Debaixo do ícone na tela inicial do celular e no topo do app."
              valor={nomeCurto}
              maximo={NOME_CURTO_MAXIMO}
              problema={problemaCurto}
              onChange={(v) => {
                limparAvisos();
                setRascunhoCurto(v);
              }}
            />
          </Card>

          {/* ── Cor ──────────────────────────────────────────────── */}
          <Card className="flex flex-col gap-4 md:p-6">
            <div>
              <h2 className="text-sm font-semibold text-ink md:text-base">Cor de destaque</h2>
              <p className="mt-1 text-xs text-ink-muted md:text-sm">
                A cor dos botões e destaques. O resto do visual é fixo, para o texto continuar legível.
              </p>
            </div>

            {corSugerida && corSugerida !== cor.toLowerCase() && (
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gold/40 bg-gold/10 p-3">
                <span
                  aria-hidden
                  className="h-9 w-9 shrink-0 rounded-lg border border-border"
                  style={{ backgroundColor: corSugerida }}
                />
                <p className="min-w-0 flex-1 text-xs text-ink">
                  <Sparkles size={12} className="mr-1 inline text-gold-strong" aria-hidden />
                  Encontramos esta cor no seu logo. Quer usá-la nos botões?
                </p>
                <Button type="button" size="sm" onClick={() => escolherCor(corSugerida)}>
                  Usar esta cor
                </Button>
              </div>
            )}

            <div className="flex flex-wrap gap-2" role="group" aria-label="Cores prontas">
              {CORES_PRONTAS.map((c) => {
                const ativa = cor.toLowerCase() === c.hex;
                return (
                  <button
                    key={c.hex}
                    type="button"
                    title={c.nome}
                    aria-label={c.nome}
                    aria-pressed={ativa}
                    onClick={() => escolherCor(c.hex)}
                    style={{ backgroundColor: c.hex }}
                    className={cn(
                      "flex h-11 w-11 items-center justify-center rounded-xl border-2 transition-transform",
                      ativa ? "scale-105 border-ink" : "border-transparent"
                    )}
                  >
                    {ativa && <Check size={16} className="text-ink" aria-hidden />}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-3">
              <label
                className="relative h-11 w-11 shrink-0 cursor-pointer overflow-hidden rounded-xl border border-border"
                style={{ backgroundColor: cor }}
              >
                <span className="sr-only">Escolher outra cor</span>
                <input
                  type="color"
                  value={cor.toLowerCase()}
                  onChange={(e) => escolherCor(e.target.value)}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
              </label>
              <div className="flex flex-col gap-1">
                <label htmlFor="cor-hex" className="text-xs font-medium text-ink">
                  Código da cor
                </label>
                <input
                  id="cor-hex"
                  inputMode="text"
                  autoCapitalize="off"
                  spellCheck={false}
                  maxLength={7}
                  value={hexDigitado ?? cor.toLowerCase()}
                  onChange={(e) => {
                    limparAvisos();
                    const v = e.target.value;
                    setHexDigitado(v);
                    const hex = normalizarHex(v);
                    if (hex) setRascunhoCor(hex);
                  }}
                  onBlur={() => setHexDigitado(null)}
                  aria-invalid={hexDigitado !== null && !normalizarHex(hexDigitado)}
                  className="min-h-11 w-32 rounded-xl border border-border bg-surface px-3 font-mono text-sm text-ink focus:border-gold focus:outline-none"
                />
              </div>
            </div>
            {hexDigitado !== null && !normalizarHex(hexDigitado) && (
              <p className="text-xs text-danger">Use o formato #RRGGBB, por exemplo #b8863a.</p>
            )}

            {avaliacao && <ConferenciaDeContraste cor={cor} avaliacao={avaliacao} />}
          </Card>
        </div>

        {/* ── Prévia ─────────────────────────────────────────────── */}
        <Card className="flex min-w-0 flex-col gap-4 md:sticky md:top-4 md:p-6">
          <div>
            <h2 className="text-sm font-semibold text-ink md:text-base">Como seus clientes veem</h2>
            <p className="mt-1 text-xs text-ink-muted md:text-sm">Prévia com o que está escolhido agora.</p>
          </div>
          {imagem && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-ink">Em tamanho real</p>
              <PreviaEmTamanhoReal
                logo={logoNaPrevia}
                nomeCurto={nomeCurto.trim()}
                rotulo={brand.panelLabel}
                fundoDoIcone={FUNDOS_DO_ICONE[fundo]}
              />
            </div>
          )}
          <PreviaDaMarca
            logo={logoNaPrevia}
            nome={nome.trim()}
            nomeCurto={nomeCurto.trim()}
            corDoBotao={avaliacao?.corDoBotao ?? brand.accentColor}
            fundoDoIcone={vaiTerLogo ? FUNDOS_DO_ICONE[imagem ? fundo : "claro"] : null}
          />
        </Card>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={salvar} disabled={!podeSalvar}>
          {salvando ? <Loader2 size={16} className="animate-spin" /> : null}
          {salvando ? "Salvando…" : "Salvar marca"}
        </Button>
        {mudou && !salvando && (
          <Button variant="ghost" onClick={descartar}>
            Descartar
          </Button>
        )}
        {aviso && !mudou && (
          <span role="status" className="flex items-center gap-1 text-xs text-success">
            <Check size={13} /> {aviso}
          </span>
        )}
        {erro && (
          <p role="alert" className="text-xs text-danger">
            {erro}
          </p>
        )}
      </div>
    </div>
  );
}

function AjudaBotao({
  ativo,
  onClick,
  children,
}: {
  ativo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      onClick={onClick}
      className={cn(
        "flex min-h-11 items-center gap-2 rounded-xl border px-3 text-xs font-medium text-ink transition-colors",
        ativo ? "border-ink bg-surface-raised" : "border-border hover:border-gold/60"
      )}
    >
      {children}
    </button>
  );
}

function Campo({
  id,
  label,
  dica,
  valor,
  maximo,
  problema,
  onChange,
}: {
  id: string;
  label: string;
  dica: string;
  valor: string;
  maximo: number;
  problema: string | null;
  onChange: (v: string) => void;
}) {
  const tamanho = valor.trim().length;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {label}
        </label>
        <span className={cn("text-[11px] tabular-nums", tamanho > maximo ? "text-danger" : "text-ink-muted")}>
          {tamanho}/{maximo}
        </span>
      </div>
      <p id={`${id}-dica`} className="text-xs text-ink-muted">
        {dica}
      </p>
      <input
        id={id}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!problema}
        aria-describedby={problema ? `${id}-erro` : `${id}-dica`}
        className="min-h-11 rounded-xl border border-border bg-surface px-3 text-sm text-ink focus:border-gold focus:outline-none aria-[invalid=true]:border-danger"
      />
      {problema && (
        <p id={`${id}-erro`} className="text-xs text-danger">
          {problema}
        </p>
      )}
    </div>
  );
}

/**
 * Os dois números que importam, com o que o app faz com cada um. Não bloqueia
 * nada — `tonsDaMarca` já protege o texto —, mas o dono vê antes de salvar.
 */
function ConferenciaDeContraste({
  cor,
  avaliacao,
}: {
  cor: string;
  avaliacao: NonNullable<ReturnType<typeof avaliarCor>>;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface-raised p-3 text-xs">
      <p className="font-medium text-ink">Leitura (WCAG)</p>
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="inline-flex h-7 min-w-16 items-center justify-center rounded-lg px-2 text-[11px] font-semibold text-ink"
          style={{ backgroundColor: avaliacao.corDoBotao }}
        >
          Agendar
        </span>
        <p className="min-w-0 flex-1 text-ink">
          Texto do botão: <strong>{formatarContraste(avaliacao.contrasteDoBotao)}</strong>
          {" — "}
          {avaliacao.botaoAjustado
            ? "essa cor é escura para o texto dos botões, então clareamos o tom (é o que aparece na prévia)."
            : "boa leitura."}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span aria-hidden className="inline-flex h-7 min-w-16 items-center justify-center rounded-lg border border-border bg-white">
          <span className="h-3 w-3 rounded-full" style={{ backgroundColor: cor }} />
        </span>
        <p className={cn("min-w-0 flex-1", avaliacao.fracaNoFundo ? "text-danger" : "text-ink")}>
          {avaliacao.fracaNoFundo && <AlertTriangle size={12} className="mr-1 inline" aria-hidden />}
          Sobre o fundo branco: <strong>{formatarContraste(avaliacao.contrasteNoFundo)}</strong>
          {" — "}
          {avaliacao.fracaNoFundo
            ? "clara demais: detalhes nessa cor quase somem. Prefira um tom mais forte."
            : "aparece bem."}
        </p>
      </div>
    </div>
  );
}
