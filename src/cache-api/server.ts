import Fastify, { FastifyInstance } from "fastify"
import { FiltrosCache } from "./imovel-cache"

export interface CacheServerDeps {
  /** Conta quantos imóveis há no cache DO CLIENTE (escopo multi-tenant). */
  contar: (clienteId: string) => Promise<number>
  /** Busca no cache com os filtros (já escopados por filtros.clienteId). */
  buscar: (filtros: FiltrosCache) => Promise<unknown[]>
  /** Fallback ao scraper quando o cache está vazio ou indisponível. */
  fallback: (query: Record<string, string>) => Promise<unknown>
  /** Cliente assumido quando o request não traz ?cliente= (retrocompat single-tenant). */
  clientePadrao?: string
  logLevel?: string
}

interface QueryImoveis {
  cliente?: string
  finalidade?: string
  tipoImovel?: string
  quartos?: string
  precoMin?: string
  precoMax?: string
  cidade?: string
  bairro?: string
  limit?: string
  comodidades?: string
  condominio?: string
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

  app.get<{ Querystring: QueryImoveis }>("/imoveis", async (req, reply) => {
    const q = req.query
    const cliente = (q.cliente ?? "").trim() || deps.clientePadrao
    if (!cliente) {
      return reply
        .code(400)
        .send({ evento: "Erro", erro: { codigo: "CLIENTE_OBRIGATORIO", mensagem: "Parâmetro 'cliente' é obrigatório." } })
    }
    try {
      const total = await deps.contar(cliente)
      if (total > 0) {
        const filtros: FiltrosCache = {
          clienteId: cliente,
          finalidade: q.finalidade,
          tipoImovel: q.tipoImovel,
          quartos: numero(q.quartos),
          precoMin: numero(q.precoMin),
          precoMax: numero(q.precoMax),
          cidade: q.cidade,
          bairro: q.bairro,
          comodidades: lista(q.comodidades),
          condominio: q.condominio,
          limit: numero(q.limit) ?? 10,
        }
        const imoveis = await deps.buscar(filtros)
        if (imoveis.length > 0) {
          return {
            evento: "ColetaConcluida",
            origem: "cache",
            total: imoveis.length,
            limit: filtros.limit,
            imoveis,
          }
        }
        // cache populado mas 0 para estes filtros → cai pro fallback (scraper) com os filtros
      }
    } catch (erro) {
      // Cache indisponível (ex.: Postgres down) → não derruba o atendimento, cai pro scraper.
      req.log.warn({ err: erro }, "cache indisponível; usando fallback do scraper")
    }
    // Garante que o scraper saiba de QUEM coletar, mesmo quando o cliente veio do padrão.
    return deps.fallback({ ...apenasPreenchidos(q), cliente })
  })

  return app
}
