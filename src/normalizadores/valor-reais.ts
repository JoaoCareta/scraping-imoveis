import { parsearNumeroBr } from "./numero-br"

/**
 * Extrai o primeiro número que aparece após "R$" (case-insensitive).
 * Exige o contexto "R$" para não capturar áreas/outros números como preço.
 * Nota: devolve o primeiro número após "R$", mesmo que exista texto entre o "R$" e o número.
 */
export function parsearValorReais(texto: string): number | null {
  if (!texto) return null
  const idx = texto.search(/r\$/i)
  if (idx < 0) return null
  return parsearNumeroBr(texto.slice(idx + 2))
}
