import { describe, it, expect } from "vitest"
import { Imovel, PropsImovel } from "./imovel"

const propsValidas = (): PropsImovel => ({
  ref: "REF-1",
  clienteId: "cliente-a",
  urlSite: "https://imob.pt/imovel/1",
  finalidade: "ALUGUER",
  preco: { valor: 800, moeda: "EUR", periodo: "MENSAL" },
  localizacao: { zonaTexto: "Porto" },
  caracteristicas: { lista: ["garagem"] },
  media: {},
  extras: { piso: 3 },
  estado: { ativo: true, extraidoEm: "2026-06-07T10:00:00.000Z", atualizadoEm: "2026-06-07T10:00:00.000Z", hashConteudo: "h1" },
})

describe("Imovel.criar", () => {
  it("cria imóvel válido", () => {
    const r = Imovel.criar(propsValidas())
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.ref.valor).toBe("REF-1")
      expect(r.value.finalidade).toBe("ALUGUER")
      expect(r.value.preco.valor).toBe(800)
      expect(r.value.extras["piso"]).toBe(3)
    }
  })

  it("acumula múltiplos erros de validação", () => {
    const r = Imovel.criar({ ...propsValidas(), ref: "  ", urlSite: "xpto", preco: { valor: -1, moeda: "EUR", periodo: "MENSAL" } })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      const campos = r.error.map((e) => e.campo)
      expect(campos).toContain("ref")
      expect(campos).toContain("urlSite")
      expect(campos).toContain("preco")
      expect(r.error.length).toBeGreaterThanOrEqual(3)
    }
  })

  it("rejeita finalidade inválida", () => {
    const r = Imovel.criar({ ...propsValidas(), finalidade: "arrendar" })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.map((e) => e.campo)).toContain("finalidade")
  })

  it("rejeita período incoerente com a finalidade (VENDA exige TOTAL)", () => {
    const r = Imovel.criar({ ...propsValidas(), finalidade: "VENDA", preco: { valor: 200000, moeda: "EUR", periodo: "MENSAL" } })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.map((e) => e.campo)).toContain("preco.periodo")
  })
})
