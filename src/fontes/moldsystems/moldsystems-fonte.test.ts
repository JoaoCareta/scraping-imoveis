import { describe, it, expect, vi } from "vitest"
import { MoldSystemsFonte } from "./moldsystems-fonte"
import { FonteIndisponivelError, FonteTimeoutError } from "../erros"
import { imovel1910 } from "./fixtures/imovel-1910"

const DEPS_BASE = {
  origin: "https://imobiliariainnove.com.br",
  clienteId: "innove",
  numRows: 5000,
  timeoutMs: 8000,
  retries: 1,
  agora: () => new Date("2026-06-18T10:00:00.000Z"),
  dormir: async () => {},
}

const respostaOk = (body: unknown) =>
  vi.fn(async () => ({ ok: true, status: 200, json: async () => body })) as unknown as typeof fetch

describe("MoldSystemsFonte", () => {
  it("mapeia docs válidos para imóveis (ALUGUER do COD 1910)", async () => {
    const fetchFn = respostaOk({ response: { docs: [imovel1910], numFound: 1 } })
    const fonte = new MoldSystemsFonte({ ...DEPS_BASE, fetchFn })

    const r = await fonte.buscarTodos()

    expect(r.rejeitados).toEqual([])
    expect(r.imoveis).toHaveLength(1)
    expect(r.imoveis[0].finalidade).toBe("ALUGUER")
    expect(r.imoveis[0].ref.valor).toBe("1910")
  })

  it("chama o URL Solr com numRows codificado", async () => {
    const fetchFn = respostaOk({ response: { docs: [], numFound: 0 } })
    const fonte = new MoldSystemsFonte({ ...DEPS_BASE, fetchFn })

    await fonte.buscarTodos()

    const urlChamado = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(urlChamado).toBe(
      "https://imobiliariainnove.com.br/api/solr/search/" + encodeURI(JSON.stringify({ numRows: 5000 })),
    )
  })

  it("coloca docs inválidos em rejeitados", async () => {
    const docInvalido = { idtProperty: 999, valLocation: 1000 }
    const fetchFn = respostaOk({ response: { docs: [docInvalido], numFound: 1 } })
    const fonte = new MoldSystemsFonte({ ...DEPS_BASE, fetchFn })

    const r = await fonte.buscarTodos()

    expect(r.imoveis).toEqual([])
    expect(r.rejeitados).toHaveLength(1)
    expect(r.rejeitados[0].ref).toBe("999")
  })

  it("avisa quando numFound excede numRows", async () => {
    const avisar = vi.fn()
    const fetchFn = respostaOk({ response: { docs: [imovel1910], numFound: 9999 } })
    const fonte = new MoldSystemsFonte({ ...DEPS_BASE, numRows: 5000, avisar, fetchFn })

    await fonte.buscarTodos()

    expect(avisar).toHaveBeenCalledOnce()
    expect(String(avisar.mock.calls[0][0])).toContain("9999")
  })

  it("erro de rede após retries → FonteIndisponivelError", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("ECONNREFUSED")
    }) as unknown as typeof fetch
    const fonte = new MoldSystemsFonte({ ...DEPS_BASE, retries: 1, fetchFn })

    await expect(fonte.buscarTodos()).rejects.toBeInstanceOf(FonteIndisponivelError)
    expect((fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2)
  })

  it("abort (timeout) → FonteTimeoutError, sem retry", async () => {
    const fetchFn = vi.fn(async () => {
      throw Object.assign(new Error("aborted"), { name: "AbortError" })
    }) as unknown as typeof fetch
    const fonte = new MoldSystemsFonte({ ...DEPS_BASE, retries: 1, fetchFn })

    await expect(fonte.buscarTodos()).rejects.toBeInstanceOf(FonteTimeoutError)
    expect((fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1)
  })

  it("4xx não faz retry → FonteIndisponivelError", async () => {
    const fetchFn = vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })) as unknown as typeof fetch
    const fonte = new MoldSystemsFonte({ ...DEPS_BASE, retries: 2, fetchFn })

    await expect(fonte.buscarTodos()).rejects.toBeInstanceOf(FonteIndisponivelError)
    expect((fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1)
  })

  it("5xx faz retry e depois sucede", async () => {
    let chamada = 0
    const fetchFn = vi.fn(async () => {
      chamada++
      if (chamada === 1) return { ok: false, status: 503, json: async () => ({}) }
      return { ok: true, status: 200, json: async () => ({ response: { docs: [imovel1910], numFound: 1 } }) }
    }) as unknown as typeof fetch
    const fonte = new MoldSystemsFonte({ ...DEPS_BASE, retries: 1, fetchFn })

    const r = await fonte.buscarTodos()

    expect(r.imoveis).toHaveLength(1)
    expect((fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2)
  })
})
