import { describe, it, expect } from "vitest"
import { finalidadesDeDoc, localizacaoDeDoc, caracteristicasDeDoc, urlSiteDeDoc, fotoPrincipalDeDoc, ativoDeDoc, extrasDeDoc, imoveisDeSolrDoc } from "./solr-mapper"
import { imovel1910 } from "./fixtures/imovel-1910"
import { imovel3339 } from "./fixtures/imovel-3339"

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

  // Fix 7 — fallback zonaTexto para namCity quando não há namDistrict
  it("zonaTexto usa namCity como fallback quando não há namDistrict", () => {
    const l = localizacaoDeDoc({ idtProperty: 1, namCity: "Bauru" })
    expect(l.zonaTexto).toBe("Bauru")
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

  // Fix 1 — tipoSingular strips accents before lookup
  it("tipoSingular normaliza acentos — Galpões → galpao", () => {
    const c = caracteristicasDeDoc({ ...imovel1910, namCategory: "Galpões" })
    expect(c.tipoImovel).toBe("galpao")
  })

  // Fix 5 — areaDeDoc priority: idt 95 wins over idt 2
  it("areaDeDoc usa idt 95 com prioridade sobre idt 2", () => {
    const doc = {
      ...imovel1910,
      jsonCharacteristics: JSON.stringify([
        { desInformation: "50.00", desInformationFormatted: "50,00 m²", characteristics: { idtCharacteristics: 2 } },
        { desInformation: "96.00", desInformationFormatted: "96,00 m²", characteristics: { idtCharacteristics: 95 } },
      ]),
    }
    expect(caracteristicasDeDoc(doc).areaM2).toBe(96)
  })

  // Fix 5 — decimal fallback via desInformation when no desInformationFormatted
  it("areaDeDoc usa desInformation decimal quando não há desInformationFormatted", () => {
    const doc = {
      ...imovel1910,
      jsonCharacteristics: JSON.stringify([
        { desInformation: "1500.50", characteristics: { idtCharacteristics: 95 } },
      ]),
    }
    expect(caracteristicasDeDoc(doc).areaM2).toBe(1500.5)
  })

  // Fix 6 — banheirosDeDoc treats 0 as undefined
  it("banheirosDeDoc trata 0 banheiros como undefined", () => {
    const c = caracteristicasDeDoc({ ...imovel1910, desResumeCharacteristics: "0 banheiros" })
    expect(c.casasBanho).toBeUndefined()
  })
})

describe("helpers de doc", () => {
  it("urlSiteDeDoc constrói o URL com slugs sem acento", () => {
    expect(urlSiteDeDoc(imovel1910, CTX, "ALUGUER")).toBe(
      "https://imobiliariainnove.com.br/imovel/locacao/apartamentos/aracatuba/condominio-edificio-residencial-park-mediterraneo/1910",
    )
  })

  // Fix 4 — urlSiteDeDoc sentinels for empty slug segments
  it("urlSiteDeDoc usa sem-cidade quando namCity é undefined", () => {
    const url = urlSiteDeDoc({ ...imovel1910, namCity: undefined }, CTX, "ALUGUER")
    expect(url).toContain("/sem-cidade/")
    expect(url).not.toMatch(/https:\/\/[^/]+\/\//)
  })

  it("fotoPrincipalDeDoc devolve a 1ª foto visível", () => {
    expect(fotoPrincipalDeDoc(imovel1910)).toContain("/imovel/fotos/1910/")
  })

  it("ativoDeDoc: mostra no site e não ocupado", () => {
    expect(ativoDeDoc(imovel1910)).toBe(true)
    expect(ativoDeDoc({ idtProperty: 1, flgShowSite: false })).toBe(false)
    expect(ativoDeDoc({ idtProperty: 1, indBusy: 1 })).toBe(false)
  })

  // Fix 7 — ativoDeDoc: indBusy=2 (non-zero number) → false
  it("ativoDeDoc: indBusy=2 (número não-zero) → false", () => {
    expect(ativoDeDoc({ idtProperty: 1, indBusy: 2 })).toBe(false)
  })

  it("extrasDeDoc inclui vagas, condominio, iptu", () => {
    const e = extrasDeDoc(imovel1910)
    expect(e["vagas"]).toBe(2)
    expect(e["condominio"]).toBe(940)
    expect(e["iptu"]).toBe(105)
  })

  // Fix 3 — extrasDeDoc exposes indStatus
  it("extrasDeDoc expõe indStatus", () => {
    expect(extrasDeDoc(imovel1910)["indStatus"]).toBe(1)
  })
})

describe("imoveisDeSolrDoc (integração com COD 1910 real)", () => {
  it("produz 1 imóvel ALUGUER válido com os campos corretos", () => {
    const resultados = imoveisDeSolrDoc(imovel1910, CTX)
    expect(resultados).toHaveLength(1)
    const r = resultados[0]
    expect(r.ok).toBe(true)
    if (r.ok) {
      const im = r.value
      expect(im.ref.valor).toBe("1910")
      expect(im.finalidade).toBe("ALUGUER")
      expect(im.preco.valor).toBe(1050)
      expect(im.preco.moeda).toBe("BRL")
      expect(im.preco.periodo).toBe("MENSAL")
      expect(im.localizacao.cidade).toBe("Araçatuba")
      expect(im.localizacao.bairro).toBe("Vila Estádio")
      expect(im.caracteristicas.quartos).toBe(2)
      expect(im.caracteristicas.areaM2).toBe(96)
      expect(im.caracteristicas.casasBanho).toBe(2)
      expect(im.extras["vagas"]).toBe(2)
      expect(im.extras["condominio"]).toBe(940)
      expect(im.estado.ativo).toBe(true)
      expect(im.urlSite.valor).toContain("/imovel/locacao/apartamentos/aracatuba/")
      expect(im.urlSite.valor).toContain("/1910")
    }
  })

  it("produz dois imóveis (ALUGUER+VENDA) quando há os dois valores", () => {
    const dual = { ...imovel1910, valSales: 350000 }
    const r = imoveisDeSolrDoc(dual, CTX)
    expect(r.map((x) => (x.ok ? x.value.finalidade : "ERR"))).toEqual(["ALUGUER", "VENDA"])
  })

  // Fix 2 — hashConteudo is content-based, not timestamp-based
  it("hashConteudo é idêntico para dois extraidoEm diferentes com o mesmo doc", () => {
    const ctx1 = { ...CTX, extraidoEm: "2026-06-07T12:00:00.000Z" }
    const ctx2 = { ...CTX, extraidoEm: "2026-06-08T09:00:00.000Z" }
    const r1 = imoveisDeSolrDoc(imovel1910, ctx1)
    const r2 = imoveisDeSolrDoc(imovel1910, ctx2)
    expect(r1[0].ok && r2[0].ok).toBe(true)
    if (r1[0].ok && r2[0].ok) {
      expect(r1[0].value.estado.hashConteudo).toBe(r2[0].value.estado.hashConteudo)
    }
  })

  it("hashConteudo muda quando valLocation muda", () => {
    const r1 = imoveisDeSolrDoc(imovel1910, CTX)
    const r2 = imoveisDeSolrDoc({ ...imovel1910, valLocation: 999 }, CTX)
    expect(r1[0].ok && r2[0].ok).toBe(true)
    if (r1[0].ok && r2[0].ok) {
      expect(r1[0].value.estado.hashConteudo).not.toBe(r2[0].value.estado.hashConteudo)
    }
  })

  // Fix 7 — imoveisDeSolrDoc with missing zonaTexto → rejected (ok: false)
  it("imoveisDeSolrDoc com zonaTexto vazio produz resultado ok:false", () => {
    const r = imoveisDeSolrDoc({ idtProperty: 5, valLocation: 1000 }, CTX)
    expect(r).toHaveLength(1)
    expect(r[0].ok).toBe(false)
  })

  // Fix 7 — imoveisDeSolrDoc with valLocation=0 → no operations → empty array
  it("imoveisDeSolrDoc com valLocation=0 produz array vazio", () => {
    const r = imoveisDeSolrDoc({ idtProperty: 5, valLocation: 0 }, CTX)
    expect(r).toEqual([])
  })
})

describe("caracteristicasItensDeDoc", () => {
  it("classifica booleana 'Sim' e anexa grupo", () => {
    const c = caracteristicasDeDoc(imovel3339)
    const sacada = c.itens.find((i) => i.chave === "sacada")
    expect(sacada?.tipo).toBe("BOOLEANA")
    expect(sacada?.valorBool).toBe(true)
    expect(sacada?.grupo).toBe("sacada")
  })

  it("preserva quantidade de elevadores como numérica", () => {
    const c = caracteristicasDeDoc(imovel3339)
    const elevador = c.itens.find((i) => i.chave === "elevador-social")
    expect(elevador?.tipo).toBe("NUMERICA")
    expect(elevador?.valorNum).toBe(2)
    expect(elevador?.grupo).toBe("elevador")
  })

  it("classifica categórica como texto", () => {
    const c = caracteristicasDeDoc(imovel3339)
    const padrao = c.itens.find((i) => i.chave === "padrao-de-acabamento")
    expect(padrao?.tipo).toBe("TEXTO")
    expect(padrao?.valorTexto).toBe("Alto")
  })

  it("ignora idt fora do dicionário", () => {
    const c = caracteristicasDeDoc(imovel3339)
    expect(c.itens.some((i) => i.idtFonte === 9999999)).toBe(false)
  })

  it("numérica zero não entra na lista de comodidades, mas fica em itens", () => {
    const c = caracteristicasDeDoc(imovel3339)
    const copas = c.itens.find((i) => i.idtFonte === 9)
    expect(copas?.tipo).toBe("NUMERICA")
    expect(copas?.valorNum).toBe(0)
  })

  it("lista deriva os rótulos das booleanas verdadeiras", () => {
    const c = caracteristicasDeDoc(imovel3339)
    expect(c.lista).toContain("Sacada")
    expect(c.lista).toContain("Piscina")
    expect(c.lista).toContain("Elevador de Serviço")
    expect(c.lista).not.toContain("Elevador Social") // é NUMERICA (qtd 2), não booleana
  })

  it("imovel1910 (sem booleanas verdadeiras) mantém lista vazia", () => {
    expect(caracteristicasDeDoc(imovel1910).lista).toEqual([])
  })
})
