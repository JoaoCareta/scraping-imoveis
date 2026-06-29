import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { urlsDeDetalheDaListagem } from "./kenlo-listagem"

const html = readFileSync(new URL("./fixtures/listagem-apartamentos-venda.html", import.meta.url), "utf8")
const ORIGIN = "https://www.cairesengimob.com.br"

describe("kenlo-listagem", () => {
  it("coleta URLs absolutas e deduplicadas das páginas de detalhe", () => {
    const urls = urlsDeDetalheDaListagem(html, ORIGIN)
    expect(urls.length).toBeGreaterThan(0)
    expect(urls.every((u) => u.startsWith("https://www.cairesengimob.com.br/imovel/"))).toBe(true)
    expect(new Set(urls).size).toBe(urls.length) // sem duplicatas
  })

  it("não traz links de listagem (/imoveis/...) nem âncoras vazias", () => {
    const urls = urlsDeDetalheDaListagem(html, ORIGIN)
    expect(urls.some((u) => u.includes("/imoveis/"))).toBe(false)
  })
})
