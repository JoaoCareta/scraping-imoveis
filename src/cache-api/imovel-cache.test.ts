import { describe, it, expect } from "vitest"
import { buscarNoCache, contarCache, Consulta, FiltrosCache } from "./imovel-cache"

describe("imovel-cache", () => {
  it("contarCache devolve o número de linhas", async () => {
    // Mockk
    const consulta: Consulta = async () => ({ rows: [{ n: 42 }] })

    // Run Test
    const total = await contarCache(consulta)

    // Assert
    expect(total).toBe(42)
  })

  it("buscarNoCache passa coringas como NULL (sem filtro)", async () => {
    // Mockk
    let capturado: unknown[] = []
    const consulta: Consulta = async (_sql, params) => {
      capturado = params
      return { rows: [] }
    }
    const f: FiltrosCache = {
      finalidade: "ALUGUER",
      tipoImovel: "casa",
      cidade: "qualquer",
      bairro: "tanto faz",
      limit: 10,
    }

    // Run Test
    await buscarNoCache(consulta, f)

    // Assert — ordem: finalidade, tipoImovel, quartos, precoMin, precoMax, cidade, bairro, comodidades, condominio, limit
    expect(capturado[0]).toBe("ALUGUER")
    expect(capturado[1]).toBe("casa")
    expect(capturado[5]).toBeNull()
    expect(capturado[6]).toBeNull()
    expect(capturado[7]).toBeNull()   // comodidades (ausente → NULL)
    expect(capturado[8]).toBeNull()   // condominio (ausente → NULL)
    expect(capturado[9]).toBe(10)     // limit
  })

  it("buscarNoCache aplica comodidades como JSONB containment", async () => {
    let capturado: unknown[] = []
    const consulta: Consulta = async (_sql, params) => {
      capturado = params
      return { rows: [] }
    }
    await buscarNoCache(consulta, { comodidades: ["elevador", "sacada"], limit: 10 })
    expect(capturado[7]).toBe(JSON.stringify(["elevador", "sacada"]))
    expect(capturado[9]).toBe(10)
  })

  it("buscarNoCache limpa o termo de condomínio (remove genéricos, normaliza)", async () => {
    let capturado: unknown[] = []
    const consulta: Consulta = async (_sql, params) => {
      capturado = params
      return { rows: [] }
    }
    await buscarNoCache(consulta, { condominio: "Residencial Elev", limit: 10 })
    expect(capturado[8]).toBe("elev") // "residencial" removido, normalizado
    expect(capturado[9]).toBe(10)
  })

  it("buscarNoCache ignora condomínio vazio/coringa (NULL)", async () => {
    let capturado: unknown[] = []
    const consulta: Consulta = async (_sql, params) => {
      capturado = params
      return { rows: [] }
    }
    await buscarNoCache(consulta, { condominio: "qualquer", limit: 10 })
    expect(capturado[8]).toBeNull()
  })

  it("buscarNoCache minusculiza comodidades (paridade case-insensitive com a scraper-api)", async () => {
    let capturado: unknown[] = []
    const consulta: Consulta = async (_sql, params) => {
      capturado = params
      return { rows: [] }
    }
    await buscarNoCache(consulta, { comodidades: ["Piscina", "PORTARIA"], limit: 10 })
    expect(capturado[7]).toBe(JSON.stringify(["piscina", "portaria"]))
  })

  it("buscarNoCache ignora comodidades vazias ou coringas (NULL)", async () => {
    let capturado: unknown[] = []
    const consulta: Consulta = async (_sql, params) => {
      capturado = params
      return { rows: [] }
    }
    await buscarNoCache(consulta, { comodidades: ["qualquer", "  "], limit: 5 })
    expect(capturado[7]).toBeNull()
  })

  it("buscarNoCache devolve os payloads das linhas", async () => {
    // Mockk
    const consulta: Consulta = async () => ({
      rows: [{ payload: { ref: "1" } }, { payload: { ref: "2" } }],
    })

    // Run Test
    const imoveis = await buscarNoCache(consulta, { limit: 10 })

    // Assert
    expect(imoveis.map((i) => (i as { ref: string }).ref)).toEqual(["1", "2"])
  })
})
