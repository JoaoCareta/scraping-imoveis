import { Result } from "../../shared/result"
import { ErroValidacao } from "../../domain/imovel/erro-validacao"
import { Imovel } from "../../domain/imovel/imovel"
import { Finalidade } from "../../domain/imovel/finalidade"
import { PeriodoPreco } from "../../domain/imovel/preco"
import { PropsLocalizacao } from "../../domain/imovel/localizacao"
import { Caracteristicas } from "../../domain/imovel/tipos"
import { parsearNumeroBr } from "../../normalizadores/numero-br"
import { parsearInteiro } from "../../normalizadores/inteiro"
import { MoldSystemsSolrDoc, MoldSystemsChar, MoldSystemsContexto, MoldSystemsFoto } from "./solr-doc"

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

// Fix 5 — priority order: iterate IDT_AREA in order (95 before 2), decimal fallback
function areaDeDoc(doc: MoldSystemsSolrDoc): number | undefined {
  const chars = lerChars(doc)
  for (const idt of IDT_AREA) {
    const c = chars.find((x) => x.characteristics?.idtCharacteristics === idt)
    if (c) {
      if (c.desInformationFormatted) {
        const n = parsearNumeroBr(c.desInformationFormatted)
        if (n != null) return n
      }
      if (c.desInformation) {
        const n = Number.parseFloat(c.desInformation)
        if (Number.isFinite(n)) return n
      }
    }
  }
  return undefined
}

// Fix 6 — treats 0 as undefined
function banheirosDeDoc(doc: MoldSystemsSolrDoc): number | undefined {
  const m = (doc.desResumeCharacteristics ?? "").match(/(\d+)\s+(?:total de\s+)?banheiro/i)
  if (!m) return undefined
  const n = parsearInteiro(m[1])
  return n != null && n > 0 ? n : undefined
}

// Fix 1 — NFD-normalize before map lookup (strips accents like Galpões → galpoes)
function tipoSingular(cat?: string): string | undefined {
  if (!cat) return undefined
  const s = cat.trim().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
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

const SLUG_FINALIDADE: Record<Finalidade, string> = { ALUGUER: "locacao", VENDA: "venda" }

function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
}

// Fix 4 — sentinels for empty slug segments
export function urlSiteDeDoc(doc: MoldSystemsSolrDoc, ctx: MoldSystemsContexto, finalidade: Finalidade): string {
  const fin = SLUG_FINALIDADE[finalidade]
  const cat = slug(doc.namCategory ?? "") || "sem-categoria"
  const cidade = slug(doc.namCity ?? "") || "sem-cidade"
  const loc = doc.desUriLandingPage ?? "imovel"
  return `${ctx.origin}/imovel/${fin}/${cat}/${cidade}/${loc}/${doc.idtProperty}`
}

export function fotoPrincipalDeDoc(doc: MoldSystemsSolrDoc): string | undefined {
  try {
    const fotos = JSON.parse(doc.jsonPhotos ?? "[]") as MoldSystemsFoto[]
    const visivel = fotos.find((f) => f.urlPhoto && !f.flgNotShowSite)
    return visivel?.urlPhoto
  } catch {
    return undefined
  }
}

// Fix 7 — harden indBusy: any non-zero number counts as ocupado
export function ativoDeDoc(doc: MoldSystemsSolrDoc): boolean {
  const mostra = doc.flgShowSite !== false
  const ocupado = doc.indBusy === true || (typeof doc.indBusy === "number" && doc.indBusy !== 0)
  return mostra && !ocupado
}

// Fix 3 — expose indStatus in extras
export function extrasDeDoc(doc: MoldSystemsSolrDoc): Record<string, unknown> {
  const e: Record<string, unknown> = {}
  if (doc.totalGarages != null) e["vagas"] = doc.totalGarages
  if (doc.valCondominium != null) e["condominio"] = doc.valCondominium
  if (doc.valMonthIptu != null) e["iptu"] = doc.valMonthIptu
  if (doc.idtTenant != null) e["idtTenant"] = doc.idtTenant
  if (doc.namState != null) e["estadoNome"] = doc.namState
  if (doc.indStatus != null) e["indStatus"] = doc.indStatus
  return e
}

// Fix 2 — content-based hash, not timestamp-dependent
function hashDeDoc(doc: MoldSystemsSolrDoc): string {
  return [
    doc.valLocation, doc.valSales, doc.valCondominium, doc.valMonthIptu,
    doc.totalRooms, doc.totalGarages, doc.namCategory, doc.namSubCategory,
    doc.namDistrict, doc.namCity, doc.namState, doc.flgShowSite, doc.indBusy,
    doc.indStatus, doc.dtaUpdate,
  ].map((v) => String(v ?? "")).join("|")
}

export function imoveisDeSolrDoc(
  doc: MoldSystemsSolrDoc,
  ctx: MoldSystemsContexto,
): Array<Result<Imovel, ErroValidacao[]>> {
  const operacoes = finalidadesDeDoc(doc)
  const localizacao = localizacaoDeDoc(doc)
  const caracteristicas = caracteristicasDeDoc(doc)
  const media = { fotoPrincipal: fotoPrincipalDeDoc(doc) }
  const extras = extrasDeDoc(doc)
  const ativo = ativoDeDoc(doc)
  const ref = String(doc.idtProperty)

  return operacoes.map((op) =>
    Imovel.criar({
      ref,
      clienteId: ctx.clienteId,
      urlSite: urlSiteDeDoc(doc, ctx, op.finalidade),
      finalidade: op.finalidade,
      preco: { valor: op.valor, moeda: "BRL", periodo: op.periodo },
      localizacao,
      caracteristicas,
      media,
      extras,
      estado: {
        ativo,
        extraidoEm: ctx.extraidoEm,
        atualizadoEm: doc.dtaUpdate ?? ctx.extraidoEm,
        hashConteudo: hashDeDoc(doc),
      },
    }),
  )
}
