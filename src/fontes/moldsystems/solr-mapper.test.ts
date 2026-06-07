import { describe, it, expect } from "vitest"
import { finalidadesDeDoc, localizacaoDeDoc, caracteristicasDeDoc, urlSiteDeDoc, fotoPrincipalDeDoc, ativoDeDoc, extrasDeDoc } from "./solr-mapper"
import { imovel1910 } from "./fixtures/imovel-1910"

const CTX = { clienteId: "innove", origin: "https://imobiliariainnove.com.br", extraidoEm: "2026-06-07T12:00:00.000Z" }

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

describe("helpers de doc", () => {
  it("urlSiteDeDoc constrói o URL com slugs sem acento", () => {
    expect(urlSiteDeDoc(imovel1910, CTX, "ALUGUER")).toBe(
      "https://imobiliariainnove.com.br/imovel/locacao/apartamentos/aracatuba/condominio-edificio-residencial-park-mediterraneo/1910",
    )
  })

  it("fotoPrincipalDeDoc devolve a 1ª foto visível", () => {
    expect(fotoPrincipalDeDoc(imovel1910)).toContain("/imovel/fotos/1910/")
  })

  it("ativoDeDoc: mostra no site e não ocupado", () => {
    expect(ativoDeDoc(imovel1910)).toBe(true)
    expect(ativoDeDoc({ idtProperty: 1, flgShowSite: false })).toBe(false)
    expect(ativoDeDoc({ idtProperty: 1, indBusy: 1 })).toBe(false)
  })

  it("extrasDeDoc inclui vagas, condominio, iptu", () => {
    const e = extrasDeDoc(imovel1910)
    expect(e["vagas"]).toBe(2)
    expect(e["condominio"]).toBe(940)
    expect(e["iptu"]).toBe(105)
  })
})
