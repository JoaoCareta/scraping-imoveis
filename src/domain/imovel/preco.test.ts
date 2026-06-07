import { describe, it, expect } from "vitest"
import { Preco } from "./preco"

describe("Preco", () => {
  it("cria com valor positivo", () => {
    const p = Preco.criar(1250, "BRL", "MENSAL")
    expect(p.ok).toBe(true)
    if (p.ok) {
      expect(p.value.valor).toBe(1250)
      expect(p.value.moeda).toBe("BRL")
      expect(p.value.periodo).toBe("MENSAL")
    }
  })

  it("rejeita valor zero ou negativo", () => {
    expect(Preco.criar(0, "BRL", "TOTAL").ok).toBe(false)
    expect(Preco.criar(-5, "BRL", "TOTAL").ok).toBe(false)
  })

  it("rejeita valor não-finito", () => {
    expect(Preco.criar(Number.NaN, "BRL", "TOTAL").ok).toBe(false)
  })

  it("periodoEsperado: ALUGUER=MENSAL, VENDA=TOTAL", () => {
    expect(Preco.periodoEsperado("ALUGUER")).toBe("MENSAL")
    expect(Preco.periodoEsperado("VENDA")).toBe("TOTAL")
  })
})
