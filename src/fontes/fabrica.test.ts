import { describe, it, expect } from "vitest"
import { criarFonte, parsearSeeds } from "./fabrica"
import { MoldSystemsFonte } from "./moldsystems/moldsystems-fonte"
import { KenloFonte } from "./kenlo/kenlo-fonte"
import { Config } from "../config"

const base: Config = {
  port: 3000, host: "0.0.0.0", clienteId: "x", origin: "https://x", solrNumRows: 5000,
  fetchTimeoutMs: 8000, logLevel: "silent", plataforma: "moldsystems", estrategia: "html",
}

describe("criarFonte", () => {
  it("plataforma moldsystems → MoldSystemsFonte", () => {
    expect(criarFonte({ ...base, plataforma: "moldsystems" })).toBeInstanceOf(MoldSystemsFonte)
  })
  it("plataforma kenlo → KenloFonte", () => {
    expect(criarFonte({ ...base, plataforma: "kenlo", origin: "https://www.cairesengimob.com.br" })).toBeInstanceOf(KenloFonte)
  })
  it("plataforma kenlo + estrategia api → falha-rápido (ColetaApiKenlo não implementada)", () => {
    expect(() => criarFonte({ ...base, plataforma: "kenlo", estrategia: "api", origin: "https://www.cairesengimob.com.br" })).toThrow(/não implementada/)
  })
})

describe("parsearSeeds", () => {
  it("monta seeds a partir de CSV de paths (finalidade do 2º segmento, tipo do 3º)", () => {
    const seeds = parsearSeeds("/imoveis/a-venda/apartamento/aracatuba, /imoveis/para-alugar/casa")
    expect(seeds).toEqual([
      { path: "/imoveis/a-venda/apartamento/aracatuba", finalidade: "VENDA", tipoImovel: "apartamento" },
      { path: "/imoveis/para-alugar/casa", finalidade: "ALUGUER", tipoImovel: "casa" },
    ])
  })

  it("ignora itens vazios e normaliza a barra inicial", () => {
    const seeds = parsearSeeds("imoveis/a-venda/terreno,, ")
    expect(seeds).toEqual([{ path: "/imoveis/a-venda/terreno", finalidade: "VENDA", tipoImovel: "terreno" }])
  })
})
