import { describe, it, expect } from "vitest"
import { FonteIndisponivelError, FonteTimeoutError } from "./erros"

describe("erros de fonte", () => {
  it("FonteIndisponivelError tem name e mensagem", () => {
    const e = new FonteIndisponivelError("rede falhou")
    expect(e).toBeInstanceOf(Error)
    expect(e.name).toBe("FonteIndisponivelError")
    expect(e.message).toBe("rede falhou")
  })

  it("FonteTimeoutError tem name próprio", () => {
    const e = new FonteTimeoutError("tempo esgotado")
    expect(e.name).toBe("FonteTimeoutError")
    expect(e).toBeInstanceOf(Error)
  })
})
