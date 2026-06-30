import { describe, it, expect } from "vitest"
import { buscarNoCache, contarCache, Consulta, FiltrosCache } from "./imovel-cache"

describe("imovel-cache", () => {
  it("contarCache conta apenas o cliente informado (escopo multi-tenant)", async () => {
    // Mockk
    let sqlUsado = ""
    let paramsUsados: unknown[] = []
    const consulta: Consulta = async (sql, params) => {
      sqlUsado = sql
      paramsUsados = params
      return { rows: [{ n: 42 }] }
    }

    // Run Test
    const total = await contarCache(consulta, "caires")

    // Assert — conta só do cliente; nunca um count global
    expect(total).toBe(42)
    expect(paramsUsados).toEqual(["caires"])
    expect(sqlUsado).toMatch(/cliente_id\s*=\s*\$1/i)
  })

  it("buscarNoCache filtra pelo cliente_id como primeiro parâmetro ($1)", async () => {
    // Mockk
    let sqlUsado = ""
    let capturado: unknown[] = []
    const consulta: Consulta = async (sql, params) => {
      sqlUsado = sql
      capturado = params
      return { rows: [] }
    }

    // Run Test
    await buscarNoCache(consulta, { clienteId: "caires", limit: 10 })

    // Assert
    expect(capturado[0]).toBe("caires")
    expect(sqlUsado).toMatch(/cliente_id\s*=\s*\$1/i)
  })

  it("buscarNoCache passa coringas como NULL (sem filtro)", async () => {
    // Mockk
    let capturado: unknown[] = []
    const consulta: Consulta = async (_sql, params) => {
      capturado = params
      return { rows: [] }
    }
    const f: FiltrosCache = {
      clienteId: "innove",
      finalidade: "ALUGUER",
      tipoImovel: "casa",
      cidade: "qualquer",
      bairro: "tanto faz",
      limit: 10,
    }

    // Run Test
    await buscarNoCache(consulta, f)

    // Assert — ordem: cliente_id, finalidade, tipoImovel, quartos, precoMin, precoMax, cidade, bairro, comodidades, condominio, limit
    expect(capturado[0]).toBe("innove")
    expect(capturado[1]).toBe("ALUGUER")
    expect(capturado[2]).toBe("casa")
    expect(capturado[6]).toBeNull() // cidade (coringa → NULL)
    expect(capturado[7]).toBeNull() // bairro (coringa → NULL)
    expect(capturado[8]).toBeNull() // comodidades (ausente → NULL)
    expect(capturado[9]).toBeNull() // condominio (ausente → NULL)
    expect(capturado[10]).toBe(10) // limit
  })

  it("buscarNoCache aplica comodidades como JSONB containment", async () => {
    let capturado: unknown[] = []
    const consulta: Consulta = async (_sql, params) => {
      capturado = params
      return { rows: [] }
    }
    await buscarNoCache(consulta, { clienteId: "innove", comodidades: ["elevador", "sacada"], limit: 10 })
    expect(capturado[8]).toBe(JSON.stringify(["elevador", "sacada"]))
    expect(capturado[10]).toBe(10)
  })

  it("buscarNoCache limpa o termo de condomínio (remove genéricos, normaliza)", async () => {
    let capturado: unknown[] = []
    const consulta: Consulta = async (_sql, params) => {
      capturado = params
      return { rows: [] }
    }
    await buscarNoCache(consulta, { clienteId: "innove", condominio: "Residencial Elev", limit: 10 })
    expect(capturado[9]).toBe("elev") // "residencial" removido, normalizado
    expect(capturado[10]).toBe(10)
  })

  it("buscarNoCache ignora condomínio vazio/coringa (NULL)", async () => {
    let capturado: unknown[] = []
    const consulta: Consulta = async (_sql, params) => {
      capturado = params
      return { rows: [] }
    }
    await buscarNoCache(consulta, { clienteId: "innove", condominio: "qualquer", limit: 10 })
    expect(capturado[9]).toBeNull()
  })

  it("buscarNoCache minusculiza comodidades (paridade case-insensitive com a scraper-api)", async () => {
    let capturado: unknown[] = []
    const consulta: Consulta = async (_sql, params) => {
      capturado = params
      return { rows: [] }
    }
    await buscarNoCache(consulta, { clienteId: "innove", comodidades: ["Piscina", "PORTARIA"], limit: 10 })
    expect(capturado[8]).toBe(JSON.stringify(["piscina", "portaria"]))
  })

  it("buscarNoCache ignora comodidades vazias ou coringas (NULL)", async () => {
    let capturado: unknown[] = []
    const consulta: Consulta = async (_sql, params) => {
      capturado = params
      return { rows: [] }
    }
    await buscarNoCache(consulta, { clienteId: "innove", comodidades: ["qualquer", "  "], limit: 5 })
    expect(capturado[8]).toBeNull()
  })

  it("buscarNoCache devolve os payloads das linhas", async () => {
    // Mockk
    const consulta: Consulta = async () => ({
      rows: [{ payload: { ref: "1" } }, { payload: { ref: "2" } }],
    })

    // Run Test
    const imoveis = await buscarNoCache(consulta, { clienteId: "innove", limit: 10 })

    // Assert
    expect(imoveis.map((i) => (i as { ref: string }).ref)).toEqual(["1", "2"])
  })
})
