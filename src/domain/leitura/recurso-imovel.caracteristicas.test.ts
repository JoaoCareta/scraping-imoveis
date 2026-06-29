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

  it("promove comodidade NUMÉRICA>0 com grupo curado e ignora numérica sem grupo", () => {
    const r = imoveisDeSolrDoc(imovel3339, CTX).find((x) => x.ok)
    expect(r?.ok).toBe(true)
    if (!r || !r.ok) return
    const rec = imovelParaRecurso(r.value)

    // idt 97 "Elevador Social" veio como "2" (NUMERICA, grupo 'elevador') → entra
    expect(rec.caracteristicas.comodidades).toContain("elevador-social")
    expect(rec.caracteristicas.comodidades).toContain("elevador")
    // idt 95 "Área Útil" (NUMERICA, SEM grupo) → não polui comodidades
    expect(rec.caracteristicas.comodidades).not.toContain("area-util")
  })

  it("promove suíte (idt 6 numérico>0) para comodidade 'suite'", () => {
    const doc = {
      ...imovel3339,
      jsonCharacteristics: JSON.stringify([
        { desInformation: "2", desInformationFormatted: "2", characteristics: { idtCharacteristics: 6 } },
      ]),
    }
    const r = imoveisDeSolrDoc(doc, CTX).find((x) => x.ok)
    expect(r?.ok).toBe(true)
    if (!r || !r.ok) return
    const rec = imovelParaRecurso(r.value)
    expect(rec.caracteristicas.comodidades).toContain("suite")
  })
})

describe("recurso-imovel — localização, mídia e condomínio", () => {
  const CTX = { clienteId: "innove", origin: "https://imobiliariainnove.com.br", extraidoEm: "2026-06-28T12:00:00.000Z" }

  it("expõe endereço estruturado, geo, título/descrição, vídeo e comodidades do condomínio", () => {
    const r = imoveisDeSolrDoc(imovel3339, CTX).find((x) => x.ok)
    expect(r?.ok).toBe(true)
    if (!r || !r.ok) return
    const rec = imovelParaRecurso(r.value)

    expect(rec.localizacao.rua).toBe("Rua Pará")
    expect(rec.localizacao.numero).toBe("70")
    expect(rec.localizacao.cep).toBe("16011015")
    expect(rec.localizacao.andar).toBe(4)
    expect(rec.localizacao.condominio).toBe("Residencial Madri")
    expect(rec.localizacao.geo).toEqual({ lat: -21.21126, lng: -50.44073 })

    expect(rec.caracteristicas.titulo).toBe("Apartamento 3 dormitórios no Centro")
    expect(rec.caracteristicas.descricao).toContain("reformado")
    expect(rec.media.video).toBe("https://youtube.com/shorts/abc123")

    // comodidades do condomínio entram com marcador 'condominio' + slug específico
    expect(rec.caracteristicas.comodidades).toContain("condominio")
    expect(rec.caracteristicas.comodidades).toContain("playground")
    // item rico carrega a origem
    expect(rec.caracteristicas.itens.find((i) => i.chave === "playground")?.origem).toBe("CONDOMINIO")
  })
})
