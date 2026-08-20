import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    /* Cache local do Firebase — bundle JÁ MINIFICADO de um deploy anterior.
     *
     * Sem esta linha, `npm run lint` varre os chunks publicados e devolve
     * milhares de problemas em código que ninguém escreveu: 22 erros e 3.589
     * avisos, todos em arquivos de uma linha. O comando fica inútil, e um
     * comando de verificação que ninguém consegue ler é um comando que ninguém
     * roda — que é como um defeito real passa despercebido no meio do ruído.
     *
     * Não aparece no CI, porque lá `.firebase/` não existe: ele nasce de um
     * deploy feito da máquina, e por isso está no `.gitignore` mas não estava
     * aqui. */
    ".firebase/**",
  ]),
]);

export default eslintConfig;
