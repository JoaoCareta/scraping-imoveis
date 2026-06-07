import { describe, it, expect } from "vitest"
import { parsearNumeroBr } from "./numero-br"

describe("parsearNumeroBr", () => {
  it("interpreta milhares com ponto e decimais com vírgula", () => {
    expect(parsearNumeroBr("R$ 1.600,00")).toBe(1600)
    expect(parsearNumeroBr("250.000")).toBe(250000)
    expect(parsearNumeroBr("68.000,00")).toBe(68000)
    expect(parsearNumeroBr("120,5")).toBe(120.5)
    expect(parsearNumeroBr("69")).toBe(69)
    expect(parsearNumeroBr("1.250/mês")).toBe(1250)
  })

  it("devolve null quando não há número", () => {
    expect(parsearNumeroBr("sem valor")).toBeNull()
    expect(parsearNumeroBr("")).toBeNull()
  })
})
