# Características de imóveis — captura rica e busca por comodidades — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capturar todas as características dos imóveis da fonte MoldSystems/Innove (elevador, sacada, piscina, etc.), modelá-las de forma rica no domínio e torná-las pesquisáveis por presença no cache.

**Architecture:** Um dicionário gerado `idt → {chave, rótulo}` (exclusivo do site) resolve os números do Solr em rótulos; um mapa curado de grupos junta variantes ("elevador" ← social/serviço). O mapeador classifica cada característica em booleana/numérica/texto e cria Value Objects `Caracteristica`. O read-model expõe `itens` (rico, sem perda) e `comodidades` (slugs+grupos das booleanas verdadeiras) dentro do `payload` JSONB; a busca no cache filtra por presença com índice GIN em expressão JSONB (`@>`) — sem alterar o upsert do n8n.

**Tech Stack:** TypeScript, Vitest, Fastify, PostgreSQL (JSONB + GIN), padrão Result para VOs.

**Desvio consciente do spec:** o spec propôs coluna denormalizada `comodidades TEXT[]`. Como nenhuma escrita à tabela `imovel` acontece neste repo (o upsert é do n8n), populá-la exigiria mudar o n8n. Em vez disso, `comodidades` vai **no payload** e o índice GIN é em expressão JSONB. Mesmo resultado de busca por presença, 100% dentro deste repo.

---

## File Structure

- **Create:** `scripts/gerar-dicionario-caracteristicas.mjs` — gerador que busca a home, extrai `allCharacteristics` e emite o dicionário.
- **Create:** `src/fontes/moldsystems/caracteristicas-dicionario.ts` — dicionário gerado (`ROTULOS`) + grupos curados (`GRUPOS`) + `resolverCaracteristica()`.
- **Create:** `src/fontes/moldsystems/caracteristicas-dicionario.test.ts` — testes do resolver e dos grupos.
- **Create:** `src/domain/imovel/caracteristica.ts` — Value Object `Caracteristica`.
- **Create:** `src/domain/imovel/caracteristica.test.ts` — testes do VO.
- **Create:** `src/fontes/moldsystems/fixtures/imovel-3339.ts` — fixture real de apartamento rico (42 características).
- **Modify:** `src/domain/imovel/tipos.ts` — `Caracteristicas` ganha `itens`.
- **Modify:** `src/domain/leitura/recurso-imovel.ts` — read-model ganha `itens` + `comodidades`.
- **Modify:** `src/fontes/moldsystems/solr-mapper.ts` — extrai `itens`, deriva `lista`, inclui características no hash.
- **Modify:** `src/fontes/moldsystems/solr-mapper.test.ts` — cobre características.
- **Modify:** `src/cache-api/imovel-cache.ts` — filtro `comodidades`.
- **Modify:** `src/cache-api/imovel-cache.test.ts` — testes do filtro.
- **Modify:** `db/schema.sql` — índice GIN em `payload->'caracteristicas'->'comodidades'`.

---

## Task 1: Value Object `Caracteristica`

**Files:**
- Create: `src/domain/imovel/caracteristica.ts`
- Test: `src/domain/imovel/caracteristica.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/domain/imovel/caracteristica.test.ts
import { describe, it, expect } from "vitest"
import { Caracteristica } from "./caracteristica"

describe("Caracteristica", () => {
  it("cria booleana com valorBool", () => {
    const r = Caracteristica.criar({
      idtFonte: 97, chave: "elevador-social", rotulo: "Elevador Social",
      grupo: "elevador", tipo: "BOOLEANA", valorBool: true,
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.chave).toBe("elevador-social")
      expect(r.value.grupo).toBe("elevador")
      expect(r.value.valorBool).toBe(true)
    }
  })

  it("cria numérica com valorNum (preserva quantidade)", () => {
    const r = Caracteristica.criar({
      idtFonte: 96, chave: "elevador-de-servico", rotulo: "Elevador de Serviço",
      tipo: "NUMERICA", valorNum: 2,
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.valorNum).toBe(2)
  })

  it("cria texto com valorTexto", () => {
    const r = Caracteristica.criar({
      idtFonte: 24, chave: "padrao-de-acabamento", rotulo: "Padrão de acabamento",
      tipo: "TEXTO", valorTexto: "Alto",
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.valorTexto).toBe("Alto")
  })

  it("rejeita chave vazia", () => {
    const r = Caracteristica.criar({
      idtFonte: 1, chave: "  ", rotulo: "X", tipo: "BOOLEANA", valorBool: true,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.campo).toBe("chave")
  })

  it("rejeita rótulo vazio", () => {
    const r = Caracteristica.criar({
      idtFonte: 1, chave: "x", rotulo: "  ", tipo: "BOOLEANA", valorBool: true,
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.campo).toBe("rotulo")
  })

  it("rejeita booleana sem valorBool", () => {
    const r = Caracteristica.criar({ idtFonte: 1, chave: "x", rotulo: "X", tipo: "BOOLEANA" })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.campo).toBe("valor")
  })

  it("rejeita numérica sem valorNum finito", () => {
    const r = Caracteristica.criar({ idtFonte: 1, chave: "x", rotulo: "X", tipo: "NUMERICA" })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.campo).toBe("valor")
  })

  it("rejeita texto sem valorTexto", () => {
    const r = Caracteristica.criar({ idtFonte: 1, chave: "x", rotulo: "X", tipo: "TEXTO", valorTexto: "  " })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.campo).toBe("valor")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/domain/imovel/caracteristica.test.ts`
Expected: FAIL — `Cannot find module './caracteristica'`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/domain/imovel/caracteristica.ts
import { Result, ok, err } from "../../shared/result"
import { ErroValidacao, erroValidacao } from "./erro-validacao"

export type TipoCaracteristica = "BOOLEANA" | "NUMERICA" | "TEXTO"

export interface PropsCaracteristica {
  idtFonte: number
  chave: string
  rotulo: string
  grupo?: string
  tipo: TipoCaracteristica
  valorBool?: boolean
  valorNum?: number
  valorTexto?: string
}

export class Caracteristica {
  private constructor(
    readonly idtFonte: number,
    readonly chave: string,
    readonly rotulo: string,
    readonly grupo: string | undefined,
    readonly tipo: TipoCaracteristica,
    readonly valorBool: boolean | undefined,
    readonly valorNum: number | undefined,
    readonly valorTexto: string | undefined,
  ) {}

  static criar(props: PropsCaracteristica): Result<Caracteristica, ErroValidacao> {
    const chave = (props.chave ?? "").trim()
    if (chave.length === 0) return err(erroValidacao("chave", "chave é obrigatória"))

    const rotulo = (props.rotulo ?? "").trim()
    if (rotulo.length === 0) return err(erroValidacao("rotulo", "rotulo é obrigatório"))

    if (props.tipo === "BOOLEANA" && typeof props.valorBool !== "boolean") {
      return err(erroValidacao("valor", "BOOLEANA requer valorBool"))
    }
    if (props.tipo === "NUMERICA" && !Number.isFinite(props.valorNum)) {
      return err(erroValidacao("valor", "NUMERICA requer valorNum finito"))
    }
    const texto = (props.valorTexto ?? "").trim()
    if (props.tipo === "TEXTO" && texto.length === 0) {
      return err(erroValidacao("valor", "TEXTO requer valorTexto não-vazio"))
    }

    const grupo = (props.grupo ?? "").trim()
    return ok(
      new Caracteristica(
        props.idtFonte,
        chave,
        rotulo,
        grupo.length === 0 ? undefined : grupo,
        props.tipo,
        props.tipo === "BOOLEANA" ? props.valorBool : undefined,
        props.tipo === "NUMERICA" ? props.valorNum : undefined,
        props.tipo === "TEXTO" ? texto : undefined,
      ),
    )
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/domain/imovel/caracteristica.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add src/domain/imovel/caracteristica.ts src/domain/imovel/caracteristica.test.ts
git commit -m "feat(domain): add Caracteristica value object"
```

---

## Task 2: Gerador do dicionário de características

**Files:**
- Create: `scripts/gerar-dicionario-caracteristicas.mjs`
- Create (gerado): `src/fontes/moldsystems/caracteristicas-dicionario.ts`

Este task produz dados gerados (625 entradas) — sem teste unitário; o teste do resolver vem no Task 3.

- [ ] **Step 1: Write the generator script**

```js
// scripts/gerar-dicionario-caracteristicas.mjs
// Busca a home da Innove, extrai o array allCharacteristics e emite o dicionário TS.
// Uso: node scripts/gerar-dicionario-caracteristicas.mjs
import { writeFileSync } from "node:fs"

const ORIGIN = process.env.ORIGIN ?? "https://imobiliariainnove.com.br"
const SAIDA = "src/fontes/moldsystems/caracteristicas-dicionario.ts"
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
}

function slug(s) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function extrairArray(html, marcador) {
  const start = html.indexOf(marcador)
  if (start < 0) throw new Error(`marcador ausente: ${marcador}`)
  let i = html.indexOf("[", start + marcador.length)
  let depth = 0
  for (let k = i; k < html.length; k++) {
    const ch = html[k]
    if (ch === "[") depth++
    else if (ch === "]") {
      depth--
      if (depth === 0) return JSON.parse(html.slice(i, k + 1))
    }
  }
  throw new Error("array não fechou")
}

const html = await (await fetch(ORIGIN + "/", { headers: HEADERS })).text()
const arr = extrairArray(html, '"allCharacteristics":')

const linhas = arr
  .filter((c) => c.idtCharacteristics != null && c.desCharacteristics)
  .sort((a, b) => a.idtCharacteristics - b.idtCharacteristics)
  .map((c) => {
    const rotulo = String(c.desCharacteristics).replace(/"/g, '\\"')
    return `  ${c.idtCharacteristics}: { chave: "${slug(c.desCharacteristics)}", rotulo: "${rotulo}" },`
  })
  .join("\n")

const conteudo = `// GERADO por scripts/gerar-dicionario-caracteristicas.mjs — não editar à mão.
// Dicionário de características EXCLUSIVO da MoldSystems/Innove (${arr.length} entradas).
export interface EntradaDicionario {
  chave: string
  rotulo: string
}

export const ROTULOS: Record<number, EntradaDicionario> = {
${linhas}
}
`

writeFileSync(SAIDA, conteudo)
console.log(`escrito ${SAIDA} com ${arr.length} entradas`)
```

- [ ] **Step 2: Run the generator**

Run: `node scripts/gerar-dicionario-caracteristicas.mjs`
Expected: `escrito src/fontes/moldsystems/caracteristicas-dicionario.ts com 625 entradas` (o número pode variar se o site mudou)

- [ ] **Step 3: Verify the generated file compiles**

Run: `npx tsc --noEmit`
Expected: sem erros relacionados ao novo arquivo

- [ ] **Step 4: Commit**

```bash
git add scripts/gerar-dicionario-caracteristicas.mjs src/fontes/moldsystems/caracteristicas-dicionario.ts
git commit -m "feat(moldsystems): generate site-specific characteristics dictionary"
```

---

## Task 3: Grupos curados + resolver

**Files:**
- Modify: `src/fontes/moldsystems/caracteristicas-dicionario.ts` (acrescentar `GRUPOS` + `resolverCaracteristica`, mantendo `ROTULOS` gerado)
- Test: `src/fontes/moldsystems/caracteristicas-dicionario.test.ts`

> Nota: `GRUPOS` e `resolverCaracteristica` ficam num bloco **abaixo** do `ROTULOS` gerado. Como o gerador sobrescreve o arquivo inteiro, mover esse bloco para um arquivo separado é mais seguro a longo prazo — mas para manter a importação única, este plano adiciona ao mesmo arquivo e o gerador (Task 2) só reescreve até o `ROTULOS`. Para evitar conflito, o gerador deve preservar o trecho curado: **alterar o gerador para concatenar o bloco curado fixo** (ver Step 4).

- [ ] **Step 1: Write the failing test**

```ts
// src/fontes/moldsystems/caracteristicas-dicionario.test.ts
import { describe, it, expect } from "vitest"
import { resolverCaracteristica } from "./caracteristicas-dicionario"

describe("resolverCaracteristica", () => {
  it("resolve idt conhecido com rótulo", () => {
    const e = resolverCaracteristica(235)
    expect(e?.rotulo).toBe("Sacada")
    expect(e?.chave).toBe("sacada")
  })

  it("anexa grupo curado para variantes de elevador", () => {
    expect(resolverCaracteristica(97)?.grupo).toBe("elevador") // Elevador Social
    expect(resolverCaracteristica(96)?.grupo).toBe("elevador") // Elevador de Serviço
    expect(resolverCaracteristica(592)?.grupo).toBe("elevador") // Elevadores
  })

  it("devolve undefined para idt desconhecido", () => {
    expect(resolverCaracteristica(999999)).toBeUndefined()
  })

  it("característica sem grupo curado vem sem grupo", () => {
    const e = resolverCaracteristica(27) // Mobília — fora de qualquer grupo
    expect(e).toBeDefined()
    expect(e?.grupo).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/fontes/moldsystems/caracteristicas-dicionario.test.ts`
Expected: FAIL — `resolverCaracteristica is not a function` / não exportado

- [ ] **Step 3: Add curated groups and resolver to the dictionary file**

Acrescentar ao final de `src/fontes/moldsystems/caracteristicas-dicionario.ts` (após a constante `ROTULOS`):

```ts
// ---- Curado à mão (preservado pelo gerador) ----
export interface CaracteristicaResolvida {
  chave: string
  rotulo: string
  grupo?: string
}

// Agrupa variantes finas num conceito pesquisável. Incremental — começa por apartamentos.
export const GRUPOS: Record<number, string> = {
  97: "elevador",   // Elevador Social
  96: "elevador",   // Elevador de Serviço
  592: "elevador",  // Elevadores
  15: "piscina",    // Piscina
  571: "piscina",   // Piscina adulto
  73: "piscina",    // Piscina infantil
  572: "piscina",   // Piscina adulto com borda infinita
  496: "churrasqueira", // Churrasqueira
  17: "churrasqueira",  // Churrasqueiras
  615: "churrasqueira", // Sacada com churrasqueira
  235: "sacada",    // Sacada
  283: "sacada",    // Varanda
  85: "sacada",     // Varanda Gourmet
  76: "portaria",   // Portaria 24 Hrs
  312: "portaria",  // Portaria Digital
  204: "portaria",  // Portaria virtual
  515: "portaria",  // Portaria com reconhecimento facial
}

export function resolverCaracteristica(idt: number): CaracteristicaResolvida | undefined {
  const base = ROTULOS[idt]
  if (!base) return undefined
  const grupo = GRUPOS[idt]
  return grupo ? { ...base, grupo } : { ...base }
}
```

- [ ] **Step 4: Update the generator to preserve the curated block**

Editar `scripts/gerar-dicionario-caracteristicas.mjs`: substituir o trecho final que monta `conteudo` para **anexar** o bloco curado fixo após o `ROTULOS`, de modo que regenerar não apague os grupos:

```js
const BLOCO_CURADO = `
// ---- Curado à mão (preservado pelo gerador) ----
export interface CaracteristicaResolvida {
  chave: string
  rotulo: string
  grupo?: string
}

export const GRUPOS: Record<number, string> = {
  97: "elevador", 96: "elevador", 592: "elevador",
  15: "piscina", 571: "piscina", 73: "piscina", 572: "piscina",
  496: "churrasqueira", 17: "churrasqueira", 615: "churrasqueira",
  235: "sacada", 283: "sacada", 85: "sacada",
  76: "portaria", 312: "portaria", 204: "portaria", 515: "portaria",
}

export function resolverCaracteristica(idt: number): CaracteristicaResolvida | undefined {
  const base = ROTULOS[idt]
  if (!base) return undefined
  const grupo = GRUPOS[idt]
  return grupo ? { ...base, grupo } : { ...base }
}
`

const conteudo = `// GERADO por scripts/gerar-dicionario-caracteristicas.mjs — não editar à mão.
// Dicionário de características EXCLUSIVO da MoldSystems/Innove (${arr.length} entradas).
export interface EntradaDicionario {
  chave: string
  rotulo: string
}

export const ROTULOS: Record<number, EntradaDicionario> = {
${linhas}
}
${BLOCO_CURADO}`
```

> Importante: manter o `GRUPOS` em **uma única definição**. Como o Step 3 já adicionou o bloco curado ao arquivo e o Step 4 faz o gerador reescrever o arquivo inteiro com esse mesmo bloco, não haverá duplicação após a próxima regeneração. Não rodar o gerador entre Step 3 e Step 4.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/fontes/moldsystems/caracteristicas-dicionario.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add src/fontes/moldsystems/caracteristicas-dicionario.ts src/fontes/moldsystems/caracteristicas-dicionario.test.ts scripts/gerar-dicionario-caracteristicas.mjs
git commit -m "feat(moldsystems): curated characteristic groups and resolver"
```

---

## Task 4: `Caracteristicas` ganha `itens`

**Files:**
- Modify: `src/domain/imovel/tipos.ts`

- [ ] **Step 1: Add the field**

Em `src/domain/imovel/tipos.ts`, importar o VO e acrescentar `itens` à interface:

```ts
import { Caracteristica } from "./caracteristica"

export interface Caracteristicas {
  readonly tipoImovel?: string
  readonly tipologia?: string
  readonly areaM2?: number
  readonly quartos?: number
  readonly casasBanho?: number
  readonly lista: readonly string[]
  readonly itens: readonly Caracteristica[]
}
```

- [ ] **Step 2: Verify the whole project still type-checks (expect errors to fix next)**

Run: `npx tsc --noEmit`
Expected: erros em `solr-mapper.ts` (não passa `itens`) — serão corrigidos no Task 6. Nenhum erro em `tipos.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/domain/imovel/tipos.ts
git commit -m "feat(domain): add itens to Caracteristicas"
```

---

## Task 5: Fixture de apartamento rico

**Files:**
- Create: `src/fontes/moldsystems/fixtures/imovel-3339.ts`

- [ ] **Step 1: Create the fixture (recorte real do Solr)**

```ts
// src/fontes/moldsystems/fixtures/imovel-3339.ts
import { MoldSystemsSolrDoc } from "../solr-doc"

// Documento Solr REAL (apartamento rico em Araçatuba) — campos relevantes ao mapeamento.
export const imovel3339: MoldSystemsSolrDoc = {
  idtProperty: 3339,
  indType: "V",
  indStatus: 1,
  indBusy: 0,
  flgShowSite: true,
  valSales: 350000,
  totalRooms: 3,
  totalGarages: 2,
  namCategory: "Apartamentos",
  namSubCategory: "Padrão",
  namDistrict: "Centro",
  namCity: "Araçatuba",
  namState: "São Paulo",
  fullAddress: "Residencial Madri, Centro, Araçatuba",
  desUriLandingPage: "residencial-madri",
  desResumeCharacteristics: "3 dormitórios, 2 total de banheiros, 2 garagens, Área útil 90,00 m²",
  jsonPhotos: "[]",
  // idt 97 Elevador Social (qtd 2), 96 Elevador de Serviço ("Sim"), 235 Sacada ("Sim"),
  // 15 Piscina ("Sim"), 24 Padrão ("Alto"), 95 Área útil (numérica), 9 Copas ("0"),
  // 160 Observação garagens (texto longo).
  jsonCharacteristics: JSON.stringify([
    { desInformation: "2", desInformationFormatted: "2,00", characteristics: { idtCharacteristics: 97 } },
    { desInformation: "Sim", desInformationFormatted: "Sim", characteristics: { idtCharacteristics: 96 } },
    { desInformation: "Sim", desInformationFormatted: "Sim", characteristics: { idtCharacteristics: 235 } },
    { desInformation: "Sim", desInformationFormatted: "Sim", characteristics: { idtCharacteristics: 15 } },
    { desInformation: "Alto", desInformationFormatted: "Alto", characteristics: { idtCharacteristics: 24 } },
    { desInformation: "90.00", desInformationFormatted: "90,00 m²", characteristics: { idtCharacteristics: 95 } },
    { desInformation: "0", desInformationFormatted: "0", characteristics: { idtCharacteristics: 9 } },
    { desInformation: "terreo ", desInformationFormatted: "terreo ", characteristics: { idtCharacteristics: 160 } },
    { desInformation: "Sim", desInformationFormatted: "Sim", characteristics: { idtCharacteristics: 9999999 } },
  ]),
  dtaUpdate: "2026-05-07T10:22:58Z",
  idtTenant: "516",
}
```

- [ ] **Step 2: Commit**

```bash
git add src/fontes/moldsystems/fixtures/imovel-3339.ts
git commit -m "test(moldsystems): add rich apartment fixture (3339)"
```

---

## Task 6: Mapeamento de características no `solr-mapper`

**Files:**
- Modify: `src/fontes/moldsystems/solr-mapper.ts`
- Modify: `src/fontes/moldsystems/solr-mapper.test.ts`

- [ ] **Step 1: Write the failing tests**

Acrescentar ao `src/fontes/moldsystems/solr-mapper.test.ts` (e importar a fixture nova no topo):

```ts
import { imovel3339 } from "./fixtures/imovel-3339"
```

```ts
describe("caracteristicasItensDeDoc", () => {
  it("classifica booleana 'Sim' e anexa grupo", () => {
    const c = caracteristicasDeDoc(imovel3339)
    const sacada = c.itens.find((i) => i.chave === "sacada")
    expect(sacada?.tipo).toBe("BOOLEANA")
    expect(sacada?.valorBool).toBe(true)
    expect(sacada?.grupo).toBe("sacada")
  })

  it("preserva quantidade de elevadores como numérica", () => {
    const c = caracteristicasDeDoc(imovel3339)
    const elevador = c.itens.find((i) => i.chave === "elevador-social")
    expect(elevador?.tipo).toBe("NUMERICA")
    expect(elevador?.valorNum).toBe(2)
    expect(elevador?.grupo).toBe("elevador")
  })

  it("classifica categórica como texto", () => {
    const c = caracteristicasDeDoc(imovel3339)
    const padrao = c.itens.find((i) => i.chave === "padrao-de-acabamento")
    expect(padrao?.tipo).toBe("TEXTO")
    expect(padrao?.valorTexto).toBe("Alto")
  })

  it("ignora idt fora do dicionário", () => {
    const c = caracteristicasDeDoc(imovel3339)
    expect(c.itens.some((i) => i.idtFonte === 9999999)).toBe(false)
  })

  it("numérica zero não entra na lista de comodidades, mas fica em itens", () => {
    const c = caracteristicasDeDoc(imovel3339)
    const copas = c.itens.find((i) => i.idtFonte === 9)
    expect(copas?.tipo).toBe("NUMERICA")
    expect(copas?.valorNum).toBe(0)
  })

  it("lista deriva os rótulos das booleanas verdadeiras", () => {
    const c = caracteristicasDeDoc(imovel3339)
    expect(c.lista).toContain("Sacada")
    expect(c.lista).toContain("Piscina")
    expect(c.lista).toContain("Elevador de Serviço")
    // elevador-social é NUMERICA (qtd 2), não booleana → não entra na lista
    expect(c.lista).not.toContain("Elevador Social")
  })

  it("imovel1910 (sem booleanas verdadeiras) mantém lista vazia", () => {
    expect(caracteristicasDeDoc(imovel1910).lista).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/fontes/moldsystems/solr-mapper.test.ts`
Expected: FAIL — `c.itens` é `undefined` / não existe

- [ ] **Step 3: Implement the mapping**

Em `src/fontes/moldsystems/solr-mapper.ts`:

(a) Adicionar imports no topo:

```ts
import { Caracteristica } from "../../domain/imovel/caracteristica"
import { resolverCaracteristica } from "./caracteristicas-dicionario"
```

(b) Adicionar a função de classificação + extração (perto de `caracteristicasDeDoc`):

```ts
function ehSim(v: string): boolean {
  return /^sim$/i.test(v.trim())
}
function ehNao(v: string): boolean {
  return /^n[ãa]o$/i.test(v.trim())
}
function ehNumerico(v: string): boolean {
  return /^[\d.,]+$/.test(v.trim())
}

export function caracteristicasItensDeDoc(doc: MoldSystemsSolrDoc): Caracteristica[] {
  const out: Caracteristica[] = []
  for (const c of lerChars(doc)) {
    const idt = c.characteristics?.idtCharacteristics
    if (idt == null) continue
    const dic = resolverCaracteristica(idt)
    if (!dic) continue // idt fora do dicionário do site → ignora

    const bruto = (c.desInformation ?? c.desInformationFormatted ?? "").trim()
    let r
    if (ehSim(bruto) || ehNao(bruto)) {
      r = Caracteristica.criar({ idtFonte: idt, chave: dic.chave, rotulo: dic.rotulo, grupo: dic.grupo, tipo: "BOOLEANA", valorBool: ehSim(bruto) })
    } else if (ehNumerico(bruto)) {
      const n = parsearNumeroBr(c.desInformationFormatted ?? bruto) ?? Number.parseFloat(bruto)
      if (!Number.isFinite(n)) continue
      r = Caracteristica.criar({ idtFonte: idt, chave: dic.chave, rotulo: dic.rotulo, grupo: dic.grupo, tipo: "NUMERICA", valorNum: n })
    } else {
      if (bruto.length === 0) continue
      r = Caracteristica.criar({ idtFonte: idt, chave: dic.chave, rotulo: dic.rotulo, grupo: dic.grupo, tipo: "TEXTO", valorTexto: bruto })
    }
    if (r.ok) out.push(r.value)
  }
  return out
}
```

(c) Atualizar `caracteristicasDeDoc` para incluir `itens` e derivar `lista`:

```ts
export function caracteristicasDeDoc(doc: MoldSystemsSolrDoc): Caracteristicas {
  const itens = caracteristicasItensDeDoc(doc)
  const lista = itens
    .filter((i) => i.tipo === "BOOLEANA" && i.valorBool === true)
    .map((i) => i.rotulo)
  return {
    tipoImovel: tipoSingular(doc.namCategory),
    tipologia: doc.namSubCategory,
    areaM2: areaDeDoc(doc),
    quartos: typeof doc.totalRooms === "number" ? doc.totalRooms : undefined,
    casasBanho: banheirosDeDoc(doc),
    lista,
    itens,
  }
}
```

(d) Incluir características no `hashDeDoc` — acrescentar `doc.jsonCharacteristics` ao array antes do `.map`:

```ts
function hashDeDoc(doc: MoldSystemsSolrDoc): string {
  return [
    doc.valLocation, doc.valSales, doc.valCondominium, doc.valMonthIptu,
    doc.totalRooms, doc.totalGarages, doc.namCategory, doc.namSubCategory,
    doc.namDistrict, doc.namCity, doc.namState, doc.flgShowSite, doc.indBusy,
    doc.indStatus, doc.dtaUpdate, doc.jsonCharacteristics,
  ].map((v) => String(v ?? "")).join("|")
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/fontes/moldsystems/solr-mapper.test.ts`
Expected: PASS (todos, incluindo os antigos — `caracteristicasDeDoc(imovel1910).lista` segue `[]`)

- [ ] **Step 5: Commit**

```bash
git add src/fontes/moldsystems/solr-mapper.ts src/fontes/moldsystems/solr-mapper.test.ts
git commit -m "feat(moldsystems): map all characteristics into rich itens"
```

---

## Task 7: Read-model expõe `itens` + `comodidades`

**Files:**
- Modify: `src/domain/leitura/recurso-imovel.ts`

- [ ] **Step 1: Write the failing test**

Criar `src/domain/leitura/recurso-imovel.caracteristicas.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { imovelParaRecurso } from "./recurso-imovel"
import { imoveisDeSolrDoc } from "../../fontes/moldsystems/solr-mapper"
import { imovel3339 } from "../../fontes/moldsystems/fixtures/imovel-3339"

const CTX = { clienteId: "innove", origin: "https://imobiliariainnove.com.br", extraidoEm: "2026-06-28T12:00:00.000Z" }

describe("recurso-imovel — características", () => {
  it("expõe itens e comodidades (slugs + grupos das booleanas verdadeiras)", () => {
    const r = imoveisDeSolrDoc(imovel3339, CTX).find((x) => x.ok)
    expect(r?.ok).toBe(true)
    if (!r || !r.ok) return
    const rec = imovelParaRecurso(r.value)

    // itens ricos presentes
    expect(rec.caracteristicas.itens.length).toBeGreaterThan(0)
    const sacada = rec.caracteristicas.itens.find((i) => i.chave === "sacada")
    expect(sacada?.valorBool).toBe(true)

    // comodidades: slugs + grupos das booleanas verdadeiras (sacada, piscina, elevador-de-servico + grupos)
    expect(rec.caracteristicas.comodidades).toContain("sacada")
    expect(rec.caracteristicas.comodidades).toContain("piscina")
    expect(rec.caracteristicas.comodidades).toContain("elevador-de-servico")
    expect(rec.caracteristicas.comodidades).toContain("elevador") // grupo
    // sem duplicatas
    const set = new Set(rec.caracteristicas.comodidades)
    expect(set.size).toBe(rec.caracteristicas.comodidades.length)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/domain/leitura/recurso-imovel.caracteristicas.test.ts`
Expected: FAIL — `comodidades` é `undefined`

- [ ] **Step 3: Update the read-model**

Em `src/domain/leitura/recurso-imovel.ts`:

(a) Estender o tipo `caracteristicas` da interface `RecursoImovel`:

```ts
  caracteristicas: {
    tipoImovel?: string
    tipologia?: string
    areaM2?: number
    quartos?: number
    casasBanho?: number
    lista: string[]
    itens: Array<{
      idtFonte: number
      chave: string
      rotulo: string
      grupo?: string
      tipo: "BOOLEANA" | "NUMERICA" | "TEXTO"
      valorBool?: boolean
      valorNum?: number
      valorTexto?: string
    }>
    comodidades: string[]
  }
```

(b) Preencher em `imovelParaRecurso` — substituir o bloco `caracteristicas: { ... }`:

```ts
    caracteristicas: (() => {
      const itens = imovel.caracteristicas.itens.map((i) => ({
        idtFonte: i.idtFonte,
        chave: i.chave,
        rotulo: i.rotulo,
        grupo: i.grupo,
        tipo: i.tipo,
        valorBool: i.valorBool,
        valorNum: i.valorNum,
        valorTexto: i.valorTexto,
      }))
      const comodidades = [
        ...new Set(
          itens
            .filter((i) => i.tipo === "BOOLEANA" && i.valorBool === true)
            .flatMap((i) => (i.grupo ? [i.chave, i.grupo] : [i.chave])),
        ),
      ]
      return {
        tipoImovel: imovel.caracteristicas.tipoImovel,
        tipologia: imovel.caracteristicas.tipologia,
        areaM2: imovel.caracteristicas.areaM2,
        quartos: imovel.caracteristicas.quartos,
        casasBanho: imovel.caracteristicas.casasBanho,
        lista: [...imovel.caracteristicas.lista],
        itens,
        comodidades,
      }
    })(),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/domain/leitura/recurso-imovel.caracteristicas.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/domain/leitura/recurso-imovel.ts src/domain/leitura/recurso-imovel.caracteristicas.test.ts
git commit -m "feat(read-model): expose itens and comodidades on RecursoImovel"
```

---

## Task 8: Filtro `comodidades` na busca do cache

**Files:**
- Modify: `src/cache-api/imovel-cache.ts`
- Modify: `src/cache-api/imovel-cache.test.ts`

- [ ] **Step 1: Write the failing tests**

Acrescentar ao `src/cache-api/imovel-cache.test.ts`:

```ts
it("buscarNoCache aplica comodidades como JSONB containment", async () => {
  let capturado: unknown[] = []
  const consulta: Consulta = async (_sql, params) => {
    capturado = params
    return { rows: [] }
  }
  await buscarNoCache(consulta, { comodidades: ["elevador", "sacada"], limit: 10 })
  // comodidades vira o penúltimo parâmetro (antes do limit) como JSON array string
  expect(capturado[7]).toBe(JSON.stringify(["elevador", "sacada"]))
  expect(capturado[8]).toBe(10)
})

it("buscarNoCache ignora comodidades vazias ou coringas (NULL)", async () => {
  let capturado: unknown[] = []
  const consulta: Consulta = async (_sql, params) => {
    capturado = params
    return { rows: [] }
  }
  await buscarNoCache(consulta, { comodidades: ["qualquer", "  "], limit: 5 })
  expect(capturado[7]).toBeNull()
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/cache-api/imovel-cache.test.ts`
Expected: FAIL — `capturado[7]` é `10` (hoje limit é o 8º parâmetro), não o JSON

- [ ] **Step 3: Implement the filter**

Em `src/cache-api/imovel-cache.ts`:

(a) Adicionar `comodidades` à interface:

```ts
export interface FiltrosCache {
  finalidade?: string
  tipoImovel?: string
  quartos?: number
  precoMin?: number
  precoMax?: number
  cidade?: string
  bairro?: string
  comodidades?: string[]
  limit: number
}
```

(b) Atualizar `SQL_BUSCA` — inserir a cláusula antes de `AND ativo = true`, e mover o `LIMIT` para `$9`:

```ts
const SQL_BUSCA = `SELECT payload FROM imovel
WHERE ($1::text IS NULL OR finalidade = $1)
  AND ($2::text IS NULL OR tipo_imovel = $2)
  AND ($3::int IS NULL OR quartos = $3)
  AND ($4::numeric IS NULL OR preco >= $4)
  AND ($5::numeric IS NULL OR preco <= $5)
  AND ($6::text IS NULL OR unaccent(lower(cidade)) = unaccent(lower($6)))
  AND ($7::text IS NULL OR unaccent(lower(bairro)) = unaccent(lower($7)))
  AND ($8::jsonb IS NULL OR payload->'caracteristicas'->'comodidades' @> $8::jsonb)
  AND ativo = true
ORDER BY preco ASC NULLS LAST
LIMIT $9`
```

(c) Adicionar um normalizador de comodidades e incluir no `params`:

```ts
function comodidadesFiltro(valores?: string[]): string | null {
  if (!valores) return null
  const limpas = valores.map((v) => (v ?? "").trim()).filter((v) => v.length > 0 && !ehSemPreferencia(v))
  return limpas.length === 0 ? null : JSON.stringify(limpas)
}
```

E no `buscarNoCache`, montar `params` nesta ordem:

```ts
  const params: unknown[] = [
    semFiltro(f.finalidade),
    semFiltro(f.tipoImovel),
    f.quartos ?? null,
    f.precoMin ?? null,
    f.precoMax ?? null,
    semFiltro(f.cidade),
    semFiltro(f.bairro),
    comodidadesFiltro(f.comodidades),
    f.limit,
  ]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/cache-api/imovel-cache.test.ts`
Expected: PASS (todos — os testes antigos de ordem `capturado[7]=bairro NULL`, `capturado[7 → agora 8]=limit` precisam continuar coerentes; o teste antigo "passa coringas como NULL" checava `capturado[7]` (limit) — **ajustar esse teste** para `capturado[8]` no limit; ver Step 5)

- [ ] **Step 5: Fix the pre-existing order assertion**

No teste antigo `"buscarNoCache passa coringas como NULL (sem filtro)"`, o `limit` deixou de ser `capturado[7]` e passou a `capturado[8]`. Ajustar:

```ts
    expect(capturado[6]).toBeNull()   // bairro
    expect(capturado[7]).toBeNull()   // comodidades (ausente → NULL)
    expect(capturado[8]).toBe(10)     // limit
```

Run: `npx vitest run src/cache-api/imovel-cache.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/cache-api/imovel-cache.ts src/cache-api/imovel-cache.test.ts
git commit -m "feat(cache-api): filter by comodidades via JSONB containment"
```

---

## Task 9: Expor `comodidades` na query da cache-api e no índice

**Files:**
- Modify: `src/cache-api/server.ts`
- Modify: `db/schema.sql`

- [ ] **Step 1: Write the failing test**

Acrescentar ao `src/cache-api/server.test.ts` um caso que passa `comodidades` na query (CSV) e verifica que chega ao `buscar`:

```ts
it("repassa comodidades (CSV) como array para a busca", async () => {
  let filtrosRecebidos: FiltrosCache | undefined
  const app = criarCacheServer(
    deps({
      contar: async () => 5,
      buscar: async (f) => {
        filtrosRecebidos = f as FiltrosCache
        return []
      },
    }),
  )
  const res = await app.inject({ method: "GET", url: "/imoveis?comodidades=elevador,sacada" })
  expect(res.statusCode).toBe(200)
  expect(filtrosRecebidos?.comodidades).toEqual(["elevador", "sacada"])
})
```

Atualizar os imports do topo do arquivo para incluir o tipo `FiltrosCache`:

```ts
import { FiltrosCache } from "./imovel-cache"
```

> Usa o helper `deps()` já existente no `server.test.ts` (que injeta `contar`/`buscar`/`fallback`/`logLevel`).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/cache-api/server.test.ts`
Expected: FAIL — `filtrosRecebidos.comodidades` é `undefined`

- [ ] **Step 3: Parse comodidades in the server**

Em `src/cache-api/server.ts`:

(a) Adicionar `comodidades?: string` à interface `QueryImoveis`.

(b) Adicionar um helper de split:

```ts
function lista(valor?: string): string[] | undefined {
  if (valor == null || valor.trim() === "") return undefined
  return valor.split(",").map((s) => s.trim()).filter((s) => s.length > 0)
}
```

(c) Incluir no objeto `filtros`:

```ts
          comodidades: lista(q.comodidades),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/cache-api/server.test.ts`
Expected: PASS

- [ ] **Step 5: Add the GIN index to the schema**

Em `db/schema.sql`, após `idx_imovel_preco`:

```sql
-- Busca por presença de comodidades (slugs + grupos no payload).
CREATE INDEX IF NOT EXISTS idx_imovel_comodidades
  ON imovel USING GIN ((payload->'caracteristicas'->'comodidades'));
```

- [ ] **Step 6: Commit**

```bash
git add src/cache-api/server.ts src/cache-api/server.test.ts db/schema.sql
git commit -m "feat(cache-api): accept comodidades query param and index it (GIN)"
```

---

## Task 10: Suíte completa + verificação final

**Files:** nenhum (verificação)

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — todos os testes (os 116 anteriores + os novos)

- [ ] **Step 2: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: sem erros

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build sem erros (gera `dist/`)

- [ ] **Step 4: Final commit (se houver ajustes)**

```bash
git add -A
git commit -m "test: green suite for rich characteristics feature" || echo "nada a commitar"
```

---

## Notas de verificação manual (pós-implementação, opcional)

- Rodar o scraper e consultar `/imoveis?tipoImovel=apartamento&cidade=Araçatuba&comodidades=elevador` deve retornar apenas apartamentos com alguma variante de elevador, e cada imóvel deve trazer `caracteristicas.itens` com tipo/quantidade para a LLM responder especificidades.
- Confirmar que `caracteristicas.comodidades` no payload contém tanto slugs específicos (`elevador-de-servico`) quanto grupos (`elevador`).
