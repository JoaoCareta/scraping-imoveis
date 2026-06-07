import { Finalidade } from "../domain/imovel/finalidade"

// Segmentos após /imovel/ : [finalidade, tipo, cidade, localidade, codigo]
export function segmentosImovel(url: string): string[] {
  if (!url) return []
  try {
    const path = url.startsWith("http") ? new URL(url).pathname : url
    const i = path.toLowerCase().indexOf("/imovel/")
    const base = i >= 0 ? path.slice(i + "/imovel/".length) : path.replace(/^\//, "")
    return base.split("/").filter(Boolean)
  } catch {
    return []
  }
}

export function finalidadeDeUrl(url: string): Finalidade | null {
  const seg = segmentosImovel(url)[0]
  if (!seg) return null
  const s = seg.toLowerCase()
  if (s.includes("venda")) return "VENDA"
  if (s.includes("locacao")) return "ALUGUER"
  return null
}

export function tipoImovelDeUrl(url: string): string | null {
  const seg = segmentosImovel(url)[1]
  if (!seg) return null
  const s = seg.toLowerCase()
  const mapa: Record<string, string> = {
    apartamentos: "apartamento",
    casas: "casa",
    comercial: "comercial",
    terrenos: "terreno",
    lotes: "lote",
    galpoes: "galpao",
    escritorios: "escritorio",
    salas: "sala",
  }
  return mapa[s] ?? s
}

export function cidadeDeUrl(url: string): string | null {
  const seg = segmentosImovel(url)[2]
  if (!seg) return null
  return seg
    .split("-")
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ")
}

export function refDeUrl(url: string): string | null {
  const segs = segmentosImovel(url)
  const ultimo = segs[segs.length - 1]
  if (!ultimo) return null
  const limpo = ultimo.trim()
  return limpo.length > 0 ? limpo : null
}
