import { describe, it, expect } from "vitest"
import { precarregarTodos, PrecarregadorDeps } from "./precarregador"
import { RecursoImovel } from "../domain/leitura/recurso-imovel"

const umImovel = [{ ref: "1" }] as unknown as RecursoImovel[]

describe("precarregarTodos", () => {
  it("busca no scraper e substitui quando há imóveis", async () => {
    const subst: string[] = []
    const deps: PrecarregadorDeps = {
      buscarNoScraper: async () => umImovel,
      substituirCatalogo: async (c, ims) => { subst.push(`${c}:${ims.length}`); return ims.length },
    }
    await precarregarTodos(deps, ["caires"])
    expect(subst).toEqual(["caires:1"])
  })

  it("scraper vazio → NÃO substitui (não zera o catálogo)", async () => {
    let chamou = false
    const deps: PrecarregadorDeps = {
      buscarNoScraper: async () => [],
      substituirCatalogo: async () => { chamou = true; return 0 },
    }
    await precarregarTodos(deps, ["caires"])
    expect(chamou).toBe(false)
  })

  it("falha do scraper não substitui nem propaga; próximo cliente segue", async () => {
    const subst: string[] = []
    const deps: PrecarregadorDeps = {
      buscarNoScraper: async (c) => { if (c === "caires") throw new Error("down"); return umImovel },
      substituirCatalogo: async (c, ims) => { subst.push(c); return ims.length },
    }
    await precarregarTodos(deps, ["caires", "outro"])
    expect(subst).toEqual(["outro"])
  })
})
