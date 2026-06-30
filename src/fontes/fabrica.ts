import { ClienteConfig } from "../config"
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
export function criarFonte(cliente: ClienteConfig, infra: { fetchTimeoutMs: number }): FonteDeImoveis {
  if (cliente.plataforma === "kenlo") {
    if (cliente.estrategia === "api") {
      throw new Error("ESTRATEGIA=api (ColetaApiKenlo) ainda não implementada para a plataforma kenlo")
    }
    const estrategia = new ColetaHtmlKenlo({
      origin: cliente.origin,
      timeoutMs: infra.fetchTimeoutMs,
      seeds: cliente.kenloSeeds ? parsearSeeds(cliente.kenloSeeds) : SEEDS_KENLO,
      maxPaginas: cliente.kenloMaxPaginas,
      avisar: (msg) => console.warn(msg),
    })
    return new KenloFonte({ origin: cliente.origin, clienteId: cliente.id, estrategia })
  }
  return new MoldSystemsFonte({
    origin: cliente.origin,
    clienteId: cliente.id,
    numRows: cliente.solrNumRows,
    timeoutMs: infra.fetchTimeoutMs,
    avisar: (msg) => console.warn(msg),
  })
}
