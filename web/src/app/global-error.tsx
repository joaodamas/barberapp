"use client";

import { useEffect } from "react";
import { relatarErro } from "@/lib/erro-front-cliente";

/**
 * O último limite: quando quebra o próprio layout raiz, `error.tsx` não
 * alcança (ele vive DENTRO do layout). Este substitui o documento inteiro, por
 * isso traz `<html>` e `<body>` e não depende de CSS, provider nem fonte —
 * tudo isso pode ser justamente o que quebrou.
 */
export default function ErroGlobal({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global]", error.digest ?? "", error);
    relatarErro("global", error, error.digest);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          padding: 24,
          textAlign: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#f6f6f4",
          color: "#1a1916",
        }}
      >
        <h1 style={{ fontSize: 20, margin: 0 }}>Esta tela não abriu</h1>
        <p style={{ maxWidth: 360, fontSize: 14, margin: 0 }}>
          Alguma coisa quebrou ao montar a página. <strong>O que você já tinha registrado está salvo</strong> — o que
          falhou foi mostrar, não gravar.
        </p>
        <button
          onClick={reset}
          style={{ minHeight: 44, padding: "0 20px", borderRadius: 12, border: 0, background: "#c9a227", fontWeight: 600 }}
        >
          Tentar de novo
        </button>
        {error.digest && <p style={{ fontSize: 11, margin: 0 }}>Código para suporte: {error.digest}</p>}
      </body>
    </html>
  );
}
