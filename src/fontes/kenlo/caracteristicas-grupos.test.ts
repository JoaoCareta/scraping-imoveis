import { describe, it, expect } from "vitest"
import { slugKenlo, grupoDeChave, caracteristicaBooleanaDeRotulo } from "./caracteristicas-grupos"

describe("kenlo caracteristicas", () => {
  it("slugKenlo normaliza acento, caixa e espaços", () => {
    expect(slugKenlo("Área de serviço")).toBe("area-de-servico")
    expect(slugKenlo("Portaria 24 Horas")).toBe("portaria-24-horas")
  })

  it("grupoDeChave devolve o grupo curado quando existe", () => {
    expect(grupoDeChave("piscina")).toBe("piscina")
    expect(grupoDeChave("cozinha")).toBeUndefined()
  })

  it("grupos usam o MESMO vocabulário de slugs que o prompt do bot envia na busca", () => {
    // O bot traduz a fala pra estes slugs (system prompt) e a busca exige presença
    // em comodidades — o grupo do rótulo Kenlo precisa cair NESSE vocabulário.
    expect(grupoDeChave("sacada")).toBe("sacada")
    expect(grupoDeChave("varanda")).toBe("sacada")
    expect(grupoDeChave("varanda-gourmet")).toBe("sacada")
    expect(grupoDeChave("academia")).toBe("academia")
    expect(grupoDeChave("salao-de-festas")).toBe("salao-de-festas")
    expect(grupoDeChave("espaco-gourmet")).toBe("espaco-gourmet")
    expect(grupoDeChave("salao-gourmet")).toBe("espaco-gourmet")
    expect(grupoDeChave("area-de-lazer")).toBe("area-de-lazer")
    expect(grupoDeChave("ar-condicionado")).toBe("ar-condicionado")
    expect(grupoDeChave("playground")).toBe("playground")
    expect(grupoDeChave("quadra")).toBe("quadra-poliesportiva")
    expect(grupoDeChave("quadra-poliesportiva")).toBe("quadra-poliesportiva")
    expect(grupoDeChave("sauna")).toBe("sauna")
    expect(grupoDeChave("pet-place")).toBe("pet-place")
    expect(grupoDeChave("condominio-fechado")).toBe("condominio-fechado")
    expect(grupoDeChave("portaria-24-horas")).toBe("portaria")
    expect(grupoDeChave("portaria")).toBe("portaria")
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
