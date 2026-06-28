import { describe, it, expect } from "vitest"
import { imovelParaRecurso } from "./recurso-imovel"
import { imoveisDeSolrDoc } from "../../fontes/moldsystems/solr-mapper"
import { imovel3339 } from "../../fontes/moldsystems/fixtures/imovel-3339"

const CTX = { clienteId: "innove", origin: "https://imobiliariainnove.com.br", extraidoEm: "2026-06-28T12:00:00.000Z" }

describe("recurso-imovel — características", () => {
  it("expõe itens e comodidades (slugs + grupos das booleanas verdadeiras)", () => {
    const r = imoveisDeSolrDoc(imovel3339, CTX).find((x) => x.ok)
    expect(r?.ok).toBe(true)
    if (!r || !r.ok) return
    const rec = imovelParaRecurso(r.value)

    expect(rec.caracteristicas.itens.length).toBeGreaterThan(0)
    const sacada = rec.caracteristicas.itens.find((i) => i.chave === "sacada")
    expect(sacada?.valorBool).toBe(true)

    expect(rec.caracteristicas.comodidades).toContain("sacada")
    expect(rec.caracteristicas.comodidades).toContain("piscina")
    expect(rec.caracteristicas.comodidades).toContain("elevador-de-servico")
    expect(rec.caracteristicas.comodidades).toContain("elevador") // grupo
    const set = new Set(rec.caracteristicas.comodidades)
    expect(set.size).toBe(rec.caracteristicas.comodidades.length) // sem duplicatas
  })
})
