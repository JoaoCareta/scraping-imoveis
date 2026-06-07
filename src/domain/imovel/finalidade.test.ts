import { describe, it, expect } from "vitest"
import { isFinalidade } from "./finalidade"

describe("Finalidade", () => {
  it("aceita ALUGUER e VENDA", () => {
    expect(isFinalidade("ALUGUER")).toBe(true)
    expect(isFinalidade("VENDA")).toBe(true)
  })

  it("rejeita valores fora do domínio", () => {
    expect(isFinalidade("arrendar")).toBe(false)
    expect(isFinalidade("")).toBe(false)
  })
})
