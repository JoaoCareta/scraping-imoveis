import { Finalidade } from "../../domain/imovel/finalidade"
import { PeriodoPreco } from "../../domain/imovel/preco"
import { PropsLocalizacao } from "../../domain/imovel/localizacao"
import { Caracteristicas } from "../../domain/imovel/tipos"
import { parsearNumeroBr } from "../../normalizadores/numero-br"
import { parsearInteiro } from "../../normalizadores/inteiro"
import { MoldSystemsSolrDoc, MoldSystemsChar } from "./solr-doc"

export interface OperacaoPreco {
  finalidade: Finalidade
  valor: number
  periodo: PeriodoPreco
}

function lerChars(doc: MoldSystemsSolrDoc): MoldSystemsChar[] {
  try {
    return JSON.parse(doc.jsonCharacteristics ?? "[]") as MoldSystemsChar[]
  } catch {
    return []
  }
}

const IDT_AREA = [95, 2]

function areaDeDoc(doc: MoldSystemsSolrDoc): number | undefined {
  const c = lerChars(doc).find((x) => x.characteristics && IDT_AREA.includes(x.characteristics.idtCharacteristics))
  if (!c) return undefined
  const n = parsearNumeroBr(c.desInformationFormatted ?? c.desInformation ?? "")
  return n ?? undefined
}

function banheirosDeDoc(doc: MoldSystemsSolrDoc): number | undefined {
  const m = (doc.desResumeCharacteristics ?? "").match(/(\d+)\s+(?:total de\s+)?banheiro/i)
  if (!m) return undefined
  return parsearInteiro(m[1]) ?? undefined
}

function tipoSingular(cat?: string): string | undefined {
  if (!cat) return undefined
  const s = cat.trim().toLowerCase()
  const mapa: Record<string, string> = {
    apartamentos: "apartamento",
    casas: "casa",
    comercial: "comercial",
    terrenos: "terreno",
    lotes: "lote",
    galpoes: "galpao",
    salas: "sala",
  }
  return mapa[s] ?? s
}

export function localizacaoDeDoc(doc: MoldSystemsSolrDoc): PropsLocalizacao {
  const zonaTexto = doc.namDistrict || doc.namCity || doc.fullAddress || ""
  return { zonaTexto, bairro: doc.namDistrict, cidade: doc.namCity, estado: doc.namState }
}

export function caracteristicasDeDoc(doc: MoldSystemsSolrDoc): Caracteristicas {
  return {
    tipoImovel: tipoSingular(doc.namCategory),
    tipologia: doc.namSubCategory,
    areaM2: areaDeDoc(doc),
    quartos: typeof doc.totalRooms === "number" ? doc.totalRooms : undefined,
    casasBanho: banheirosDeDoc(doc),
    lista: [],
  }
}

export function finalidadesDeDoc(doc: MoldSystemsSolrDoc): OperacaoPreco[] {
  const out: OperacaoPreco[] = []
  if (typeof doc.valLocation === "number" && doc.valLocation > 0) {
    out.push({ finalidade: "ALUGUER", valor: doc.valLocation, periodo: "MENSAL" })
  }
  if (typeof doc.valSales === "number" && doc.valSales > 0) {
    out.push({ finalidade: "VENDA", valor: doc.valSales, periodo: "TOTAL" })
  }
  return out
}
