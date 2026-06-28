import { describe, it, expect } from "vitest"
import { criarServidor } from "./server"
import { Config } from "../config"
import { ImovelRepository, Coleta, FiltrosImovel } from "../aplicacao/imovel-repository"
import { FonteIndisponivelError, FonteTimeoutError } from "../fontes/erros"

const CONFIG_BASE: Config = {
  port: 3000, host: "0.0.0.0", clienteId: "innove",
  origin: "https://x", solrNumRows: 5000, fetchTimeoutMs: 8000, logLevel: "silent",
}

function recurso(ref: string, finalidade: "ALUGUER" | "VENDA"): Coleta["imoveis"][number] {
  return {
    ref, clienteId: "innove", urlSite: "https://x/" + ref, finalidade,
    preco: { valor: 1000, moeda: "BRL", periodo: "MENSAL" },
    localizacao: { zonaTexto: "Centro", cidade: "Bauru" },
    caracteristicas: { lista: [], itens: [], comodidades: [] }, media: {}, extras: {},
    estado: { ativo: true, extraidoEm: "2026-06-18T10:00:00.000Z", atualizadoEm: "2026-06-18T10:00:00.000Z", hashConteudo: "h" },
  }
}

function repoFake(over: Partial<ImovelRepository> = {}): ImovelRepository {
  const coleta: Coleta = { imoveis: [recurso("1910", "ALUGUER")], total: 1, rejeitados: 0, extraidoEm: "2026-06-18T10:00:00.000Z" }
  return {
    buscar: async (_f: FiltrosImovel) => coleta,
    buscarPorRef: async (ref: string) =>
      ref === "1910" ? coleta : { imoveis: [], total: 0, rejeitados: 0, extraidoEm: "2026-06-18T10:00:00.000Z" },
    ...over,
  }
}

describe("servidor", () => {
  it("GET /health → 200 ok", async () => {
    const app = criarServidor(repoFake(), CONFIG_BASE)
    const res = await app.inject({ method: "GET", url: "/health" })
    expect(res.statusCode).toBe(200)
    expect(res.json().status).toBe("ok")
  })

  it("GET /imoveis?comodidades=piscina,portaria → repassa array para o repo", async () => {
    let recebido: FiltrosImovel | undefined
    const app = criarServidor(
      repoFake({ buscar: async (f) => { recebido = f; return { imoveis: [], total: 0, rejeitados: 0, extraidoEm: "2026-06-18T10:00:00.000Z" } } }),
      CONFIG_BASE,
    )
    const res = await app.inject({ method: "GET", url: "/imoveis?comodidades=piscina,portaria" })
    expect(res.statusCode).toBe(200)
    expect(recebido?.comodidades).toEqual(["piscina", "portaria"])
  })

  it("GET /imoveis → 200 envelope ColetaConcluida", async () => {
    const app = criarServidor(repoFake(), CONFIG_BASE)
    const res = await app.inject({ method: "GET", url: "/imoveis" })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.evento).toBe("ColetaConcluida")
    expect(body.total).toBe(1)
    expect(body.imoveis[0].ref).toBe("1910")
  })

  it("GET /imoveis com finalidade inválida → 400", async () => {
    const app = criarServidor(repoFake(), CONFIG_BASE)
    const res = await app.inject({ method: "GET", url: "/imoveis?finalidade=XPTO" })
    expect(res.statusCode).toBe(400)
  })

  it("GET /imoveis/:ref inexistente → 404", async () => {
    const app = criarServidor(repoFake(), CONFIG_BASE)
    const res = await app.inject({ method: "GET", url: "/imoveis/9999" })
    expect(res.statusCode).toBe(404)
  })

  it("fonte indisponível → 503 com evento", async () => {
    const repo = repoFake({ buscar: async () => { throw new FonteIndisponivelError("down") } })
    const app = criarServidor(repo, CONFIG_BASE)
    const res = await app.inject({ method: "GET", url: "/imoveis" })
    expect(res.statusCode).toBe(503)
    expect(res.json().evento).toBe("FonteIndisponivel")
  })

  it("timeout da fonte → 504", async () => {
    const repo = repoFake({ buscar: async () => { throw new FonteTimeoutError("slow") } })
    const app = criarServidor(repo, CONFIG_BASE)
    const res = await app.inject({ method: "GET", url: "/imoveis" })
    expect(res.statusCode).toBe(504)
  })

  it("API key ligada: sem header → 401; com header → 200", async () => {
    const app = criarServidor(repoFake(), { ...CONFIG_BASE, apiKey: "segredo" })
    const semHeader = await app.inject({ method: "GET", url: "/imoveis" })
    expect(semHeader.statusCode).toBe(401)
    const comHeader = await app.inject({ method: "GET", url: "/imoveis", headers: { "x-api-key": "segredo" } })
    expect(comHeader.statusCode).toBe(200)
  })

  it("API key ligada não bloqueia /health", async () => {
    const app = criarServidor(repoFake(), { ...CONFIG_BASE, apiKey: "segredo" })
    const res = await app.inject({ method: "GET", url: "/health" })
    expect(res.statusCode).toBe(200)
  })

  it("pagina com limit/offset e devolve total + página", async () => {
    const coleta3: Coleta = {
      imoveis: [recurso("1", "ALUGUER"), recurso("2", "ALUGUER"), recurso("3", "VENDA")],
      total: 3, rejeitados: 0, extraidoEm: "2026-06-18T10:00:00.000Z",
    }
    const app = criarServidor(repoFake({ buscar: async () => coleta3 }), CONFIG_BASE)
    const res = await app.inject({ method: "GET", url: "/imoveis?limit=2&offset=1" })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.total).toBe(3)
    expect(body.limit).toBe(2)
    expect(body.offset).toBe(1)
    expect(body.imoveis.map((i: { ref: string }) => i.ref)).toEqual(["2", "3"])
  })

  it("ignora query params vazios em vez de dar 400", async () => {
    const app = criarServidor(repoFake(), CONFIG_BASE)
    const res = await app.inject({ method: "GET", url: "/imoveis?finalidade=&bairro=&precoMax=2000" })
    expect(res.statusCode).toBe(200)
    expect(res.json().evento).toBe("ColetaConcluida")
  })

  it("remove valores coringa (qualquer/tanto faz) em vez de filtrar ou dar 400", async () => {
    const app = criarServidor(repoFake(), CONFIG_BASE)
    const res = await app.inject({ method: "GET", url: "/imoveis?finalidade=qualquer&bairro=qualquer&tipoImovel=tanto%20faz" })
    expect(res.statusCode).toBe(200)
    expect(res.json().evento).toBe("ColetaConcluida")
  })
})
