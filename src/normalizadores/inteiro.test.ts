import { describe, it, expect } from "vitest"
import { parsearInteiro } from "./inteiro"

describe("parsearInteiro", () => {
  it("extrai o primeiro inteiro (quartos/banheiros/vagas)", () => {
    expect(parsearInteiro("3 quartos")).toBe(3)
    expect(parsearInteiro("2 banheiros")).toBe(2)
    expect(parsearInteiro("1 vaga")).toBe(1)
    expect(parsearInteiro("2")).toBe(2)
  })

  it("devolve null sem dígitos", () => {
    expect(parsearInteiro("sem vaga")).toBeNull()
    expect(parsearInteiro("")).toBeNull()
  })
})
