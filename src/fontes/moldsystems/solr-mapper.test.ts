import { describe, it, expect } from "vitest"
import { finalidadesDeDoc, localizacaoDeDoc, caracteristicasDeDoc } from "./solr-mapper"
import { imovel1910 } from "./fixtures/imovel-1910"

describe("finalidadesDeDoc", () => {
  it("ALUGUER quando há valLocation>0", () => {
    expect(finalidadesDeDoc({ idtProperty: 1, valLocation: 1050 })).toEqual([
      { finalidade: "ALUGUER", valor: 1050, periodo: "MENSAL" },
    ])
  })

  it("VENDA quando há valSales>0", () => {
    expect(finalidadesDeDoc({ idtProperty: 1, valSales: 250000 })).toEqual([
      { finalidade: "VENDA", valor: 250000, periodo: "TOTAL" },
    ])
  })

  it("ambas quando há os dois valores", () => {
    const r = finalidadesDeDoc({ idtProperty: 1, valLocation: 900, valSales: 200000 })
    expect(r.map((o) => o.finalidade)).toEqual(["ALUGUER", "VENDA"])
  })

  it("vazio quando não há valores positivos", () => {
    expect(finalidadesDeDoc({ idtProperty: 1, valLocation: 0 })).toEqual([])
  })
})

describe("localizacaoDeDoc", () => {
  it("mapeia bairro/cidade/estado e zonaTexto", () => {
    const l = localizacaoDeDoc(imovel1910)
    expect(l).toEqual({
      zonaTexto: "Vila Estádio",
      bairro: "Vila Estádio",
      cidade: "Araçatuba",
      estado: "São Paulo",
    })
  })
})

describe("caracteristicasDeDoc", () => {
  it("mapeia tipo (singular), tipologia, área, quartos e banheiros", () => {
    const c = caracteristicasDeDoc(imovel1910)
    expect(c.tipoImovel).toBe("apartamento")
    expect(c.tipologia).toBe("Padrão")
    expect(c.areaM2).toBe(96)
    expect(c.quartos).toBe(2)
    expect(c.casasBanho).toBe(2)
    expect(c.lista).toEqual([])
  })
})
