import pg from "pg"
import { criarCacheServer } from "./server"
import { buscarNoCache, contarCache, Consulta } from "./imovel-cache"

const PORT = Number(process.env.PORT ?? 3001)
const HOST = process.env.HOST ?? "0.0.0.0"
const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://inove:inove@postgres:5432/inove"
const SCRAPER_URL = process.env.SCRAPER_URL ?? "http://scraper-api:3000"

const pool = new pg.Pool({ connectionString: DATABASE_URL })
const consulta: Consulta = (sql, params) => pool.query(sql, params)

const app = criarCacheServer({
  contar: () => contarCache(consulta),
  buscar: (filtros) => buscarNoCache(consulta, filtros),
  fallback: async (query) => {
    const qs = new URLSearchParams(query).toString()
    const url = `${SCRAPER_URL}/imoveis${qs ? `?${qs}` : ""}`
    const res = await fetch(url)
    return res.json()
  },
  logLevel: process.env.LOG_LEVEL ?? "info",
})

app
  .listen({ host: HOST, port: PORT })
  .then(() => console.log(`cache-api on ${HOST}:${PORT} -> DB ${DATABASE_URL}, scraper ${SCRAPER_URL}`))
  .catch((erro) => {
    console.error(erro)
    process.exit(1)
  })
