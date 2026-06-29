import { describe, it, expect } from "vitest"
import { slugKenlo, grupoDeChave, caracteristicaBooleanaDeRotulo } from "./caracteristicas-grupos"

describe("kenlo caracteristicas", () => {
  it("slugKenlo normaliza acento, caixa e espaços", () => {
    expect(slugKenlo("Área de serviço")).toBe("area-de-servico")
    expect(slugKenlo("Portaria 24 Horas")).toBe("portaria-24-horas")
  })

  it("grupoDeChave devolve o grupo curado quando existe", () => {
    expect(grupoDeChave("piscina")).toBe("piscina")
    expect(grupoDeChave("sacada")).toBe("sacada-varanda")
    expect(grupoDeChave("cozinha")).toBeUndefined()
  })

  it("caracteristicaBooleanaDeRotulo cria BOOLEANA presente, com slug e grupo", () => {
    const r = caracteristicaBooleanaDeRotulo("Piscina")
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.chave).toBe("piscina")
      expect(r.value.rotulo).toBe("Piscina")
      expect(r.value.tipo).toBe("BOOLEANA")
      expect(r.value.valorBool).toBe(true)
      expect(r.value.grupo).toBe("piscina")
    }
  })
})
