import { describe, it, expect } from "vitest"
import { ok, err, isOk, isErr } from "./result"

describe("Result", () => {
  it("ok carrega o valor e é reconhecido por isOk", () => {
    const r = ok(42)
    expect(isOk(r)).toBe(true)
    expect(isErr(r)).toBe(false)
    if (r.ok) expect(r.value).toBe(42)
  })

  it("err carrega o erro e é reconhecido por isErr", () => {
    const r = err("falhou")
    expect(isErr(r)).toBe(true)
    expect(isOk(r)).toBe(false)
    if (!r.ok) expect(r.error).toBe("falhou")
  })
})
