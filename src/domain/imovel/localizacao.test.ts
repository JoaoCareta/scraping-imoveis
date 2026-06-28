import { describe, it, expect } from "vitest"
import { Localizacao } from "./localizacao"

describe("Localizacao", () => {
  it("cria com zonaTexto e opcionais, fazendo trim", () => {
    const l = Localizacao.criar({ zonaTexto: "  Centro  ", cidade: " Araçatuba " })
    expect(l.ok).toBe(true)
    if (l.ok) {
      expect(l.value.zonaTexto).toBe("Centro")
      expect(l.value.cidade).toBe("Araçatuba")
      expect(l.value.bairro).toBeUndefined()
    }
  })

  it("rejeita zonaTexto vazia", () => {
    const l = Localizacao.criar({ zonaTexto: "   " })
    expect(l.ok).toBe(false)
    if (!l.ok) expect(l.error.campo).toBe("zonaTexto")
  })

  it("normaliza opcional só-espaços para undefined", () => {
    const l = Localizacao.criar({ zonaTexto: "Centro", bairro: "   " })
    expect(l.ok).toBe(true)
    if (l.ok) expect(l.value.bairro).toBeUndefined()
  })

  it("normaliza estado (UF) para maiúsculas", () => {
    const l = Localizacao.criar({ zonaTexto: "Centro", estado: "sp" })
    expect(l.ok).toBe(true)
    if (l.ok) expect(l.value.estado).toBe("SP")
  })
})

describe("Localizacao endereço estruturado", () => {
  it("armazena rua, numero, cep, andar, ponto de referência e condomínio (com trim)", () => {
    const l = Localizacao.criar({
      zonaTexto: "Centro", rua: "  Rua Pará  ", numero: " 70 ", cep: "16011015",
      andar: 4, pontoReferencia: " ao lado da praça ", condominio: " Residencial Madri ",
    })
    expect(l.ok).toBe(true)
    if (l.ok) {
      expect(l.value.rua).toBe("Rua Pará")
      expect(l.value.numero).toBe("70")
      expect(l.value.cep).toBe("16011015")
      expect(l.value.andar).toBe(4)
      expect(l.value.pontoReferencia).toBe("ao lado da praça")
      expect(l.value.condominio).toBe("Residencial Madri")
    }
  })

  it("armazena geo quando lat/lng finitos", () => {
    const l = Localizacao.criar({ zonaTexto: "Centro", geo: { lat: -21.21, lng: -50.44 } })
    expect(l.ok).toBe(true)
    if (l.ok) expect(l.value.geo).toEqual({ lat: -21.21, lng: -50.44 })
  })

  it("descarta geo com valores não finitos", () => {
    const l = Localizacao.criar({ zonaTexto: "Centro", geo: { lat: NaN, lng: -50 } })
    expect(l.ok).toBe(true)
    if (l.ok) expect(l.value.geo).toBeUndefined()
  })

  it("campos novos ausentes ficam undefined", () => {
    const l = Localizacao.criar({ zonaTexto: "Centro" })
    expect(l.ok).toBe(true)
    if (l.ok) {
      expect(l.value.rua).toBeUndefined()
      expect(l.value.andar).toBeUndefined()
      expect(l.value.geo).toBeUndefined()
    }
  })
})
