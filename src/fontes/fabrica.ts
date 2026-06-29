import { Config } from "../config"
import { FonteDeImoveis } from "./fonte-de-imoveis"
import { MoldSystemsFonte } from "./moldsystems/moldsystems-fonte"
import { KenloFonte } from "./kenlo/kenlo-fonte"
import { ColetaHtmlKenlo, SeedListagem } from "./kenlo/coleta-html"

// Tipos de listagem do caires (Kenlo). Seeds inexistentes para um tipo só dão 404 na
// página 1 e são ignorados sem erro — então a lista pode ser ampla com segurança.
const TIPOS_KENLO = [
  "apartamento", "casa", "cobertura", "sobrado", "kitnet", "flat", "studio", "terreno",
  "sala", "salao", "ponto", "area", "chacara", "sitio", "fazenda", "barracao", "galpao", "loja",
]
const SEEDS_KENLO: SeedListagem[] = [
  ...TIPOS_KENLO.map((t) => ({ path: `/imoveis/a-venda/${t}`, finalidade: "VENDA" as const, tipoImovel: t })),
  ...TIPOS_KENLO.map((t) => ({ path: `/imoveis/para-alugar/${t}`, finalidade: "ALUGUER" as const, tipoImovel: t })),
]

/**
 * Converte um CSV de paths de listagem em seeds. A finalidade vem do 2º segmento do
 * path (`para-alugar` → ALUGUER, senão VENDA) e o tipo do 3º. Ex.:
 * "/imoveis/a-venda/apartamento/aracatuba, /imoveis/para-alugar/casa".
 */
export function parsearSeeds(csv: string): SeedListagem[] {
  return csv
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((raw) => {
      const path = raw.startsWith("/") ? raw : `/${raw}`
      const segs = path.split("/").filter(Boolean) // [imoveis, <finalidade>, <tipo>, ...]
      const finalidade = segs[1] === "para-alugar" ? ("ALUGUER" as const) : ("VENDA" as const)
      return { path, finalidade, tipoImovel: segs[2] }
    })
}

/** Único lugar que conhece o mapa plataforma → classe de fonte. */
export function criarFonte(config: Config): FonteDeImoveis {
  if (config.plataforma === "kenlo") {
    if (config.estrategia === "api") {
      throw new Error("ESTRATEGIA=api (ColetaApiKenlo) ainda não implementada para a plataforma kenlo")
    }
    const estrategia = new ColetaHtmlKenlo({
      origin: config.origin,
      timeoutMs: config.fetchTimeoutMs,
      seeds: config.kenloSeeds ? parsearSeeds(config.kenloSeeds) : SEEDS_KENLO,
      avisar: (msg) => console.warn(msg),
    })
    return new KenloFonte({ origin: config.origin, clienteId: config.clienteId, estrategia })
  }
  return new MoldSystemsFonte({
    origin: config.origin,
    clienteId: config.clienteId,
    numRows: config.solrNumRows,
    timeoutMs: config.fetchTimeoutMs,
    avisar: (msg) => console.warn(msg),
  })
}
