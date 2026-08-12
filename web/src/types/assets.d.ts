/// <reference types="next/image-types/global" />

/**
 * Declara os tipos de `import foto from "…/foto.webp"`.
 *
 * Isto vive em `next-env.d.ts` — que o Next **gera durante o build** e que o
 * `.gitignore` exclui, por ser artefato. Como a esteira roda `typecheck` ANTES
 * de `build`, o arquivo não existe na hora da checagem e os dois imports de
 * `.webp` da landing quebravam com `TS2307: Cannot find module`.
 *
 * Na máquina de quem já tinha buildado uma vez, passava. É o formato clássico
 * do defeito que só a esteira encontra: o typecheck lia um arquivo que ninguém
 * versionou e que só existe depois de um passo posterior.
 *
 * Uma linha versionada resolve sem duplicar declaração: é a mesma referência
 * que o arquivo gerado usa, só que num arquivo que é nosso.
 */

export {};
