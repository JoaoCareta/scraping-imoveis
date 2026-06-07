import { describe, it, expect } from "vitest"
import { UrlSite } from "./url-site"

describe("UrlSite", () => {
  it("aceita URL http(s) válida", () => {
    const u = UrlSite.criar("https://imobiliaria.pt/imovel/1234")
    expect(u.ok).toBe(true)
    if (u.ok) expect(u.value.valor).toBe("https://imobiliaria.pt/imovel/1234")
  })

  it("rejeita texto que não é URL", () => {
    const u = UrlSite.criar("não é url")
    expect(u.ok).toBe(false)
    if (!u.ok) expect(u.error.campo).toBe("urlSite")
  })

  it("rejeita protocolo não-http", () => {
    const u = UrlSite.criar("ftp://imobiliaria.pt/x")
    expect(u.ok).toBe(false)
  })
})
