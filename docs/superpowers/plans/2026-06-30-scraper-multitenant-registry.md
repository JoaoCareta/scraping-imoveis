# Scraper multi-tenant por registro — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar o scraper-api single-tenant num único serviço multi-tenant que conhece todos os clientes via um registro (`CLIENTES` em env JSON) e seleciona a fonte por `?cliente=`.

**Architecture:** `carregarConfig` parseia `CLIENTES` (JSON) em `ClienteConfig[]`. No boot, `criarRegistro` constrói um `Map<clienteId → repo>` (eager). O server resolve o repo por `?cliente=` a cada request (`cliente` obrigatório → 400 se ausente/desconhecido). Mantém o scraper DB-free.

**Tech Stack:** TypeScript, Fastify, Vitest. Sem libs novas.

**Ordem (mantém build verde a cada task):** fábrica → registro → server → config → deploy/docs. `src/main.ts` é reajustado de forma incremental nas tasks 1, 3 e 4.

---

### Task 1: Fábrica por cliente — `criarFonte(cliente, infra)`

Refatora a fábrica para receber UMA `ClienteConfig` (não a `Config` global). `Config` permanece single-tenant nesta task (mudança aditiva do tipo `ClienteConfig`); `main.ts` adapta.

**Files:**
- Modify: `src/config.ts` (adiciona `ClienteConfig`)
- Modify: `src/fontes/fabrica.ts:37-58`
- Modify: `src/main.ts:7-11`
- Test: `src/fontes/fabrica.test.ts` (reescreve `criarFonte`)

- [ ] **Step 1: Adicionar o tipo `ClienteConfig` em `src/config.ts`** (aditivo, acima de `interface Config`)

```ts
export interface ClienteConfig {
  id: string
  plataforma: "moldsystems" | "kenlo"
  estrategia: "html" | "api"
  origin: string
  solrNumRows: number
  kenloSeeds?: string
  kenloMaxPaginas?: number
}
```

- [ ] **Step 2: Reescrever o teste da fábrica** — `src/fontes/fabrica.test.ts` (substituir o bloco `describe("criarFonte"...)` e o `base`/imports do topo; manter o `describe("parsearSeeds")` inalterado)

```ts
import { describe, it, expect } from "vitest"
import { criarFonte, parsearSeeds } from "./fabrica"
import { MoldSystemsFonte } from "./moldsystems/moldsystems-fonte"
import { KenloFonte } from "./kenlo/kenlo-fonte"
import { ClienteConfig } from "../config"

const base: ClienteConfig = {
  id: "x", plataforma: "moldsystems", estrategia: "html", origin: "https://x", solrNumRows: 5000,
}
const infra = { fetchTimeoutMs: 8000 }

describe("criarFonte", () => {
  it("plataforma moldsystems → MoldSystemsFonte", () => {
    expect(criarFonte({ ...base, plataforma: "moldsystems" }, infra)).toBeInstanceOf(MoldSystemsFonte)
  })
  it("plataforma kenlo → KenloFonte", () => {
    expect(criarFonte({ ...base, plataforma: "kenlo", origin: "https://www.cairesengimob.com.br" }, infra)).toBeInstanceOf(KenloFonte)
  })
  it("plataforma kenlo + estrategia api → falha-rápido (ColetaApiKenlo não implementada)", () => {
    expect(() => criarFonte({ ...base, plataforma: "kenlo", estrategia: "api", origin: "https://www.cairesengimob.com.br" }, infra)).toThrow(/não implementada/)
  })
})
```

(O `describe("parsearSeeds")` permanece como está.)

- [ ] **Step 3: Rodar o teste e ver falhar**

Run: `npx vitest run src/fontes/fabrica.test.ts`
Expected: FAIL (criarFonte ainda espera `Config`; assinatura nova não bate).

- [ ] **Step 4: Reescrever `criarFonte` em `src/fontes/fabrica.ts`** (substituir a função `criarFonte`; `TIPOS_KENLO`/`SEEDS_KENLO`/`parsearSeeds` inalterados; remover o import de `Config`, adicionar `ClienteConfig`)

```ts
import { ClienteConfig } from "../config"
// (manter os demais imports: FonteDeImoveis, MoldSystemsFonte, KenloFonte, ColetaHtmlKenlo, SeedListagem)

/** Único lugar que conhece o mapa plataforma → classe de fonte. */
export function criarFonte(cliente: ClienteConfig, infra: { fetchTimeoutMs: number }): FonteDeImoveis {
  if (cliente.plataforma === "kenlo") {
    if (cliente.estrategia === "api") {
      throw new Error("ESTRATEGIA=api (ColetaApiKenlo) ainda não implementada para a plataforma kenlo")
    }
    const estrategia = new ColetaHtmlKenlo({
      origin: cliente.origin,
      timeoutMs: infra.fetchTimeoutMs,
      seeds: cliente.kenloSeeds ? parsearSeeds(cliente.kenloSeeds) : SEEDS_KENLO,
      maxPaginas: cliente.kenloMaxPaginas,
      avisar: (msg) => console.warn(msg),
    })
    return new KenloFonte({ origin: cliente.origin, clienteId: cliente.id, estrategia })
  }
  return new MoldSystemsFonte({
    origin: cliente.origin,
    clienteId: cliente.id,
    numRows: cliente.solrNumRows,
    timeoutMs: infra.fetchTimeoutMs,
    avisar: (msg) => console.warn(msg),
  })
}
```

- [ ] **Step 5: Ajustar `src/main.ts` (adaptador interino)** — monta uma `ClienteConfig` a partir da `Config` ainda single-tenant

```ts
import { FastifyInstance } from "fastify"
import { carregarConfig, Config, ClienteConfig } from "./config"
import { criarFonte } from "./fontes/fabrica"
import { FonteImovelRepository } from "./aplicacao/fonte-imovel-repository"
import { criarServidor } from "./api/server"

export function construirApp(config: Config): FastifyInstance {
  const cliente: ClienteConfig = {
    id: config.clienteId, plataforma: config.plataforma, estrategia: config.estrategia,
    origin: config.origin, solrNumRows: config.solrNumRows,
    kenloSeeds: config.kenloSeeds, kenloMaxPaginas: config.kenloMaxPaginas,
  }
  const fonte = criarFonte(cliente, { fetchTimeoutMs: config.fetchTimeoutMs })
  const repo = new FonteImovelRepository({ fonte })
  return criarServidor(repo, config)
}
// (manter iniciar() e o bloco de arranque inalterados)
```

- [ ] **Step 6: Rodar testes + typecheck (verde)**

Run: `npx vitest run src/fontes/fabrica.test.ts && npm run typecheck`
Expected: PASS; typecheck sem erros.

- [ ] **Step 7: Commit**

```bash
git add src/config.ts src/fontes/fabrica.ts src/fontes/fabrica.test.ts src/main.ts
git commit -m "refactor(scraper): criarFonte recebe ClienteConfig + infra"
```

---

### Task 2: Registro de fontes (novo)

Cria o registro eager `cliente → repo`. Arquivo novo, desacoplado da `Config` (recebe `ClienteConfig[]`), então é testável isolado e não depende da ordem das demais tasks.

**Files:**
- Create: `src/fontes/registro-de-fontes.ts`
- Test: `src/fontes/registro-de-fontes.test.ts`

- [ ] **Step 1: Escrever o teste** — `src/fontes/registro-de-fontes.test.ts`

```ts
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
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `npx vitest run src/fontes/registro-de-fontes.test.ts`
Expected: FAIL ("Cannot find module './registro-de-fontes'").

- [ ] **Step 3: Implementar `src/fontes/registro-de-fontes.ts`**

```ts
import { ClienteConfig } from "../config"
import { criarFonte } from "./fabrica"
import { FonteImovelRepository } from "../aplicacao/fonte-imovel-repository"
import { ImovelRepository } from "../aplicacao/imovel-repository"

/** Resolve cliente → repositório (uma fonte por cliente, construída no boot). */
export interface RegistroDeFontes {
  obter(clienteId: string): ImovelRepository | undefined
}

export function criarRegistro(
  clientes: ClienteConfig[],
  infra: { fetchTimeoutMs: number },
): RegistroDeFontes {
  const repos = new Map<string, ImovelRepository>()
  for (const cliente of clientes) {
    const fonte = criarFonte(cliente, infra)
    repos.set(cliente.id, new FonteImovelRepository({ fonte }))
  }
  return { obter: (clienteId) => repos.get(clienteId) }
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `npx vitest run src/fontes/registro-de-fontes.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add src/fontes/registro-de-fontes.ts src/fontes/registro-de-fontes.test.ts
git commit -m "feat(scraper): registro de fontes (cliente -> repo, eager)"
```

---

### Task 3: Server seleciona a fonte por `?cliente=`

Troca o guard `recusaClienteIncompativel` por seleção de fonte via registro. `cliente` vira obrigatório: ausente → 400 `CLIENTE_OBRIGATORIO`; desconhecido → 400 `CLIENTE_DESCONHECIDO`. `main.ts` passa a montar um registro (ainda de 1 cliente, derivado da Config single-tenant).

**Files:**
- Modify: `src/api/server.ts` (assinatura + remove guard + `resolverRepo`)
- Modify: `src/main.ts:7-11`
- Test: `src/api/server.test.ts` (reescreve helper + casos de cliente)

- [ ] **Step 1: Reescrever `src/api/server.test.ts`** (helper de registro + `cliente=innove` nos requests + casos 400)

```ts
import { describe, it, expect } from "vitest"
import { criarServidor } from "./server"
import { Config } from "../config"
import { ImovelRepository, Coleta, FiltrosImovel } from "../aplicacao/imovel-repository"
import { RegistroDeFontes } from "../fontes/registro-de-fontes"
import { FonteIndisponivelError, FonteTimeoutError } from "../fontes/erros"

const CONFIG_BASE: Config = {
  port: 3000, host: "0.0.0.0", fetchTimeoutMs: 8000, logLevel: "silent",
  clientes: [{ id: "innove", plataforma: "moldsystems", estrategia: "html", origin: "https://x", solrNumRows: 5000 }],
}

function recurso(ref: string, finalidade: "ALUGUER" | "VENDA"): Coleta["imoveis"][number] {
  return {
    ref, clienteId: "innove", urlSite: "https://x/" + ref, finalidade,
    preco: { valor: 1000, moeda: "BRL", periodo: "MENSAL" },
    localizacao: { zonaTexto: "Centro", cidade: "Bauru" },
    caracteristicas: { lista: [], itens: [], comodidades: [] }, media: {}, extras: {},
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

/** Registro com um repo para "innove" (e, opcionalmente, mais clientes). */
function registroFake(repos: Record<string, ImovelRepository> = { innove: repoFake() }): RegistroDeFontes {
  return { obter: (cliente) => repos[cliente] }
}

describe("servidor", () => {
  it("GET /health → 200 ok", async () => {
    const app = criarServidor(registroFake(), CONFIG_BASE)
    const res = await app.inject({ method: "GET", url: "/health" })
    expect(res.statusCode).toBe(200)
    expect(res.json().status).toBe("ok")
  })

  it("GET /imoveis sem cliente → 400 CLIENTE_OBRIGATORIO", async () => {
    const app = criarServidor(registroFake(), CONFIG_BASE)
    const res = await app.inject({ method: "GET", url: "/imoveis" })
    expect(res.statusCode).toBe(400)
    expect(res.json().erro.codigo).toBe("CLIENTE_OBRIGATORIO")
  })

  it("GET /imoveis?cliente=caires (não registrado) → 400 CLIENTE_DESCONHECIDO", async () => {
    const app = criarServidor(registroFake(), CONFIG_BASE)
    const res = await app.inject({ method: "GET", url: "/imoveis?cliente=caires" })
    expect(res.statusCode).toBe(400)
    expect(res.json().erro.codigo).toBe("CLIENTE_DESCONHECIDO")
  })

  it("GET /imoveis?cliente=innove → 200 envelope ColetaConcluida", async () => {
    const app = criarServidor(registroFake(), CONFIG_BASE)
    const res = await app.inject({ method: "GET", url: "/imoveis?cliente=innove" })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.evento).toBe("ColetaConcluida")
    expect(body.total).toBe(1)
    expect(body.imoveis[0].ref).toBe("1910")
  })

  it("seleciona o repo do cliente pedido (caires ≠ innove)", async () => {
    const colCaires: Coleta = { imoveis: [recurso("C1", "VENDA")], total: 1, rejeitados: 0, extraidoEm: "2026-06-18T10:00:00.000Z" }
    const app = criarServidor(
      registroFake({ innove: repoFake(), caires: repoFake({ buscar: async () => colCaires }) }),
      CONFIG_BASE,
    )
    const res = await app.inject({ method: "GET", url: "/imoveis?cliente=caires" })
    expect(res.statusCode).toBe(200)
    expect(res.json().imoveis[0].ref).toBe("C1")
  })

  it("GET /imoveis?cliente=innove&comodidades=piscina,portaria → repassa array para o repo", async () => {
    let recebido: FiltrosImovel | undefined
    const app = criarServidor(
      registroFake({ innove: repoFake({ buscar: async (f) => { recebido = f; return { imoveis: [], total: 0, rejeitados: 0, extraidoEm: "2026-06-18T10:00:00.000Z" } } }) }),
      CONFIG_BASE,
    )
    const res = await app.inject({ method: "GET", url: "/imoveis?cliente=innove&comodidades=piscina,portaria" })
    expect(res.statusCode).toBe(200)
    expect(recebido?.comodidades).toEqual(["piscina", "portaria"])
  })

  it("GET /imoveis com finalidade inválida → 400", async () => {
    const app = criarServidor(registroFake(), CONFIG_BASE)
    const res = await app.inject({ method: "GET", url: "/imoveis?cliente=innove&finalidade=XPTO" })
    expect(res.statusCode).toBe(400)
  })

  it("GET /imoveis/:ref sem cliente → 400", async () => {
    const app = criarServidor(registroFake(), CONFIG_BASE)
    const res = await app.inject({ method: "GET", url: "/imoveis/1910" })
    expect(res.statusCode).toBe(400)
  })

  it("GET /imoveis/:ref?cliente=innove inexistente → 404", async () => {
    const app = criarServidor(registroFake(), CONFIG_BASE)
    const res = await app.inject({ method: "GET", url: "/imoveis/9999?cliente=innove" })
    expect(res.statusCode).toBe(404)
  })

  it("fonte indisponível → 503 com evento", async () => {
    const app = criarServidor(registroFake({ innove: repoFake({ buscar: async () => { throw new FonteIndisponivelError("down") } }) }), CONFIG_BASE)
    const res = await app.inject({ method: "GET", url: "/imoveis?cliente=innove" })
    expect(res.statusCode).toBe(503)
    expect(res.json().evento).toBe("FonteIndisponivel")
  })

  it("timeout da fonte → 504", async () => {
    const app = criarServidor(registroFake({ innove: repoFake({ buscar: async () => { throw new FonteTimeoutError("slow") } }) }), CONFIG_BASE)
    const res = await app.inject({ method: "GET", url: "/imoveis?cliente=innove" })
    expect(res.statusCode).toBe(504)
  })

  it("API key ligada: sem header → 401; com header → 200", async () => {
    const app = criarServidor(registroFake(), { ...CONFIG_BASE, apiKey: "segredo" })
    const semHeader = await app.inject({ method: "GET", url: "/imoveis?cliente=innove" })
    expect(semHeader.statusCode).toBe(401)
    const comHeader = await app.inject({ method: "GET", url: "/imoveis?cliente=innove", headers: { "x-api-key": "segredo" } })
    expect(comHeader.statusCode).toBe(200)
  })

  it("API key ligada não bloqueia /health", async () => {
    const app = criarServidor(registroFake(), { ...CONFIG_BASE, apiKey: "segredo" })
    const res = await app.inject({ method: "GET", url: "/health" })
    expect(res.statusCode).toBe(200)
  })

  it("pagina com limit/offset e devolve total + página", async () => {
    const coleta3: Coleta = {
      imoveis: [recurso("1", "ALUGUER"), recurso("2", "ALUGUER"), recurso("3", "VENDA")],
      total: 3, rejeitados: 0, extraidoEm: "2026-06-18T10:00:00.000Z",
    }
    const app = criarServidor(registroFake({ innove: repoFake({ buscar: async () => coleta3 }) }), CONFIG_BASE)
    const res = await app.inject({ method: "GET", url: "/imoveis?cliente=innove&limit=2&offset=1" })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.total).toBe(3)
    expect(body.limit).toBe(2)
    expect(body.offset).toBe(1)
    expect(body.imoveis.map((i: { ref: string }) => i.ref)).toEqual(["2", "3"])
  })

  it("ignora query params vazios em vez de dar 400", async () => {
    const app = criarServidor(registroFake(), CONFIG_BASE)
    const res = await app.inject({ method: "GET", url: "/imoveis?cliente=innove&finalidade=&bairro=&precoMax=2000" })
    expect(res.statusCode).toBe(200)
    expect(res.json().evento).toBe("ColetaConcluida")
  })

  it("remove valores coringa (qualquer/tanto faz) em vez de filtrar ou dar 400", async () => {
    const app = criarServidor(registroFake(), CONFIG_BASE)
    const res = await app.inject({ method: "GET", url: "/imoveis?cliente=innove&finalidade=qualquer&bairro=qualquer&tipoImovel=tanto%20faz" })
    expect(res.statusCode).toBe(200)
    expect(res.json().evento).toBe("ColetaConcluida")
  })
})
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `npx vitest run src/api/server.test.ts`
Expected: FAIL (criarServidor ainda espera `repo`; `RegistroDeFontes` não usado; CONFIG_BASE shape).

- [ ] **Step 3: Reescrever `src/api/server.ts`** — assinatura, remover guard, adicionar `resolverRepo`

No topo, trocar o import do repo por:
```ts
import { ImovelRepository, FiltrosImovel } from "../aplicacao/imovel-repository"
import { RegistroDeFontes } from "../fontes/registro-de-fontes"
```

Trocar a assinatura e remover `recusaClienteIncompativel`:
```ts
export function criarServidor(registro: RegistroDeFontes, config: Config): FastifyInstance {
  const app = Fastify({ logger: { level: config.logLevel } })

  // ... (hook de apiKey, preValidation, setErrorHandler e GET /health INALTERADOS) ...

  // Seleciona o repo do cliente pedido. cliente é OBRIGATÓRIO.
  function resolverRepo(
    cliente: string | undefined,
    reply: import("fastify").FastifyReply,
  ): ImovelRepository | undefined {
    const id = (cliente ?? "").trim()
    if (!id) {
      reply.code(400).send({
        evento: "Erro",
        erro: { codigo: "CLIENTE_OBRIGATORIO", mensagem: "Parâmetro 'cliente' é obrigatório." },
      })
      return undefined
    }
    const repo = registro.obter(id)
    if (!repo) {
      reply.code(400).send({
        evento: "Erro",
        erro: { codigo: "CLIENTE_DESCONHECIDO", mensagem: `Cliente '${id}' não está registrado.` },
      })
      return undefined
    }
    return repo
  }
```

Na rota `/imoveis`, trocar o início do handler:
```ts
    async (req: FastifyRequest<{ Querystring: QueryImoveis }>, reply) => {
      const q = req.query
      const repo = resolverRepo(q.cliente, reply)
      if (!repo) return reply
      const limit = q.limit ?? 100
      // ... (resto do handler inalterado: filtros, repo.buscar, envelope) ...
```

Na rota `/imoveis/:ref`, trocar o início:
```ts
  app.get<{ Params: { ref: string }; Querystring: { cliente?: string } }>("/imoveis/:ref", async (req, reply) => {
    const repo = resolverRepo(req.query.cliente, reply)
    if (!repo) return reply
    const coleta = await repo.buscarPorRef(req.params.ref)
    // ... (resto inalterado) ...
```

- [ ] **Step 4: Ajustar `src/main.ts` (registro de 1 cliente, interino)**

```ts
import { FastifyInstance } from "fastify"
import { carregarConfig, Config, ClienteConfig } from "./config"
import { criarRegistro } from "./fontes/registro-de-fontes"
import { criarServidor } from "./api/server"

export function construirApp(config: Config): FastifyInstance {
  const cliente: ClienteConfig = {
    id: config.clienteId, plataforma: config.plataforma, estrategia: config.estrategia,
    origin: config.origin, solrNumRows: config.solrNumRows,
    kenloSeeds: config.kenloSeeds, kenloMaxPaginas: config.kenloMaxPaginas,
  }
  const registro = criarRegistro([cliente], { fetchTimeoutMs: config.fetchTimeoutMs })
  return criarServidor(registro, config)
}
// (manter iniciar() e o bloco de arranque inalterados)
```

- [ ] **Step 5: Rodar testes + typecheck (verde)**

Run: `npx vitest run src/api/server.test.ts && npm run typecheck`
Expected: PASS; typecheck sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/api/server.ts src/api/server.test.ts src/main.ts
git commit -m "feat(scraper): seleção de fonte por ?cliente= (obrigatório, 400 se ausente/desconhecido)"
```

---

### Task 4: Config multi-tenant — `CLIENTES` (JSON)

`Config` deixa de ser single-tenant: ganha `clientes: ClienteConfig[]` e perde `clienteId/origin/plataforma/estrategia/kenloSeeds/kenloMaxPaginas/solrNumRows`. `carregarConfig` parseia/valida `CLIENTES`. `main.ts` passa à forma final.

**Files:**
- Modify: `src/config.ts` (Config + carregarConfig)
- Modify: `src/main.ts:7-11` (forma final)
- Test: `src/config.test.ts` (reescreve)
- Test: `src/main.test.ts` (novo shape de config)

- [ ] **Step 1: Reescrever `src/config.test.ts`**

```ts
import { describe, it, expect } from "vitest"
import { carregarConfig } from "./config"

const UM = JSON.stringify([{ id: "innove", plataforma: "moldsystems", origin: "https://x" }])

describe("carregarConfig", () => {
  it("aplica defaults de infra e parseia CLIENTES", () => {
    const c = carregarConfig({ CLIENTES: UM })
    expect(c.port).toBe(3000)
    expect(c.host).toBe("0.0.0.0")
    expect(c.fetchTimeoutMs).toBe(8000)
    expect(c.apiKey).toBeUndefined()
    expect(c.clientes).toHaveLength(1)
    expect(c.clientes[0]).toMatchObject({ id: "innove", plataforma: "moldsystems", estrategia: "html", origin: "https://x", solrNumRows: 5000 })
  })

  it("lê e converte infra do ambiente", () => {
    const c = carregarConfig({ CLIENTES: UM, PORT: "8080", API_KEY: "segredo" })
    expect(c.port).toBe(8080)
    expect(c.apiKey).toBe("segredo")
  })

  it("API_KEY vazia continua undefined (gate desligado)", () => {
    expect(carregarConfig({ CLIENTES: UM, API_KEY: "" }).apiKey).toBeUndefined()
  })

  it("parseia vários clientes com campos por plataforma", () => {
    const json = JSON.stringify([
      { id: "innove", plataforma: "moldsystems", origin: "https://i", solrNumRows: 100 },
      { id: "caires", plataforma: "kenlo", estrategia: "html", origin: "https://c", kenloMaxPaginas: 2 },
    ])
    const c = carregarConfig({ CLIENTES: json })
    expect(c.clientes.map((x) => x.id)).toEqual(["innove", "caires"])
    expect(c.clientes[0].solrNumRows).toBe(100)
    expect(c.clientes[1]).toMatchObject({ plataforma: "kenlo", kenloMaxPaginas: 2 })
  })

  it("CLIENTES ausente → erro", () => {
    expect(() => carregarConfig({})).toThrow(/CLIENTES/)
  })

  it("CLIENTES com JSON inválido → erro", () => {
    expect(() => carregarConfig({ CLIENTES: "{nope" })).toThrow(/JSON/)
  })

  it("CLIENTES lista vazia → erro", () => {
    expect(() => carregarConfig({ CLIENTES: "[]" })).toThrow(/não-vazia/)
  })

  it("cliente sem origin → erro", () => {
    expect(() => carregarConfig({ CLIENTES: JSON.stringify([{ id: "x", plataforma: "kenlo" }]) })).toThrow(/origin/)
  })

  it("plataforma inválida → erro", () => {
    expect(() => carregarConfig({ CLIENTES: JSON.stringify([{ id: "x", plataforma: "outra", origin: "https://x" }]) })).toThrow(/plataforma/)
  })

  it("id duplicado → erro", () => {
    const json = JSON.stringify([{ id: "x", plataforma: "kenlo", origin: "https://a" }, { id: "x", plataforma: "kenlo", origin: "https://b" }])
    expect(() => carregarConfig({ CLIENTES: json })).toThrow(/duplicado/)
  })
})
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `npx vitest run src/config.test.ts`
Expected: FAIL (Config ainda single-tenant; carregarConfig não lê CLIENTES).

- [ ] **Step 3: Reescrever `src/config.ts`** (manter `ClienteConfig` da Task 1; trocar `Config` e `carregarConfig`)

```ts
export interface ClienteConfig {
  id: string
  plataforma: "moldsystems" | "kenlo"
  estrategia: "html" | "api"
  origin: string
  solrNumRows: number
  kenloSeeds?: string
  kenloMaxPaginas?: number
}

export interface Config {
  port: number
  host: string
  fetchTimeoutMs: number
  logLevel: string
  apiKey?: string
  clientes: ClienteConfig[]
}

type Env = Record<string, string | undefined>

function numero(valor: string | undefined, fallback: number): number {
  const n = Number.parseInt(valor ?? "", 10)
  return Number.isFinite(n) ? n : fallback
}

function parsearClientes(raw: string | undefined): ClienteConfig[] {
  if (!raw || raw.trim() === "") {
    throw new Error("CLIENTES é obrigatório: defina um JSON com a lista de clientes.")
  }
  let bruto: unknown
  try {
    bruto = JSON.parse(raw)
  } catch {
    throw new Error("CLIENTES não é um JSON válido.")
  }
  if (!Array.isArray(bruto) || bruto.length === 0) {
    throw new Error("CLIENTES deve ser uma lista não-vazia.")
  }
  const ids = new Set<string>()
  return bruto.map((item) => {
    const c = (item ?? {}) as Record<string, unknown>
    const id = typeof c.id === "string" ? c.id.trim() : ""
    if (!id) throw new Error("CLIENTES: cada cliente precisa de um 'id'.")
    if (ids.has(id)) throw new Error(`CLIENTES: id duplicado '${id}'.`)
    ids.add(id)
    if (c.plataforma !== "moldsystems" && c.plataforma !== "kenlo") {
      throw new Error(`CLIENTES['${id}']: 'plataforma' deve ser 'moldsystems' ou 'kenlo'.`)
    }
    const origin = typeof c.origin === "string" ? c.origin.trim() : ""
    if (!origin) throw new Error(`CLIENTES['${id}']: 'origin' é obrigatório.`)
    const estrategia = c.estrategia === "api" ? "api" : "html"
    const solrNumRows = typeof c.solrNumRows === "number" ? c.solrNumRows : 5000
    const kenloSeeds = typeof c.kenloSeeds === "string" && c.kenloSeeds.trim() ? c.kenloSeeds.trim() : undefined
    const kenloMaxPaginas = typeof c.kenloMaxPaginas === "number" && c.kenloMaxPaginas > 0 ? c.kenloMaxPaginas : undefined
    return { id, plataforma: c.plataforma, estrategia, origin, solrNumRows, kenloSeeds, kenloMaxPaginas }
  })
}

export function carregarConfig(env: Env): Config {
  const apiKey = env.API_KEY?.trim()
  return {
    port: numero(env.PORT, 3000),
    host: env.HOST ?? "0.0.0.0",
    fetchTimeoutMs: numero(env.FETCH_TIMEOUT_MS, 8000),
    logLevel: env.LOG_LEVEL ?? "info",
    apiKey: apiKey ? apiKey : undefined,
    clientes: parsearClientes(env.CLIENTES),
  }
}
```

- [ ] **Step 4: Levar `src/main.ts` à forma final**

```ts
import { FastifyInstance } from "fastify"
import { carregarConfig, Config } from "./config"
import { criarRegistro } from "./fontes/registro-de-fontes"
import { criarServidor } from "./api/server"

export function construirApp(config: Config): FastifyInstance {
  const registro = criarRegistro(config.clientes, { fetchTimeoutMs: config.fetchTimeoutMs })
  return criarServidor(registro, config)
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

if (process.env.NODE_ENV !== "test") {
  iniciar().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
```

- [ ] **Step 5: Atualizar `src/main.test.ts`** (novo shape de config)

```ts
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
```

- [ ] **Step 6: Rodar a suíte inteira + typecheck (verde)**

Run: `npm test && npm run typecheck`
Expected: PASS (toda a suíte); typecheck sem erros.

- [ ] **Step 7: Commit**

```bash
git add src/config.ts src/config.test.ts src/main.ts src/main.test.ts
git commit -m "feat(scraper): Config multi-tenant via CLIENTES (JSON) — remove envs single-tenant"
```

---

### Task 5: Deploy & docs

Atualiza a config de ambiente (single-tenant → `CLIENTES`) e a doc.

**Files:**
- Modify: `.env.example`
- Modify: `.env` (host — para o scraper subir após o rebuild)
- Modify: `docs/API.md` (seção do scraper)

- [ ] **Step 1: Reescrever `.env.example`**

```
PORT=3000
HOST=0.0.0.0
FETCH_TIMEOUT_MS=8000
LOG_LEVEL=info
# Vazio = sem autenticação (rede interna/VPN). Preencher ativa o header x-api-key.
API_KEY=
# Registro multi-tenant: JSON com a lista de clientes que este scraper atende.
# Cada cliente: id, plataforma (moldsystems|kenlo), origin, + config da plataforma
# (solrNumRows p/ moldsystems; estrategia/kenloSeeds/kenloMaxPaginas p/ kenlo).
CLIENTES=[{"id":"innove","plataforma":"moldsystems","origin":"https://imobiliariainnove.com.br","solrNumRows":5000},{"id":"caires","plataforma":"kenlo","estrategia":"html","origin":"https://www.cairesengimob.com.br"}]
```

- [ ] **Step 2: Atualizar o `.env` do host** — remover `CLIENTE_ID/ORIGIN/PLATAFORMA/ESTRATEGIA/KENLO_SEEDS/MAX_PAGINAS/SOLR_NUM_ROWS` e adicionar a linha `CLIENTES=[...]` (mesmo conteúdo do `.env.example`). Sem isto o scraper não sobe após o rebuild (carregarConfig lança).

- [ ] **Step 3: Atualizar `docs/API.md`** — na seção do scraper:
  - Trocar a explicação do `?cliente=` como "guard (409)" por "obrigatório; ausente/desconhecido → **400** (`CLIENTE_OBRIGATORIO` / `CLIENTE_DESCONHECIDO`)".
  - Na tabela de erros, trocar a linha do `409` por `400 | cliente ausente/desconhecido`.
  - Anotar que a fonte de cada cliente é definida no env `CLIENTES` do scraper (não mais `CLIENTE_ID/ORIGIN/PLATAFORMA`).

- [ ] **Step 4: Commit**

```bash
git add .env.example docs/API.md
git commit -m "docs(scraper): config multi-tenant via CLIENTES + cliente obrigatório (400)"
```

> `.env` do host normalmente é gitignored — não entra no commit, mas precisa estar atualizado para o redeploy.

---

## Verificação final (pós-implementação)

- [ ] `npm test` (toda a suíte verde) e `npm run typecheck`.
- [ ] Redeploy: `docker compose up -d --build`.
- [ ] `curl "http://localhost:3000/imoveis?cliente=innove"` → dados innove.
- [ ] `curl "http://localhost:3000/imoveis?cliente=caires"` → dados caires (Kenlo), **não** mais 409/innove.
- [ ] `curl "http://localhost:3000/imoveis"` (sem cliente) → 400 `CLIENTE_OBRIGATORIO`.
- [ ] `curl "http://localhost:3000/imoveis?cliente=zzz"` → 400 `CLIENTE_DESCONHECIDO`.

## Self-review (feito)
- **Cobertura do spec:** config CLIENTES (T4) ✓ · fábrica por cliente (T1) ✓ · registro eager (T2) ✓ · server seleção + 400 (T3) ✓ · deploy/docs (T5) ✓ · cache-api inalterada (nada a fazer) ✓.
- **Placeholders:** nenhum — todo passo tem código/condição reais.
- **Consistência de tipos:** `ClienteConfig` (id, plataforma, estrategia, origin, solrNumRows, kenloSeeds?, kenloMaxPaginas?) e `criarFonte(cliente, infra)` / `criarRegistro(clientes, infra)` / `RegistroDeFontes.obter` / `criarServidor(registro, config)` usados de forma idêntica em todas as tasks.
