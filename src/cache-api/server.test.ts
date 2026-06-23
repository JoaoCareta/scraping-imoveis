import { describe, it, expect } from "vitest"
import { criarCacheServer, CacheServerDeps } from "./server"

function deps(over: Partial<CacheServerDeps> = {}): CacheServerDeps {
  return {
    contar: async () => 1,
    buscar: async () => [{ ref: "1" }],
    fallback: async () => ({ evento: "ColetaConcluida", origem: "scraper", total: 0, imoveis: [] }),
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
    const res = await app.inject({ method: "GET", url: "/imoveis?cidade=Araçatuba" })

    // Assert
    expect(res.json().origem).toBe("cache")
    expect(res.json().total).toBe(1)
    expect(chamouScraper).toBe(false)
  })

  it("cai pro scraper quando o cache está vazio", async () => {
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
    const res = await app.inject({ method: "GET", url: "/imoveis?cidade=Birigui" })

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
    const res = await app.inject({ method: "GET", url: "/imoveis" })

    // Assert
    expect(res.statusCode).toBe(200)
    expect(chamouScraper).toBe(true)
  })
})
