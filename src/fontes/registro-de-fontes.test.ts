import { describe, it, expect } from "vitest"
import { criarRegistro } from "./registro-de-fontes"
import { ClienteConfig } from "../config"

const infra = { fetchTimeoutMs: 8000 }
const innove: ClienteConfig = { id: "innove", plataforma: "moldsystems", estrategia: "html", origin: "https://x", solrNumRows: 5000 }
const caires: ClienteConfig = { id: "caires", plataforma: "kenlo", estrategia: "html", origin: "https://www.cairesengimob.com.br", solrNumRows: 5000 }

describe("criarRegistro", () => {
  it("obter devolve um repo para cada cliente registrado", () => {
    const reg = criarRegistro([innove, caires], infra)
    expect(reg.obter("innove")).toBeDefined()
    expect(reg.obter("caires")).toBeDefined()
  })
  it("repos de clientes distintos são instâncias diferentes", () => {
    const reg = criarRegistro([innove, caires], infra)
    expect(reg.obter("innove")).not.toBe(reg.obter("caires"))
  })
  it("obter de cliente não-registrado devolve undefined", () => {
    const reg = criarRegistro([innove], infra)
    expect(reg.obter("desconhecido")).toBeUndefined()
  })
})
