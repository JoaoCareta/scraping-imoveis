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
