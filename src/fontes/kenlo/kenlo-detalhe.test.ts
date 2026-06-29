import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { imovelDeHtmlDetalhe } from "./kenlo-detalhe"

const ctx = { clienteId: "caires", origin: "https://www.cairesengimob.com.br", extraidoEm: "2026-06-29T10:00:00.000Z" }
const html = (n: string) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "utf8")
const URL_AP1048 = "https://www.cairesengimob.com.br/imovel/apartamento-ciudad-del-este-3-quartos-95-m/AP1048-CIMB"
const URL_CA0676 = "https://www.cairesengimob.com.br/imovel/casa-aracatuba-2-quartos-50-m/CA0676-CIMB"

describe("imovelDeHtmlDetalhe", () => {
  it("extrai campos do AP1048 (sob consulta → preço ausente)", () => {
    const r = imovelDeHtmlDetalhe(html("detalhe-ap1048.html"), URL_AP1048, { finalidade: "VENDA", tipoImovel: "apartamento" }, ctx)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const im = r.value
    expect(im.ref.valor).toBe("AP1048-CIMB")
    expect(im.finalidade).toBe("VENDA")
    expect(im.preco).toBeUndefined()
    expect(im.caracteristicas.quartos).toBe(3)
    expect(im.caracteristicas.casasBanho).toBe(2)
    expect(im.caracteristicas.areaM2).toBe(95)
    const chaves = im.caracteristicas.itens.map((i) => i.chave)
    expect(chaves).toContain("piscina")
    expect(chaves).toContain("sacada")
  })

  it("extrai preço do CA0676 (com R$)", () => {
    const r = imovelDeHtmlDetalhe(html("detalhe-com-preco.html"), URL_CA0676, { finalidade: "VENDA", tipoImovel: "casa" }, ctx)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.ref.valor).toBe("CA0676-CIMB")
      expect(r.value.preco?.valor).toBe(100000)
    }
  })
})
