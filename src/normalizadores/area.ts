import { parsearNumeroBr } from "./numero-br"

export function parsearAreaM2(texto: string): number | null {
  if (!texto) return null
  const m = texto.match(/([\d.,]+)\s*m(?:²|2)/i)
  if (!m) return null
  return parsearNumeroBr(m[1])
}
