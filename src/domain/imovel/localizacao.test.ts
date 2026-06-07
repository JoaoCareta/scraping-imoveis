import { describe, it, expect } from "vitest"
import { Localizacao } from "./localizacao"

describe("Localizacao", () => {
  it("cria com zonaTexto e opcionais, fazendo trim", () => {
    const l = Localizacao.criar({ zonaTexto: "  Lisboa  ", concelho: " Lisboa " })
    expect(l.ok).toBe(true)
    if (l.ok) {
      expect(l.value.zonaTexto).toBe("Lisboa")
      expect(l.value.concelho).toBe("Lisboa")
      expect(l.value.distrito).toBeUndefined()
    }
  })

  it("rejeita zonaTexto vazia", () => {
    const l = Localizacao.criar({ zonaTexto: "   " })
    expect(l.ok).toBe(false)
    if (!l.ok) expect(l.error.campo).toBe("zonaTexto")
  })
})
