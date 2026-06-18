import { describe, it, expect } from "vitest"
import { imovelParaRecurso } from "./recurso-imovel"
import { imoveisDeSolrDoc } from "../../fontes/moldsystems/solr-mapper"
import { imovel1910 } from "../../fontes/moldsystems/fixtures/imovel-1910"
import { isOk } from "../../shared/result"

const CTX = { clienteId: "innove", origin: "https://imobiliariainnove.com.br", extraidoEm: "2026-06-18T10:00:00.000Z" }

describe("imovelParaRecurso", () => {
  it("produz hierarquia rica a partir do agregado", () => {
    const r = imoveisDeSolrDoc(imovel1910, CTX)[0]
    expect(isOk(r)).toBe(true)
    if (!isOk(r)) return
    const recurso = imovelParaRecurso(r.value)

    expect(recurso.ref).toBe("1910")
    expect(recurso.clienteId).toBe("innove")
    expect(recurso.finalidade).toBe("ALUGUER")
    expect(recurso.preco).toEqual({ valor: 1050, moeda: "BRL", periodo: "MENSAL" })
    expect(recurso.localizacao.cidade).toBe("Araçatuba")
    expect(recurso.localizacao.bairro).toBe("Vila Estádio")
    expect(recurso.caracteristicas.quartos).toBe(2)
    expect(recurso.caracteristicas.areaM2).toBe(96)
    expect(recurso.caracteristicas.lista).toEqual([])
    expect(recurso.media.fotoPrincipal).toContain("/imovel/fotos/1910/")
    expect(recurso.extras["condominio"]).toBe(940)
    expect(recurso.estado.ativo).toBe(true)
    expect(recurso.estado.extraidoEm).toBe("2026-06-18T10:00:00.000Z")
  })
})
