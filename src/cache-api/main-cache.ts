import pg from "pg"
import { criarCacheServer } from "./server"
import { buscarNoCache, contarCache, substituirCatalogoTx, Consulta } from "./imovel-cache"
import { precarregarTodos } from "./precarregador"
import { RecursoImovel } from "../domain/leitura/recurso-imovel"

const PORT = Number(process.env.PORT ?? 3001)
const HOST = process.env.HOST ?? "0.0.0.0"
const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://inove:inove@postgres:5432/inove"
const SCRAPER_URL = process.env.SCRAPER_URL ?? "http://scraper-api:3000"
// Cliente assumido quando o request não traz ?cliente= (retrocompat single-tenant).
const CLIENTE_PADRAO = process.env.CLIENTE_PADRAO?.trim() || "innove"
// Clientes a pré-carregar no boot (warm-up). Vazio = nenhum.
const PRELOAD_CLIENTES = (process.env.PRELOAD_CLIENTES ?? "")
  .split(",").map((s) => s.trim()).filter(Boolean)

const pool = new pg.Pool({ connectionString: DATABASE_URL })
const consulta: Consulta = (sql, params) => pool.query(sql, params)

/** Roda fn dentro de UMA transação (client dedicado do pool). */
async function comTransacao<T>(fn: (tx: Consulta) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const r = await fn((sql, params) => client.query(sql, params))
    await client.query("COMMIT")
    return r
  } catch (e) {
    await client.query("ROLLBACK")
    throw e
  } finally {
    client.release()
  }
}

/** Busca o catálogo completo de um cliente no scraper. */
async function buscarNoScraper(cliente: string): Promise<RecursoImovel[]> {
  const res = await fetch(`${SCRAPER_URL}/imoveis?cliente=${encodeURIComponent(cliente)}`)
  const env = (await res.json()) as { imoveis?: RecursoImovel[] }
  return env.imoveis ?? []
}

const app = criarCacheServer({
  contar: (clienteId) => contarCache(consulta, clienteId),
  buscar: (filtros) => buscarNoCache(consulta, filtros),
  fallback: async (query) => {
    const qs = new URLSearchParams(query).toString()
    const url = `${SCRAPER_URL}/imoveis${qs ? `?${qs}` : ""}`
    const res = await fetch(url)
    return res.json()
  },
  clientePadrao: CLIENTE_PADRAO,
  logLevel: process.env.LOG_LEVEL ?? "info",
})

app
  .listen({ host: HOST, port: PORT })
  .then(() => {
    console.log(`cache-api on ${HOST}:${PORT} -> DB ${DATABASE_URL}, scraper ${SCRAPER_URL}`)
    if (PRELOAD_CLIENTES.length > 0) {
      console.log(`pre-load: warm-up de [${PRELOAD_CLIENTES.join(", ")}] em background`)
      precarregarTodos(
        {
          buscarNoScraper,
          substituirCatalogo: (cliente, imoveis) =>
            comTransacao((tx) => substituirCatalogoTx(tx, cliente, imoveis)),
          log: (m) => console.log(m),
          avisar: (m) => console.warn(m),
        },
        PRELOAD_CLIENTES,
      ).catch((e) => console.error("pre-load:", e))
    }
  })
  .catch((erro) => {
    console.error(erro)
    process.exit(1)
  })
