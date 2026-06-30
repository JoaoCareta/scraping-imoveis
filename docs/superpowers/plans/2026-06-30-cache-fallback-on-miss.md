# Fallback em cache-miss — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans para implementar. Steps usam checkbox (`- [ ]`).

**Goal:** Quando a busca filtrada no cache vier vazia, a cache-api cai pro scraper com os mesmos filtros (em vez de devolver 0).

**Architecture:** Uma mudança no handler `/imoveis` de `src/cache-api/server.ts`: só retornar o envelope `origem: "cache"` se `imoveis.length > 0`; senão, cair no `deps.fallback(...)` existente.

**Tech Stack:** TypeScript, Fastify, Vitest.

---

### Task 1: cair pro scraper quando a busca filtrada vem vazia

**Files:**
- Modify: `src/cache-api/server.ts` (handler `/imoveis`)
- Test: `src/cache-api/server.test.ts` (novo caso)

- [ ] **Step 1: Escrever o teste** — adicionar ao `describe("cache-api server", ...)` em `src/cache-api/server.test.ts`:

```ts
  it("cache populado mas 0 para os filtros → cai pro scraper com os filtros", async () => {
    let queryRepassada: Record<string, string> | undefined
    const app = criarCacheServer(
      deps({
        contar: async () => 500,          // o cliente TEM imóveis
        buscar: async () => [],            // mas 0 para estes filtros
        fallback: async (query) => {
          queryRepassada = query
          return { evento: "ColetaConcluida", origem: "scraper", total: 0, imoveis: [] }
        },
      }),
    )
    const res = await app.inject({ method: "GET", url: "/imoveis?cliente=caires&tipoImovel=casa" })
    expect(res.json().origem).toBe("scraper")        // NÃO veio do cache
    expect(queryRepassada?.cliente).toBe("caires")   // scraper recebeu o cliente
    expect(queryRepassada?.tipoImovel).toBe("casa")  // e os filtros
  })
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/cache-api/server.test.ts`
Expected: FAIL no novo caso (`origem` === "cache", `queryRepassada` undefined — hoje retorna do cache mesmo vazio).

- [ ] **Step 3: Implementar** — em `src/cache-api/server.ts`, no handler `/imoveis`, envolver o retorno do cache num `if (imoveis.length > 0)`:

Trocar:
```ts
        const imoveis = await deps.buscar(filtros)
        return {
          evento: "ColetaConcluida",
          origem: "cache",
          total: imoveis.length,
          limit: filtros.limit,
          imoveis,
        }
```
Por:
```ts
        const imoveis = await deps.buscar(filtros)
        if (imoveis.length > 0) {
          return {
            evento: "ColetaConcluida",
            origem: "cache",
            total: imoveis.length,
            limit: filtros.limit,
            imoveis,
          }
        }
        // cache populado mas 0 para estes filtros → cai pro fallback (scraper) com os filtros
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/cache-api/server.test.ts && npm run typecheck`
Expected: PASS (todos, incluindo o novo); typecheck limpo.

- [ ] **Step 5: Commit**

```bash
git add src/cache-api/server.ts src/cache-api/server.test.ts
git commit -m "feat(cache): cai pro scraper quando a busca filtrada vem vazia (cache-miss)"
```

---

## Verificação final
- [ ] `npm test` verde.
- [ ] Redeploy (junto com os seeds simplificados do item 1): `docker compose up -d --build`.
- [ ] Buscar um tipo fora do warm-up (ex.: `?cliente=caires&tipoImovel=sala`) → não devolve "0 do cache"; cai pro scraper (mais lento, mas traz/realmente confirma 0 da fonte).
- [ ] `?cliente=caires&tipoImovel=casa` → continua rápido (origem cache).

## Self-review (feito)
- Cobertura do spec: gate por `imoveis.length` ✓; fallback com filtros (já passa `{...q, cliente}`) ✓; sem write-through ✓.
- Regressão: testes existentes com `contar=5, buscar=[]` capturam filtros ANTES do retorno e checam status 200 (o fallback também dá 200) — não quebram.
- Sem placeholders.
