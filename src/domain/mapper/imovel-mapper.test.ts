import { describe, it, expect } from "vitest"
import { Imovel, PropsImovel } from "../imovel/imovel"
import { imovelParaDto, dtoParaImovel } from "./imovel-mapper"

const props = (): PropsImovel => ({
  ref: "REF-9",
  clienteId: "cli",
  urlSite: "https://imob.pt/imovel/9",
  finalidade: "VENDA",
  preco: { valor: 250000, moeda: "BRL", periodo: "TOTAL" },
  localizacao: { zonaTexto: "Centro", bairro: "Centro", cidade: "Araçatuba", estado: "SP" },
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
    expect(dto.moeda).toBe("BRL")
    expect(dto.periodoPreco).toBe("TOTAL")
    expect(dto.zonaTexto).toBe("Centro")
    expect(dto.cidade).toBe("Araçatuba")
    expect(dto.estado).toBe("SP")
    expect(dto.tipologia).toBe("T3")
    expect(dto.caracteristicas).toEqual(["elevador"])
    expect(dto.extras["certificado"]).toBe("B")
    expect(dto.ativo).toBe(true)
    expect(dto.hashConteudo).toBe("h9")
  })
})

describe("imovelParaDto extras imutabilidade", () => {
  it("mutação do dto.extras não afecta os extras do imóvel original", () => {
    const r = Imovel.criar(props())
    if (!r.ok) throw new Error("setup inválido")
    const dto = imovelParaDto(r.value)
    dto.extras["novaClave"] = "injectado"
    expect(r.value.extras["novaClave"]).toBeUndefined()
  })
})

describe("dtoParaImovel (round-trip)", () => {
  it("DTO -> Imovel -> DTO preserva os campos", () => {
    const original = Imovel.criar(props())
    if (!original.ok) throw new Error("setup inválido")
    const dto = imovelParaDto(original.value)

    const reconstruido = dtoParaImovel(dto)
    expect(reconstruido.ok).toBe(true)
    if (reconstruido.ok) {
      expect(imovelParaDto(reconstruido.value)).toEqual(dto)
    }
  })

  it("ALUGUER sem periodoPreco deriva MENSAL automaticamente", () => {
    const r = Imovel.criar({
      ref: "REF-ALUG",
      clienteId: "cli",
      urlSite: "https://imob.pt/imovel/alug",
      finalidade: "ALUGUER",
      preco: { valor: 900, moeda: "BRL", periodo: "MENSAL" },
      localizacao: { zonaTexto: "Faro" },
      caracteristicas: { lista: [] },
      media: {},
      extras: {},
      estado: { ativo: true, extraidoEm: "2026-06-07T10:00:00.000Z", atualizadoEm: "2026-06-07T10:00:00.000Z", hashConteudo: "ha1" },
    })
    if (!r.ok) throw new Error("setup inválido")
    const dto = imovelParaDto(r.value)
    const { periodoPreco, ...semPeriodo } = dto
    const resultado = dtoParaImovel(semPeriodo as typeof dto)
    expect(resultado.ok).toBe(true)
    if (resultado.ok) expect(resultado.value.preco.periodo).toBe("MENSAL")
  })

  it("propaga erros de validação de um DTO inválido", () => {
    const original = Imovel.criar(props())
    if (!original.ok) throw new Error("setup inválido")
    const dto = imovelParaDto(original.value)
    const invalido = { ...dto, preco: -10 }

    const r = dtoParaImovel(invalido)
    expect(r.ok).toBe(false)
  })
})
