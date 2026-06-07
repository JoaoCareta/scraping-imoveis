import { describe, it, expect } from "vitest"
import { Imovel, PropsImovel } from "../imovel/imovel"
import { imovelParaDto } from "./imovel-mapper"

const props = (): PropsImovel => ({
  ref: "REF-9",
  clienteId: "cli",
  urlSite: "https://imob.pt/imovel/9",
  finalidade: "VENDA",
  preco: { valor: 250000, moeda: "EUR", periodo: "TOTAL" },
  localizacao: { zonaTexto: "Braga", concelho: "Braga" },
  caracteristicas: { tipoImovel: "Apartamento", tipologia: "T3", areaM2: 120, quartos: 3, casasBanho: 2, lista: ["elevador"] },
  media: { fotoPrincipal: "https://imob.pt/f9.jpg" },
  extras: { certificado: "B" },
  estado: { ativo: true, extraidoEm: "2026-06-07T10:00:00.000Z", atualizadoEm: "2026-06-07T10:00:00.000Z", hashConteudo: "h9" },
})

describe("imovelParaDto", () => {
  it("achata a entidade no contrato de saída", () => {
    const r = Imovel.criar(props())
    if (!r.ok) throw new Error("setup inválido")
    const dto = imovelParaDto(r.value)

    expect(dto.ref).toBe("REF-9")
    expect(dto.urlSite).toBe("https://imob.pt/imovel/9")
    expect(dto.preco).toBe(250000)
    expect(dto.moeda).toBe("EUR")
    expect(dto.periodoPreco).toBe("TOTAL")
    expect(dto.zonaTexto).toBe("Braga")
    expect(dto.tipologia).toBe("T3")
    expect(dto.caracteristicas).toEqual(["elevador"])
    expect(dto.extras["certificado"]).toBe("B")
    expect(dto.ativo).toBe(true)
    expect(dto.hashConteudo).toBe("h9")
  })
})
