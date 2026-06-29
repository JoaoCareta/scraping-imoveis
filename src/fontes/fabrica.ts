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

/** Único lugar que conhece o mapa plataforma → classe de fonte. */
export function criarFonte(config: Config): FonteDeImoveis {
  if (config.plataforma === "kenlo") {
    const estrategia = new ColetaHtmlKenlo({
      origin: config.origin,
      timeoutMs: config.fetchTimeoutMs,
      seeds: SEEDS_KENLO,
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
