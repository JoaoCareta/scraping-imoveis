import { describe, it, expect } from "vitest"
import { criarCacheServer, CacheServerDeps } from "./server"
import { FiltrosCache } from "./imovel-cache"

function deps(over: Partial<CacheServerDeps> = {}): CacheServerDeps {
  return {
    contar: async () => 1,
    buscar: async () => [{ ref: "1" }],
    fallback: async () => ({ evento: "ColetaConcluida", origem: "scraper", total: 0, imoveis: [] }),
    clientePadrao: "innove",
    logLevel: "silent",
    ...over,
  }
}

describe("cache-api server", () => {
  it("GET /health → 200 cache-api", async () => {
    const app = criarCacheServer(deps())
    const res = await app.inject({ method: "GET", url: "/health" })
    expect(res.statusCode).toBe(200)
    expect(res.json().servico).toBe("cache-api")
  })

  it("usa o cache quando há imóveis e NÃO chama o scraper", async () => {
    // Mockk
    let chamouScraper = false
    const app = criarCacheServer(
      deps({
        contar: async () => 500,
        buscar: async () => [{ ref: "1" }],
        fallback: async () => {
          chamouScraper = true
          return {}
        },
      }),
    )

    // Run Test
    const res = await app.inject({ method: "GET", url: "/imoveis?cliente=innove&cidade=Araçatuba" })

    // Assert
    expect(res.json().origem).toBe("cache")
    expect(res.json().total).toBe(1)
    expect(chamouScraper).toBe(false)
  })

  it("cai pro scraper quando o cache do cliente está vazio", async () => {
    // Mockk
    let chamouScraper = false
    const app = criarCacheServer(
      deps({
        contar: async () => 0,
        fallback: async () => {
          chamouScraper = true
          return { evento: "ColetaConcluida", origem: "scraper", total: 0, imoveis: [] }
        },
      }),
    )

    // Run Test
    const res = await app.inject({ method: "GET", url: "/imoveis?cliente=innove&cidade=Birigui" })

    // Assert
    expect(chamouScraper).toBe(true)
    expect(res.json().origem).toBe("scraper")
  })

  it("cai pro scraper se o cache der erro (resiliência)", async () => {
    // Mockk
    let chamouScraper = false
    const app = criarCacheServer(
      deps({
        contar: async () => {
          throw new Error("db down")
        },
        fallback: async () => {
          chamouScraper = true
          return { origem: "scraper" }
        },
      }),
    )

    // Run Test
    const res = await app.inject({ method: "GET", url: "/imoveis?cliente=innove" })

    // Assert
    expect(res.statusCode).toBe(200)
    expect(chamouScraper).toBe(true)
  })

  it("repassa comodidades (CSV) como array para a busca", async () => {
    let filtrosRecebidos: FiltrosCache | undefined
    const app = criarCacheServer(
      deps({
        contar: async () => 5,
        buscar: async (f) => {
          filtrosRecebidos = f as FiltrosCache
          return []
        },
      }),
    )
    const res = await app.inject({ method: "GET", url: "/imoveis?cliente=innove&comodidades=elevador,sacada" })
    expect(res.statusCode).toBe(200)
    expect(filtrosRecebidos?.comodidades).toEqual(["elevador", "sacada"])
  })

  it("repassa condominio para a busca", async () => {
    let filtrosRecebidos: FiltrosCache | undefined
    const app = criarCacheServer(
      deps({
        contar: async () => 5,
        buscar: async (f) => {
          filtrosRecebidos = f as FiltrosCache
          return []
        },
      }),
    )
    const res = await app.inject({ method: "GET", url: "/imoveis?cliente=innove&condominio=Vila%20Madalena" })
    expect(res.statusCode).toBe(200)
    expect(filtrosRecebidos?.condominio).toBe("Vila Madalena")
  })

  it("escopa contagem e busca ao cliente informado (?cliente=)", async () => {
    // Mockk
    let clienteContado: string | undefined
    let filtrosRecebidos: FiltrosCache | undefined
    const app = criarCacheServer(
      deps({
        contar: async (clienteId) => {
          clienteContado = clienteId
          return 5
        },
        buscar: async (f) => {
          filtrosRecebidos = f as FiltrosCache
          return []
        },
      }),
    )

    // Run Test
    const res = await app.inject({ method: "GET", url: "/imoveis?cliente=caires&cidade=Aracatuba" })

    // Assert — nada de vazar dados de outro cliente
    expect(res.statusCode).toBe(200)
    expect(clienteContado).toBe("caires")
    expect(filtrosRecebidos?.clienteId).toBe("caires")
  })

  it("sem ?cliente= usa o cliente padrão (retrocompat single-tenant)", async () => {
    // Mockk
    let clienteContado: string | undefined
    let filtrosRecebidos: FiltrosCache | undefined
    const app = criarCacheServer(
      deps({
        contar: async (clienteId) => {
          clienteContado = clienteId
          return 5
        },
        buscar: async (f) => {
          filtrosRecebidos = f as FiltrosCache
          return []
        },
      }),
    )

    // Run Test
    const res = await app.inject({ method: "GET", url: "/imoveis?cidade=Aracatuba" })

    // Assert
    expect(res.statusCode).toBe(200)
    expect(clienteContado).toBe("innove")
    expect(filtrosRecebidos?.clienteId).toBe("innove")
  })

  it("repassa o cliente ao scraper no fallback (mesmo vindo do padrão)", async () => {
    // Mockk
    let queryRepassada: Record<string, string> | undefined
    const app = criarCacheServer(
      deps({
        contar: async () => 0,
        fallback: async (query) => {
          queryRepassada = query
          return { origem: "scraper" }
        },
      }),
    )

    // Run Test
    const res = await app.inject({ method: "GET", url: "/imoveis?cidade=Birigui" })

    // Assert — o scraper precisa saber de QUEM coletar
    expect(res.statusCode).toBe(200)
    expect(queryRepassada?.cliente).toBe("innove")
  })

  it("sem cliente e sem padrão → 400 (multi-tenant exige cliente)", async () => {
    const app = criarCacheServer(deps({ clientePadrao: undefined }))
    const res = await app.inject({ method: "GET", url: "/imoveis?cidade=Aracatuba" })
    expect(res.statusCode).toBe(400)
  })
})
