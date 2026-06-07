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

  it("interpreta valores grandes (milhões)", () => {
    expect(parsearNumeroBr("R$ 1.234.567,89")).toBe(1234567.89)
  })
  it("limitação documentada: grupo de pontos curto lê só o inteiro", () => {
    expect(parsearNumeroBr("1.23")).toBe(1)
  })
  it("zero é número válido", () => {
    expect(parsearNumeroBr("0")).toBe(0)
  })
})
