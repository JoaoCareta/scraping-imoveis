export interface ClienteConfig {
  id: string
  plataforma: "moldsystems" | "kenlo"
  estrategia: "html" | "api"
  origin: string
  solrNumRows: number
  kenloSeeds?: string
  kenloMaxPaginas?: number
}

export interface Config {
  port: number
  host: string
  fetchTimeoutMs: number
  logLevel: string
  apiKey?: string
  clientes: ClienteConfig[]
}

type Env = Record<string, string | undefined>

function numero(valor: string | undefined, fallback: number): number {
  const n = Number.parseInt(valor ?? "", 10)
  return Number.isFinite(n) ? n : fallback
}

/** Parseia e valida o env JSON `CLIENTES` (lança no boot se inválido/ vazio). */
function parsearClientes(raw: string | undefined): ClienteConfig[] {
  if (!raw || raw.trim() === "") {
    throw new Error("CLIENTES é obrigatório: defina um JSON com a lista de clientes.")
  }
  let bruto: unknown
  try {
    bruto = JSON.parse(raw)
  } catch {
    throw new Error("CLIENTES não é um JSON válido.")
  }
  if (!Array.isArray(bruto) || bruto.length === 0) {
    throw new Error("CLIENTES deve ser uma lista não-vazia.")
  }
  const ids = new Set<string>()
  return bruto.map((item) => {
    const c = (item ?? {}) as Record<string, unknown>
    const id = typeof c.id === "string" ? c.id.trim() : ""
    if (!id) throw new Error("CLIENTES: cada cliente precisa de um 'id'.")
    if (ids.has(id)) throw new Error(`CLIENTES: id duplicado '${id}'.`)
    ids.add(id)
    const plataforma = c.plataforma
    if (plataforma !== "moldsystems" && plataforma !== "kenlo") {
      throw new Error(`CLIENTES['${id}']: 'plataforma' deve ser 'moldsystems' ou 'kenlo'.`)
    }
    const origin = typeof c.origin === "string" ? c.origin.trim() : ""
    if (!origin) throw new Error(`CLIENTES['${id}']: 'origin' é obrigatório.`)
    const estrategia = c.estrategia === "api" ? "api" : "html"
    const solrNumRows = typeof c.solrNumRows === "number" ? c.solrNumRows : 5000
    const kenloSeeds = typeof c.kenloSeeds === "string" && c.kenloSeeds.trim() ? c.kenloSeeds.trim() : undefined
    const kenloMaxPaginas = typeof c.kenloMaxPaginas === "number" && c.kenloMaxPaginas > 0 ? c.kenloMaxPaginas : undefined
    return { id, plataforma, estrategia, origin, solrNumRows, kenloSeeds, kenloMaxPaginas }
  })
}

export function carregarConfig(env: Env): Config {
  const apiKey = env.API_KEY?.trim()
  return {
    port: numero(env.PORT, 3000),
    host: env.HOST ?? "0.0.0.0",
    fetchTimeoutMs: numero(env.FETCH_TIMEOUT_MS, 8000),
    logLevel: env.LOG_LEVEL ?? "info",
    apiKey: apiKey ? apiKey : undefined,
    clientes: parsearClientes(env.CLIENTES),
  }
}
