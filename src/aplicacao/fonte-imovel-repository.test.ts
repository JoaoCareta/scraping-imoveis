import { describe, it, expect } from "vitest"
import { FonteImovelRepository } from "./fonte-imovel-repository"
import { FonteDeImoveis, ResultadoExtracao } from "../fontes/fonte-de-imoveis"
import { imoveisDeSolrDoc } from "../fontes/moldsystems/solr-mapper"
import { imovel1910 } from "../fontes/moldsystems/fixtures/imovel-1910"
import { isOk } from "../shared/result"
import { Imovel } from "../domain/imovel/imovel"
import { MoldSystemsSolrDoc } from "../fontes/moldsystems/solr-doc"

const CTX = { clienteId: "innove", origin: "https://imobiliariainnove.com.br", extraidoEm: "2026-06-18T10:00:00.000Z" }

function imoveisDeDocs(docs: MoldSystemsSolrDoc[]): Imovel[] {
  return docs.flatMap((d) => imoveisDeSolrDoc(d, CTX)).flatMap((r) => (isOk(r) ? [r.value] : []))
}

const docAluguel = imovel1910
const docVendaEAluguel = { ...imovel1910, idtProperty: 2001, totalRooms: 3, namDistrict: "Centro", namCity: "Bauru", valLocation: 1500, valSales: 300000 }

function fonteFake(imoveis: Imovel[], rejeitados = 0): FonteDeImoveis {
  const r: ResultadoExtracao = {
    imoveis,
    rejeitados: Array.from({ length: rejeitados }, (_, i) => ({ ref: `rej-${i}`, erros: [] })),
  }
  return { buscarTodos: async () => r }
}

describe("FonteImovelRepository", () => {
  it("buscar sem filtros devolve todos como RecursoImovel + total/rejeitados", async () => {
    const repo = new FonteImovelRepository({ fonte: fonteFake(imoveisDeDocs([docAluguel, docVendaEAluguel]), 2) })

    const c = await repo.buscar({})

    expect(c.total).toBe(3)
    expect(c.rejeitados).toBe(2)
    expect(c.extraidoEm).toBe("2026-06-18T10:00:00.000Z")
    expect(c.imoveis.every((i) => typeof i.preco.valor === "number")).toBe(true)
  })

  it("filtra por finalidade", async () => {
    const repo = new FonteImovelRepository({ fonte: fonteFake(imoveisDeDocs([docAluguel, docVendaEAluguel])) })
    const c = await repo.buscar({ finalidade: "VENDA" })
    expect(c.total).toBe(1)
    expect(c.imoveis[0].finalidade).toBe("VENDA")
  })

  it("filtra por precoMax", async () => {
    const repo = new FonteImovelRepository({ fonte: fonteFake(imoveisDeDocs([docAluguel, docVendaEAluguel])) })
    const c = await repo.buscar({ finalidade: "ALUGUER", precoMax: 1200 })
    expect(c.total).toBe(1)
    expect(c.imoveis[0].ref).toBe("1910")
  })

  it("filtra por quartos e cidade (case-insensitive)", async () => {
    const repo = new FonteImovelRepository({ fonte: fonteFake(imoveisDeDocs([docAluguel, docVendaEAluguel])) })
    const c = await repo.buscar({ quartos: 3, cidade: "bauru" })
    expect(c.imoveis.every((i) => i.caracteristicas.quartos === 3 && i.localizacao.cidade === "Bauru")).toBe(true)
    expect(c.total).toBe(2)
  })

  it("ativo default = true (só ativos)", async () => {
    const ativos = imoveisDeDocs([docAluguel])
    const inativos = imoveisDeDocs([{ ...imovel1910, idtProperty: 3003, flgShowSite: false }])
    const repo = new FonteImovelRepository({ fonte: fonteFake([...ativos, ...inativos]) })
    const c = await repo.buscar({})
    expect(c.imoveis.every((i) => i.estado.ativo)).toBe(true)
    expect(c.total).toBe(1)
  })

  it("buscarPorRef devolve as finalidades daquele ref", async () => {
    const repo = new FonteImovelRepository({ fonte: fonteFake(imoveisDeDocs([docAluguel, docVendaEAluguel])) })
    const c = await repo.buscarPorRef("2001")
    expect(c.total).toBe(2)
    expect(c.imoveis.map((i) => i.finalidade).sort()).toEqual(["ALUGUER", "VENDA"])
  })

  it("filtra por precoMin", async () => {
    const repo = new FonteImovelRepository({ fonte: fonteFake(imoveisDeDocs([docAluguel, docVendaEAluguel])) })
    const c = await repo.buscar({ finalidade: "ALUGUER", precoMin: 1200 })
    expect(c.total).toBe(1)
    expect(c.imoveis[0].ref).toBe("2001")
  })

  it("filtra por bairro (case-insensitive)", async () => {
    const repo = new FonteImovelRepository({ fonte: fonteFake(imoveisDeDocs([docAluguel, docVendaEAluguel])) })
    const c = await repo.buscar({ bairro: "vila estádio" })
    expect(c.total).toBe(1)
    expect(c.imoveis[0].ref).toBe("1910")
  })

  it("ativo:false devolve apenas inativos", async () => {
    const ativos = imoveisDeDocs([docAluguel])
    const inativos = imoveisDeDocs([{ ...imovel1910, idtProperty: 3003, flgShowSite: false }])
    const repo = new FonteImovelRepository({ fonte: fonteFake([...ativos, ...inativos]) })
    const c = await repo.buscar({ ativo: false })
    expect(c.total).toBe(1)
    expect(c.imoveis.every((i) => i.estado.ativo === false)).toBe(true)
  })

  it("ignora valores coringa (qualquer/todos) como sem filtro", async () => {
    const repo = new FonteImovelRepository({ fonte: fonteFake(imoveisDeDocs([docAluguel, docVendaEAluguel])) })
    const c = await repo.buscar({ bairro: "qualquer", tipoImovel: "todos" })
    expect(c.total).toBe(3)
  })
})
