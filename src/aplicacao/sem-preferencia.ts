/**
 * Valores "coringa" que clientes (ex.: o modelo do n8n) enviam para significar
 * "sem preferência". São tratados como ausentes — nunca filtram.
 */
export const VALORES_SEM_PREFERENCIA = new Set([
  "qualquer",
  "qualquer um",
  "qualquer uma",
  "qualquer cidade",
  "qualquer bairro",
  "qualquer tipo",
  "qualquer lugar",
  "qualquer regiao",
  "qualquer região",
  "todos",
  "todas",
  "todos os tipos",
  "ambos",
  "os dois",
  "any",
  "indiferente",
  "tanto faz",
  "sem preferencia",
  "sem preferência",
  "nao sei",
  "não sei",
  "nenhum",
  "nenhuma",
  "n/a",
  "na",
])

/** True se o valor for vazio/espaços ou um coringa de "sem preferência". */
export function ehSemPreferencia(valor: string): boolean {
  const v = valor.trim().toLowerCase()
  return v === "" || VALORES_SEM_PREFERENCIA.has(v)
}
