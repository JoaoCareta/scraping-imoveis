# Serviço de API + Deploy do Scraping — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar o módulo de scraping num serviço HTTP stateless (sem cache, sem persistência) que coleta imóveis da API Solr do MoldSystems e os expõe como um Read Model rico (`RecursoImovel`), empacotado em docker compose e publicado num repositório privado.

**Architecture:** Event Storming como modelagem (não Event Sourcing). `ColetarImoveis` (command) → `MoldSystemsFonte` (cliente HTTP) → agregado `Imovel` → `imovelParaRecurso` → `RecursoImovel` (read model). Camadas: `fontes/` (coleta), `domain/` (agregado + read model), `aplicacao/` (repository/filtros), `api/` (Fastify). Fronteira `ImovelRepository` isola a API da origem.

**Tech Stack:** TypeScript (ESM, Node 20+), Fastify, Vitest, tsup (esbuild) para build, tsx para dev, Docker + docker compose.

> **Convenções deste repo:** testes em `src/**/*.test.ts` com Vitest, descrições em português (`it("...")`); Conventional Commits com scope; **cada commit termina com o trailer** `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

> **Desvio face à spec §7.2 (registado):** o build usa **tsup (esbuild)**, não `tsc` puro. Razão: o código usa imports relativos sem extensão (`"../../shared/result"`), que o `tsc` não consegue emitir como ESM executável em Node sem reescrever todos os imports para `.js`. O `tsc --noEmit` continua a ser o `typecheck`.

---

## File Structure

**Criar:**
- `src/fontes/erros.ts` — `FonteIndisponivelError`, `FonteTimeoutError`.
- `src/fontes/moldsystems/moldsystems-fonte.ts` — `MoldSystemsFonte implements FonteDeImoveis`.
- `src/fontes/moldsystems/moldsystems-fonte.test.ts`
- `src/domain/leitura/recurso-imovel.ts` — tipo `RecursoImovel` + `imovelParaRecurso`.
- `src/domain/leitura/recurso-imovel.test.ts`
- `src/aplicacao/imovel-repository.ts` — `FiltrosImovel`, `Coleta`, `ImovelRepository`.
- `src/aplicacao/fonte-imovel-repository.ts` — `FonteImovelRepository`.
- `src/aplicacao/fonte-imovel-repository.test.ts`
- `src/config.ts` — `Config` + `carregarConfig`.
- `src/config.test.ts`
- `src/api/server.ts` — `criarServidor(repo, config)`.
- `src/api/server.test.ts`
- `src/main.ts` — `construirApp` + `iniciar`.
- `tsup.config.ts`, `Dockerfile`, `docker-compose.yml`, `.env.example`

**Modificar:**
- `package.json` — deps (`fastify`), devDeps (`tsup`, `tsx`), scripts.
- `README.md` — secção de deploy.

**Remover (aposentar o DTO plano — sem consumidor, confirmado por grep):**
- `src/domain/mapper/imovel-dto.ts`, `src/domain/mapper/imovel-mapper.ts`, `src/domain/mapper/imovel-mapper.test.ts`

---

## Task 0: Setup de dependências e build

**Files:**
- Modify: `package.json`
- Create: `tsup.config.ts`

- [ ] **Step 1: Instalar dependências**

Run:
```bash
npm install fastify
npm install -D tsup tsx
```
Expected: instala sem erros; `fastify` em `dependencies`, `tsup`/`tsx` em `devDependencies`.

- [ ] **Step 2: Adicionar scripts ao `package.json`**

No bloco `"scripts"`, garantir exatamente:
```json
"scripts": {
  "test": "vitest run",
  "test:watch": "vitest",
  "typecheck": "tsc --noEmit",
  "build": "tsup",
  "start": "node dist/main.js",
  "dev": "tsx watch src/main.ts"
}
```

- [ ] **Step 3: Criar `tsup.config.ts`**

```ts
import { defineConfig } from "tsup"

export default defineConfig({
  entry: ["src/main.ts"],
  format: ["esm"],
  platform: "node",
  target: "node20",
  outDir: "dist",
  clean: true,
})
```

- [ ] **Step 4: Verificar typecheck e suite atual**

Run: `npm run typecheck && npm test`
Expected: typecheck limpo; os 82 testes existentes continuam verdes.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json tsup.config.ts
git commit -m "build: add fastify, tsup/tsx and service scripts" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 1: Erros de fonte

**Files:**
- Create: `src/fontes/erros.ts`
- Test: `src/fontes/erros.test.ts`

- [ ] **Step 1: Escrever o teste a falhar**

`src/fontes/erros.test.ts`:
```ts
import { describe, it, expect } from "vitest"
import { FonteIndisponivelError, FonteTimeoutError } from "./erros"

describe("erros de fonte", () => {
  it("FonteIndisponivelError tem name e mensagem", () => {
    const e = new FonteIndisponivelError("rede falhou")
    expect(e).toBeInstanceOf(Error)
    expect(e.name).toBe("FonteIndisponivelError")
    expect(e.message).toBe("rede falhou")
  })

  it("FonteTimeoutError tem name próprio", () => {
    const e = new FonteTimeoutError("tempo esgotado")
    expect(e.name).toBe("FonteTimeoutError")
    expect(e).toBeInstanceOf(Error)
  })
})
```

- [ ] **Step 2: Correr e confirmar que falha**

Run: `npx vitest run src/fontes/erros.test.ts`
Expected: FAIL — `Cannot find module './erros'`.

- [ ] **Step 3: Implementar**

`src/fontes/erros.ts`:
```ts
export class FonteIndisponivelError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "FonteIndisponivelError"
  }
}

export class FonteTimeoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "FonteTimeoutError"
  }
}
```

- [ ] **Step 4: Correr e confirmar verde**

Run: `npx vitest run src/fontes/erros.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add src/fontes/erros.ts src/fontes/erros.test.ts
git commit -m "feat(fonte): add FonteIndisponivelError and FonteTimeoutError" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: MoldSystemsFonte (cliente HTTP — Fase 4b)

**Files:**
- Create: `src/fontes/moldsystems/moldsystems-fonte.ts`
- Test: `src/fontes/moldsystems/moldsystems-fonte.test.ts`

- [ ] **Step 1: Escrever os testes a falhar (sucesso, rejeitado, truncado, rede, timeout)**

`src/fontes/moldsystems/moldsystems-fonte.test.ts`:
```ts
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
    // doc sem zonaTexto (namDistrict/namCity/fullAddress) com valLocation > 0 → rejeitado
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
    expect((fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(2) // 1 tentativa + 1 retry
  })

  it("abort (timeout) → FonteTimeoutError, sem retry", async () => {
    const fetchFn = vi.fn(async () => {
      throw Object.assign(new Error("aborted"), { name: "AbortError" })
    }) as unknown as typeof fetch
    const fonte = new MoldSystemsFonte({ ...DEPS_BASE, retries: 1, fetchFn })

    await expect(fonte.buscarTodos()).rejects.toBeInstanceOf(FonteTimeoutError)
    expect((fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Correr e confirmar que falha**

Run: `npx vitest run src/fontes/moldsystems/moldsystems-fonte.test.ts`
Expected: FAIL — `Cannot find module './moldsystems-fonte'`.

- [ ] **Step 3: Implementar**

`src/fontes/moldsystems/moldsystems-fonte.ts`:
```ts
import { FonteDeImoveis, ResultadoExtracao, ImovelRejeitado } from "../fonte-de-imoveis"
import { FonteIndisponivelError, FonteTimeoutError } from "../erros"
import { Imovel } from "../../domain/imovel/imovel"
import { isOk } from "../../shared/result"
import { imoveisDeSolrDoc } from "./solr-mapper"
import { MoldSystemsSolrDoc } from "./solr-doc"

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
}

export interface MoldSystemsFonteDeps {
  origin: string
  clienteId: string
  numRows: number
  timeoutMs: number
  retries?: number
  fetchFn?: typeof fetch
  agora?: () => Date
  dormir?: (ms: number) => Promise<void>
  avisar?: (msg: string) => void
}

interface RespostaSolr {
  response?: { docs?: MoldSystemsSolrDoc[]; numFound?: number }
}

export class MoldSystemsFonte implements FonteDeImoveis {
  private readonly origin: string
  private readonly clienteId: string
  private readonly numRows: number
  private readonly timeoutMs: number
  private readonly retries: number
  private readonly fetchFn: typeof fetch
  private readonly agora: () => Date
  private readonly dormir: (ms: number) => Promise<void>
  private readonly avisar: (msg: string) => void

  constructor(deps: MoldSystemsFonteDeps) {
    this.origin = deps.origin
    this.clienteId = deps.clienteId
    this.numRows = deps.numRows
    this.timeoutMs = deps.timeoutMs
    this.retries = deps.retries ?? 1
    this.fetchFn = deps.fetchFn ?? fetch
    this.agora = deps.agora ?? (() => new Date())
    this.dormir = deps.dormir ?? ((ms) => new Promise((r) => setTimeout(r, ms)))
    this.avisar = deps.avisar ?? (() => {})
  }

  async buscarTodos(): Promise<ResultadoExtracao> {
    const url = `${this.origin}/api/solr/search/${encodeURI(JSON.stringify({ numRows: this.numRows }))}`
    const data = await this.obter(url)
    const docs = data.response?.docs ?? []
    const numFound = data.response?.numFound ?? docs.length
    if (numFound > this.numRows) {
      this.avisar(`catálogo truncado: numFound=${numFound} > numRows=${this.numRows}`)
    }
    const ctx = { clienteId: this.clienteId, origin: this.origin, extraidoEm: this.agora().toISOString() }
    const imoveis: Imovel[] = []
    const rejeitados: ImovelRejeitado[] = []
    for (const doc of docs) {
      for (const r of imoveisDeSolrDoc(doc, ctx)) {
        if (isOk(r)) imoveis.push(r.value)
        else rejeitados.push({ ref: String(doc.idtProperty), erros: r.error })
      }
    }
    return { imoveis, rejeitados }
  }

  private async obter(url: string): Promise<RespostaSolr> {
    let ultimoErro: unknown
    for (let tentativa = 0; tentativa <= this.retries; tentativa++) {
      try {
        const res = await this.fetchFn(url, { headers: HEADERS, signal: AbortSignal.timeout(this.timeoutMs) })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return (await res.json()) as RespostaSolr
      } catch (e) {
        // AbortSignal.timeout rejeita com DOMException name="TimeoutError"; abort manual usa "AbortError".
        if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) {
          throw new FonteTimeoutError(`timeout ao coletar de ${this.origin} (${this.timeoutMs}ms)`)
        }
        ultimoErro = e
        if (tentativa < this.retries) await this.dormir(200 * (tentativa + 1))
      }
    }
    const motivo = ultimoErro instanceof Error ? ultimoErro.message : String(ultimoErro)
    throw new FonteIndisponivelError(`fonte indisponível em ${this.origin}: ${motivo}`)
  }
}
```

- [ ] **Step 4: Correr e confirmar verde**

Run: `npx vitest run src/fontes/moldsystems/moldsystems-fonte.test.ts`
Expected: PASS (6 testes).

- [ ] **Step 5: Commit**

```bash
git add src/fontes/moldsystems/moldsystems-fonte.ts src/fontes/moldsystems/moldsystems-fonte.test.ts
git commit -m "feat(moldsystems): add MoldSystemsFonte http client with retries and timeout" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: RecursoImovel (Read Model) + imovelParaRecurso

**Files:**
- Create: `src/domain/leitura/recurso-imovel.ts`
- Test: `src/domain/leitura/recurso-imovel.test.ts`

- [ ] **Step 1: Escrever o teste a falhar**

`src/domain/leitura/recurso-imovel.test.ts`:
```ts
import { describe, it, expect } from "vitest"
import { imovelParaRecurso } from "./recurso-imovel"
import { imoveisDeSolrDoc } from "../../fontes/moldsystems/solr-mapper"
import { imovel1910 } from "../../fontes/moldsystems/fixtures/imovel-1910"
import { isOk } from "../../shared/result"

const CTX = { clienteId: "innove", origin: "https://imobiliariainnove.com.br", extraidoEm: "2026-06-18T10:00:00.000Z" }

describe("imovelParaRecurso", () => {
  it("produz hierarquia rica a partir do agregado", () => {
    const r = imoveisDeSolrDoc(imovel1910, CTX)[0]
    expect(isOk(r)).toBe(true)
    if (!isOk(r)) return
    const recurso = imovelParaRecurso(r.value)

    expect(recurso.ref).toBe("1910")
    expect(recurso.clienteId).toBe("innove")
    expect(recurso.finalidade).toBe("ALUGUER")
    expect(recurso.preco).toEqual({ valor: 1050, moeda: "BRL", periodo: "MENSAL" })
    expect(recurso.localizacao.cidade).toBe("Araçatuba")
    expect(recurso.localizacao.bairro).toBe("Vila Estádio")
    expect(recurso.caracteristicas.quartos).toBe(2)
    expect(recurso.caracteristicas.areaM2).toBe(96)
    expect(recurso.caracteristicas.lista).toEqual([])
    expect(recurso.media.fotoPrincipal).toContain("/imovel/fotos/1910/")
    expect(recurso.extras["condominio"]).toBe(940)
    expect(recurso.estado.ativo).toBe(true)
    expect(recurso.estado.extraidoEm).toBe("2026-06-18T10:00:00.000Z")
  })
})
```

- [ ] **Step 2: Correr e confirmar que falha**

Run: `npx vitest run src/domain/leitura/recurso-imovel.test.ts`
Expected: FAIL — `Cannot find module './recurso-imovel'`.

- [ ] **Step 3: Implementar**

`src/domain/leitura/recurso-imovel.ts`:
```ts
import { Imovel } from "../imovel/imovel"

/** Read Model (Event Storming) — projeção rica/hierárquica do agregado Imovel para leitura via API. */
export interface RecursoImovel {
  ref: string
  clienteId: string
  urlSite: string
  finalidade: string
  preco: { valor: number; moeda: string; periodo: string }
  localizacao: { zonaTexto: string; bairro?: string; cidade?: string; estado?: string }
  caracteristicas: {
    tipoImovel?: string
    tipologia?: string
    areaM2?: number
    quartos?: number
    casasBanho?: number
    lista: string[]
  }
  media: { fotoPrincipal?: string }
  extras: Record<string, unknown>
  estado: { ativo: boolean; extraidoEm: string; atualizadoEm: string; hashConteudo: string }
}

export function imovelParaRecurso(imovel: Imovel): RecursoImovel {
  return {
    ref: imovel.ref.valor,
    clienteId: imovel.clienteId,
    urlSite: imovel.urlSite.valor,
    finalidade: imovel.finalidade,
    preco: { valor: imovel.preco.valor, moeda: imovel.preco.moeda, periodo: imovel.preco.periodo },
    localizacao: {
      zonaTexto: imovel.localizacao.zonaTexto,
      bairro: imovel.localizacao.bairro,
      cidade: imovel.localizacao.cidade,
      estado: imovel.localizacao.estado,
    },
    caracteristicas: {
      tipoImovel: imovel.caracteristicas.tipoImovel,
      tipologia: imovel.caracteristicas.tipologia,
      areaM2: imovel.caracteristicas.areaM2,
      quartos: imovel.caracteristicas.quartos,
      casasBanho: imovel.caracteristicas.casasBanho,
      lista: [...imovel.caracteristicas.lista],
    },
    media: { fotoPrincipal: imovel.media.fotoPrincipal },
    extras: { ...imovel.extras },
    estado: {
      ativo: imovel.estado.ativo,
      extraidoEm: imovel.estado.extraidoEm,
      atualizadoEm: imovel.estado.atualizadoEm,
      hashConteudo: imovel.estado.hashConteudo,
    },
  }
}
```

- [ ] **Step 4: Correr e confirmar verde**

Run: `npx vitest run src/domain/leitura/recurso-imovel.test.ts`
Expected: PASS (1 teste).

- [ ] **Step 5: Commit**

```bash
git add src/domain/leitura/recurso-imovel.ts src/domain/leitura/recurso-imovel.test.ts
git commit -m "feat(leitura): add RecursoImovel read model and imovelParaRecurso mapper" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Aposentar o ImovelDto plano

**Files:**
- Remove: `src/domain/mapper/imovel-dto.ts`, `src/domain/mapper/imovel-mapper.ts`, `src/domain/mapper/imovel-mapper.test.ts`

- [ ] **Step 1: Confirmar que não há consumidores fora dos próprios ficheiros**

Run: `git grep -nE "imovelParaDto|dtoParaImovel|ImovelDto" -- src`
Expected: só linhas dentro de `src/domain/mapper/imovel-dto.ts`, `imovel-mapper.ts`, `imovel-mapper.test.ts`. Se aparecer outro ficheiro, **parar** e ligar esse consumidor a `RecursoImovel` antes de remover.

- [ ] **Step 2: Remover os ficheiros**

Run: `git rm src/domain/mapper/imovel-dto.ts src/domain/mapper/imovel-mapper.ts src/domain/mapper/imovel-mapper.test.ts`

- [ ] **Step 3: Correr a suite completa**

Run: `npm test`
Expected: PASS, sem referências quebradas (os 82 originais menos os do mapper plano, mais os novos).

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor(domain): retire flat ImovelDto in favor of RecursoImovel read model" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: ImovelRepository + FonteImovelRepository (stateless)

**Files:**
- Create: `src/aplicacao/imovel-repository.ts`
- Create: `src/aplicacao/fonte-imovel-repository.ts`
- Test: `src/aplicacao/fonte-imovel-repository.test.ts`

- [ ] **Step 1: Definir os contratos (`imovel-repository.ts`)**

`src/aplicacao/imovel-repository.ts`:
```ts
import { RecursoImovel } from "../domain/leitura/recurso-imovel"

export interface FiltrosImovel {
  finalidade?: "ALUGUER" | "VENDA"
  precoMin?: number
  precoMax?: number
  quartos?: number
  cidade?: string
  bairro?: string
  tipoImovel?: string
  ativo?: boolean
}

/** Resultado de "ColetarImoveis" (envelope ColetaConcluida). */
export interface Coleta {
  imoveis: RecursoImovel[]
  total: number
  rejeitados: number
  extraidoEm: string
}

export interface ImovelRepository {
  buscar(filtros: FiltrosImovel): Promise<Coleta>
  buscarPorRef(ref: string): Promise<Coleta>
}
```

- [ ] **Step 2: Escrever os testes a falhar (`fonte-imovel-repository.test.ts`)**

```ts
import { describe, it, expect } from "vitest"
import { FonteImovelRepository } from "./fonte-imovel-repository"
import { FonteDeImoveis, ResultadoExtracao } from "../fontes/fonte-de-imoveis"
import { imoveisDeSolrDoc } from "../fontes/moldsystems/solr-mapper"
import { imovel1910 } from "../fontes/moldsystems/fixtures/imovel-1910"
import { isOk } from "../shared/result"
import { Imovel } from "../domain/imovel/imovel"

const CTX = { clienteId: "innove", origin: "https://imobiliariainnove.com.br", extraidoEm: "2026-06-18T10:00:00.000Z" }

function imoveisDeDocs(docs: object[]): Imovel[] {
  return docs.flatMap((d) => imoveisDeSolrDoc(d, CTX)).flatMap((r) => (isOk(r) ? [r.value] : []))
}

// 3 imóveis: 1910 ALUGUER (2 quartos, Araçatuba, 1050) · 2001 VENDA (3 quartos, Bauru, 300000) · 2001 ALUGUER (3q, Bauru, 1500)
const docAluguel = imovel1910
const docVendaEAluguel = { ...imovel1910, idtProperty: 2001, totalRooms: 3, namDistrict: "Centro", namCity: "Bauru", valLocation: 1500, valSales: 300000 }

function fonteFake(imoveis: Imovel[], rejeitados = 0): FonteDeImoveis {
  const r: ResultadoExtracao = {
    imoveis,
    rejeitados: Array.from({ length: rejeitados }, (_, i) => ({ ref: `rej-${i}`, erros: [] })),
  }
  return { buscarTodos: async () => r }
}

describe("FonteImovelRepository", () => {
  it("buscar sem filtros devolve todos como RecursoImovel + total/rejeitados", async () => {
    const repo = new FonteImovelRepository({ fonte: fonteFake(imoveisDeDocs([docAluguel, docVendaEAluguel]), 2) })

    const c = await repo.buscar({})

    expect(c.total).toBe(3) // 1910 ALUGUER + 2001 ALUGUER + 2001 VENDA
    expect(c.rejeitados).toBe(2)
    expect(c.extraidoEm).toBe("2026-06-18T10:00:00.000Z")
    expect(c.imoveis.every((i) => typeof i.preco.valor === "number")).toBe(true)
  })

  it("filtra por finalidade", async () => {
    const repo = new FonteImovelRepository({ fonte: fonteFake(imoveisDeDocs([docAluguel, docVendaEAluguel])) })
    const c = await repo.buscar({ finalidade: "VENDA" })
    expect(c.total).toBe(1)
    expect(c.imoveis[0].finalidade).toBe("VENDA")
  })

  it("filtra por precoMax", async () => {
    const repo = new FonteImovelRepository({ fonte: fonteFake(imoveisDeDocs([docAluguel, docVendaEAluguel])) })
    const c = await repo.buscar({ finalidade: "ALUGUER", precoMax: 1200 })
    expect(c.total).toBe(1)
    expect(c.imoveis[0].ref).toBe("1910")
  })

  it("filtra por quartos e cidade (case-insensitive)", async () => {
    const repo = new FonteImovelRepository({ fonte: fonteFake(imoveisDeDocs([docAluguel, docVendaEAluguel])) })
    const c = await repo.buscar({ quartos: 3, cidade: "bauru" })
    expect(c.imoveis.every((i) => i.caracteristicas.quartos === 3 && i.localizacao.cidade === "Bauru")).toBe(true)
    expect(c.total).toBe(2)
  })

  it("ativo default = true (só ativos)", async () => {
    const ativos = imoveisDeDocs([docAluguel])
    const inativos = imoveisDeDocs([{ ...imovel1910, idtProperty: 3003, flgShowSite: false }])
    const repo = new FonteImovelRepository({ fonte: fonteFake([...ativos, ...inativos]) })
    const c = await repo.buscar({})
    expect(c.imoveis.every((i) => i.estado.ativo)).toBe(true)
    expect(c.total).toBe(1)
  })

  it("buscarPorRef devolve as finalidades daquele ref", async () => {
    const repo = new FonteImovelRepository({ fonte: fonteFake(imoveisDeDocs([docAluguel, docVendaEAluguel])) })
    const c = await repo.buscarPorRef("2001")
    expect(c.total).toBe(2)
    expect(c.imoveis.map((i) => i.finalidade).sort()).toEqual(["ALUGUER", "VENDA"])
  })
})
```

- [ ] **Step 3: Correr e confirmar que falha**

Run: `npx vitest run src/aplicacao/fonte-imovel-repository.test.ts`
Expected: FAIL — `Cannot find module './fonte-imovel-repository'`.

- [ ] **Step 4: Implementar (`fonte-imovel-repository.ts`)**

```ts
import { FonteDeImoveis } from "../fontes/fonte-de-imoveis"
import { imovelParaRecurso, RecursoImovel } from "../domain/leitura/recurso-imovel"
import { Coleta, FiltrosImovel, ImovelRepository } from "./imovel-repository"

export interface FonteImovelRepositoryDeps {
  fonte: FonteDeImoveis
  agora?: () => Date
}

export class FonteImovelRepository implements ImovelRepository {
  private readonly fonte: FonteDeImoveis
  private readonly agora: () => Date

  constructor(deps: FonteImovelRepositoryDeps) {
    this.fonte = deps.fonte
    this.agora = deps.agora ?? (() => new Date())
  }

  async buscar(filtros: FiltrosImovel): Promise<Coleta> {
    const { recursos, rejeitados } = await this.coletar()
    const filtrados = recursos.filter((r) => this.combina(r, filtros))
    return this.montar(filtrados, rejeitados, recursos)
  }

  async buscarPorRef(ref: string): Promise<Coleta> {
    const { recursos, rejeitados } = await this.coletar()
    const filtrados = recursos.filter((r) => r.ref === ref)
    return this.montar(filtrados, rejeitados, recursos)
  }

  private async coletar(): Promise<{ recursos: RecursoImovel[]; rejeitados: number }> {
    const r = await this.fonte.buscarTodos()
    return { recursos: r.imoveis.map(imovelParaRecurso), rejeitados: r.rejeitados.length }
  }

  private montar(filtrados: RecursoImovel[], rejeitados: number, todos: RecursoImovel[]): Coleta {
    const extraidoEm = todos[0]?.estado.extraidoEm ?? this.agora().toISOString()
    return { imoveis: filtrados, total: filtrados.length, rejeitados, extraidoEm }
  }

  private combina(r: RecursoImovel, f: FiltrosImovel): boolean {
    const querAtivo = f.ativo ?? true
    const igualTexto = (a?: string, b?: string) =>
      b == null || (a ?? "").toLowerCase() === b.toLowerCase()

    const passaAtivo = r.estado.ativo === querAtivo
    const passaFinalidade = f.finalidade == null || r.finalidade === f.finalidade
    const passaPrecoMin = f.precoMin == null || r.preco.valor >= f.precoMin
    const passaPrecoMax = f.precoMax == null || r.preco.valor <= f.precoMax
    const passaQuartos = f.quartos == null || r.caracteristicas.quartos === f.quartos
    const passaCidade = igualTexto(r.localizacao.cidade, f.cidade)
    const passaBairro = igualTexto(r.localizacao.bairro, f.bairro)
    const passaTipo = igualTexto(r.caracteristicas.tipoImovel, f.tipoImovel)

    return (
      passaAtivo &&
      passaFinalidade &&
      passaPrecoMin &&
      passaPrecoMax &&
      passaQuartos &&
      passaCidade &&
      passaBairro &&
      passaTipo
    )
  }
}
```

- [ ] **Step 5: Correr e confirmar verde**

Run: `npx vitest run src/aplicacao/fonte-imovel-repository.test.ts`
Expected: PASS (6 testes).

- [ ] **Step 6: Commit**

```bash
git add src/aplicacao/imovel-repository.ts src/aplicacao/fonte-imovel-repository.ts src/aplicacao/fonte-imovel-repository.test.ts
git commit -m "feat(aplicacao): add stateless ImovelRepository with in-memory filtering" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Config a partir de variáveis de ambiente

**Files:**
- Create: `src/config.ts`
- Test: `src/config.test.ts`

- [ ] **Step 1: Escrever o teste a falhar**

`src/config.test.ts`:
```ts
import { describe, it, expect } from "vitest"
import { carregarConfig } from "./config"

describe("carregarConfig", () => {
  it("aplica defaults quando o ambiente está vazio", () => {
    const c = carregarConfig({})
    expect(c.port).toBe(3000)
    expect(c.host).toBe("0.0.0.0")
    expect(c.clienteId).toBe("innove")
    expect(c.origin).toBe("https://imobiliariainnove.com.br")
    expect(c.solrNumRows).toBe(5000)
    expect(c.fetchTimeoutMs).toBe(8000)
    expect(c.apiKey).toBeUndefined()
  })

  it("lê e converte valores do ambiente", () => {
    const c = carregarConfig({ PORT: "8080", SOLR_NUM_ROWS: "100", API_KEY: "segredo" })
    expect(c.port).toBe(8080)
    expect(c.solrNumRows).toBe(100)
    expect(c.apiKey).toBe("segredo")
  })

  it("API_KEY vazia continua undefined (gate desligado)", () => {
    const c = carregarConfig({ API_KEY: "" })
    expect(c.apiKey).toBeUndefined()
  })
})
```

- [ ] **Step 2: Correr e confirmar que falha**

Run: `npx vitest run src/config.test.ts`
Expected: FAIL — `Cannot find module './config'`.

- [ ] **Step 3: Implementar**

`src/config.ts`:
```ts
export interface Config {
  port: number
  host: string
  clienteId: string
  origin: string
  solrNumRows: number
  fetchTimeoutMs: number
  logLevel: string
  apiKey?: string
}

type Env = Record<string, string | undefined>

function numero(valor: string | undefined, fallback: number): number {
  const n = Number.parseInt(valor ?? "", 10)
  return Number.isFinite(n) ? n : fallback
}

export function carregarConfig(env: Env): Config {
  const apiKey = env.API_KEY?.trim()
  return {
    port: numero(env.PORT, 3000),
    host: env.HOST ?? "0.0.0.0",
    clienteId: env.CLIENTE_ID ?? "innove",
    origin: env.ORIGIN ?? "https://imobiliariainnove.com.br",
    solrNumRows: numero(env.SOLR_NUM_ROWS, 5000),
    fetchTimeoutMs: numero(env.FETCH_TIMEOUT_MS, 8000),
    logLevel: env.LOG_LEVEL ?? "info",
    apiKey: apiKey ? apiKey : undefined,
  }
}
```

- [ ] **Step 4: Correr e confirmar verde**

Run: `npx vitest run src/config.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add src/config.ts src/config.test.ts
git commit -m "feat(config): load service config from environment with defaults" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Servidor Fastify + rotas

**Files:**
- Create: `src/api/server.ts`
- Test: `src/api/server.test.ts`

- [ ] **Step 1: Escrever os testes a falhar**

`src/api/server.test.ts`:
```ts
import { describe, it, expect } from "vitest"
import { criarServidor } from "./server"
import { Config } from "../config"
import { ImovelRepository, Coleta, FiltrosImovel } from "../aplicacao/imovel-repository"
import { FonteIndisponivelError, FonteTimeoutError } from "../fontes/erros"

const CONFIG_BASE: Config = {
  port: 3000, host: "0.0.0.0", clienteId: "innove",
  origin: "https://x", solrNumRows: 5000, fetchTimeoutMs: 8000, logLevel: "silent",
}

function recurso(ref: string, finalidade: "ALUGUER" | "VENDA"): Coleta["imoveis"][number] {
  return {
    ref, clienteId: "innove", urlSite: "https://x/" + ref, finalidade,
    preco: { valor: 1000, moeda: "BRL", periodo: "MENSAL" },
    localizacao: { zonaTexto: "Centro", cidade: "Bauru" },
    caracteristicas: { lista: [] }, media: {}, extras: {},
    estado: { ativo: true, extraidoEm: "2026-06-18T10:00:00.000Z", atualizadoEm: "2026-06-18T10:00:00.000Z", hashConteudo: "h" },
  }
}

function repoFake(over: Partial<ImovelRepository> = {}): ImovelRepository {
  const coleta: Coleta = { imoveis: [recurso("1910", "ALUGUER")], total: 1, rejeitados: 0, extraidoEm: "2026-06-18T10:00:00.000Z" }
  return {
    buscar: async (_f: FiltrosImovel) => coleta,
    buscarPorRef: async (ref: string) =>
      ref === "1910" ? coleta : { imoveis: [], total: 0, rejeitados: 0, extraidoEm: "2026-06-18T10:00:00.000Z" },
    ...over,
  }
}

describe("servidor", () => {
  it("GET /health → 200 ok", async () => {
    const app = criarServidor(repoFake(), CONFIG_BASE)
    const res = await app.inject({ method: "GET", url: "/health" })
    expect(res.statusCode).toBe(200)
    expect(res.json().status).toBe("ok")
  })

  it("GET /imoveis → 200 envelope ColetaConcluida", async () => {
    const app = criarServidor(repoFake(), CONFIG_BASE)
    const res = await app.inject({ method: "GET", url: "/imoveis" })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.evento).toBe("ColetaConcluida")
    expect(body.total).toBe(1)
    expect(body.imoveis[0].ref).toBe("1910")
  })

  it("GET /imoveis com finalidade inválida → 400", async () => {
    const app = criarServidor(repoFake(), CONFIG_BASE)
    const res = await app.inject({ method: "GET", url: "/imoveis?finalidade=XPTO" })
    expect(res.statusCode).toBe(400)
  })

  it("GET /imoveis/:ref inexistente → 404", async () => {
    const app = criarServidor(repoFake(), CONFIG_BASE)
    const res = await app.inject({ method: "GET", url: "/imoveis/9999" })
    expect(res.statusCode).toBe(404)
  })

  it("fonte indisponível → 503 com evento", async () => {
    const repo = repoFake({ buscar: async () => { throw new FonteIndisponivelError("down") } })
    const app = criarServidor(repo, CONFIG_BASE)
    const res = await app.inject({ method: "GET", url: "/imoveis" })
    expect(res.statusCode).toBe(503)
    expect(res.json().evento).toBe("FonteIndisponivel")
  })

  it("timeout da fonte → 504", async () => {
    const repo = repoFake({ buscar: async () => { throw new FonteTimeoutError("slow") } })
    const app = criarServidor(repo, CONFIG_BASE)
    const res = await app.inject({ method: "GET", url: "/imoveis" })
    expect(res.statusCode).toBe(504)
  })

  it("API key ligada: sem header → 401; com header → 200", async () => {
    const app = criarServidor(repoFake(), { ...CONFIG_BASE, apiKey: "segredo" })
    const semHeader = await app.inject({ method: "GET", url: "/imoveis" })
    expect(semHeader.statusCode).toBe(401)
    const comHeader = await app.inject({ method: "GET", url: "/imoveis", headers: { "x-api-key": "segredo" } })
    expect(comHeader.statusCode).toBe(200)
  })

  it("API key ligada não bloqueia /health", async () => {
    const app = criarServidor(repoFake(), { ...CONFIG_BASE, apiKey: "segredo" })
    const res = await app.inject({ method: "GET", url: "/health" })
    expect(res.statusCode).toBe(200)
  })
})
```

- [ ] **Step 2: Correr e confirmar que falha**

Run: `npx vitest run src/api/server.test.ts`
Expected: FAIL — `Cannot find module './server'`.

- [ ] **Step 3: Implementar**

`src/api/server.ts`:
```ts
import Fastify, { FastifyInstance, FastifyRequest } from "fastify"
import { Config } from "../config"
import { ImovelRepository, FiltrosImovel } from "../aplicacao/imovel-repository"
import { FonteIndisponivelError, FonteTimeoutError } from "../fontes/erros"

interface QueryImoveis {
  finalidade?: "ALUGUER" | "VENDA"
  precoMin?: number
  precoMax?: number
  quartos?: number
  cidade?: string
  bairro?: string
  tipoImovel?: string
  ativo?: boolean
  limit?: number
  offset?: number
}

const SCHEMA_IMOVEIS = {
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      finalidade: { type: "string", enum: ["ALUGUER", "VENDA"] },
      precoMin: { type: "number", minimum: 0 },
      precoMax: { type: "number", minimum: 0 },
      quartos: { type: "integer", minimum: 0 },
      cidade: { type: "string" },
      bairro: { type: "string" },
      tipoImovel: { type: "string" },
      ativo: { type: "boolean" },
      limit: { type: "integer", minimum: 1, maximum: 500, default: 100 },
      offset: { type: "integer", minimum: 0, default: 0 },
    },
  },
}

export function criarServidor(repo: ImovelRepository, config: Config): FastifyInstance {
  const app = Fastify({ logger: { level: config.logLevel } })

  if (config.apiKey) {
    app.addHook("onRequest", async (req, reply) => {
      if (req.url.startsWith("/health")) return
      if (req.headers["x-api-key"] !== config.apiKey) {
        return reply.code(401).send({ evento: "NaoAutorizado", erro: { codigo: "API_KEY", mensagem: "x-api-key inválida ou ausente" } })
      }
    })
  }

  app.setErrorHandler((erro, _req, reply) => {
    if (erro instanceof FonteTimeoutError) {
      return reply.code(504).send({ evento: "FonteTimeout", erro: { codigo: "FONTE_TIMEOUT", mensagem: erro.message } })
    }
    if (erro instanceof FonteIndisponivelError) {
      return reply.code(503).send({ evento: "FonteIndisponivel", erro: { codigo: "FONTE_INDISPONIVEL", mensagem: erro.message } })
    }
    const status = erro.statusCode ?? 500
    return reply.code(status).send({ evento: "Erro", erro: { codigo: String(status), mensagem: erro.message } })
  })

  app.get("/health", async () => ({ status: "ok", uptimeMs: Math.round(process.uptime() * 1000) }))

  app.get<{ Querystring: QueryImoveis }>("/imoveis", { schema: SCHEMA_IMOVEIS }, async (req: FastifyRequest<{ Querystring: QueryImoveis }>) => {
    const q = req.query
    const limit = q.limit ?? 100
    const offset = q.offset ?? 0
    const filtros: FiltrosImovel = {
      finalidade: q.finalidade,
      precoMin: q.precoMin,
      precoMax: q.precoMax,
      quartos: q.quartos,
      cidade: q.cidade,
      bairro: q.bairro,
      tipoImovel: q.tipoImovel,
      ativo: q.ativo,
    }
    const coleta = await repo.buscar(filtros)
    return {
      evento: "ColetaConcluida",
      extraidoEm: coleta.extraidoEm,
      total: coleta.total,
      rejeitados: coleta.rejeitados,
      imoveis: coleta.imoveis.slice(offset, offset + limit),
    }
  })

  app.get<{ Params: { ref: string } }>("/imoveis/:ref", async (req, reply) => {
    const coleta = await repo.buscarPorRef(req.params.ref)
    if (coleta.total === 0) {
      return reply.code(404).send({ evento: "ImovelNaoEncontrado", erro: { codigo: "NAO_ENCONTRADO", mensagem: `ref ${req.params.ref} não encontrada` } })
    }
    return { evento: "ColetaConcluida", extraidoEm: coleta.extraidoEm, total: coleta.total, rejeitados: coleta.rejeitados, imoveis: coleta.imoveis }
  })

  return app
}
```

- [ ] **Step 4: Correr e confirmar verde**

Run: `npx vitest run src/api/server.test.ts`
Expected: PASS (8 testes).

- [ ] **Step 5: Commit**

```bash
git add src/api/server.ts src/api/server.test.ts
git commit -m "feat(api): add fastify server with imoveis routes, validation and error mapping" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Entry point (main.ts)

**Files:**
- Create: `src/main.ts`
- Test: `src/main.test.ts`

- [ ] **Step 1: Escrever o teste a falhar (wiring sem rede)**

`src/main.test.ts`:
```ts
import { describe, it, expect } from "vitest"
import { construirApp } from "./main"

describe("construirApp", () => {
  it("constrói o servidor a partir da config sem chamar a rede", async () => {
    const app = construirApp({
      port: 3000, host: "0.0.0.0", clienteId: "innove", origin: "https://x",
      solrNumRows: 5000, fetchTimeoutMs: 8000, logLevel: "silent",
    })
    const res = await app.inject({ method: "GET", url: "/health" })
    expect(res.statusCode).toBe(200)
  })
})
```

- [ ] **Step 2: Correr e confirmar que falha**

Run: `npx vitest run src/main.test.ts`
Expected: FAIL — `Cannot find module './main'` ou `construirApp` não exportado.

- [ ] **Step 3: Implementar**

`src/main.ts`:
```ts
import { FastifyInstance } from "fastify"
import { carregarConfig, Config } from "./config"
import { MoldSystemsFonte } from "./fontes/moldsystems/moldsystems-fonte"
import { FonteImovelRepository } from "./aplicacao/fonte-imovel-repository"
import { criarServidor } from "./api/server"

export function construirApp(config: Config): FastifyInstance {
  const fonte = new MoldSystemsFonte({
    origin: config.origin,
    clienteId: config.clienteId,
    numRows: config.solrNumRows,
    timeoutMs: config.fetchTimeoutMs,
    avisar: (msg) => console.warn(msg),
  })
  const repo = new FonteImovelRepository({ fonte })
  return criarServidor(repo, config)
}

export async function iniciar(): Promise<void> {
  const config = carregarConfig(process.env)
  const app = construirApp(config)
  const fechar = async () => {
    await app.close()
    process.exit(0)
  }
  process.on("SIGTERM", fechar)
  process.on("SIGINT", fechar)
  await app.listen({ host: config.host, port: config.port })
}

// Arranca só quando executado diretamente (não em testes).
if (process.env.NODE_ENV !== "test") {
  iniciar().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
```

- [ ] **Step 4: Correr e confirmar verde + build + suite completa**

Run: `npx vitest run src/main.test.ts && npm run typecheck && npm run build`
Expected: teste PASS; typecheck limpo; `dist/main.js` gerado.

- [ ] **Step 5: Commit**

```bash
git add src/main.ts src/main.test.ts
git commit -m "feat(api): add main entry point wiring fonte, repository and server" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Docker, compose e .env.example

**Files:**
- Create: `Dockerfile`, `docker-compose.yml`, `.env.example`, `.dockerignore`

- [ ] **Step 1: Criar `.dockerignore`**

```
node_modules
dist
.git
docs
spikes
coverage
*.log
```

- [ ] **Step 2: Criar `Dockerfile`**

```dockerfile
# build
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json tsup.config.ts ./
COPY src ./src
RUN npm run build

# runtime
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1
CMD ["node", "dist/main.js"]
```

- [ ] **Step 3: Criar `.env.example`**

```dotenv
PORT=3000
HOST=0.0.0.0
CLIENTE_ID=innove
ORIGIN=https://imobiliariainnove.com.br
SOLR_NUM_ROWS=5000
FETCH_TIMEOUT_MS=8000
LOG_LEVEL=info
# Vazio = sem autenticação (rede interna/VPN). Preencher ativa o header x-api-key.
API_KEY=
```

- [ ] **Step 4: Criar `docker-compose.yml`**

> Substituir `NOME_DA_REDE_DO_N8N` pela rede docker externa onde o n8n já corre (ver §11 da spec). Sem `ports:` públicos: o n8n chama `http://scraper-api:3000`.

```yaml
services:
  scraper-api:
    build: .
    container_name: scraper-api
    restart: unless-stopped
    env_file: .env
    networks:
      - n8n_net
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://127.0.0.1:3000/health"]
      interval: 30s
      timeout: 5s
      retries: 3

networks:
  n8n_net:
    external: true
    name: NOME_DA_REDE_DO_N8N
```

- [ ] **Step 5: Verificar o build da imagem (manual — requer Docker)**

Run: `docker build -t scraper-api:dev .`
Expected: build conclui; imagem criada. (Se o Docker não estiver disponível neste ambiente, marcar para o utilizador correr na VPS.)

- [ ] **Step 6: Commit**

```bash
git add Dockerfile docker-compose.yml .env.example .dockerignore
git commit -m "build: add Dockerfile, docker-compose and env example for deployment" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: README — secção de deploy e consumo no n8n

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Substituir a secção "Integrar com o n8n"**

Substituir a secção atual (linhas ~64–79) por:

```markdown
## Serviço HTTP / API

O scraper corre como **serviço HTTP stateless** (sem cache, sem BD): cada pedido
coleta da API do MoldSystems, mapeia e devolve um Read Model rico (`RecursoImovel`).

### Correr localmente
```bash
npm run dev            # tsx watch (desenvolvimento)
npm run build && npm start   # produção (dist/main.js)
```

### Endpoints
- `GET /health` → `{ "status": "ok" }`
- `GET /imoveis?finalidade=ALUGUER&precoMax=2000&quartos=3&cidade=Bauru` → envelope `ColetaConcluida`
- `GET /imoveis/:ref`

### Deploy (docker compose, ao lado do n8n)
1. `cp .env.example .env` e ajustar.
2. Em `docker-compose.yml`, pôr o nome da rede docker do n8n em `NOME_DA_REDE_DO_N8N`.
3. `docker compose up -d --build`.
4. No n8n, nó **HTTP Request** → `http://scraper-api:3000/imoveis?...` (rede interna).

A API não é exposta à internet pública (rede interna/VPN). Para proteger mesmo
dentro da rede, preencher `API_KEY` no `.env` e enviar o header `x-api-key`.
```

- [ ] **Step 2: Verificar a suite completa**

Run: `npm test`
Expected: tudo verde.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document HTTP service, API endpoints and docker deploy" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Publicar no GitHub (privado)

> **Pré-requisito (manual, utilizador):** correr `gh auth login` — o token de `Joao-Careta` está inválido.

**Files:** nenhum (operação git/gh).

- [ ] **Step 1: Confirmar autenticação**

Run: `gh auth status`
Expected: conta autenticada, token válido.

- [ ] **Step 2: Confirmar suite verde antes de publicar**

Run: `npm test && npm run typecheck`
Expected: tudo verde.

- [ ] **Step 3: Criar repositório privado e empurrar**

Run:
```bash
gh repo create scraping-imoveis --private --source=. --remote=origin --push
```
Expected: repositório privado criado; `origin` configurado; `main` empurrado (inclui `docs/`).

- [ ] **Step 4: Verificar**

Run: `git remote -v && gh repo view --web`
Expected: `origin` aponta para o repo privado; abre no browser.

---

## Verificação final

- [ ] `npm test` — toda a suite verde (existentes + novos).
- [ ] `npm run typecheck` — sem erros de tipo.
- [ ] `npm run build` — `dist/main.js` gerado.
- [ ] `docker build` / `docker compose up -d --build` — serviço responde em `GET /health` (na VPS).
- [ ] `GET /imoveis` devolve o envelope `ColetaConcluida` com `RecursoImovel` ricos contra o innove real.
