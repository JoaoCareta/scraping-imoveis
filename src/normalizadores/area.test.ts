import { describe, it, expect } from "vitest"
import { parsearAreaM2 } from "./area"

describe("parsearAreaM2", () => {
  it("extrai a área em m² (com ou sem espaço, ² ou 2)", () => {
    expect(parsearAreaM2("120 m²")).toBe(120)
    expect(parsearAreaM2("69m²")).toBe(69)
    expect(parsearAreaM2("Área útil: 47 m2")).toBe(47)
    expect(parsearAreaM2("120,5 m²")).toBe(120.5)
  })

  it("devolve null sem m²", () => {
    expect(parsearAreaM2("3 quartos")).toBeNull()
    expect(parsearAreaM2("")).toBeNull()
  })
})
