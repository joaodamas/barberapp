/** Converte o formato de valores da API REST do Firestore em objetos comuns. Puro (sem Firebase). */
export type ValorRest = Record<string, unknown>;

function converter(v: ValorRest): unknown {
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return Number(v.doubleValue);
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("timestampValue" in v) return v.timestampValue;
  if ("mapValue" in v) return converterCampos(((v.mapValue as ValorRest)?.fields ?? {}) as Record<string, ValorRest>);
  if ("arrayValue" in v) return (((v.arrayValue as ValorRest)?.values ?? []) as ValorRest[]).map(converter);
  return undefined;
}

export function converterCampos(campos: Record<string, ValorRest>): Record<string, unknown> {
  const saida: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(campos)) saida[k] = converter(v);
  return saida;
}

