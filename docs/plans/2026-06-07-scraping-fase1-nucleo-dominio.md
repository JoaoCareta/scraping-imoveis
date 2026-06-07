# Scraping — Fase 1: Núcleo de Domínio — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir o núcleo de domínio puro do módulo de scraping de imóveis — value objects validados, a entidade `Imovel` (factory fail-fast que acumula erros), o contrato serializável `ImovelDto` e o mapper bidirecional — como uma biblioteca TypeScript testada, sem qualquer I/O.

**Architecture:** Domínio rico (value objects com invariantes + entidade imutável criada por factory que devolve `Result`) separado do contrato de saída (`ImovelDto` plano) por um mapper. Tudo puro e determinístico (sem rede, sem BD, sem relógio: timestamps entram como strings ISO já calculadas). Esta camada é a fundação das fases seguintes (persistência, motor de scraping, API).

**Tech Stack:** TypeScript (strict), Vitest, npm. Sem dependências de runtime nesta fase.

**Referência:** spec em `docs/specs/2026-06-07-modulo-scraping-imoveis-design.md` (§5 Modelo de domínio, §5.4 Contrato de saída).

---

## Roadmap (fases seguintes — fora deste plano)

Cada fase será detalhada no seu próprio plano quando lá chegarmos. Esta ordem garante que cada fase entrega software funcional e testável:

1. **Fase 1 — Núcleo de Domínio** ← **ESTE PLANO**
2. **Fase 2 — Normalizadores** (texto cru → valores do domínio: `"1.250 €/mês"` → `Preco`, `"T3"`, `"120 m²"`).
3. **Fase 3 — Persistência** (interface `ImovelRepository` + impl + schema `imovel` com `extras` JSONB + diff/estado; aqui fecha-se o engine de BD — PostgreSQL recomendado).
4. **Fase 4 — Motor agnóstico + adaptador por cliente** (Crawlee Cheerio/Playwright, `descobrirListagens`, `extrairCampos`, descoberta de campos).
5. **Fase 5 — Execução & resiliência** (orquestração do run, circuit breaker, alertas via n8n/Sentry, scheduler por cliente).
6. **Fase 6 — Entrega** (API REST de query `GET /imoveis?filtros` + eventos de mudança opcionais).

---

## File Structure (Fase 1)

```
package.json                              ← scaffold, scripts npm
tsconfig.json                             ← TypeScript strict
vitest.config.ts                          ← runner de testes
src/
  shared/
    result.ts                             ← Result<T,E> + ok/err/isOk/isErr
    result.test.ts
  domain/
    imovel/
      erro-validacao.ts                   ← ErroValidacao + factory
      finalidade.ts                       ← Finalidade + type guard
      finalidade.test.ts
      ref.ts                              ← value object Ref
      ref.test.ts
      preco.ts                            ← value object Preco (+ Moeda, PeriodoPreco)
      preco.test.ts
      localizacao.ts                      ← value object Localizacao
      localizacao.test.ts
      url-site.ts                         ← value object UrlSite
      url-site.test.ts
      tipos.ts                            ← Caracteristicas, Media, EstadoExtracao (interfaces)
      imovel.ts                           ← entidade Imovel (criar/mudouEmRelacaoA/comEstado)
      imovel.test.ts
    mapper/
      imovel-dto.ts                       ← contrato ImovelDto
      imovel-mapper.ts                    ← imovelParaDto / dtoParaImovel
      imovel-mapper.test.ts
```

**Responsabilidade por ficheiro:** um value object por ficheiro (invariante isolada e testável); `tipos.ts` agrupa as interfaces sem invariantes (dados puros); `imovel.ts` é o único que conhece invariantes entre campos; o mapper é o único que conhece o formato de saída. `shared/result.ts` não conhece o domínio.

---

## Task 1: Scaffold do projeto + toolchain

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `src/sanity.test.ts` (temporário — removido na Task 2)

- [ ] **Step 1: Criar `package.json`**

```json
{
  "name": "scraping-imoveis",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Criar `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "types": ["node"]
  },
  "include": ["src", "vitest.config.ts"]
}
```

> **Nota:** não usar `rootDir`/`outDir` aqui — com `tsc --noEmit` (typecheck) e `include` a abranger `vitest.config.ts`, `rootDir: "src"` provoca `TS6059`. Quando a fase de build precisar de emitir JS, adicionar um `tsconfig.build.json` separado com `"rootDir": "src"` e `"include": ["src"]`.

- [ ] **Step 3: Criar `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
})
```

- [ ] **Step 4: Criar smoke test `src/sanity.test.ts`**

```ts
import { describe, it, expect } from "vitest"

describe("toolchain", () => {
  it("corre testes Vitest", () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 5: Instalar dependências**

Run: `npm install`
Expected: cria `node_modules/` e `package-lock.json` sem erros.

- [ ] **Step 6: Correr testes e typecheck**

Run: `npm test`
Expected: PASS — 1 teste passa.

Run: `npm run typecheck`
Expected: sem erros.

- [ ] **Step 7: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts src/sanity.test.ts package-lock.json
git commit -m "build: scaffold typescript + vitest toolchain"
```

---

## Task 2: `Result<T, E>` (shared)

**Files:**
- Create: `src/shared/result.ts`
- Test: `src/shared/result.test.ts`
- Delete: `src/sanity.test.ts`

- [ ] **Step 1: Escrever o teste a falhar**

Create `src/shared/result.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { ok, err, isOk, isErr } from "./result"

describe("Result", () => {
  it("ok carrega o valor e é reconhecido por isOk", () => {
    const r = ok(42)
    expect(isOk(r)).toBe(true)
    expect(isErr(r)).toBe(false)
    if (r.ok) expect(r.value).toBe(42)
  })

  it("err carrega o erro e é reconhecido por isErr", () => {
    const r = err("falhou")
    expect(isErr(r)).toBe(true)
    expect(isOk(r)).toBe(false)
    if (!r.ok) expect(r.error).toBe("falhou")
  })
})
```

- [ ] **Step 2: Correr o teste para confirmar que falha**

Run: `npx vitest run src/shared/result.test.ts`
Expected: FAIL — `Cannot find module './result'`.

- [ ] **Step 3: Implementação mínima**

Create `src/shared/result.ts`:

```ts
export type Result<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E }

export const ok = <T>(value: T): Result<T, never> => ({ ok: true, value })
export const err = <E>(error: E): Result<never, E> => ({ ok: false, error })

export const isOk = <T, E>(r: Result<T, E>): boolean => r.ok
export const isErr = <T, E>(r: Result<T, E>): boolean => !r.ok
```

- [ ] **Step 4: Remover o smoke test temporário**

Run: `git rm src/sanity.test.ts`

- [ ] **Step 5: Correr os testes para confirmar que passam**

Run: `npm test`
Expected: PASS — testes do Result passam; sanity test já não existe.

- [ ] **Step 6: Commit**

```bash
git add src/shared/result.ts src/shared/result.test.ts
git commit -m "feat: add Result type for fail-fast validation"
```

---

## Task 3: `ErroValidacao`

**Files:**
- Create: `src/domain/imovel/erro-validacao.ts`

- [ ] **Step 1: Implementar (tipo + factory — sem comportamento a testar isoladamente; será exercitado pelos value objects)**

Create `src/domain/imovel/erro-validacao.ts`:

```ts
export interface ErroValidacao {
  readonly campo: string
  readonly mensagem: string
}

export const erroValidacao = (campo: string, mensagem: string): ErroValidacao => ({
  campo,
  mensagem,
})
```

- [ ] **Step 2: Confirmar que compila**

Run: `npm run typecheck`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/domain/imovel/erro-validacao.ts
git commit -m "feat: add ErroValidacao type"
```

---

## Task 4: `Finalidade` + type guard

**Files:**
- Create: `src/domain/imovel/finalidade.ts`
- Test: `src/domain/imovel/finalidade.test.ts`

- [ ] **Step 1: Escrever o teste a falhar**

Create `src/domain/imovel/finalidade.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { isFinalidade } from "./finalidade"

describe("Finalidade", () => {
  it("aceita ALUGUER e VENDA", () => {
    expect(isFinalidade("ALUGUER")).toBe(true)
    expect(isFinalidade("VENDA")).toBe(true)
  })

  it("rejeita valores fora do domínio", () => {
    expect(isFinalidade("arrendar")).toBe(false)
    expect(isFinalidade("")).toBe(false)
  })
})
```

- [ ] **Step 2: Correr o teste para confirmar que falha**

Run: `npx vitest run src/domain/imovel/finalidade.test.ts`
Expected: FAIL — `Cannot find module './finalidade'`.

- [ ] **Step 3: Implementação mínima**

Create `src/domain/imovel/finalidade.ts`:

```ts
export const FINALIDADES = ["ALUGUER", "VENDA"] as const
export type Finalidade = (typeof FINALIDADES)[number]

export const isFinalidade = (valor: string): valor is Finalidade =>
  (FINALIDADES as readonly string[]).includes(valor)
```

- [ ] **Step 4: Correr o teste para confirmar que passa**

Run: `npx vitest run src/domain/imovel/finalidade.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/imovel/finalidade.ts src/domain/imovel/finalidade.test.ts
git commit -m "feat: add Finalidade with type guard"
```

---

## Task 5: Value object `Ref`

**Files:**
- Create: `src/domain/imovel/ref.ts`
- Test: `src/domain/imovel/ref.test.ts`

- [ ] **Step 1: Escrever o teste a falhar**

Create `src/domain/imovel/ref.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { Ref } from "./ref"

describe("Ref", () => {
  it("cria com valor válido e faz trim", () => {
    const r = Ref.criar("  REF-1234  ")
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.valor).toBe("REF-1234")
  })

  it("rejeita referência vazia", () => {
    const r = Ref.criar("   ")
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.campo).toBe("ref")
  })

  it("equals compara pelo valor", () => {
    const a = Ref.criar("X1")
    const b = Ref.criar("X1")
    if (a.ok && b.ok) expect(a.value.equals(b.value)).toBe(true)
  })
})
```

- [ ] **Step 2: Correr o teste para confirmar que falha**

Run: `npx vitest run src/domain/imovel/ref.test.ts`
Expected: FAIL — `Cannot find module './ref'`.

- [ ] **Step 3: Implementação mínima**

Create `src/domain/imovel/ref.ts`:

```ts
import { Result, ok, err } from "../../shared/result"
import { ErroValidacao, erroValidacao } from "./erro-validacao"

export class Ref {
  private constructor(readonly valor: string) {}

  static criar(valor: string): Result<Ref, ErroValidacao> {
    const limpo = (valor ?? "").trim()
    if (limpo.length === 0) {
      return err(erroValidacao("ref", "A referência não pode ser vazia"))
    }
    return ok(new Ref(limpo))
  }

  equals(outra: Ref): boolean {
    return this.valor === outra.valor
  }
}
```

- [ ] **Step 4: Correr o teste para confirmar que passa**

Run: `npx vitest run src/domain/imovel/ref.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/imovel/ref.ts src/domain/imovel/ref.test.ts
git commit -m "feat: add Ref value object"
```

---

## Task 6: Value object `Preco`

**Files:**
- Create: `src/domain/imovel/preco.ts`
- Test: `src/domain/imovel/preco.test.ts`

- [ ] **Step 1: Escrever o teste a falhar**

Create `src/domain/imovel/preco.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { Preco } from "./preco"

describe("Preco", () => {
  it("cria com valor positivo", () => {
    const p = Preco.criar(1250, "EUR", "MENSAL")
    expect(p.ok).toBe(true)
    if (p.ok) {
      expect(p.value.valor).toBe(1250)
      expect(p.value.moeda).toBe("EUR")
      expect(p.value.periodo).toBe("MENSAL")
    }
  })

  it("rejeita valor zero ou negativo", () => {
    expect(Preco.criar(0, "EUR", "TOTAL").ok).toBe(false)
    expect(Preco.criar(-5, "EUR", "TOTAL").ok).toBe(false)
  })

  it("rejeita valor não-finito", () => {
    expect(Preco.criar(Number.NaN, "EUR", "TOTAL").ok).toBe(false)
  })

  it("periodoEsperado: ALUGUER=MENSAL, VENDA=TOTAL", () => {
    expect(Preco.periodoEsperado("ALUGUER")).toBe("MENSAL")
    expect(Preco.periodoEsperado("VENDA")).toBe("TOTAL")
  })
})
```

- [ ] **Step 2: Correr o teste para confirmar que falha**

Run: `npx vitest run src/domain/imovel/preco.test.ts`
Expected: FAIL — `Cannot find module './preco'`.

- [ ] **Step 3: Implementação mínima**

Create `src/domain/imovel/preco.ts`:

```ts
import { Result, ok, err } from "../../shared/result"
import { ErroValidacao, erroValidacao } from "./erro-validacao"
import { Finalidade } from "./finalidade"

export type Moeda = "EUR"
export type PeriodoPreco = "MENSAL" | "TOTAL"

export class Preco {
  private constructor(
    readonly valor: number,
    readonly moeda: Moeda,
    readonly periodo: PeriodoPreco,
  ) {}

  static criar(
    valor: number,
    moeda: Moeda,
    periodo: PeriodoPreco,
  ): Result<Preco, ErroValidacao> {
    if (!Number.isFinite(valor) || valor <= 0) {
      return err(erroValidacao("preco", "O preço tem de ser maior que zero"))
    }
    return ok(new Preco(valor, moeda, periodo))
  }

  static periodoEsperado(finalidade: Finalidade): PeriodoPreco {
    return finalidade === "ALUGUER" ? "MENSAL" : "TOTAL"
  }
}
```

- [ ] **Step 4: Correr o teste para confirmar que passa**

Run: `npx vitest run src/domain/imovel/preco.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/imovel/preco.ts src/domain/imovel/preco.test.ts
git commit -m "feat: add Preco value object"
```

---

## Task 7: Value object `Localizacao`

**Files:**
- Create: `src/domain/imovel/localizacao.ts`
- Test: `src/domain/imovel/localizacao.test.ts`

- [ ] **Step 1: Escrever o teste a falhar**

Create `src/domain/imovel/localizacao.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { Localizacao } from "./localizacao"

describe("Localizacao", () => {
  it("cria com zonaTexto e opcionais, fazendo trim", () => {
    const l = Localizacao.criar({ zonaTexto: "  Lisboa  ", concelho: " Lisboa " })
    expect(l.ok).toBe(true)
    if (l.ok) {
      expect(l.value.zonaTexto).toBe("Lisboa")
      expect(l.value.concelho).toBe("Lisboa")
      expect(l.value.distrito).toBeUndefined()
    }
  })

  it("rejeita zonaTexto vazia", () => {
    const l = Localizacao.criar({ zonaTexto: "   " })
    expect(l.ok).toBe(false)
    if (!l.ok) expect(l.error.campo).toBe("zonaTexto")
  })
})
```

- [ ] **Step 2: Correr o teste para confirmar que falha**

Run: `npx vitest run src/domain/imovel/localizacao.test.ts`
Expected: FAIL — `Cannot find module './localizacao'`.

- [ ] **Step 3: Implementação mínima**

Create `src/domain/imovel/localizacao.ts`:

```ts
import { Result, ok, err } from "../../shared/result"
import { ErroValidacao, erroValidacao } from "./erro-validacao"

export interface PropsLocalizacao {
  zonaTexto: string
  concelho?: string
  distrito?: string
  freguesia?: string
}

export class Localizacao {
  private constructor(
    readonly zonaTexto: string,
    readonly concelho: string | undefined,
    readonly distrito: string | undefined,
    readonly freguesia: string | undefined,
  ) {}

  static criar(props: PropsLocalizacao): Result<Localizacao, ErroValidacao> {
    const zona = (props.zonaTexto ?? "").trim()
    if (zona.length === 0) {
      return err(erroValidacao("zonaTexto", "A localização (zonaTexto) é obrigatória"))
    }
    const opcional = (v: string | undefined): string | undefined => {
      const limpo = (v ?? "").trim()
      return limpo.length === 0 ? undefined : limpo
    }
    return ok(
      new Localizacao(zona, opcional(props.concelho), opcional(props.distrito), opcional(props.freguesia)),
    )
  }
}
```

- [ ] **Step 4: Correr o teste para confirmar que passa**

Run: `npx vitest run src/domain/imovel/localizacao.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/imovel/localizacao.ts src/domain/imovel/localizacao.test.ts
git commit -m "feat: add Localizacao value object"
```

---

## Task 8: Value object `UrlSite`

**Files:**
- Create: `src/domain/imovel/url-site.ts`
- Test: `src/domain/imovel/url-site.test.ts`

- [ ] **Step 1: Escrever o teste a falhar**

Create `src/domain/imovel/url-site.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { UrlSite } from "./url-site"

describe("UrlSite", () => {
  it("aceita URL http(s) válida", () => {
    const u = UrlSite.criar("https://imobiliaria.pt/imovel/1234")
    expect(u.ok).toBe(true)
    if (u.ok) expect(u.value.valor).toBe("https://imobiliaria.pt/imovel/1234")
  })

  it("rejeita texto que não é URL", () => {
    const u = UrlSite.criar("não é url")
    expect(u.ok).toBe(false)
    if (!u.ok) expect(u.error.campo).toBe("urlSite")
  })

  it("rejeita protocolo não-http", () => {
    const u = UrlSite.criar("ftp://imobiliaria.pt/x")
    expect(u.ok).toBe(false)
  })
})
```

- [ ] **Step 2: Correr o teste para confirmar que falha**

Run: `npx vitest run src/domain/imovel/url-site.test.ts`
Expected: FAIL — `Cannot find module './url-site'`.

- [ ] **Step 3: Implementação mínima**

Create `src/domain/imovel/url-site.ts`:

```ts
import { Result, ok, err } from "../../shared/result"
import { ErroValidacao, erroValidacao } from "./erro-validacao"

export class UrlSite {
  private constructor(readonly valor: string) {}

  static criar(valor: string): Result<UrlSite, ErroValidacao> {
    const limpo = (valor ?? "").trim()
    let url: URL
    try {
      url = new URL(limpo)
    } catch {
      return err(erroValidacao("urlSite", "URL do imóvel inválida"))
    }
    const protocoloValido = url.protocol === "http:" || url.protocol === "https:"
    if (!protocoloValido) {
      return err(erroValidacao("urlSite", "A URL tem de ser http ou https"))
    }
    return ok(new UrlSite(url.toString()))
  }
}
```

- [ ] **Step 4: Correr o teste para confirmar que passa**

Run: `npx vitest run src/domain/imovel/url-site.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/imovel/url-site.ts src/domain/imovel/url-site.test.ts
git commit -m "feat: add UrlSite value object"
```

---

## Task 9: Interfaces de dados (`Caracteristicas`, `Media`, `EstadoExtracao`)

**Files:**
- Create: `src/domain/imovel/tipos.ts`

Estas estruturas não têm invariantes próprios (dados puros); são validadas/usadas via `Imovel`. Sem teste isolado — exercitadas na Task 10.

- [ ] **Step 1: Implementar**

Create `src/domain/imovel/tipos.ts`:

```ts
export interface Caracteristicas {
  readonly tipoImovel?: string
  readonly tipologia?: string
  readonly areaM2?: number
  readonly quartos?: number
  readonly casasBanho?: number
  readonly lista: readonly string[]
}

export interface Media {
  readonly fotoPrincipal?: string
}

export interface EstadoExtracao {
  readonly ativo: boolean
  readonly extraidoEm: string // ISO 8601 (calculado fora do domínio — mantém o domínio determinístico)
  readonly atualizadoEm: string // ISO 8601
  readonly hashConteudo: string
}
```

- [ ] **Step 2: Confirmar que compila**

Run: `npm run typecheck`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add src/domain/imovel/tipos.ts
git commit -m "feat: add Caracteristicas/Media/EstadoExtracao data types"
```

---

## Task 10: Entidade `Imovel` — factory `criar`

**Files:**
- Create: `src/domain/imovel/imovel.ts`
- Test: `src/domain/imovel/imovel.test.ts`

- [ ] **Step 1: Escrever o teste a falhar**

Create `src/domain/imovel/imovel.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { Imovel, PropsImovel } from "./imovel"

const propsValidas = (): PropsImovel => ({
  ref: "REF-1",
  clienteId: "cliente-a",
  urlSite: "https://imob.pt/imovel/1",
  finalidade: "ALUGUER",
  preco: { valor: 800, moeda: "EUR", periodo: "MENSAL" },
  localizacao: { zonaTexto: "Porto" },
  caracteristicas: { lista: ["garagem"] },
  media: {},
  extras: { piso: 3 },
  estado: { ativo: true, extraidoEm: "2026-06-07T10:00:00.000Z", atualizadoEm: "2026-06-07T10:00:00.000Z", hashConteudo: "h1" },
})

describe("Imovel.criar", () => {
  it("cria imóvel válido", () => {
    const r = Imovel.criar(propsValidas())
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.ref.valor).toBe("REF-1")
      expect(r.value.finalidade).toBe("ALUGUER")
      expect(r.value.preco.valor).toBe(800)
      expect(r.value.extras["piso"]).toBe(3)
    }
  })

  it("acumula múltiplos erros de validação", () => {
    const r = Imovel.criar({ ...propsValidas(), ref: "  ", urlSite: "xpto", preco: { valor: -1, moeda: "EUR", periodo: "MENSAL" } })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      const campos = r.error.map((e) => e.campo)
      expect(campos).toContain("ref")
      expect(campos).toContain("urlSite")
      expect(campos).toContain("preco")
      expect(r.error.length).toBeGreaterThanOrEqual(3)
    }
  })

  it("rejeita finalidade inválida", () => {
    const r = Imovel.criar({ ...propsValidas(), finalidade: "arrendar" })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.map((e) => e.campo)).toContain("finalidade")
  })

  it("rejeita período incoerente com a finalidade (VENDA exige TOTAL)", () => {
    const r = Imovel.criar({ ...propsValidas(), finalidade: "VENDA", preco: { valor: 200000, moeda: "EUR", periodo: "MENSAL" } })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.map((e) => e.campo)).toContain("preco.periodo")
  })
})
```

- [ ] **Step 2: Correr o teste para confirmar que falha**

Run: `npx vitest run src/domain/imovel/imovel.test.ts`
Expected: FAIL — `Cannot find module './imovel'`.

- [ ] **Step 3: Implementação mínima**

Create `src/domain/imovel/imovel.ts`:

```ts
import { Result, ok, err } from "../../shared/result"
import { ErroValidacao, erroValidacao } from "./erro-validacao"
import { Finalidade, isFinalidade } from "./finalidade"
import { Ref } from "./ref"
import { Preco, Moeda, PeriodoPreco } from "./preco"
import { Localizacao, PropsLocalizacao } from "./localizacao"
import { UrlSite } from "./url-site"
import { Caracteristicas, Media, EstadoExtracao } from "./tipos"

export interface PropsImovel {
  ref: string
  clienteId: string
  urlSite: string
  finalidade: string
  preco: { valor: number; moeda: Moeda; periodo: PeriodoPreco }
  localizacao: PropsLocalizacao
  caracteristicas: Caracteristicas
  media: Media
  extras: Record<string, unknown>
  estado: EstadoExtracao
}

export class Imovel {
  private constructor(
    readonly ref: Ref,
    readonly clienteId: string,
    readonly urlSite: UrlSite,
    readonly finalidade: Finalidade,
    readonly preco: Preco,
    readonly localizacao: Localizacao,
    readonly caracteristicas: Caracteristicas,
    readonly media: Media,
    readonly extras: Record<string, unknown>,
    readonly estado: EstadoExtracao,
  ) {}

  static criar(props: PropsImovel): Result<Imovel, ErroValidacao[]> {
    const erros: ErroValidacao[] = []

    const refR = Ref.criar(props.ref)
    if (!refR.ok) erros.push(refR.error)

    const clienteId = (props.clienteId ?? "").trim()
    if (clienteId.length === 0) erros.push(erroValidacao("clienteId", "clienteId é obrigatório"))

    const urlR = UrlSite.criar(props.urlSite)
    if (!urlR.ok) erros.push(urlR.error)

    const finalidadeValida = isFinalidade(props.finalidade)
    if (!finalidadeValida) erros.push(erroValidacao("finalidade", "finalidade tem de ser ALUGUER ou VENDA"))

    const precoR = Preco.criar(props.preco.valor, props.preco.moeda, props.preco.periodo)
    if (!precoR.ok) erros.push(precoR.error)

    const locR = Localizacao.criar(props.localizacao)
    if (!locR.ok) erros.push(locR.error)

    // Invariante entre campos: período coerente com finalidade (só avaliável se ambos válidos)
    if (finalidadeValida && precoR.ok) {
      const esperado = Preco.periodoEsperado(props.finalidade as Finalidade)
      if (precoR.value.periodo !== esperado) {
        erros.push(erroValidacao("preco.periodo", `Para ${props.finalidade} o período tem de ser ${esperado}`))
      }
    }

    if (erros.length > 0) return err(erros)

    // Guarda de narrowing: inalcançável com erros vazios, mas estreita os tipos para o construtor.
    if (!refR.ok || !urlR.ok || !precoR.ok || !locR.ok || !finalidadeValida) {
      return err(erros)
    }

    return ok(
      new Imovel(
        refR.value,
        clienteId,
        urlR.value,
        props.finalidade as Finalidade,
        precoR.value,
        locR.value,
        props.caracteristicas,
        props.media,
        props.extras,
        props.estado,
      ),
    )
  }
}
```

- [ ] **Step 4: Correr o teste para confirmar que passa**

Run: `npx vitest run src/domain/imovel/imovel.test.ts`
Expected: PASS — 4 testes.

- [ ] **Step 5: Commit**

```bash
git add src/domain/imovel/imovel.ts src/domain/imovel/imovel.test.ts
git commit -m "feat: add Imovel entity with fail-fast factory"
```

---

## Task 11: `Imovel.mudouEmRelacaoA` + `comEstado`

**Files:**
- Modify: `src/domain/imovel/imovel.ts`
- Modify: `src/domain/imovel/imovel.test.ts`

- [ ] **Step 1: Escrever os testes a falhar (acrescentar ao describe existente)**

Add to `src/domain/imovel/imovel.test.ts` (novo bloco no fim do ficheiro):

```ts
describe("Imovel comportamento de estado", () => {
  const base = () => {
    const r = Imovel.criar(propsValidas())
    if (!r.ok) throw new Error("setup inválido")
    return r.value
  }

  it("mudouEmRelacaoA é true quando o hash difere", () => {
    const a = base()
    const b = a.comEstado({ ...a.estado, hashConteudo: "h2" })
    expect(a.mudouEmRelacaoA(b)).toBe(true)
  })

  it("mudouEmRelacaoA é false quando o hash é igual", () => {
    const a = base()
    const b = a.comEstado({ ...a.estado, atualizadoEm: "2026-06-08T00:00:00.000Z" })
    expect(a.mudouEmRelacaoA(b)).toBe(false)
  })

  it("comEstado devolve nova instância sem mutar a original", () => {
    const a = base()
    const b = a.comEstado({ ...a.estado, ativo: false })
    expect(b.estado.ativo).toBe(false)
    expect(a.estado.ativo).toBe(true)
    expect(b.ref.valor).toBe(a.ref.valor)
  })
})
```

- [ ] **Step 2: Correr o teste para confirmar que falha**

Run: `npx vitest run src/domain/imovel/imovel.test.ts`
Expected: FAIL — `mudouEmRelacaoA is not a function` / `comEstado is not a function`.

- [ ] **Step 3: Implementação mínima (acrescentar os métodos à classe `Imovel`)**

Add inside the `Imovel` class in `src/domain/imovel/imovel.ts`, after the `criar` factory:

```ts
  mudouEmRelacaoA(outro: Imovel): boolean {
    return this.estado.hashConteudo !== outro.estado.hashConteudo
  }

  comEstado(estado: EstadoExtracao): Imovel {
    return new Imovel(
      this.ref,
      this.clienteId,
      this.urlSite,
      this.finalidade,
      this.preco,
      this.localizacao,
      this.caracteristicas,
      this.media,
      this.extras,
      estado,
    )
  }
```

- [ ] **Step 4: Correr o teste para confirmar que passa**

Run: `npx vitest run src/domain/imovel/imovel.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/imovel/imovel.ts src/domain/imovel/imovel.test.ts
git commit -m "feat: add Imovel state behavior (mudouEmRelacaoA, comEstado)"
```

---

## Task 12: Contrato `ImovelDto` + `imovelParaDto`

**Files:**
- Create: `src/domain/mapper/imovel-dto.ts`
- Create: `src/domain/mapper/imovel-mapper.ts`
- Test: `src/domain/mapper/imovel-mapper.test.ts`

- [ ] **Step 1: Definir o contrato `ImovelDto`**

Create `src/domain/mapper/imovel-dto.ts`:

```ts
export interface ImovelDto {
  ref: string
  clienteId: string
  urlSite: string
  finalidade: string
  tipoImovel?: string
  tipologia?: string
  preco: number
  moeda: string
  periodoPreco?: string
  distrito?: string
  concelho?: string
  freguesia?: string
  zonaTexto: string
  areaM2?: number
  quartos?: number
  casasBanho?: number
  caracteristicas?: string[]
  fotoPrincipal?: string
  extras: Record<string, unknown>
  ativo: boolean
  extraidoEm: string
  atualizadoEm: string
  hashConteudo: string
}
```

- [ ] **Step 2: Escrever o teste a falhar**

Create `src/domain/mapper/imovel-mapper.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { Imovel, PropsImovel } from "../imovel/imovel"
import { imovelParaDto } from "./imovel-mapper"

const props = (): PropsImovel => ({
  ref: "REF-9",
  clienteId: "cli",
  urlSite: "https://imob.pt/imovel/9",
  finalidade: "VENDA",
  preco: { valor: 250000, moeda: "EUR", periodo: "TOTAL" },
  localizacao: { zonaTexto: "Braga", concelho: "Braga" },
  caracteristicas: { tipoImovel: "Apartamento", tipologia: "T3", areaM2: 120, quartos: 3, casasBanho: 2, lista: ["elevador"] },
  media: { fotoPrincipal: "https://imob.pt/f9.jpg" },
  extras: { certificado: "B" },
  estado: { ativo: true, extraidoEm: "2026-06-07T10:00:00.000Z", atualizadoEm: "2026-06-07T10:00:00.000Z", hashConteudo: "h9" },
})

describe("imovelParaDto", () => {
  it("achata a entidade no contrato de saída", () => {
    const r = Imovel.criar(props())
    if (!r.ok) throw new Error("setup inválido")
    const dto = imovelParaDto(r.value)

    expect(dto.ref).toBe("REF-9")
    expect(dto.urlSite).toBe("https://imob.pt/imovel/9")
    expect(dto.preco).toBe(250000)
    expect(dto.moeda).toBe("EUR")
    expect(dto.periodoPreco).toBe("TOTAL")
    expect(dto.zonaTexto).toBe("Braga")
    expect(dto.tipologia).toBe("T3")
    expect(dto.caracteristicas).toEqual(["elevador"])
    expect(dto.extras["certificado"]).toBe("B")
    expect(dto.ativo).toBe(true)
    expect(dto.hashConteudo).toBe("h9")
  })
})
```

- [ ] **Step 3: Correr o teste para confirmar que falha**

Run: `npx vitest run src/domain/mapper/imovel-mapper.test.ts`
Expected: FAIL — `Cannot find module './imovel-mapper'`.

- [ ] **Step 4: Implementação mínima**

Create `src/domain/mapper/imovel-mapper.ts`:

```ts
import { Imovel } from "../imovel/imovel"
import { ImovelDto } from "./imovel-dto"

export function imovelParaDto(imovel: Imovel): ImovelDto {
  return {
    ref: imovel.ref.valor,
    clienteId: imovel.clienteId,
    urlSite: imovel.urlSite.valor,
    finalidade: imovel.finalidade,
    tipoImovel: imovel.caracteristicas.tipoImovel,
    tipologia: imovel.caracteristicas.tipologia,
    preco: imovel.preco.valor,
    moeda: imovel.preco.moeda,
    periodoPreco: imovel.preco.periodo,
    distrito: imovel.localizacao.distrito,
    concelho: imovel.localizacao.concelho,
    freguesia: imovel.localizacao.freguesia,
    zonaTexto: imovel.localizacao.zonaTexto,
    areaM2: imovel.caracteristicas.areaM2,
    quartos: imovel.caracteristicas.quartos,
    casasBanho: imovel.caracteristicas.casasBanho,
    caracteristicas: [...imovel.caracteristicas.lista],
    fotoPrincipal: imovel.media.fotoPrincipal,
    extras: imovel.extras,
    ativo: imovel.estado.ativo,
    extraidoEm: imovel.estado.extraidoEm,
    atualizadoEm: imovel.estado.atualizadoEm,
    hashConteudo: imovel.estado.hashConteudo,
  }
}
```

- [ ] **Step 5: Correr o teste para confirmar que passa**

Run: `npx vitest run src/domain/mapper/imovel-mapper.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/domain/mapper/imovel-dto.ts src/domain/mapper/imovel-mapper.ts src/domain/mapper/imovel-mapper.test.ts
git commit -m "feat: add ImovelDto contract and imovelParaDto mapper"
```

---

## Task 13: `dtoParaImovel` + round-trip

**Files:**
- Modify: `src/domain/mapper/imovel-mapper.ts`
- Modify: `src/domain/mapper/imovel-mapper.test.ts`

- [ ] **Step 1: Escrever o teste a falhar (round-trip)**

Primeiro, estende o import existente no topo de `src/domain/mapper/imovel-mapper.test.ts` para incluir `dtoParaImovel`:

```ts
import { imovelParaDto, dtoParaImovel } from "./imovel-mapper"
```

Depois acrescenta este bloco ao fim de `src/domain/mapper/imovel-mapper.test.ts`:

```ts
describe("dtoParaImovel (round-trip)", () => {
  it("DTO -> Imovel -> DTO preserva os campos", () => {
    const original = Imovel.criar(props())
    if (!original.ok) throw new Error("setup inválido")
    const dto = imovelParaDto(original.value)

    const reconstruido = dtoParaImovel(dto)
    expect(reconstruido.ok).toBe(true)
    if (reconstruido.ok) {
      expect(imovelParaDto(reconstruido.value)).toEqual(dto)
    }
  })

  it("propaga erros de validação de um DTO inválido", () => {
    const original = Imovel.criar(props())
    if (!original.ok) throw new Error("setup inválido")
    const dto = imovelParaDto(original.value)
    const invalido = { ...dto, preco: -10 }

    const r = dtoParaImovel(invalido)
    expect(r.ok).toBe(false)
  })
})
```

- [ ] **Step 2: Correr o teste para confirmar que falha**

Run: `npx vitest run src/domain/mapper/imovel-mapper.test.ts`
Expected: FAIL — `dtoParaImovel is not exported` / `Cannot find name 'dtoParaImovel'`.

- [ ] **Step 3: Implementação mínima (acrescentar ao mapper)**

Add to `src/domain/mapper/imovel-mapper.ts`:

```ts
import { Result } from "../../shared/result"
import { ErroValidacao } from "../imovel/erro-validacao"
import { Moeda, PeriodoPreco } from "../imovel/preco"

export function dtoParaImovel(dto: ImovelDto): Result<Imovel, ErroValidacao[]> {
  return Imovel.criar({
    ref: dto.ref,
    clienteId: dto.clienteId,
    urlSite: dto.urlSite,
    finalidade: dto.finalidade,
    preco: {
      valor: dto.preco,
      moeda: dto.moeda as Moeda,
      periodo: (dto.periodoPreco ?? "TOTAL") as PeriodoPreco,
    },
    localizacao: {
      zonaTexto: dto.zonaTexto,
      concelho: dto.concelho,
      distrito: dto.distrito,
      freguesia: dto.freguesia,
    },
    caracteristicas: {
      tipoImovel: dto.tipoImovel,
      tipologia: dto.tipologia,
      areaM2: dto.areaM2,
      quartos: dto.quartos,
      casasBanho: dto.casasBanho,
      lista: dto.caracteristicas ?? [],
    },
    media: { fotoPrincipal: dto.fotoPrincipal },
    extras: dto.extras ?? {},
    estado: {
      ativo: dto.ativo,
      extraidoEm: dto.extraidoEm,
      atualizadoEm: dto.atualizadoEm,
      hashConteudo: dto.hashConteudo,
    },
  })
}
```

- [ ] **Step 4: Correr toda a suite + typecheck**

Run: `npm test`
Expected: PASS — todos os testes (Result, Finalidade, Ref, Preco, Localizacao, UrlSite, Imovel, mapper).

Run: `npm run typecheck`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/domain/mapper/imovel-mapper.ts src/domain/mapper/imovel-mapper.test.ts
git commit -m "feat: add dtoParaImovel mapper with round-trip coverage"
```

---

## Definition of Done (Fase 1)

- [ ] `npm test` verde (toda a suite de domínio).
- [ ] `npm run typecheck` sem erros.
- [ ] `Imovel.criar` valida e **acumula** erros (`Result<Imovel, ErroValidacao[]>`).
- [ ] Invariante período↔finalidade aplicada.
- [ ] Round-trip `Imovel ↔ ImovelDto` preserva os campos.
- [ ] Domínio 100% determinístico (sem rede/BD/relógio).
- [ ] Cada task commitada separadamente.
