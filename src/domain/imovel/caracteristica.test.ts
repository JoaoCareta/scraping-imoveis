import { describe, it, expect } from "vitest"
import { Caracteristica } from "./caracteristica"

describe("Caracteristica", () => {
  it("cria booleana com valorBool", () => {
    const r = Caracteristica.criar({
      idtFonte: 97, chave: "elevador-social", rotulo: "Elevador Social",
      grupo: "elevador", tipo: "BOOLEANA", valorBool: true,
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.chave).toBe("elevador-social")
      expect(r.value.grupo).toBe("elevador")
      expect(r.value.valorBool).toBe(true)
    }
  })

  it("cria numérica com valorNum (preserva quantidade)", () => {
    const r = Caracteristica.criar({
      idtFonte: 96, chave: "elevador-de-servico", rotulo: "Elevador de Serviço",
      tipo: "NUMERICA", valorNum: 2,
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.valorNum).toBe(2)
  })

  it("cria texto com valorTexto", () => {
    const r = Caracteristica.criar({
      idtFonte: 24, chave: "padrao-de-acabamento", rotulo: "Padrão de acabamento",
      tipo: "TEXTO", valorTexto: "Alto",
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.valorTexto).toBe("Alto")
  })

  it("rejeita chave vazia", () => {
    const r = Caracteristica.criar({
      idtFonte: 1, chave: "  ", rotulo: "X", tipo: "BOOLEANA", valorBool: true,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.campo).toBe("chave")
  })

  it("rejeita rótulo vazio", () => {
    const r = Caracteristica.criar({
      idtFonte: 1, chave: "x", rotulo: "  ", tipo: "BOOLEANA", valorBool: true,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.campo).toBe("rotulo")
  })

  it("rejeita booleana sem valorBool", () => {
    const r = Caracteristica.criar({ idtFonte: 1, chave: "x", rotulo: "X", tipo: "BOOLEANA" })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.campo).toBe("valor")
  })

  it("rejeita numérica sem valorNum finito", () => {
    const r = Caracteristica.criar({ idtFonte: 1, chave: "x", rotulo: "X", tipo: "NUMERICA" })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.campo).toBe("valor")
  })

  it("rejeita texto sem valorTexto", () => {
    const r = Caracteristica.criar({ idtFonte: 1, chave: "x", rotulo: "X", tipo: "TEXTO", valorTexto: "  " })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.campo).toBe("valor")
  })
})
