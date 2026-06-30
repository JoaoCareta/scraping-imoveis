import { describe, it, expect } from "vitest"
import { buscarNoCache, contarCache, substituirCatalogoTx, Consulta, FiltrosCache } from "./imovel-cache"
import { RecursoImovel } from "../domain/leitura/recurso-imovel"

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

function recursoFake(over: Partial<RecursoImovel> = {}): RecursoImovel {
  return {
    ref: "AP1", clienteId: "caires", urlSite: "https://c/AP1", finalidade: "VENDA",
    preco: { valor: 500000, moeda: "BRL", periodo: "TOTAL" },
    localizacao: { zonaTexto: "z", cidade: "Araçatuba", bairro: "Centro" },
    caracteristicas: { tipoImovel: "apartamento", quartos: 2, lista: [], itens: [], comodidades: [] },
    media: {}, extras: {},
    estado: { ativo: true, extraidoEm: "2026-06-30T00:00:00.000Z", atualizadoEm: "2026-06-30T00:00:00.000Z", hashConteudo: "h" },
    ...over,
  } as RecursoImovel
}

describe("substituirCatalogoTx", () => {
  it("apaga o catálogo do cliente e insere os novos, mapeando os campos", async () => {
    const calls: { sql: string; params: unknown[] }[] = []
    const tx: Consulta = async (sql, params) => { calls.push({ sql, params }); return { rows: [] } }
    const r1 = recursoFake()

    const n = await substituirCatalogoTx(tx, "caires", [r1])

    expect(n).toBe(1)
    expect(calls[0].sql).toMatch(/delete\s+from\s+imovel\s+where\s+cliente_id\s*=\s*\$1/i)
    expect(calls[0].params).toEqual(["caires"])
    expect(calls[1].sql).toMatch(/insert\s+into\s+imovel/i)
    expect(calls[1].params).toEqual([
      "caires", "AP1", "VENDA", "apartamento", 2, 500000, "Araçatuba", "Centro", true, JSON.stringify(r1),
    ])
  })

  it("preço ausente → null", async () => {
    const calls: { sql: string; params: unknown[] }[] = []
    const tx: Consulta = async (sql, params) => { calls.push({ sql, params }); return { rows: [] } }
    await substituirCatalogoTx(tx, "caires", [recursoFake({ preco: undefined })])
    expect(calls[1].params[5]).toBeNull()
  })

  it("DELETE vem antes dos INSERT", async () => {
    const ordem: string[] = []
    const tx: Consulta = async (sql) => { ordem.push(/delete/i.test(sql) ? "del" : "ins"); return { rows: [] } }
    await substituirCatalogoTx(tx, "caires", [recursoFake(), recursoFake({ ref: "AP2" })])
    expect(ordem).toEqual(["del", "ins", "ins"])
  })
})
