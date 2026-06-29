import { describe, it, expect } from "vitest"
import { carregarConfig } from "./config"

describe("carregarConfig", () => {
  it("aplica defaults quando o ambiente está vazio", () => {
    const c = carregarConfig({})
    expect(c.port).toBe(3000)
    expect(c.host).toBe("0.0.0.0")
    expect(c.clienteId).toBe("innove")
    expect(c.origin).toBe("https://imobiliariainnove.com.br")
    expect(c.solrNumRows).toBe(5000)
    expect(c.fetchTimeoutMs).toBe(8000)
    expect(c.apiKey).toBeUndefined()
  })

  it("lê e converte valores do ambiente", () => {
    const c = carregarConfig({ PORT: "8080", SOLR_NUM_ROWS: "100", API_KEY: "segredo" })
    expect(c.port).toBe(8080)
    expect(c.solrNumRows).toBe(100)
    expect(c.apiKey).toBe("segredo")
  })

  it("API_KEY vazia continua undefined (gate desligado)", () => {
    const c = carregarConfig({ API_KEY: "" })
    expect(c.apiKey).toBeUndefined()
  })

  it("plataforma e estrategia: defaults e override por env", () => {
    expect(carregarConfig({}).plataforma).toBe("moldsystems")
    expect(carregarConfig({}).estrategia).toBe("html")
    expect(carregarConfig({ PLATAFORMA: "kenlo", ESTRATEGIA: "api" }).plataforma).toBe("kenlo")
    expect(carregarConfig({ PLATAFORMA: "kenlo", ESTRATEGIA: "api" }).estrategia).toBe("api")
  })
})
