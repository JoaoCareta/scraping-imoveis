import Fastify, { FastifyInstance } from "fastify"
import { FiltrosCache } from "./imovel-cache"

export interface CacheServerDeps {
  /** Conta quantos imóveis há no cache. */
  contar: () => Promise<number>
  /** Busca no cache com os filtros. */
  buscar: (filtros: FiltrosCache) => Promise<unknown[]>
  /** Fallback ao scraper quando o cache está vazio ou indisponível. */
  fallback: (query: Record<string, string>) => Promise<unknown>
  logLevel?: string
}

interface QueryImoveis {
  finalidade?: string
  tipoImovel?: string
  quartos?: string
  precoMin?: string
  precoMax?: string
  cidade?: string
  bairro?: string
  limit?: string
  comodidades?: string
}

function numero(valor?: string): number | undefined {
  if (valor == null || valor.trim() === "") return undefined
  const n = Number(valor)
  return Number.isFinite(n) ? n : undefined
}

function lista(valor?: string): string[] | undefined {
  if (valor == null || valor.trim() === "") return undefined
  return valor.split(",").map((s) => s.trim()).filter((s) => s.length > 0)
}

function apenasPreenchidos(q: QueryImoveis): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [chave, valor] of Object.entries(q)) {
    if (valor != null && String(valor).trim() !== "") out[chave] = String(valor)
  }
  return out
}

export function criarCacheServer(deps: CacheServerDeps): FastifyInstance {
  const app = Fastify({ logger: { level: deps.logLevel ?? "info" } })

  app.get("/health", async () => ({ status: "ok", servico: "cache-api" }))

  app.get<{ Querystring: QueryImoveis }>("/imoveis", async (req) => {
    const q = req.query
    try {
      const total = await deps.contar()
      if (total > 0) {
        const filtros: FiltrosCache = {
          finalidade: q.finalidade,
          tipoImovel: q.tipoImovel,
          quartos: numero(q.quartos),
          precoMin: numero(q.precoMin),
          precoMax: numero(q.precoMax),
          cidade: q.cidade,
          bairro: q.bairro,
          comodidades: lista(q.comodidades),
          limit: numero(q.limit) ?? 10,
        }
        const imoveis = await deps.buscar(filtros)
        return {
          evento: "ColetaConcluida",
          origem: "cache",
          total: imoveis.length,
          limit: filtros.limit,
          imoveis,
        }
      }
    } catch (erro) {
      // Cache indisponível (ex.: Postgres down) → não derruba o atendimento, cai pro scraper.
      req.log.warn({ err: erro }, "cache indisponível; usando fallback do scraper")
    }
    return deps.fallback(apenasPreenchidos(q))
  })

  return app
}
