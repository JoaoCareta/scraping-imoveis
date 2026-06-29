import * as cheerio from "cheerio"

function absoluta(href: string, origin: string): string | undefined {
  try {
    return new URL(href, origin).toString()
  } catch {
    return undefined
  }
}

/** Última parte do path (.../{REF}) — usada para deduplicar variantes de slug. */
function refDeUrl(u: string): string {
  try {
    const segs = new URL(u).pathname.split("/").filter(Boolean)
    return segs[segs.length - 1] ?? u
  } catch {
    return u
  }
}

/**
 * URLs de detalhe (/imovel/.../{REF}) de uma página de listagem, deduplicadas por REF.
 * Âncora estável: links cujo href contém "/imovel/" (≠ "/imoveis/" da navegação).
 * O Cheerio parseia só o DOM real — a 2ª cópia escapada (hidratação Marko) fica dentro
 * de um <script> e não vira <a>, então não é contada. A dedup por REF cobre slugs repetidos.
 */
export function urlsDeDetalheDaListagem(html: string, origin: string): string[] {
  const $ = cheerio.load(html)
  const porRef = new Map<string, string>()
  $('a[href*="/imovel/"]').each((_, el) => {
    const href = $(el).attr("href")
    if (!href) return
    const limpo = href.split("#")[0].split("?")[0]
    const abs = absoluta(limpo, origin)
    if (!abs || !abs.includes("/imovel/")) return
    const ref = refDeUrl(abs)
    if (ref && !porRef.has(ref)) porRef.set(ref, abs)
  })
  return [...porRef.values()]
}
