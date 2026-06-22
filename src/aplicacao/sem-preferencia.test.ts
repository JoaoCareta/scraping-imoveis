import { describe, it, expect } from "vitest"
import { ehSemPreferencia } from "./sem-preferencia"

describe("ehSemPreferencia", () => {
  it("trata vazio e espaços como sem preferência", () => {
    expect(ehSemPreferencia("")).toBe(true)
    expect(ehSemPreferencia("   ")).toBe(true)
  })

  it("trata coringas como sem preferência (case/acento/espaços insensível)", () => {
    expect(ehSemPreferencia("qualquer")).toBe(true)
    expect(ehSemPreferencia("  Tanto Faz ")).toBe(true)
    expect(ehSemPreferencia("TODOS")).toBe(true)
    expect(ehSemPreferencia("ambos")).toBe(true)
    expect(ehSemPreferencia("indiferente")).toBe(true)
  })

  it("mantém valores reais como filtro", () => {
    expect(ehSemPreferencia("Araçatuba")).toBe(false)
    expect(ehSemPreferencia("apartamento")).toBe(false)
    expect(ehSemPreferencia("Centro")).toBe(false)
  })
})
