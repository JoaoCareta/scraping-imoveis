import { describe, it, expect } from "vitest"
import { finalidadesDeDoc } from "./solr-mapper"

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
