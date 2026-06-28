import { describe, it, expect } from "vitest"
import { resolverCaracteristica } from "./caracteristicas-dicionario"

describe("resolverCaracteristica", () => {
  it("resolve idt conhecido com rótulo", () => {
    const e = resolverCaracteristica(235)
    expect(e?.rotulo).toBe("Sacada")
    expect(e?.chave).toBe("sacada")
  })

  it("anexa grupo curado para variantes de elevador", () => {
    expect(resolverCaracteristica(97)?.grupo).toBe("elevador") // Elevador Social
    expect(resolverCaracteristica(96)?.grupo).toBe("elevador") // Elevador de Serviço
    expect(resolverCaracteristica(592)?.grupo).toBe("elevador") // Elevadores
  })

  it("devolve undefined para idt desconhecido", () => {
    expect(resolverCaracteristica(999999)).toBeUndefined()
  })

  it("característica sem grupo curado vem sem grupo", () => {
    const e = resolverCaracteristica(27) // Mobília — fora de qualquer grupo
    expect(e).toBeDefined()
    expect(e?.grupo).toBeUndefined()
  })
})
