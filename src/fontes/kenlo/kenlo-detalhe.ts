import * as cheerio from "cheerio"
import type { CheerioAPI } from "cheerio"
import { Result } from "../../shared/result"
import { ErroValidacao } from "../../domain/imovel/erro-validacao"
import { Imovel } from "../../domain/imovel/imovel"
import { Caracteristica } from "../../domain/imovel/caracteristica"
import { parsearAreaM2 } from "../../normalizadores/area"
import { parsearInteiro } from "../../normalizadores/inteiro"
import { caracteristicaBooleanaDeRotulo } from "./caracteristicas-grupos"
import { KenloContexto, DicaListagem } from "./estrategia"

export type { DicaListagem } from "./estrategia"

// Formas mínimas do JSON-LD que efetivamente lemos (boundary tipado).
interface OfferLd {
  price?: string | number
}
interface ProductLd {
  sku?: string
  description?: string
  image?: string
  offers?: OfferLd | OfferLd[]
}
interface BreadcrumbItemLd {
  position?: number
  name?: string
  item?: { name?: string }
}
interface BreadcrumbLd {
  itemListElement?: BreadcrumbItemLd[]
}

// breadcrumb: Home/Imóveis/finalidade/tipo/CIDADE/BAIRRO/ref — ver ACHADOS.md
const POS_CIDADE = 5
const POS_BAIRRO = 6

function refDePath(url: string): string {
  try {
    const p = url.startsWith("http") ? new URL(url).pathname : url
    const segs = p.split("/").filter(Boolean)
    return (segs[segs.length - 1] ?? "").trim()
  } catch {
    return ""
  }
}

/** Junta todos os blocos JSON-LD (<script type=application/ld+json>) num array plano. */
function blocosJsonLd($: CheerioAPI): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const parsed = JSON.parse($(el).contents().text())
      if (Array.isArray(parsed)) out.push(...parsed)
      else out.push(parsed)
    } catch {
      /* bloco malformado → ignora */
    }
  })
  return out
}

function porTipo<T>(blocos: Record<string, unknown>[], tipo: string): T | undefined {
  return blocos.find((b) => {
    const t = (b as any)["@type"]
    return t === tipo || (Array.isArray(t) && t.includes(tipo))
  }) as T | undefined
}

/** Valor do par "item-info": <span class=item-info-title>LABEL</span><span class=item-info-value>V</span>. */
function valorItemInfo($: CheerioAPI, label: string): string | undefined {
  let v: string | undefined
  $("span.item-info-title").each((_, el) => {
    if (v) return
    if ($(el).text().trim().toLowerCase() === label.toLowerCase()) {
      v = $(el).next("span.item-info-value").text().trim() || undefined
    }
  })
  return v
}

export function imovelDeHtmlDetalhe(
  html: string,
  url: string,
  dica: DicaListagem,
  ctx: KenloContexto,
): Result<Imovel, ErroValidacao[]> {
  const $ = cheerio.load(html)
  const blocos = blocosJsonLd($)
  const product = porTipo<ProductLd>(blocos, "Product")

  // ref: link canonical (último segmento), fallback Product.sku ou a própria url.
  const canonical = $('link[rel="canonical"]').attr("href")
  const ref = refDePath(canonical ?? url) || String(product?.sku ?? "")

  // preço: Product.offers[].price (presente só quando há preço; ausência = "sob consulta").
  const offers = product?.offers
  const off = Array.isArray(offers) ? offers[0] : offers
  const precoNum = off?.price != null ? Number(off.price) : NaN
  const preco =
    Number.isFinite(precoNum) && precoNum > 0
      ? {
          valor: precoNum,
          moeda: "BRL" as const,
          periodo: dica.finalidade === "ALUGUER" ? ("MENSAL" as const) : ("TOTAL" as const),
        }
      : undefined

  // características numéricas (DOM, pares item-info).
  const quartos = parsearInteiro(valorItemInfo($, "Quartos") ?? "") ?? undefined
  const banheiros = parsearInteiro(valorItemInfo($, "Banheiros") ?? "") ?? undefined
  const areaM2 = parsearAreaM2(valorItemInfo($, "Área útil") ?? valorItemInfo($, "Área") ?? "") ?? undefined
  const suites = parsearInteiro(valorItemInfo($, "Suíte") ?? valorItemInfo($, "Suítes") ?? "") ?? null

  // comodidades (DOM, box-amenities > p) + suíte como NUMERICA.
  const itens: Caracteristica[] = []
  if (suites && suites > 0) {
    const cs = Caracteristica.criar({ idtFonte: 0, chave: "suite", rotulo: "Suíte", grupo: "suite", tipo: "NUMERICA", valorNum: suites })
    if (cs.ok) itens.push(cs.value)
  }
  $("div.box-amenities > p").each((_, el) => {
    const rotulo = $(el).text().trim().replace(/\s+/g, " ")
    if (rotulo.length >= 2 && rotulo.length <= 50) {
      const c = caracteristicaBooleanaDeRotulo(rotulo)
      if (c.ok) itens.push(c.value)
    }
  })
  const lista = itens.filter((i) => i.tipo === "BOOLEANA" && i.valorBool === true).map((i) => i.rotulo)

  // localização (breadcrumb JSON-LD pos5 cidade / pos6 bairro) + título.
  const titulo = ($("h1 span").first().text().trim() || $("h1").first().text().trim()) || undefined
  const bc = porTipo<BreadcrumbLd>(blocos, "BreadcrumbList")
  const itensBc: BreadcrumbItemLd[] = Array.isArray(bc?.itemListElement) ? bc.itemListElement : []
  const nomeBc = (pos: number): string | undefined => {
    const it = itensBc.find((i) => i?.position === pos) ?? itensBc[pos - 1]
    const nome = it?.item?.name ?? it?.name
    return typeof nome === "string" && nome.trim() ? nome.trim() : undefined
  }
  const cidade = nomeBc(POS_CIDADE)
  const bairro = nomeBc(POS_BAIRRO)
  const descricao = (typeof product?.description === "string" ? product.description : $("div.box-description span").first().text()).trim() || undefined
  const fotoPrincipal = $('img[src*="img.kenlo.io"]').first().attr("src") ?? (typeof product?.image === "string" ? product.image : undefined)

  return Imovel.criar({
    ref,
    clienteId: ctx.clienteId,
    urlSite: url,
    finalidade: dica.finalidade,
    preco,
    localizacao: { zonaTexto: titulo ?? bairro ?? cidade ?? ctx.origin, cidade, bairro },
    caracteristicas: { tipoImovel: dica.tipoImovel, areaM2, quartos, casasBanho: banheiros, titulo, descricao, lista, itens },
    media: { fotoPrincipal },
    extras: { precoSobConsulta: preco == null },
    estado: { ativo: true, extraidoEm: ctx.extraidoEm, atualizadoEm: ctx.extraidoEm, hashConteudo: "" },
  })
}
