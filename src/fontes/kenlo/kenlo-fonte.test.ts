import { describe, it, expect } from "vitest"
import { KenloFonte } from "./kenlo-fonte"
import { EstrategiaColetaKenlo, KenloContexto } from "./estrategia"

describe("KenloFonte", () => {
  it("delega à estratégia injetada e repassa o contexto (clienteId/origin/extraidoEm)", async () => {
    let ctxRecebido: KenloContexto | undefined
    const estrategia: EstrategiaColetaKenlo = {
      coletar: async (ctx) => {
        ctxRecebido = ctx
        return { imoveis: [], rejeitados: [] }
      },
    }
    const fonte = new KenloFonte({
      origin: "https://www.cairesengimob.com.br",
      clienteId: "caires",
      estrategia,
      agora: () => new Date("2026-06-29T10:00:00.000Z"),
    })
    const r = await fonte.buscarTodos()
    expect(r.imoveis).toEqual([])
    expect(ctxRecebido?.clienteId).toBe("caires")
    expect(ctxRecebido?.origin).toBe("https://www.cairesengimob.com.br")
    expect(ctxRecebido?.extraidoEm).toBe("2026-06-29T10:00:00.000Z")
  })
})
