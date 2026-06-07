export function parsearInteiro(texto: string): number | null {
  if (!texto) return null
  const m = texto.match(/\d+/)
  if (!m) return null
  const n = Number.parseInt(m[0], 10)
  return Number.isFinite(n) ? n : null
}
