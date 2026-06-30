import { describe, it, expect } from "vitest"
import { carregarConfig } from "./config"

const UM = JSON.stringify([{ id: "innove", plataforma: "moldsystems", origin: "https://x" }])

describe("carregarConfig", () => {
  it("aplica defaults de infra e parseia CLIENTES", () => {
    const c = carregarConfig({ CLIENTES: UM })
    expect(c.port).toBe(3000)
    expect(c.host).toBe("0.0.0.0")
    expect(c.fetchTimeoutMs).toBe(8000)
    expect(c.apiKey).toBeUndefined()
    expect(c.clientes).toHaveLength(1)
    expect(c.clientes[0]).toMatchObject({ id: "innove", plataforma: "moldsystems", estrategia: "html", origin: "https://x", solrNumRows: 5000 })
  })

  it("lê e converte infra do ambiente", () => {
    const c = carregarConfig({ CLIENTES: UM, PORT: "8080", API_KEY: "segredo" })
    expect(c.port).toBe(8080)
    expect(c.apiKey).toBe("segredo")
  })

  it("API_KEY vazia continua undefined (gate desligado)", () => {
    expect(carregarConfig({ CLIENTES: UM, API_KEY: "" }).apiKey).toBeUndefined()
  })

  it("parseia vários clientes com campos por plataforma", () => {
    const json = JSON.stringify([
      { id: "innove", plataforma: "moldsystems", origin: "https://i", solrNumRows: 100 },
      { id: "caires", plataforma: "kenlo", estrategia: "html", origin: "https://c", kenloMaxPaginas: 2 },
    ])
    const c = carregarConfig({ CLIENTES: json })
    expect(c.clientes.map((x) => x.id)).toEqual(["innove", "caires"])
    expect(c.clientes[0].solrNumRows).toBe(100)
    expect(c.clientes[1]).toMatchObject({ plataforma: "kenlo", kenloMaxPaginas: 2 })
  })

  it("CLIENTES ausente → erro", () => {
    expect(() => carregarConfig({})).toThrow(/CLIENTES/)
  })

  it("CLIENTES com JSON inválido → erro", () => {
    expect(() => carregarConfig({ CLIENTES: "{nope" })).toThrow(/JSON/)
  })

  it("CLIENTES lista vazia → erro", () => {
    expect(() => carregarConfig({ CLIENTES: "[]" })).toThrow(/não-vazia/)
  })

  it("cliente sem origin → erro", () => {
    expect(() => carregarConfig({ CLIENTES: JSON.stringify([{ id: "x", plataforma: "kenlo" }]) })).toThrow(/origin/)
  })

  it("plataforma inválida → erro", () => {
    expect(() => carregarConfig({ CLIENTES: JSON.stringify([{ id: "x", plataforma: "outra", origin: "https://x" }]) })).toThrow(/plataforma/)
  })

  it("id duplicado → erro", () => {
    const json = JSON.stringify([{ id: "x", plataforma: "kenlo", origin: "https://a" }, { id: "x", plataforma: "kenlo", origin: "https://b" }])
    expect(() => carregarConfig({ CLIENTES: json })).toThrow(/duplicado/)
  })
})
