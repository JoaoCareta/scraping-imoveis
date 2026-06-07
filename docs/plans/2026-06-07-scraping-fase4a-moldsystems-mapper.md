# Scraping — Fase 4a: Mapper MoldSystems (Solr doc → Imovel) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Construir o **mapper puro** que converte um documento Solr da plataforma MoldSystems no nosso domínio `Imovel` (um por operação ALUGUER/VENDA disponível), validado com a **fixture real do imóvel COD 1910**. Sem rede (a obtenção HTTP é a Fase 4b).

**Architecture:** `FonteDeImoveis` é a interface de fonte de imóveis. Esta fase entrega a **camada de mapeamento** do adaptador MoldSystems: funções puras `doc Solr → PropsImovel → Imovel.criar()`. O cliente HTTP (Solr fetch + paginação) fica para a 4b e implementará `FonteDeImoveis` usando este mapper.

**Tech Stack:** TypeScript (strict), Vitest. Reutiliza o domínio (`Imovel`, `Finalidade`, `Preco`) e normalizadores (`parsearNumeroBr`, `parsearInteiro`). Sem dependências novas.

**Referência:** API decifrada em `docs/spikes/2026-06-07-innove-moldsystems.md` (secção "API da plataforma MoldSystems").

---

## Decisões de design (registadas)

- **Multi-finalidade:** o mapper produz **um `Imovel` por operação** com valor > 0 (`valLocation`→ALUGUER/MENSAL; `valSales`→VENDA/TOTAL). `ref = String(idtProperty)` (join key intacto). Unicidade composta resolve-se na Fase 3.
- **`urlSite`** é construído: `{origin}/imovel/{finalidadeSlug}/{categoriaSlug}/{cidadeSlug}/{desUriLandingPage}/{idtProperty}` (slugs sem acentos).
- **`estado` (UF):** `namState` vem por extenso ("São Paulo"); guardamos em `localizacao.estado` (a normalização para UF fica como refinamento futuro) e o nome também em `extras.estadoNome`.
- **`ativo`:** `flgShowSite !== false && !indBusy`.
- **Campos sem mapeamento direto** (IPTU, condomínio, vagas, idtTenant) → `extras`.

---

## File Structure (Fase 4a)

```
src/fontes/
  fonte-de-imoveis.ts                       ← interface FonteDeImoveis + ResultadoExtracao
  moldsystems/
    solr-doc.ts                             ← MoldSystemsSolrDoc, MoldSystemsContexto, sub-tipos
    fixtures/imovel-1910.ts                 ← documento Solr REAL do COD 1910 (typed)
    solr-mapper.ts                          ← imoveisDeSolrDoc + helpers
    solr-mapper.test.ts
```

---

## Task 1: Interface `FonteDeImoveis`

**Files:**
- Create: `src/fontes/fonte-de-imoveis.ts`

Tipos puros — sem teste isolado (exercitados pela 4b). Confirma compilação.

- [ ] **Step 1: Implementar**

```ts
import { Imovel } from "../domain/imovel/imovel"
import { ErroValidacao } from "../domain/imovel/erro-validacao"

/** Um imóvel rejeitado na extração (não passou nas invariantes do domínio). */
export interface ImovelRejeitado {
  readonly ref: string
  readonly erros: readonly ErroValidacao[]
}

/** Resultado de uma extração: imóveis válidos + rejeitados (para alertas/taxa de rejeição). */
export interface ResultadoExtracao {
  readonly imoveis: readonly Imovel[]
  readonly rejeitados: readonly ImovelRejeitado[]
}

/** Fonte de imóveis — implementada por API (MoldSystems) ou DOM (Cheerio/Playwright). */
export interface FonteDeImoveis {
  buscarTodos(): Promise<ResultadoExtracao>
}
```

- [ ] **Step 2: Typecheck**

Run: `cd "D:\Documentos\scrapping"; npm run typecheck`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/fontes/fonte-de-imoveis.ts
git commit -m "feat(fontes): add FonteDeImoveis interface"
```

---

## Task 2: Tipos do doc Solr + fixture real 1910

**Files:**
- Create: `src/fontes/moldsystems/solr-doc.ts`
- Create: `src/fontes/moldsystems/fixtures/imovel-1910.ts`

- [ ] **Step 1: Implementar os tipos**

```ts
// src/fontes/moldsystems/solr-doc.ts
export interface MoldSystemsFoto {
  urlPhoto: string
  desPhoto?: string
  flgNotShowSite?: number
}

export interface MoldSystemsChar {
  desInformation?: string
  desInformationFormatted?: string
  characteristics?: { idtCharacteristics: number }
}

export interface MoldSystemsSolrDoc {
  idtProperty: number
  indType?: string
  indStatus?: number
  indBusy?: number | boolean
  flgShowSite?: boolean
  valLocation?: number
  valSales?: number
  valCondominium?: number
  valMonthIptu?: number
  totalRooms?: number
  totalGarages?: number
  namCategory?: string
  namSubCategory?: string
  namDistrict?: string
  namCity?: string
  namState?: string
  fullAddress?: string
  desUriLandingPage?: string
  desResumeCharacteristics?: string
  jsonPhotos?: string
  jsonCharacteristics?: string
  dtaUpdate?: string
  idtTenant?: string
}

export interface MoldSystemsContexto {
  clienteId: string
  origin: string // ex.: "https://imobiliariainnove.com.br"
  extraidoEm: string // ISO 8601, injetado (mantém o mapper determinístico)
}
```

- [ ] **Step 2: Criar a fixture real (COD 1910)**

```ts
// src/fontes/moldsystems/fixtures/imovel-1910.ts
import { MoldSystemsSolrDoc } from "../solr-doc"

// Documento Solr REAL obtido via /api/solr/search/ (campos relevantes ao mapeamento).
export const imovel1910: MoldSystemsSolrDoc = {
  idtProperty: 1910,
  indType: "L",
  indStatus: 1,
  indBusy: 0,
  flgShowSite: true,
  valLocation: 1050,
  valCondominium: 940,
  valMonthIptu: 105,
  totalRooms: 2,
  totalGarages: 2,
  namCategory: "Apartamentos",
  namSubCategory: "Padrão",
  namDistrict: "Vila Estádio",
  namCity: "Araçatuba",
  namState: "São Paulo",
  fullAddress: "AVENIDA SAUDADE, 999, Vila Estádio, Araçatuba - CEP: 16020-070, Apto. 111",
  desUriLandingPage: "condominio-edificio-residencial-park-mediterraneo",
  desResumeCharacteristics: "2 dormitórios, 2 total de banheiros, 1 cozinha, 2 garagens, Área útil 96,00 m²",
  jsonPhotos:
    '[{"desPhoto":"Sala","urlPhoto":"https://s3.amazonaws.com/msys-imob-imobiliariainnove/imovel/fotos/1910/300d0e31334f3816fee39cb5564f27ceAT.jpg","flgNotShowSite":0}]',
  jsonCharacteristics:
    '[{"desInformation":"96.00","desInformationFormatted":"96,00 m²","characteristics":{"idtCharacteristics":95}},{"desInformation":"2","desInformationFormatted":"2","characteristics":{"idtCharacteristics":176}}]',
  dtaUpdate: "2026-05-07T10:22:58Z",
  idtTenant: "516",
}
```

- [ ] **Step 3: Typecheck + commit**

Run: `cd "D:\Documentos\scrapping"; npm run typecheck`
Expected: sem erros.

```bash
git add src/fontes/moldsystems/solr-doc.ts src/fontes/moldsystems/fixtures/imovel-1910.ts
git commit -m "feat(moldsystems): add Solr doc types and real 1910 fixture"
```

---

## Task 3: `finalidadesDeDoc`

**Files:**
- Create: `src/fontes/moldsystems/solr-mapper.ts`
- Test: `src/fontes/moldsystems/solr-mapper.test.ts`

- [ ] **Step 1: Escrever o teste a falhar**

```ts
import { describe, it, expect } from "vitest"
import { finalidadesDeDoc } from "./solr-mapper"

describe("finalidadesDeDoc", () => {
  it("ALUGUER quando há valLocation>0", () => {
    expect(finalidadesDeDoc({ idtProperty: 1, valLocation: 1050 })).toEqual([
      { finalidade: "ALUGUER", valor: 1050, periodo: "MENSAL" },
    ])
  })

  it("VENDA quando há valSales>0", () => {
    expect(finalidadesDeDoc({ idtProperty: 1, valSales: 250000 })).toEqual([
      { finalidade: "VENDA", valor: 250000, periodo: "TOTAL" },
    ])
  })

  it("ambas quando há os dois valores", () => {
    const r = finalidadesDeDoc({ idtProperty: 1, valLocation: 900, valSales: 200000 })
    expect(r.map((o) => o.finalidade)).toEqual(["ALUGUER", "VENDA"])
  })

  it("vazio quando não há valores positivos", () => {
    expect(finalidadesDeDoc({ idtProperty: 1, valLocation: 0 })).toEqual([])
  })
})
```

- [ ] **Step 2: Correr e confirmar falha**

Run: `npx vitest run src/fontes/moldsystems/solr-mapper.test.ts`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implementação mínima**

```ts
import { Finalidade } from "../../domain/imovel/finalidade"
import { PeriodoPreco } from "../../domain/imovel/preco"
import { MoldSystemsSolrDoc } from "./solr-doc"

export interface OperacaoPreco {
  finalidade: Finalidade
  valor: number
  periodo: PeriodoPreco
}

export function finalidadesDeDoc(doc: MoldSystemsSolrDoc): OperacaoPreco[] {
  const out: OperacaoPreco[] = []
  if (typeof doc.valLocation === "number" && doc.valLocation > 0) {
    out.push({ finalidade: "ALUGUER", valor: doc.valLocation, periodo: "MENSAL" })
  }
  if (typeof doc.valSales === "number" && doc.valSales > 0) {
    out.push({ finalidade: "VENDA", valor: doc.valSales, periodo: "TOTAL" })
  }
  return out
}
```

- [ ] **Step 4: Correr e confirmar passa**

Run: `npx vitest run src/fontes/moldsystems/solr-mapper.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/fontes/moldsystems/solr-mapper.ts src/fontes/moldsystems/solr-mapper.test.ts
git commit -m "feat(moldsystems): add finalidadesDeDoc"
```

---

## Task 4: `localizacaoDeDoc` + `caracteristicasDeDoc`

**Files:**
- Modify: `src/fontes/moldsystems/solr-mapper.ts`
- Modify: `src/fontes/moldsystems/solr-mapper.test.ts`

- [ ] **Step 1: Escrever os testes a falhar (estende o import e acrescenta)**

Estende o import para `import { finalidadesDeDoc, localizacaoDeDoc, caracteristicasDeDoc } from "./solr-mapper"` e acrescenta, usando a fixture real:

```ts
import { imovel1910 } from "./fixtures/imovel-1910"

describe("localizacaoDeDoc", () => {
  it("mapeia bairro/cidade/estado e zonaTexto", () => {
    const l = localizacaoDeDoc(imovel1910)
    expect(l).toEqual({
      zonaTexto: "Vila Estádio",
      bairro: "Vila Estádio",
      cidade: "Araçatuba",
      estado: "São Paulo",
    })
  })
})

describe("caracteristicasDeDoc", () => {
  it("mapeia tipo (singular), tipologia, área, quartos e banheiros", () => {
    const c = caracteristicasDeDoc(imovel1910)
    expect(c.tipoImovel).toBe("apartamento")
    expect(c.tipologia).toBe("Padrão")
    expect(c.areaM2).toBe(96)
    expect(c.quartos).toBe(2)
    expect(c.casasBanho).toBe(2)
    expect(c.lista).toEqual([])
  })
})
```

- [ ] **Step 2: Correr e confirmar falha**

Run: `npx vitest run src/fontes/moldsystems/solr-mapper.test.ts`
Expected: FAIL — funções não exportadas.

- [ ] **Step 3: Implementação mínima (acrescentar a `solr-mapper.ts`)**

```ts
import { parsearNumeroBr } from "../../normalizadores/numero-br"
import { parsearInteiro } from "../../normalizadores/inteiro"
import { PropsLocalizacao } from "../../domain/imovel/localizacao"
import { Caracteristicas } from "../../domain/imovel/tipos"
import { MoldSystemsChar } from "./solr-doc"

function lerChars(doc: MoldSystemsSolrDoc): MoldSystemsChar[] {
  try {
    return JSON.parse(doc.jsonCharacteristics ?? "[]") as MoldSystemsChar[]
  } catch {
    return []
  }
}

const IDT_AREA = [95, 2]

function areaDeDoc(doc: MoldSystemsSolrDoc): number | undefined {
  const c = lerChars(doc).find((x) => x.characteristics && IDT_AREA.includes(x.characteristics.idtCharacteristics))
  if (!c) return undefined
  const n = parsearNumeroBr(c.desInformationFormatted ?? c.desInformation ?? "")
  return n ?? undefined
}

function banheirosDeDoc(doc: MoldSystemsSolrDoc): number | undefined {
  const m = (doc.desResumeCharacteristics ?? "").match(/(\d+)\s+(?:total de\s+)?banheiro/i)
  if (!m) return undefined
  return parsearInteiro(m[1]) ?? undefined
}

function tipoSingular(cat?: string): string | undefined {
  if (!cat) return undefined
  const s = cat.trim().toLowerCase()
  const mapa: Record<string, string> = {
    apartamentos: "apartamento",
    casas: "casa",
    comercial: "comercial",
    terrenos: "terreno",
    lotes: "lote",
    galpoes: "galpao",
    salas: "sala",
  }
  return mapa[s] ?? s
}

export function localizacaoDeDoc(doc: MoldSystemsSolrDoc): PropsLocalizacao {
  const zonaTexto = doc.namDistrict || doc.namCity || doc.fullAddress || ""
  return { zonaTexto, bairro: doc.namDistrict, cidade: doc.namCity, estado: doc.namState }
}

export function caracteristicasDeDoc(doc: MoldSystemsSolrDoc): Caracteristicas {
  return {
    tipoImovel: tipoSingular(doc.namCategory),
    tipologia: doc.namSubCategory,
    areaM2: areaDeDoc(doc),
    quartos: typeof doc.totalRooms === "number" ? doc.totalRooms : undefined,
    casasBanho: banheirosDeDoc(doc),
    lista: [],
  }
}
```

- [ ] **Step 4: Correr e confirmar passa**

Run: `npx vitest run src/fontes/moldsystems/solr-mapper.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/fontes/moldsystems/solr-mapper.ts src/fontes/moldsystems/solr-mapper.test.ts
git commit -m "feat(moldsystems): add localizacaoDeDoc and caracteristicasDeDoc"
```

---

## Task 5: `urlSiteDeDoc` + `fotoPrincipalDeDoc` + `ativoDeDoc` + `extrasDeDoc`

**Files:**
- Modify: `src/fontes/moldsystems/solr-mapper.ts`
- Modify: `src/fontes/moldsystems/solr-mapper.test.ts`

- [ ] **Step 1: Escrever os testes a falhar (estende o import e acrescenta)**

Estende o import para incluir `urlSiteDeDoc, fotoPrincipalDeDoc, ativoDeDoc, extrasDeDoc` e acrescenta:

```ts
const CTX = { clienteId: "innove", origin: "https://imobiliariainnove.com.br", extraidoEm: "2026-06-07T12:00:00.000Z" }

describe("helpers de doc", () => {
  it("urlSiteDeDoc constrói o URL com slugs sem acento", () => {
    expect(urlSiteDeDoc(imovel1910, CTX, "ALUGUER")).toBe(
      "https://imobiliariainnove.com.br/imovel/locacao/apartamentos/aracatuba/condominio-edificio-residencial-park-mediterraneo/1910",
    )
  })

  it("fotoPrincipalDeDoc devolve a 1ª foto visível", () => {
    expect(fotoPrincipalDeDoc(imovel1910)).toContain("/imovel/fotos/1910/")
  })

  it("ativoDeDoc: mostra no site e não ocupado", () => {
    expect(ativoDeDoc(imovel1910)).toBe(true)
    expect(ativoDeDoc({ idtProperty: 1, flgShowSite: false })).toBe(false)
    expect(ativoDeDoc({ idtProperty: 1, indBusy: 1 })).toBe(false)
  })

  it("extrasDeDoc inclui vagas, condominio, iptu", () => {
    const e = extrasDeDoc(imovel1910)
    expect(e["vagas"]).toBe(2)
    expect(e["condominio"]).toBe(940)
    expect(e["iptu"]).toBe(105)
  })
})
```

- [ ] **Step 2: Correr e confirmar falha**

Run: `npx vitest run src/fontes/moldsystems/solr-mapper.test.ts`
Expected: FAIL — funções não exportadas.

- [ ] **Step 3: Implementação mínima (acrescentar a `solr-mapper.ts`)**

```ts
// Reutiliza o import existente de `Finalidade` (Task 3); adicione no topo:
//   import { MoldSystemsContexto, MoldSystemsFoto } from "./solr-doc"

const SLUG_FINALIDADE: Record<Finalidade, string> = { ALUGUER: "locacao", VENDA: "venda" }

function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
}

export function urlSiteDeDoc(doc: MoldSystemsSolrDoc, ctx: MoldSystemsContexto, finalidade: Finalidade): string {
  const fin = SLUG_FINALIDADE[finalidade]
  const cat = slug(doc.namCategory ?? "imovel")
  const cidade = slug(doc.namCity ?? "")
  const loc = doc.desUriLandingPage ?? "imovel"
  return `${ctx.origin}/imovel/${fin}/${cat}/${cidade}/${loc}/${doc.idtProperty}`
}

export function fotoPrincipalDeDoc(doc: MoldSystemsSolrDoc): string | undefined {
  try {
    const fotos = JSON.parse(doc.jsonPhotos ?? "[]") as MoldSystemsFoto[]
    const visivel = fotos.find((f) => f.urlPhoto && !f.flgNotShowSite)
    return visivel?.urlPhoto
  } catch {
    return undefined
  }
}

export function ativoDeDoc(doc: MoldSystemsSolrDoc): boolean {
  const mostra = doc.flgShowSite !== false
  const ocupado = doc.indBusy === true || doc.indBusy === 1
  return mostra && !ocupado
}

export function extrasDeDoc(doc: MoldSystemsSolrDoc): Record<string, unknown> {
  const e: Record<string, unknown> = {}
  if (doc.totalGarages != null) e["vagas"] = doc.totalGarages
  if (doc.valCondominium != null) e["condominio"] = doc.valCondominium
  if (doc.valMonthIptu != null) e["iptu"] = doc.valMonthIptu
  if (doc.idtTenant != null) e["idtTenant"] = doc.idtTenant
  if (doc.namState != null) e["estadoNome"] = doc.namState
  return e
}
```

- [ ] **Step 4: Correr e confirmar passa**

Run: `npx vitest run src/fontes/moldsystems/solr-mapper.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/fontes/moldsystems/solr-mapper.ts src/fontes/moldsystems/solr-mapper.test.ts
git commit -m "feat(moldsystems): add urlSite/foto/ativo/extras helpers"
```

---

## Task 6: `imoveisDeSolrDoc` (montagem) + integração com a fixture 1910

**Files:**
- Modify: `src/fontes/moldsystems/solr-mapper.ts`
- Modify: `src/fontes/moldsystems/solr-mapper.test.ts`

- [ ] **Step 1: Escrever o teste a falhar (integração real)**

Estende o import para incluir `imoveisDeSolrDoc` e acrescenta:

```ts
describe("imoveisDeSolrDoc (integração com COD 1910 real)", () => {
  it("produz 1 imóvel ALUGUER válido com os campos corretos", () => {
    const resultados = imoveisDeSolrDoc(imovel1910, CTX)
    expect(resultados).toHaveLength(1)
    const r = resultados[0]
    expect(r.ok).toBe(true)
    if (r.ok) {
      const im = r.value
      expect(im.ref.valor).toBe("1910")
      expect(im.finalidade).toBe("ALUGUER")
      expect(im.preco.valor).toBe(1050)
      expect(im.preco.moeda).toBe("BRL")
      expect(im.preco.periodo).toBe("MENSAL")
      expect(im.localizacao.cidade).toBe("Araçatuba")
      expect(im.localizacao.bairro).toBe("Vila Estádio")
      expect(im.caracteristicas.quartos).toBe(2)
      expect(im.caracteristicas.areaM2).toBe(96)
      expect(im.caracteristicas.casasBanho).toBe(2)
      expect(im.extras["vagas"]).toBe(2)
      expect(im.extras["condominio"]).toBe(940)
      expect(im.estado.ativo).toBe(true)
      expect(im.urlSite.valor).toContain("/imovel/locacao/apartamentos/aracatuba/")
      expect(im.urlSite.valor).toContain("/1910")
    }
  })

  it("produz dois imóveis (ALUGUER+VENDA) quando há os dois valores", () => {
    const dual = { ...imovel1910, valSales: 350000 }
    const r = imoveisDeSolrDoc(dual, CTX)
    expect(r.map((x) => (x.ok ? x.value.finalidade : "ERR"))).toEqual(["ALUGUER", "VENDA"])
  })
})
```

- [ ] **Step 2: Correr e confirmar falha**

Run: `npx vitest run src/fontes/moldsystems/solr-mapper.test.ts`
Expected: FAIL — `imoveisDeSolrDoc` não exportado.

- [ ] **Step 3: Implementação mínima (acrescentar a `solr-mapper.ts`)**

```ts
import { Result } from "../../shared/result"
import { ErroValidacao } from "../../domain/imovel/erro-validacao"
import { Imovel } from "../../domain/imovel/imovel"

export function imoveisDeSolrDoc(
  doc: MoldSystemsSolrDoc,
  ctx: MoldSystemsContexto,
): Array<Result<Imovel, ErroValidacao[]>> {
  const operacoes = finalidadesDeDoc(doc)
  const localizacao = localizacaoDeDoc(doc)
  const caracteristicas = caracteristicasDeDoc(doc)
  const media = { fotoPrincipal: fotoPrincipalDeDoc(doc) }
  const extras = extrasDeDoc(doc)
  const ativo = ativoDeDoc(doc)
  const ref = String(doc.idtProperty)

  return operacoes.map((op) =>
    Imovel.criar({
      ref,
      clienteId: ctx.clienteId,
      urlSite: urlSiteDeDoc(doc, ctx, op.finalidade),
      finalidade: op.finalidade,
      preco: { valor: op.valor, moeda: "BRL", periodo: op.periodo },
      localizacao,
      caracteristicas,
      media,
      extras,
      estado: {
        ativo,
        extraidoEm: ctx.extraidoEm,
        atualizadoEm: doc.dtaUpdate ?? ctx.extraidoEm,
        hashConteudo: String(doc.dtaUpdate ?? ctx.extraidoEm),
      },
    }),
  )
}
```

- [ ] **Step 4: Correr a suite completa + typecheck**

Run: `cd "D:\Documentos\scrapping"; npm test`
Expected: toda a suite verde (domínio + normalizadores + moldsystems).

Run: `npm run typecheck`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/fontes/moldsystems/solr-mapper.ts src/fontes/moldsystems/solr-mapper.test.ts
git commit -m "feat(moldsystems): assemble imoveisDeSolrDoc with real 1910 integration test"
```

---

## Definition of Done (Fase 4a)

- [ ] `npm test` verde (inclui o teste de integração com a fixture REAL do COD 1910).
- [ ] `npm run typecheck` limpo.
- [ ] `imoveisDeSolrDoc` produz **um `Imovel` por operação** (ALUGUER/VENDA), validado pelo domínio.
- [ ] Mapper 100% puro (sem rede) — a fixture é um doc Solr estático.
- [ ] Cada task commitada separadamente.

> **Fase 4b (próxima):** `MoldSystemsFonte implements FonteDeImoveis` — cliente HTTP do `/api/solr/search/{json}`, paginação (`numRows`/`numFound`), montagem via `imoveisDeSolrDoc`, e tratamento de erros/timeouts. Testável com `fetch` mockado + a fixture.
