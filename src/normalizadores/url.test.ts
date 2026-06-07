import { describe, it, expect } from "vitest"
import { finalidadeDeUrl, tipoImovelDeUrl } from "./url"

const ALUG = "https://imobiliariainnove.com.br/imovel/locacao/apartamentos/aracatuba/conjunto-habitacional-pedro-perri/2937"
const VENDA = "https://imobiliariainnove.com.br/imovel/venda/casas/aracatuba/centro/1000"
const AMBOS = "https://imobiliariainnove.com.br/imovel/venda-e-locacao/apartamentos/aracatuba/aviacao/3461"

describe("finalidadeDeUrl", () => {
  it("locacao -> ALUGUER, venda -> VENDA, venda-e-locacao -> VENDA", () => {
    expect(finalidadeDeUrl(ALUG)).toBe("ALUGUER")
    expect(finalidadeDeUrl(VENDA)).toBe("VENDA")
    expect(finalidadeDeUrl(AMBOS)).toBe("VENDA")
  })

  it("devolve null para URL sem segmento de finalidade", () => {
    expect(finalidadeDeUrl("https://x.com/")).toBeNull()
    expect(finalidadeDeUrl("")).toBeNull()
  })
})

describe("tipoImovelDeUrl", () => {
  it("mapeia o segmento de tipo para o singular do domínio", () => {
    expect(tipoImovelDeUrl(ALUG)).toBe("apartamento")
    expect(tipoImovelDeUrl(VENDA)).toBe("casa")
    expect(tipoImovelDeUrl("https://x/imovel/locacao/comercial/aracatuba/alvorada/3464")).toBe("comercial")
  })

  it("devolve null sem segmento de tipo", () => {
    expect(tipoImovelDeUrl("https://x.com/")).toBeNull()
  })
})
