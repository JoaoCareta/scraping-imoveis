import { describe, it, expect } from "vitest"
import { limparTermoCondominio, textoCondominio, casaCondominio } from "./condominio-busca"

describe("limparTermoCondominio", () => {
  it("normaliza acento/caixa e remove palavras genéricas", () => {
    expect(limparTermoCondominio("Residencial Elev")).toBe("elev")
    expect(limparTermoCondominio("CONDOMÍNIO Vila Madalena")).toBe("vila madalena")
    expect(limparTermoCondominio("Edifício  Spazio  Albany")).toBe("spazio albany")
  })

  it("retorna null para vazio ou só genéricos", () => {
    expect(limparTermoCondominio("")).toBeNull()
    expect(limparTermoCondominio("   ")).toBeNull()
    expect(limparTermoCondominio("condomínio")).toBeNull()
  })
})

describe("casaCondominio (palavra inteira)", () => {
  const texto = (s: string) => textoCondominio({ descricao: s })

  it("acha 'elev' como palavra, sem confundir com 'elevador'", () => {
    expect(casaCondominio(texto("apartamento no Condomínio Elev"), "elev")).toBe(true)
    expect(casaCondominio(texto("apartamento com elevador e piscina"), "elev")).toBe(false)
  })

  it("acha nome composto que só existe no texto", () => {
    expect(casaCondominio(texto("Apartamento no Residencial Ataville em Araçatuba"), "ataville")).toBe(true)
    expect(casaCondominio(texto("Edifício Spazio Albany - Jardim Sumaré"), "spazio albany")).toBe(true)
  })

  it("casa por qualquer fonte (nome estruturado, título, slug)", () => {
    const t = textoCondominio({ condominio: "Condomínio Elev", titulo: "Apto à venda", urlSite: "https://x/imovel/venda/apartamentos/aracatuba/elev-aracatuba/1320" })
    expect(casaCondominio(t, "elev")).toBe(true)
  })
})
