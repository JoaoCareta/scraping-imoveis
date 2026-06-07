# Scraping — Fase 2: Normalizadores — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Construir os **normalizadores** puros que convertem texto cru extraído de um site (formato brasileiro) e segmentos de URL nos valores que a entidade `Imovel` precisa — preço (R$), área (m²), inteiros (quartos/banheiros/vagas), e finalidade/tipo/cidade/ref a partir do URL de detalhe.

**Architecture:** Funções puras e determinísticas (string → `number | null` ou `Finalidade | null`), sem I/O, sem dependência de DOM/rede. Reutilizam o domínio (`Finalidade`) onde aplicável. Alimentam (na Fase 4) o passo `normalizar → Imovel.criar()`. Cada função é testada com **tabela de casos** baseada nos formatos reais observados no spike MoldSystems (ver `docs/spikes/2026-06-07-innove-moldsystems.md`).

**Tech Stack:** TypeScript (strict), Vitest. Sem dependências novas.

**Referência:** spec §4.1 e §9; primeiro cliente = imobiliariainnove (plataforma MoldSystems).

---

## Decisões de design (registadas)

- **`venda-e-locacao` → `VENDA`.** O segmento de finalidade do URL pode ser `locacao`, `venda` ou `venda-e-locacao`. Regra: contém "venda" → `VENDA`; senão contém "locacao" → `ALUGUER`. (Um imóvel à venda-e-locação entra como `VENDA`; rever na Fase 4 se for preciso suportar duplo.)
- **`cidadeDeUrl` perde acentos.** O slug `aracatuba` vira `"Aracatuba"` (sem cedilha). É aceitável: o `zonaTexto`/card costuma trazer a forma acentuada; a cidade do URL é um fallback estruturado.
- **Números BR:** ponto = milhares, vírgula = decimais (`"1.600,00"` → `1600`, `"250.000"` → `250000`, `"120,5"` → `120.5`).

---

## File Structure (Fase 2)

```
src/normalizadores/
  numero-br.ts        + numero-br.test.ts        ← parsearNumeroBr (núcleo)
  valor-reais.ts      + valor-reais.test.ts       ← parsearValorReais (exige "R$")
  area.ts             + area.test.ts              ← parsearAreaM2
  inteiro.ts          + inteiro.test.ts           ← parsearInteiro (quartos/banheiros/vagas)
  url.ts              + url.test.ts               ← finalidadeDeUrl, tipoImovelDeUrl, cidadeDeUrl, refDeUrl
```

Cada ficheiro tem uma responsabilidade. `url.ts` agrupa os parsers que partilham a lógica de segmentos do URL `/imovel/{finalidade}/{tipo}/{cidade}/{localidade}/{codigo}`.

---

## Task 1: `parsearNumeroBr`

**Files:**
- Create: `src/normalizadores/numero-br.ts`
- Test: `src/normalizadores/numero-br.test.ts`

- [ ] **Step 1: Escrever o teste a falhar**

```ts
import { describe, it, expect } from "vitest"
import { parsearNumeroBr } from "./numero-br"

describe("parsearNumeroBr", () => {
  it("interpreta milhares com ponto e decimais com vírgula", () => {
    expect(parsearNumeroBr("R$ 1.600,00")).toBe(1600)
    expect(parsearNumeroBr("250.000")).toBe(250000)
    expect(parsearNumeroBr("68.000,00")).toBe(68000)
    expect(parsearNumeroBr("120,5")).toBe(120.5)
    expect(parsearNumeroBr("69")).toBe(69)
    expect(parsearNumeroBr("1.250/mês")).toBe(1250)
  })

  it("devolve null quando não há número", () => {
    expect(parsearNumeroBr("sem valor")).toBeNull()
    expect(parsearNumeroBr("")).toBeNull()
  })
})
```

- [ ] **Step 2: Correr e confirmar falha**

Run: `npx vitest run src/normalizadores/numero-br.test.ts`
Expected: FAIL — `Cannot find module './numero-br'`.

- [ ] **Step 3: Implementação mínima**

```ts
// Extrai o primeiro número em formato brasileiro (ponto=milhares, vírgula=decimais).
export function parsearNumeroBr(texto: string): number | null {
  if (!texto) return null
  const m = texto.match(/\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?/)
  if (!m) return null
  const limpo = m[0].replace(/\./g, "").replace(",", ".")
  const n = Number.parseFloat(limpo)
  return Number.isFinite(n) ? n : null
}
```

- [ ] **Step 4: Correr e confirmar passa**

Run: `npx vitest run src/normalizadores/numero-br.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/normalizadores/numero-br.ts src/normalizadores/numero-br.test.ts
git commit -m "feat(normalizadores): add parsearNumeroBr"
```

---

## Task 2: `parsearValorReais`

**Files:**
- Create: `src/normalizadores/valor-reais.ts`
- Test: `src/normalizadores/valor-reais.test.ts`

- [ ] **Step 1: Escrever o teste a falhar**

```ts
import { describe, it, expect } from "vitest"
import { parsearValorReais } from "./valor-reais"

describe("parsearValorReais", () => {
  it("extrai o valor após R$", () => {
    expect(parsearValorReais("R$ 1.600,00")).toBe(1600)
    expect(parsearValorReais("Aluguel: R$ 900,00")).toBe(900)
    expect(parsearValorReais("R$ 250.000,00")).toBe(250000)
  })

  it("devolve null sem contexto R$ (evita confundir com área)", () => {
    expect(parsearValorReais("120 m²")).toBeNull()
    expect(parsearValorReais("")).toBeNull()
  })
})
```

- [ ] **Step 2: Correr e confirmar falha**

Run: `npx vitest run src/normalizadores/valor-reais.test.ts`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementação mínima**

```ts
import { parsearNumeroBr } from "./numero-br"

// Exige o contexto "R$" para não capturar áreas/outros números como preço.
export function parsearValorReais(texto: string): number | null {
  if (!texto) return null
  const idx = texto.search(/r\$/i)
  if (idx < 0) return null
  return parsearNumeroBr(texto.slice(idx + 2))
}
```

- [ ] **Step 4: Correr e confirmar passa**

Run: `npx vitest run src/normalizadores/valor-reais.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/normalizadores/valor-reais.ts src/normalizadores/valor-reais.test.ts
git commit -m "feat(normalizadores): add parsearValorReais"
```

---

## Task 3: `parsearAreaM2`

**Files:**
- Create: `src/normalizadores/area.ts`
- Test: `src/normalizadores/area.test.ts`

- [ ] **Step 1: Escrever o teste a falhar**

```ts
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
```

- [ ] **Step 2: Correr e confirmar falha**

Run: `npx vitest run src/normalizadores/area.test.ts`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementação mínima**

```ts
import { parsearNumeroBr } from "./numero-br"

export function parsearAreaM2(texto: string): number | null {
  if (!texto) return null
  const m = texto.match(/([\d.,]+)\s*m(?:²|2)/i)
  if (!m) return null
  return parsearNumeroBr(m[1])
}
```

- [ ] **Step 4: Correr e confirmar passa**

Run: `npx vitest run src/normalizadores/area.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/normalizadores/area.ts src/normalizadores/area.test.ts
git commit -m "feat(normalizadores): add parsearAreaM2"
```

---

## Task 4: `parsearInteiro`

**Files:**
- Create: `src/normalizadores/inteiro.ts`
- Test: `src/normalizadores/inteiro.test.ts`

- [ ] **Step 1: Escrever o teste a falhar**

```ts
import { describe, it, expect } from "vitest"
import { parsearInteiro } from "./inteiro"

describe("parsearInteiro", () => {
  it("extrai o primeiro inteiro (quartos/banheiros/vagas)", () => {
    expect(parsearInteiro("3 quartos")).toBe(3)
    expect(parsearInteiro("2 banheiros")).toBe(2)
    expect(parsearInteiro("1 vaga")).toBe(1)
    expect(parsearInteiro("2")).toBe(2)
  })

  it("devolve null sem dígitos", () => {
    expect(parsearInteiro("sem vaga")).toBeNull()
    expect(parsearInteiro("")).toBeNull()
  })
})
```

- [ ] **Step 2: Correr e confirmar falha**

Run: `npx vitest run src/normalizadores/inteiro.test.ts`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementação mínima**

```ts
export function parsearInteiro(texto: string): number | null {
  if (!texto) return null
  const m = texto.match(/\d+/)
  if (!m) return null
  const n = Number.parseInt(m[0], 10)
  return Number.isFinite(n) ? n : null
}
```

- [ ] **Step 4: Correr e confirmar passa**

Run: `npx vitest run src/normalizadores/inteiro.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/normalizadores/inteiro.ts src/normalizadores/inteiro.test.ts
git commit -m "feat(normalizadores): add parsearInteiro"
```

---

## Task 5: `url.ts` — `segmentosImovel` + `finalidadeDeUrl`

**Files:**
- Create: `src/normalizadores/url.ts`
- Test: `src/normalizadores/url.test.ts`

- [ ] **Step 1: Escrever o teste a falhar**

```ts
import { describe, it, expect } from "vitest"
import { finalidadeDeUrl } from "./url"

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
```

- [ ] **Step 2: Correr e confirmar falha**

Run: `npx vitest run src/normalizadores/url.test.ts`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementação mínima**

```ts
import { Finalidade } from "../domain/imovel/finalidade"

// Segmentos após /imovel/ : [finalidade, tipo, cidade, localidade, codigo]
export function segmentosImovel(url: string): string[] {
  if (!url) return []
  try {
    const path = url.startsWith("http") ? new URL(url).pathname : url
    const i = path.indexOf("/imovel/")
    const base = i >= 0 ? path.slice(i + "/imovel/".length) : path.replace(/^\//, "")
    return base.split("/").filter(Boolean)
  } catch {
    return []
  }
}

export function finalidadeDeUrl(url: string): Finalidade | null {
  const seg = segmentosImovel(url)[0]
  if (!seg) return null
  const s = seg.toLowerCase()
  if (s.includes("venda")) return "VENDA"
  if (s.includes("locacao")) return "ALUGUER"
  return null
}
```

- [ ] **Step 4: Correr e confirmar passa**

Run: `npx vitest run src/normalizadores/url.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/normalizadores/url.ts src/normalizadores/url.test.ts
git commit -m "feat(normalizadores): add segmentosImovel and finalidadeDeUrl"
```

---

## Task 6: `tipoImovelDeUrl`

**Files:**
- Modify: `src/normalizadores/url.ts`
- Modify: `src/normalizadores/url.test.ts`

- [ ] **Step 1: Escrever o teste a falhar (acrescentar)**

Estende o import no topo de `url.test.ts` para `import { finalidadeDeUrl, tipoImovelDeUrl } from "./url"` e acrescenta:

```ts
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
```

- [ ] **Step 2: Correr e confirmar falha**

Run: `npx vitest run src/normalizadores/url.test.ts`
Expected: FAIL — `tipoImovelDeUrl is not a function` / não exportado.

- [ ] **Step 3: Implementação mínima (acrescentar a `url.ts`)**

```ts
export function tipoImovelDeUrl(url: string): string | null {
  const seg = segmentosImovel(url)[1]
  if (!seg) return null
  const s = seg.toLowerCase()
  const mapa: Record<string, string> = {
    apartamentos: "apartamento",
    casas: "casa",
    comercial: "comercial",
    terrenos: "terreno",
  }
  return mapa[s] ?? s.replace(/s$/, "")
}
```

- [ ] **Step 4: Correr e confirmar passa**

Run: `npx vitest run src/normalizadores/url.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/normalizadores/url.ts src/normalizadores/url.test.ts
git commit -m "feat(normalizadores): add tipoImovelDeUrl"
```

---

## Task 7: `cidadeDeUrl`

**Files:**
- Modify: `src/normalizadores/url.ts`
- Modify: `src/normalizadores/url.test.ts`

- [ ] **Step 1: Escrever o teste a falhar (acrescentar)**

Estende o import para incluir `cidadeDeUrl` e acrescenta:

```ts
describe("cidadeDeUrl", () => {
  it("de-slugifica o segmento de cidade em Title Case", () => {
    expect(cidadeDeUrl(ALUG)).toBe("Aracatuba")
    expect(cidadeDeUrl("https://x/imovel/venda/casas/sao-jose-do-rio-preto/centro/9")).toBe("Sao Jose Do Rio Preto")
  })

  it("devolve null sem segmento de cidade", () => {
    expect(cidadeDeUrl("https://x.com/")).toBeNull()
  })
})
```

- [ ] **Step 2: Correr e confirmar falha**

Run: `npx vitest run src/normalizadores/url.test.ts`
Expected: FAIL — `cidadeDeUrl` não exportado.

- [ ] **Step 3: Implementação mínima (acrescentar a `url.ts`)**

```ts
export function cidadeDeUrl(url: string): string | null {
  const seg = segmentosImovel(url)[2]
  if (!seg) return null
  return seg
    .split("-")
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ")
}
```

- [ ] **Step 4: Correr e confirmar passa**

Run: `npx vitest run src/normalizadores/url.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/normalizadores/url.ts src/normalizadores/url.test.ts
git commit -m "feat(normalizadores): add cidadeDeUrl"
```

---

## Task 8: `refDeUrl`

**Files:**
- Modify: `src/normalizadores/url.ts`
- Modify: `src/normalizadores/url.test.ts`

- [ ] **Step 1: Escrever o teste a falhar (acrescentar)**

Estende o import para incluir `refDeUrl` e acrescenta:

```ts
describe("refDeUrl", () => {
  it("devolve o último segmento (o código)", () => {
    expect(refDeUrl(ALUG)).toBe("2937")
    expect(refDeUrl(VENDA)).toBe("1000")
    expect(refDeUrl("https://x/imovel/locacao/casas/aracatuba/sao-rafael/18")).toBe("18")
  })

  it("devolve null para URL sem segmentos", () => {
    expect(refDeUrl("https://x.com/")).toBeNull()
    expect(refDeUrl("")).toBeNull()
  })
})
```

- [ ] **Step 2: Correr e confirmar falha**

Run: `npx vitest run src/normalizadores/url.test.ts`
Expected: FAIL — `refDeUrl` não exportado.

- [ ] **Step 3: Implementação mínima (acrescentar a `url.ts`)**

```ts
export function refDeUrl(url: string): string | null {
  const segs = segmentosImovel(url)
  const ultimo = segs[segs.length - 1]
  if (!ultimo) return null
  const limpo = ultimo.trim()
  return limpo.length > 0 ? limpo : null
}
```

- [ ] **Step 4: Correr e confirmar passa + suite completa**

Run: `npx vitest run src/normalizadores/url.test.ts`
Expected: PASS.

Run: `npm test` e `npm run typecheck`
Expected: toda a suite verde (domínio + normalizadores), typecheck limpo.

- [ ] **Step 5: Commit**

```bash
git add src/normalizadores/url.ts src/normalizadores/url.test.ts
git commit -m "feat(normalizadores): add refDeUrl"
```

---

## Definition of Done (Fase 2)

- [ ] `npm test` verde (domínio + normalizadores).
- [ ] `npm run typecheck` sem erros.
- [ ] Cada normalizador é puro (sem I/O) e testado com tabela de casos no formato BR real.
- [ ] `venda-e-locacao` → `VENDA`; `cidadeDeUrl` documentado como sem-acentos.
- [ ] Cada task commitada separadamente.

> **Fora do âmbito (Fase 4):** a montagem `CamposBrutos → normalizadores → Imovel.criar()` e a obtenção do texto cru (DOM/API) pertencem ao motor/adaptador, não a esta fase.
