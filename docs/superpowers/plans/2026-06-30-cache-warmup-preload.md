# Warm-up de cache (pre-load no boot) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer a cache-api pré-carregar (no boot, opt-in via `PRELOAD_CLIENTES`) o catálogo de clientes lentos (caires) na tabela `imovel`, para `?cliente=caires` sair rápido do cache.

**Architecture:** `substituirCatalogoTx` (write no DB, em transação) + `precarregarTodos` (orquestra busca→substituição, isola erros) + wiring em `main-cache.ts` (lê `PRELOAD_CLIENTES`, chama em background após `app.listen`, com `comTransacao` via `pool.connect`).

**Tech Stack:** TypeScript, node-postgres (pg), Vitest. Sem libs novas.

**Ordem:** write → orquestrador → wiring. Tasks 1 e 2 são aditivas (build verde a cada commit).

---

### Task 1: `substituirCatalogoTx` — escrita atômica do catálogo

**Files:**
- Modify: `src/cache-api/imovel-cache.ts` (novo export + import de `RecursoImovel`)
- Test: `src/cache-api/imovel-cache.test.ts` (novo `describe`)

- [ ] **Step 1: Escrever o teste** — adicionar ao fim de `src/cache-api/imovel-cache.test.ts` (dentro do arquivo, novo `describe`; ajustar o import do topo)

No topo, trocar a linha de import por:
```ts
import { buscarNoCache, contarCache, substituirCatalogoTx, Consulta, FiltrosCache } from "./imovel-cache"
import { RecursoImovel } from "../domain/leitura/recurso-imovel"
```

Adicionar este `describe` ao fim do arquivo:
```ts
function recursoFake(over: Partial<RecursoImovel> = {}): RecursoImovel {
  return {
    ref: "AP1", clienteId: "caires", urlSite: "https://c/AP1", finalidade: "VENDA",
    preco: { valor: 500000, moeda: "BRL", periodo: "TOTAL" },
    localizacao: { zonaTexto: "z", cidade: "Araçatuba", bairro: "Centro" },
    caracteristicas: { tipoImovel: "apartamento", quartos: 2, lista: [], itens: [], comodidades: [] },
    media: {}, extras: {},
    estado: { ativo: true, extraidoEm: "2026-06-30T00:00:00.000Z", atualizadoEm: "2026-06-30T00:00:00.000Z", hashConteudo: "h" },
    ...over,
  } as RecursoImovel
}

describe("substituirCatalogoTx", () => {
  it("apaga o catálogo do cliente e insere os novos, mapeando os campos", async () => {
    const calls: { sql: string; params: unknown[] }[] = []
    const tx: Consulta = async (sql, params) => { calls.push({ sql, params }); return { rows: [] } }
    const r1 = recursoFake()

    const n = await substituirCatalogoTx(tx, "caires", [r1])

    expect(n).toBe(1)
    expect(calls[0].sql).toMatch(/delete\s+from\s+imovel\s+where\s+cliente_id\s*=\s*\$1/i)
    expect(calls[0].params).toEqual(["caires"])
    expect(calls[1].sql).toMatch(/insert\s+into\s+imovel/i)
    expect(calls[1].params).toEqual([
      "caires", "AP1", "VENDA", "apartamento", 2, 500000, "Araçatuba", "Centro", true, JSON.stringify(r1),
    ])
  })

  it("preço ausente → null", async () => {
    const calls: { sql: string; params: unknown[] }[] = []
    const tx: Consulta = async (sql, params) => { calls.push({ sql, params }); return { rows: [] } }
    await substituirCatalogoTx(tx, "caires", [recursoFake({ preco: undefined })])
    expect(calls[1].params[5]).toBeNull()
  })

  it("DELETE vem antes dos INSERT", async () => {
    const ordem: string[] = []
    const tx: Consulta = async (sql) => { ordem.push(/delete/i.test(sql) ? "del" : "ins"); return { rows: [] } }
    await substituirCatalogoTx(tx, "caires", [recursoFake(), recursoFake({ ref: "AP2" })])
    expect(ordem).toEqual(["del", "ins", "ins"])
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/cache-api/imovel-cache.test.ts`
Expected: FAIL (`substituirCatalogoTx` não existe).

- [ ] **Step 3: Implementar** — adicionar ao fim de `src/cache-api/imovel-cache.ts` (e o import de `RecursoImovel` no topo)

No topo, adicionar:
```ts
import { RecursoImovel } from "../domain/leitura/recurso-imovel"
```

Ao fim do arquivo:
```ts
const SQL_DELETE_CLIENTE = "DELETE FROM imovel WHERE cliente_id = $1"

const SQL_UPSERT = `INSERT INTO imovel
  (cliente_id, ref, finalidade, tipo_imovel, quartos, preco, cidade, bairro, ativo, payload)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
ON CONFLICT (cliente_id, ref, finalidade) DO UPDATE SET
  tipo_imovel = EXCLUDED.tipo_imovel, quartos = EXCLUDED.quartos, preco = EXCLUDED.preco,
  cidade = EXCLUDED.cidade, bairro = EXCLUDED.bairro, ativo = EXCLUDED.ativo,
  payload = EXCLUDED.payload, sincronizado_em = now()`

/**
 * Substitui o catálogo do cliente DENTRO de uma transação (`tx`): apaga as linhas
 * do cliente e reinsere as novas. Devolve quantos imóveis foram inseridos.
 * O ciclo de transação (BEGIN/COMMIT/ROLLBACK + client do pool) é do chamador.
 */
export async function substituirCatalogoTx(
  tx: Consulta,
  cliente: string,
  imoveis: RecursoImovel[],
): Promise<number> {
  await tx(SQL_DELETE_CLIENTE, [cliente])
  for (const im of imoveis) {
    await tx(SQL_UPSERT, [
      cliente,
      im.ref,
      im.finalidade,
      im.caracteristicas.tipoImovel ?? null,
      im.caracteristicas.quartos ?? null,
      im.preco?.valor ?? null,
      im.localizacao.cidade ?? null,
      im.localizacao.bairro ?? null,
      im.estado.ativo,
      JSON.stringify(im),
    ])
  }
  return imoveis.length
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/cache-api/imovel-cache.test.ts`
Expected: PASS (todos, incluindo os 3 novos).

- [ ] **Step 5: Commit**

```bash
git add src/cache-api/imovel-cache.ts src/cache-api/imovel-cache.test.ts
git commit -m "feat(cache): substituirCatalogoTx — escrita atômica do catálogo do cliente"
```

---

### Task 2: `precarregador` — orquestra busca → substituição

**Files:**
- Create: `src/cache-api/precarregador.ts`
- Test: `src/cache-api/precarregador.test.ts`

- [ ] **Step 1: Escrever o teste** — `src/cache-api/precarregador.test.ts`

```ts
import { describe, it, expect } from "vitest"
import { precarregarTodos, PrecarregadorDeps } from "./precarregador"
import { RecursoImovel } from "../domain/leitura/recurso-imovel"

const umImovel = [{ ref: "1" }] as unknown as RecursoImovel[]

describe("precarregarTodos", () => {
  it("busca no scraper e substitui quando há imóveis", async () => {
    const subst: string[] = []
    const deps: PrecarregadorDeps = {
      buscarNoScraper: async () => umImovel,
      substituirCatalogo: async (c, ims) => { subst.push(`${c}:${ims.length}`); return ims.length },
    }
    await precarregarTodos(deps, ["caires"])
    expect(subst).toEqual(["caires:1"])
  })

  it("scraper vazio → NÃO substitui (não zera o catálogo)", async () => {
    let chamou = false
    const deps: PrecarregadorDeps = {
      buscarNoScraper: async () => [],
      substituirCatalogo: async () => { chamou = true; return 0 },
    }
    await precarregarTodos(deps, ["caires"])
    expect(chamou).toBe(false)
  })

  it("falha do scraper não substitui nem propaga; próximo cliente segue", async () => {
    const subst: string[] = []
    const deps: PrecarregadorDeps = {
      buscarNoScraper: async (c) => { if (c === "caires") throw new Error("down"); return umImovel },
      substituirCatalogo: async (c, ims) => { subst.push(c); return ims.length },
    }
    await precarregarTodos(deps, ["caires", "outro"])
    expect(subst).toEqual(["outro"])
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/cache-api/precarregador.test.ts`
Expected: FAIL ("Cannot find module './precarregador'").

- [ ] **Step 3: Implementar** — `src/cache-api/precarregador.ts`

```ts
import { RecursoImovel } from "../domain/leitura/recurso-imovel"

export interface PrecarregadorDeps {
  /** Busca o catálogo completo do cliente no scraper. */
  buscarNoScraper: (cliente: string) => Promise<RecursoImovel[]>
  /** Substitui (atômico) o catálogo do cliente no cache; devolve nº inserido. */
  substituirCatalogo: (cliente: string, imoveis: RecursoImovel[]) => Promise<number>
  log?: (msg: string) => void
  avisar?: (msg: string) => void
}

/**
 * Pré-carrega o catálogo de cada cliente. Erros são isolados por cliente (um que
 * falha não impede os outros) e NUNCA derrubam o processo. Retorno vazio do scraper
 * não substitui (evita zerar o catálogo por engano).
 */
export async function precarregarTodos(deps: PrecarregadorDeps, clientes: string[]): Promise<void> {
  for (const cliente of clientes) {
    try {
      const imoveis = await deps.buscarNoScraper(cliente)
      if (imoveis.length === 0) {
        deps.avisar?.(`pre-load ${cliente}: scraper devolveu 0 imóveis — catálogo mantido`)
        continue
      }
      const n = await deps.substituirCatalogo(cliente, imoveis)
      deps.log?.(`pre-load ${cliente}: ${n} imóveis carregados no cache`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      deps.avisar?.(`pre-load ${cliente} falhou: ${msg} — catálogo mantido`)
    }
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/cache-api/precarregador.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add src/cache-api/precarregador.ts src/cache-api/precarregador.test.ts
git commit -m "feat(cache): precarregador — orquestra warm-up com isolamento de erro"
```

---

### Task 3: Wiring em `main-cache.ts` + deploy

Glue (sem teste unitário — composition root). Verificação: typecheck + build + verificação manual no deploy.

**Files:**
- Modify: `src/cache-api/main-cache.ts` (reescrita)
- Modify: `docker-compose.yml` (env `PRELOAD_CLIENTES` na cache-api)
- Modify: `db/docker-compose.yml` (comentário: cache-api também escreve no warm-up)

- [ ] **Step 1: Reescrever `src/cache-api/main-cache.ts`**

```ts
import pg from "pg"
import { criarCacheServer } from "./server"
import { buscarNoCache, contarCache, substituirCatalogoTx, Consulta } from "./imovel-cache"
import { precarregarTodos } from "./precarregador"
import { RecursoImovel } from "../domain/leitura/recurso-imovel"

const PORT = Number(process.env.PORT ?? 3001)
const HOST = process.env.HOST ?? "0.0.0.0"
const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://inove:inove@postgres:5432/inove"
const SCRAPER_URL = process.env.SCRAPER_URL ?? "http://scraper-api:3000"
// Cliente assumido quando o request não traz ?cliente= (retrocompat single-tenant).
const CLIENTE_PADRAO = process.env.CLIENTE_PADRAO?.trim() || "innove"
// Clientes a pré-carregar no boot (warm-up). Vazio = nenhum.
const PRELOAD_CLIENTES = (process.env.PRELOAD_CLIENTES ?? "")
  .split(",").map((s) => s.trim()).filter(Boolean)

const pool = new pg.Pool({ connectionString: DATABASE_URL })
const consulta: Consulta = (sql, params) => pool.query(sql, params)

/** Roda fn dentro de UMA transação (client dedicado do pool). */
async function comTransacao<T>(fn: (tx: Consulta) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const r = await fn((sql, params) => client.query(sql, params))
    await client.query("COMMIT")
    return r
  } catch (e) {
    await client.query("ROLLBACK")
    throw e
  } finally {
    client.release()
  }
}

/** Busca o catálogo completo de um cliente no scraper. */
async function buscarNoScraper(cliente: string): Promise<RecursoImovel[]> {
  const res = await fetch(`${SCRAPER_URL}/imoveis?cliente=${encodeURIComponent(cliente)}`)
  const env = (await res.json()) as { imoveis?: RecursoImovel[] }
  return env.imoveis ?? []
}

const app = criarCacheServer({
  contar: (clienteId) => contarCache(consulta, clienteId),
  buscar: (filtros) => buscarNoCache(consulta, filtros),
  fallback: async (query) => {
    const qs = new URLSearchParams(query).toString()
    const url = `${SCRAPER_URL}/imoveis${qs ? `?${qs}` : ""}`
    const res = await fetch(url)
    return res.json()
  },
  clientePadrao: CLIENTE_PADRAO,
  logLevel: process.env.LOG_LEVEL ?? "info",
})

app
  .listen({ host: HOST, port: PORT })
  .then(() => {
    console.log(`cache-api on ${HOST}:${PORT} -> DB ${DATABASE_URL}, scraper ${SCRAPER_URL}`)
    if (PRELOAD_CLIENTES.length > 0) {
      console.log(`pre-load: warm-up de [${PRELOAD_CLIENTES.join(", ")}] em background`)
      precarregarTodos(
        {
          buscarNoScraper,
          substituirCatalogo: (cliente, imoveis) =>
            comTransacao((tx) => substituirCatalogoTx(tx, cliente, imoveis)),
          log: (m) => console.log(m),
          avisar: (m) => console.warn(m),
        },
        PRELOAD_CLIENTES,
      ).catch((e) => console.error("pre-load:", e))
    }
  })
  .catch((erro) => {
    console.error(erro)
    process.exit(1)
  })
```

- [ ] **Step 2: Env no `docker-compose.yml` (serviço `cache-api`)** — adicionar dentro de `environment:`, junto de `CLIENTE_PADRAO`:

```yaml
      # Warm-up no boot: pré-carrega o catálogo destes clientes (CSV). Vazio = nenhum.
      PRELOAD_CLIENTES: caires
```

- [ ] **Step 3: Atualizar comentário em `db/docker-compose.yml`** — a linha `#   - A cache-api apenas LÊ este banco.` passa a:

```
#   - A cache-api LÊ este banco (e ESCREVE no warm-up de boot — pre-load de clientes).
```

- [ ] **Step 4: Typecheck + build + suíte**

Run: `npm run typecheck && npm test && npm run build`
Expected: typecheck sem erros; toda a suíte verde; build (`tsup`) gera `dist/` sem erro.

- [ ] **Step 5: Commit**

```bash
git add src/cache-api/main-cache.ts docker-compose.yml db/docker-compose.yml
git commit -m "feat(cache): warm-up no boot via PRELOAD_CLIENTES (background, transação)"
```

---

## Verificação final (pós-implementação)

- [ ] Garantir que o `.env` (CLIENTES do scraper) tem o caires com os seeds das categorias a pré-carregar (apartamento, casa, ...).
- [ ] Redeploy: `docker compose up -d --build`.
- [ ] Logs da cache-api mostram o warm-up: `docker logs cache-api --tail 30` → `pre-load: warm-up de [caires]...` e depois `pre-load caires: N imóveis carregados no cache`.
- [ ] Conferir no banco: `docker exec inove-postgres psql -U inove -d inove -tAc "SELECT count(*) FROM imovel WHERE cliente_id='caires'"` → > 0.
- [ ] `curl "http://localhost:3001/imoveis?cliente=caires&tipoImovel=apartamento&cidade=Ara%C3%A7atuba"` → **rápido** (origem cache), sem disparar crawl.

## Self-review (feito)
- **Cobertura do spec:** PRELOAD_CLIENTES (T3) ✓ · precarregador c/ isolamento+vazio (T2) ✓ · substituição atômica/transação (T1 + comTransacao em T3) ✓ · mapeamento RecursoImovel→colunas (T1) ✓ · background após listen (T3) ✓ · não-zera em vazio/erro (T2) ✓ · GET /imoveis inalterado (sem mudança no server) ✓ · comentário cache-api read-only (T3) ✓.
- **Placeholders:** nenhum.
- **Consistência de tipos:** `substituirCatalogoTx(tx, cliente, imoveis)`, `PrecarregadorDeps{buscarNoScraper, substituirCatalogo, log?, avisar?}`, `precarregarTodos(deps, clientes)`, `Consulta` reusado como tipo de `tx` — idênticos entre tasks e wiring.
