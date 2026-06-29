import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { ColetaHtmlKenlo } from "./coleta-html"

const f = (n: string) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "utf8")
const ctx = { clienteId: "caires", origin: "https://www.cairesengimob.com.br", extraidoEm: "2026-06-29T10:00:00.000Z" }

// fetch falso: listagem page 1 → fixture; page>=2 → HTTP 404 (fim); detalhe → fixture ap1048.
function fetchFake(contadorPaginas: { paginasPedidas: number }): typeof fetch {
  return (async (input: unknown) => {
    const url = String(input)
    if (url.includes("/imoveis/")) {
      contadorPaginas.paginasPedidas++
      const m = url.match(/[?&]page=(\d+)/)
      const page = m ? Number(m[1]) : 1
      if (page >= 2) return new Response("Não encontramos imóveis", { status: 404 })
      return new Response(f("listagem-apartamentos-venda.html"), { status: 200 })
    }
    return new Response(f("detalhe-ap1048.html"), { status: 200 })
  }) as unknown as typeof fetch
}

describe("ColetaHtmlKenlo", () => {
  it("crawleia ?page=N até 404 e parseia os detalhes em Imovel[]", async () => {
    const cont = { paginasPedidas: 0 }
    const estrategia = new ColetaHtmlKenlo({
      origin: ctx.origin,
      timeoutMs: 2000,
      fetchFn: fetchFake(cont),
      seeds: [{ path: "/imoveis/a-venda/apartamento", finalidade: "VENDA", tipoImovel: "apartamento" }],
      concorrencia: 4,
      dormir: async () => {},
    })
    const r = await estrategia.coletar(ctx)
    expect(r.imoveis.length).toBeGreaterThan(0)         // 12 URLs da listagem → 12 imóveis parseados
    expect(r.imoveis[0].clienteId).toBe("caires")
    expect(cont.paginasPedidas).toBe(2)                  // pediu page=1 (cards) e page=2 (404 → parou)
    expect(Array.isArray(r.rejeitados)).toBe(true)
  })
})
