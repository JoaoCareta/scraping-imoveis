import { describe, it, expect } from "vitest"
import { Ref } from "./ref"

describe("Ref", () => {
  it("cria com valor válido e faz trim", () => {
    const r = Ref.criar("  REF-1234  ")
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.valor).toBe("REF-1234")
  })

  it("rejeita referência vazia", () => {
    const r = Ref.criar("   ")
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.campo).toBe("ref")
  })

  it("equals compara pelo valor", () => {
    const a = Ref.criar("X1")
    const b = Ref.criar("X1")
    if (a.ok && b.ok) expect(a.value.equals(b.value)).toBe(true)
  })

  it("equals devolve false para referências diferentes", () => {
    const a = Ref.criar("X1")
    const b = Ref.criar("X2")
    if (a.ok && b.ok) expect(a.value.equals(b.value)).toBe(false)
  })
})
