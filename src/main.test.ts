import { describe, it, expect } from "vitest"
import { construirApp } from "./main"

describe("construirApp", () => {
  it("constrói o servidor a partir da config sem chamar a rede", async () => {
    const app = construirApp({
      port: 3000, host: "0.0.0.0", fetchTimeoutMs: 8000, logLevel: "silent",
      clientes: [{ id: "innove", plataforma: "moldsystems", estrategia: "html", origin: "https://x", solrNumRows: 5000 }],
    })
    const res = await app.inject({ method: "GET", url: "/health" })
    expect(res.statusCode).toBe(200)
  })
})
