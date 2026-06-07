import { describe, it, expect } from "vitest"
import { parsearValorReais } from "./valor-reais"

describe("parsearValorReais", () => {
  it("extrai o valor após R$", () => {
    expect(parsearValorReais("R$ 1.600,00")).toBe(1600)
    expect(parsearValorReais("Aluguel: R$ 900,00")).toBe(900)
    expect(parsearValorReais("R$ 250.000,00")).toBe(250000)
  })

  it("devolve null sem contexto R$ (evita confundir com área)", () => {
    expect(parsearValorReais("120 m²")).toBeNull()
    expect(parsearValorReais("")).toBeNull()
  })

  it("aceita sem espaço e em minúsculas", () => {
    expect(parsearValorReais("R$1.500")).toBe(1500)
    expect(parsearValorReais("r$ 900,00")).toBe(900)
  })
  it("R$ sem número devolve null", () => {
    expect(parsearValorReais("R$")).toBeNull()
  })
})
