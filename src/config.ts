export interface Config {
  port: number
  host: string
  clienteId: string
  origin: string
  solrNumRows: number
  fetchTimeoutMs: number
  logLevel: string
  apiKey?: string
}

type Env = Record<string, string | undefined>

function numero(valor: string | undefined, fallback: number): number {
  const n = Number.parseInt(valor ?? "", 10)
  return Number.isFinite(n) ? n : fallback
}

export function carregarConfig(env: Env): Config {
  const apiKey = env.API_KEY?.trim()
  return {
    port: numero(env.PORT, 3000),
    host: env.HOST ?? "0.0.0.0",
    clienteId: env.CLIENTE_ID ?? "innove",
    origin: env.ORIGIN ?? "https://imobiliariainnove.com.br",
    solrNumRows: numero(env.SOLR_NUM_ROWS, 5000),
    fetchTimeoutMs: numero(env.FETCH_TIMEOUT_MS, 8000),
    logLevel: env.LOG_LEVEL ?? "info",
    apiKey: apiKey ? apiKey : undefined,
  }
}
