/**
 * Extrai o primeiro número em formato brasileiro (ponto = milhares, vírgula = decimais).
 * Ex.: "1.600,00" → 1600, "250.000" → 250000, "120,5" → 120.5, "1.234.567,89" → 1234567.89.
 * Limitação conhecida (contexto BR): um grupo de pontos que NÃO seja milhares válido
 * ("1.23", "1.5") é lido só pela parte inteira ("1.23" → 1). Inputs assim não são esperados em dados BR.
 */
export function parsearNumeroBr(texto: string): number | null {
  if (!texto) return null
  const m = texto.match(/\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?/)
  if (!m) return null
  const limpo = m[0].replace(/\./g, "").replace(",", ".")
  const n = Number.parseFloat(limpo)
  return Number.isFinite(n) ? n : null
}
