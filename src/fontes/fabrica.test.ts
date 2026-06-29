import { describe, it, expect } from "vitest"
import { criarFonte } from "./fabrica"
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
