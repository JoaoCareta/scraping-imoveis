import { parsearNumeroBr } from "./numero-br"

// Exige o contexto "R$" para não capturar áreas/outros números como preço.
export function parsearValorReais(texto: string): number | null {
  if (!texto) return null
  const idx = texto.search(/r\$/i)
  if (idx < 0) return null
  return parsearNumeroBr(texto.slice(idx + 2))
}
