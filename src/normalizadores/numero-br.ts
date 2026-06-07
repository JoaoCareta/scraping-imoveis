// Extrai o primeiro número em formato brasileiro (ponto=milhares, vírgula=decimais).
export function parsearNumeroBr(texto: string): number | null {
  if (!texto) return null
  const m = texto.match(/\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?/)
  if (!m) return null
  const limpo = m[0].replace(/\./g, "").replace(",", ".")
  const n = Number.parseFloat(limpo)
  return Number.isFinite(n) ? n : null
}
