# Mapeamento dos campos restantes da MoldSystems — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mapear os campos do documento Solr da MoldSystems que ainda eram descartados — localização completa, apresentação, mídia, condomínio (incl. características searchable) e extras.

**Architecture:** Enriquece o VO `Localizacao` e as seções `Caracteristicas`/`Media`; reusa o pipeline de características para o condomínio (mesmo dicionário, marcando `origem="CONDOMINIO"`), de modo que suas comodidades caem no índice GIN e no filtro existentes sem mudar SQL. Tudo flui para o `payload` JSONB do read-model.

**Tech Stack:** TypeScript, Vitest, padrão Result para VOs.

---

## File Structure

- **Modify:** `src/fontes/moldsystems/solr-doc.ts` — declara os novos campos Solr.
- **Modify:** `src/domain/imovel/caracteristica.ts` — VO ganha `origem`.
- **Modify:** `src/domain/imovel/caracteristica.test.ts` — testa `origem`.
- **Modify:** `src/domain/imovel/localizacao.ts` — VO ganha rua/numero/cep/andar/pontoReferencia/condominio/geo.
- **Modify:** `src/domain/imovel/localizacao.test.ts` — testa novos campos.
- **Modify:** `src/domain/imovel/tipos.ts` — `Media` e `Caracteristicas` ganham campos.
- **Modify:** `src/fontes/moldsystems/fixtures/imovel-3339.ts` — adiciona campos raw novos + condomínio.
- **Modify:** `src/fontes/moldsystems/solr-mapper.ts` — lê os novos campos, extrai condomínio, extras, hash.
- **Modify:** `src/fontes/moldsystems/solr-mapper.test.ts` — cobre os novos mapeamentos.
- **Modify:** `src/domain/leitura/recurso-imovel.ts` — read-model expõe os novos campos.
- **Modify:** `src/domain/leitura/recurso-imovel.caracteristicas.test.ts` — cobre condomínio + novos campos.

---

## Task 1: Declarar os novos campos Solr em `solr-doc.ts`

**Files:**
- Modify: `src/fontes/moldsystems/solr-doc.ts`

- [ ] **Step 1: Add fields to `MoldSystemsSolrDoc`**

No final da interface `MoldSystemsSolrDoc` (antes do `}` de fechamento, após `idtTenant?: string`), inserir:

```ts
  // --- Endereço estruturado ---
  namStreet?: string
  numNumber?: string | number
  numPostalArea?: string | number
  numFloor?: string | number
  desReferencePoint?: string
  latitudeAndLongitude?: string
  namCondominium?: string
  // --- Apresentação ---
  desTitleSite?: string
  desInformationSite?: string
  desObservation?: string
  // --- Mídia ---
  urlVideo?: string
  jsonPhotosCondominium?: string
  // --- Condomínio (características) ---
  jsonCondominiumCharacteristics?: string
  // --- Extras fiscais/diversos ---
  valIptu?: number
  numParcelsIptu?: number
  valSumLocationAndCondominium?: number
  numApartment?: string | number
  numBlock?: string | number
  numLandBlock?: string | number
  numLandLot?: string | number
  desAddressObservation?: string
  desBranchActivity?: string
  flg360?: boolean | number
  flgHideValSaleSite?: boolean | number
  flgHideValLocationSite?: boolean | number
  flgHighlight?: boolean | number
  dtaRegister?: string
  namCondominiumPlant?: string
  desAddressObservationCondominium?: string
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: sem erros (só adicionamos campos opcionais).

- [ ] **Step 3: Commit**

```bash
git add src/fontes/moldsystems/solr-doc.ts
git commit -m "feat(moldsystems): declare remaining Solr fields"
```

---

## Task 2: `Caracteristica` ganha `origem`

**Files:**
- Modify: `src/domain/imovel/caracteristica.ts`
- Modify: `src/domain/imovel/caracteristica.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/domain/imovel/caracteristica.test.ts`:

```ts
describe("Caracteristica origem", () => {
  it("default origem é IMOVEL quando não informado", () => {
    const r = Caracteristica.criar({ idtFonte: 1, chave: "x", rotulo: "X", tipo: "BOOLEANA", valorBool: true })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.origem).toBe("IMOVEL")
  })

  it("aceita origem CONDOMINIO", () => {
    const r = Caracteristica.criar({ idtFonte: 15, chave: "piscina", rotulo: "Piscina", tipo: "BOOLEANA", valorBool: true, origem: "CONDOMINIO" })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.origem).toBe("CONDOMINIO")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/domain/imovel/caracteristica.test.ts`
Expected: FAIL — `origem` é `undefined` / não existe na props.

- [ ] **Step 3: Implement**

Em `src/domain/imovel/caracteristica.ts`:

(a) Add the type and props field. Add `export type OrigemCaracteristica = "IMOVEL" | "CONDOMINIO"` near `TipoCaracteristica`, and add `origem?: OrigemCaracteristica` to `PropsCaracteristica`.

(b) Add `readonly origem: OrigemCaracteristica` as the LAST constructor param.

(c) In `criar`, pass `props.origem ?? "IMOVEL"` as the last argument to `new Caracteristica(...)`.

Concretamente, o `return ok(new Caracteristica(...))` final passa a incluir, após `valorTexto`:

```ts
        props.tipo === "TEXTO" ? texto : undefined,
        props.origem ?? "IMOVEL",
```

E o construtor passa a ter no fim:

```ts
    readonly valorTexto: string | undefined,
    readonly origem: OrigemCaracteristica,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/domain/imovel/caracteristica.test.ts`
Expected: PASS (todos, incluindo os antigos).

- [ ] **Step 5: Commit**

```bash
git add src/domain/imovel/caracteristica.ts src/domain/imovel/caracteristica.test.ts
git commit -m "feat(domain): add origem (IMOVEL|CONDOMINIO) to Caracteristica"
```

---

## Task 3: `Localizacao` ganha endereço estruturado + geo

**Files:**
- Modify: `src/domain/imovel/localizacao.ts`
- Modify: `src/domain/imovel/localizacao.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/domain/imovel/localizacao.test.ts`:

```ts
describe("Localizacao endereço estruturado", () => {
  it("armazena rua, numero, cep, andar, ponto de referência e condomínio (com trim)", () => {
    const l = Localizacao.criar({
      zonaTexto: "Centro", rua: "  Rua Pará  ", numero: " 70 ", cep: "16011015",
      andar: 4, pontoReferencia: " ao lado da praça ", condominio: " Residencial Madri ",
    })
    expect(l.ok).toBe(true)
    if (l.ok) {
      expect(l.value.rua).toBe("Rua Pará")
      expect(l.value.numero).toBe("70")
      expect(l.value.cep).toBe("16011015")
      expect(l.value.andar).toBe(4)
      expect(l.value.pontoReferencia).toBe("ao lado da praça")
      expect(l.value.condominio).toBe("Residencial Madri")
    }
  })

  it("armazena geo quando lat/lng finitos", () => {
    const l = Localizacao.criar({ zonaTexto: "Centro", geo: { lat: -21.21, lng: -50.44 } })
    expect(l.ok).toBe(true)
    if (l.ok) expect(l.value.geo).toEqual({ lat: -21.21, lng: -50.44 })
  })

  it("descarta geo com valores não finitos", () => {
    const l = Localizacao.criar({ zonaTexto: "Centro", geo: { lat: NaN, lng: -50 } })
    expect(l.ok).toBe(true)
    if (l.ok) expect(l.value.geo).toBeUndefined()
  })

  it("campos novos ausentes ficam undefined", () => {
    const l = Localizacao.criar({ zonaTexto: "Centro" })
    expect(l.ok).toBe(true)
    if (l.ok) {
      expect(l.value.rua).toBeUndefined()
      expect(l.value.andar).toBeUndefined()
      expect(l.value.geo).toBeUndefined()
    }
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/domain/imovel/localizacao.test.ts`
Expected: FAIL — campos não existem.

- [ ] **Step 3: Implement**

Substituir o conteúdo de `src/domain/imovel/localizacao.ts` por:

```ts
import { Result, ok, err } from "../../shared/result"
import { ErroValidacao, erroValidacao } from "./erro-validacao"

export interface Geo {
  lat: number
  lng: number
}

export interface PropsLocalizacao {
  zonaTexto: string
  bairro?: string
  cidade?: string
  estado?: string // UF, ex.: "SP"
  rua?: string
  numero?: string
  cep?: string
  andar?: number
  pontoReferencia?: string
  condominio?: string
  geo?: Geo
}

export class Localizacao {
  private constructor(
    readonly zonaTexto: string,
    readonly bairro: string | undefined,
    readonly cidade: string | undefined,
    readonly estado: string | undefined,
    readonly rua: string | undefined,
    readonly numero: string | undefined,
    readonly cep: string | undefined,
    readonly andar: number | undefined,
    readonly pontoReferencia: string | undefined,
    readonly condominio: string | undefined,
    readonly geo: Geo | undefined,
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
    const uf = opcional(props.estado)
    const andar = typeof props.andar === "number" && Number.isFinite(props.andar) ? props.andar : undefined
    const geo =
      props.geo && Number.isFinite(props.geo.lat) && Number.isFinite(props.geo.lng) ? props.geo : undefined
    return ok(
      new Localizacao(
        zona,
        opcional(props.bairro),
        opcional(props.cidade),
        uf ? uf.toUpperCase() : undefined,
        opcional(props.rua),
        opcional(props.numero),
        opcional(props.cep),
        andar,
        opcional(props.pontoReferencia),
        opcional(props.condominio),
        geo,
      ),
    )
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/domain/imovel/localizacao.test.ts`
Expected: PASS (novos + antigos).

- [ ] **Step 5: Commit**

```bash
git add src/domain/imovel/localizacao.ts src/domain/imovel/localizacao.test.ts
git commit -m "feat(domain): enrich Localizacao with structured address and geo"
```

---

## Task 4: Estender a fixture `imovel-3339` com os campos raw novos

**Files:**
- Modify: `src/fontes/moldsystems/fixtures/imovel-3339.ts`

- [ ] **Step 1: Add raw fields to the fixture**

No objeto `imovel3339`, logo antes da linha `dtaUpdate: "2026-05-07T10:22:58Z",`, inserir:

```ts
  // --- endereço estruturado ---
  namStreet: "Rua Pará",
  numNumber: "70",
  numPostalArea: "16011015",
  numFloor: "4",
  desReferencePoint: "ao lado da praça central",
  latitudeAndLongitude: "-21.2112600000000,-50.4407300000000",
  namCondominium: "Residencial Madri",
  // --- apresentação ---
  desTitleSite: "Apartamento 3 dormitórios no Centro",
  desInformationSite: "Excelente apartamento reformado, próximo ao comércio.",
  desObservation: "Aceita financiamento bancário.",
  // --- mídia ---
  urlVideo: "https://youtube.com/shorts/abc123",
  jsonPhotosCondominium: '[{"urlPhoto":"https://s3/cond1.jpg","flgNotShowSite":0}]',
  // --- condomínio: características (mesmo dicionário; idt 75 Playground, 15 Piscina, 97 Elevador Social qtd) ---
  jsonCondominiumCharacteristics: JSON.stringify([
    { desInformation: "Sim", desInformationFormatted: "Sim", characteristics: { idtCharacteristics: 75 } },
    { desInformation: "Sim", desInformationFormatted: "Sim", characteristics: { idtCharacteristics: 15 } },
    { desInformation: "1", desInformationFormatted: "1,00", characteristics: { idtCharacteristics: 97 } },
  ]),
  // --- extras ---
  valIptu: 1200,
  numParcelsIptu: 10,
  valSumLocationAndCondominium: 1990,
  numApartment: "402",
  numBlock: "B",
  desAddressObservation: "Fundos",
  flg360: 1,
  flgHighlight: 1,
  dtaRegister: "2024-03-18T00:00:00Z",
```

- [ ] **Step 2: Type-check the fixture**

Run: `npx tsc --noEmit`
Expected: sem erros referentes a `imovel-3339.ts` (todos os campos existem em `MoldSystemsSolrDoc` após Task 1).

- [ ] **Step 3: Commit**

```bash
git add src/fontes/moldsystems/fixtures/imovel-3339.ts
git commit -m "test(moldsystems): extend fixture 3339 with remaining raw fields"
```

---

## Task 5: `localizacaoDeDoc` lê endereço estruturado + geo

**Files:**
- Modify: `src/fontes/moldsystems/solr-mapper.ts`
- Modify: `src/fontes/moldsystems/solr-mapper.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/fontes/moldsystems/solr-mapper.test.ts`:

```ts
describe("localizacaoDeDoc endereço estruturado", () => {
  it("mapeia rua, numero, cep, andar, ponto de referência, condomínio e geo", () => {
    const l = localizacaoDeDoc(imovel3339)
    expect(l.rua).toBe("Rua Pará")
    expect(l.numero).toBe("70")
    expect(l.cep).toBe("16011015")
    expect(l.andar).toBe(4)
    expect(l.pontoReferencia).toBe("ao lado da praça central")
    expect(l.condominio).toBe("Residencial Madri")
    expect(l.geo).toEqual({ lat: -21.21126, lng: -50.44073 })
  })

  it("trata o sentinela 0E-13 como sem geo", () => {
    const l = localizacaoDeDoc({ ...imovel3339, latitudeAndLongitude: "0E-13,0E-13" })
    expect(l.geo).toBeUndefined()
  })

  it("sem latitudeAndLongitude → geo undefined", () => {
    const l = localizacaoDeDoc({ ...imovel3339, latitudeAndLongitude: undefined })
    expect(l.geo).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/fontes/moldsystems/solr-mapper.test.ts`
Expected: FAIL — `l.rua`/`l.geo` undefined.

- [ ] **Step 3: Implement**

Em `src/fontes/moldsystems/solr-mapper.ts`, substituir a função `localizacaoDeDoc` (e adicionar `parsearGeo` logo acima dela):

```ts
function parsearGeo(s?: string): { lat: number; lng: number } | undefined {
  if (!s) return undefined
  const [a, b] = s.split(",")
  const lat = Number.parseFloat(a)
  const lng = Number.parseFloat(b)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined
  // Sentinela "0E-13" (BigDecimal zero) = imóvel não geocodificado.
  if (Math.abs(lat) < 1e-6 && Math.abs(lng) < 1e-6) return undefined
  return { lat, lng }
}

export function localizacaoDeDoc(doc: MoldSystemsSolrDoc): PropsLocalizacao {
  const zonaTexto = doc.namDistrict || doc.namCity || doc.fullAddress || ""
  const andarNum = doc.numFloor != null ? Number.parseInt(String(doc.numFloor), 10) : NaN
  return {
    zonaTexto,
    bairro: doc.namDistrict,
    cidade: doc.namCity,
    estado: doc.namState,
    rua: doc.namStreet,
    numero: doc.numNumber != null ? String(doc.numNumber) : undefined,
    cep: doc.numPostalArea != null ? String(doc.numPostalArea) : undefined,
    andar: Number.isFinite(andarNum) ? andarNum : undefined,
    pontoReferencia: doc.desReferencePoint,
    condominio: doc.namCondominium,
    geo: parsearGeo(doc.latitudeAndLongitude),
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/fontes/moldsystems/solr-mapper.test.ts`
Expected: PASS (novos + antigos — o teste antigo de `localizacaoDeDoc` que checa zonaTexto/bairro/cidade/estado segue válido).

- [ ] **Step 5: Commit**

```bash
git add src/fontes/moldsystems/solr-mapper.ts src/fontes/moldsystems/solr-mapper.test.ts
git commit -m "feat(moldsystems): map structured address and geo into Localizacao"
```

---

## Task 6: `Media` e `Caracteristicas` ganham mídia/apresentação

**Files:**
- Modify: `src/domain/imovel/tipos.ts`
- Modify: `src/fontes/moldsystems/solr-mapper.ts`
- Modify: `src/fontes/moldsystems/solr-mapper.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/fontes/moldsystems/solr-mapper.test.ts`:

```ts
describe("apresentação e mídia", () => {
  it("caracteristicasDeDoc traz titulo e descricao", () => {
    const c = caracteristicasDeDoc(imovel3339)
    expect(c.titulo).toBe("Apartamento 3 dormitórios no Centro")
    expect(c.descricao).toBe("Excelente apartamento reformado, próximo ao comércio.")
  })

  it("imoveisDeSolrDoc preenche media.video e media.fotosCondominio", () => {
    const CTX2 = { clienteId: "innove", origin: "https://imobiliariainnove.com.br", extraidoEm: "2026-06-28T12:00:00.000Z" }
    const r = imoveisDeSolrDoc(imovel3339, CTX2).find((x) => x.ok)
    expect(r?.ok).toBe(true)
    if (r && r.ok) {
      expect(r.value.media.video).toBe("https://youtube.com/shorts/abc123")
      expect(r.value.media.fotosCondominio).toEqual(["https://s3/cond1.jpg"])
    }
  })
})
```

> `caracteristicasDeDoc` e `imoveisDeSolrDoc` já estão importados no topo do arquivo de teste.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/fontes/moldsystems/solr-mapper.test.ts`
Expected: FAIL — `titulo`/`media.video` não existem.

- [ ] **Step 3: Implement the type changes in `src/domain/imovel/tipos.ts`**

Estender `Caracteristicas` (adicionar dois campos após `casasBanho`) e `Media`:

```ts
export interface Caracteristicas {
  readonly tipoImovel?: string
  readonly tipologia?: string
  readonly areaM2?: number
  readonly quartos?: number
  readonly casasBanho?: number
  readonly titulo?: string
  readonly descricao?: string
  readonly lista: readonly string[]
  readonly itens: readonly Caracteristica[]
}

export interface Media {
  readonly fotoPrincipal?: string
  readonly video?: string
  readonly fotosCondominio?: readonly string[]
}
```

- [ ] **Step 4: Implement the mapper changes in `src/fontes/moldsystems/solr-mapper.ts`**

(a) Add a small trim helper near the top of the file (after the imports), if not present:

```ts
function texto(v?: string): string | undefined {
  const t = (v ?? "").trim()
  return t.length === 0 ? undefined : t
}
```

(b) In `caracteristicasDeDoc`, add `titulo` and `descricao` to the returned object (right after `casasBanho`):

```ts
    titulo: texto(doc.desTitleSite),
    descricao: texto(doc.desInformationSite),
```

(c) Add a helper for condo photos near `fotoPrincipalDeDoc`:

```ts
export function fotosCondominioDeDoc(doc: MoldSystemsSolrDoc): string[] | undefined {
  try {
    const fotos = JSON.parse(doc.jsonPhotosCondominium ?? "[]") as MoldSystemsFoto[]
    const urls = fotos.filter((f) => f.urlPhoto && !f.flgNotShowSite).map((f) => f.urlPhoto)
    return urls.length > 0 ? urls : undefined
  } catch {
    return undefined
  }
}
```

(d) In `imoveisDeSolrDoc`, replace the `media` line:

```ts
  const media = { fotoPrincipal: fotoPrincipalDeDoc(doc), video: texto(doc.urlVideo), fotosCondominio: fotosCondominioDeDoc(doc) }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/fontes/moldsystems/solr-mapper.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/domain/imovel/tipos.ts src/fontes/moldsystems/solr-mapper.ts src/fontes/moldsystems/solr-mapper.test.ts
git commit -m "feat(moldsystems): map title, description, video and condo photos"
```

---

## Task 7: Características do condomínio (reuso do pipeline)

**Files:**
- Modify: `src/fontes/moldsystems/solr-mapper.ts`
- Modify: `src/fontes/moldsystems/solr-mapper.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/fontes/moldsystems/solr-mapper.test.ts`:

```ts
describe("características do condomínio", () => {
  it("inclui itens do condomínio com origem CONDOMINIO", () => {
    const c = caracteristicasDeDoc(imovel3339)
    const playground = c.itens.find((i) => i.chave === "playground")
    expect(playground).toBeDefined()
    expect(playground?.origem).toBe("CONDOMINIO")
  })

  it("itens do imóvel permanecem com origem IMOVEL", () => {
    const c = caracteristicasDeDoc(imovel3339)
    const sacada = c.itens.find((i) => i.chave === "sacada")
    expect(sacada?.origem).toBe("IMOVEL")
  })

  it("lista (rótulos) NÃO inclui amenidades do condomínio", () => {
    const c = caracteristicasDeDoc(imovel3339)
    // 'Playground' só existe no condomínio nesta fixture → não entra na lista do imóvel
    expect(c.lista).not.toContain("Playground")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/fontes/moldsystems/solr-mapper.test.ts`
Expected: FAIL — não há item `playground` (condomínio ainda não extraído).

- [ ] **Step 3: Implement**

Em `src/fontes/moldsystems/solr-mapper.ts`:

(a) Refatorar `caracteristicasItensDeDoc` extraindo o laço para `itensDeChars(chars, origem)`. Substituir a função inteira por:

```ts
function itensDeChars(chars: MoldSystemsChar[], origem: "IMOVEL" | "CONDOMINIO"): Caracteristica[] {
  const out: Caracteristica[] = []
  for (const c of chars) {
    const idt = c.characteristics?.idtCharacteristics
    if (idt == null) continue
    const dic = resolverCaracteristica(idt)
    if (!dic) continue // idt fora do dicionário do site → ignora

    const bruto = (c.desInformation ?? c.desInformationFormatted ?? "").trim()
    let r
    if (ehSim(bruto) || ehNao(bruto)) {
      r = Caracteristica.criar({ idtFonte: idt, chave: dic.chave, rotulo: dic.rotulo, grupo: dic.grupo, tipo: "BOOLEANA", valorBool: ehSim(bruto), origem })
    } else if (ehNumerico(bruto)) {
      const n = (c.desInformationFormatted ? parsearNumeroBr(c.desInformationFormatted) : null) ?? Number.parseFloat(bruto)
      if (!Number.isFinite(n)) continue
      r = Caracteristica.criar({ idtFonte: idt, chave: dic.chave, rotulo: dic.rotulo, grupo: dic.grupo, tipo: "NUMERICA", valorNum: n, origem })
    } else {
      if (bruto.length === 0) continue
      r = Caracteristica.criar({ idtFonte: idt, chave: dic.chave, rotulo: dic.rotulo, grupo: dic.grupo, tipo: "TEXTO", valorTexto: bruto, origem })
    }
    if (r.ok) out.push(r.value)
  }
  return out
}

export function caracteristicasItensDeDoc(doc: MoldSystemsSolrDoc): Caracteristica[] {
  return itensDeChars(lerChars(doc), "IMOVEL")
}

function lerCharsCondominio(doc: MoldSystemsSolrDoc): MoldSystemsChar[] {
  try {
    return JSON.parse(doc.jsonCondominiumCharacteristics ?? "[]") as MoldSystemsChar[]
  } catch {
    return []
  }
}

export function caracteristicasCondominioDeDoc(doc: MoldSystemsSolrDoc): Caracteristica[] {
  return itensDeChars(lerCharsCondominio(doc), "CONDOMINIO")
}
```

(b) Atualizar `caracteristicasDeDoc` para juntar imóvel + condomínio e derivar `lista` só do imóvel:

```ts
export function caracteristicasDeDoc(doc: MoldSystemsSolrDoc): Caracteristicas {
  const itens = [...caracteristicasItensDeDoc(doc), ...caracteristicasCondominioDeDoc(doc)]
  const lista = itens
    .filter((i) => i.origem === "IMOVEL" && i.tipo === "BOOLEANA" && i.valorBool === true)
    .map((i) => i.rotulo)
  return {
    tipoImovel: tipoSingular(doc.namCategory),
    tipologia: doc.namSubCategory,
    areaM2: areaDeDoc(doc),
    quartos: typeof doc.totalRooms === "number" ? doc.totalRooms : undefined,
    casasBanho: banheirosDeDoc(doc),
    titulo: texto(doc.desTitleSite),
    descricao: texto(doc.desInformationSite),
    lista,
    itens,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/fontes/moldsystems/solr-mapper.test.ts`
Expected: PASS (novos + antigos — `lista` do imóvel inalterada para itens IMOVEL).

- [ ] **Step 5: Commit**

```bash
git add src/fontes/moldsystems/solr-mapper.ts src/fontes/moldsystems/solr-mapper.test.ts
git commit -m "feat(moldsystems): extract condominium characteristics (origem=CONDOMINIO)"
```

---

## Task 8: `extrasDeDoc` + `hashDeDoc`

**Files:**
- Modify: `src/fontes/moldsystems/solr-mapper.ts`
- Modify: `src/fontes/moldsystems/solr-mapper.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/fontes/moldsystems/solr-mapper.test.ts`:

```ts
describe("extrasDeDoc — campos novos", () => {
  it("mapeia iptu anual, custo mensal total, apto/bloco, observações e flags", () => {
    const e = extrasDeDoc(imovel3339)
    expect(e.iptuAnual).toBe(1200)
    expect(e.iptuParcelas).toBe(10)
    expect(e.custoMensalTotal).toBe(1990)
    expect(e.numeroApartamento).toBe("402")
    expect(e.bloco).toBe("B")
    expect(e.observacao).toBe("Aceita financiamento bancário.")
    expect(e.observacaoEndereco).toBe("Fundos")
    expect(e.tem360).toBe(true)
    expect(e.destaque).toBe(true)
    expect(e.dtaRegister).toBe("2024-03-18T00:00:00Z")
  })
})

describe("hashDeDoc inclui características do condomínio", () => {
  it("muda quando jsonCondominiumCharacteristics muda", () => {
    const CTX3 = { clienteId: "innove", origin: "https://imobiliariainnove.com.br", extraidoEm: "2026-06-28T12:00:00.000Z" }
    const base = imoveisDeSolrDoc(imovel3339, CTX3).find((x) => x.ok)
    const alterado = imoveisDeSolrDoc({ ...imovel3339, jsonCondominiumCharacteristics: "[]" }, CTX3).find((x) => x.ok)
    expect(base?.ok && alterado?.ok).toBe(true)
    if (base?.ok && alterado?.ok) {
      expect(base.value.estado.hashConteudo).not.toBe(alterado.value.estado.hashConteudo)
    }
  })
})
```

> `extrasDeDoc` precisa estar importado no topo do arquivo de teste — adicionar a `extrasDeDoc` à lista de imports de `./solr-mapper` se ainda não estiver.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/fontes/moldsystems/solr-mapper.test.ts`
Expected: FAIL — `e.iptuAnual` undefined / hash igual.

- [ ] **Step 3: Implement**

Em `src/fontes/moldsystems/solr-mapper.ts`:

(a) No fim de `extrasDeDoc` (antes de `return e`), adicionar:

```ts
  if (doc.valIptu != null) e["iptuAnual"] = doc.valIptu
  if (doc.numParcelsIptu != null) e["iptuParcelas"] = doc.numParcelsIptu
  if (doc.valSumLocationAndCondominium != null) e["custoMensalTotal"] = doc.valSumLocationAndCondominium
  if (doc.numApartment != null) e["numeroApartamento"] = String(doc.numApartment)
  if (doc.numBlock != null) e["bloco"] = String(doc.numBlock)
  if (doc.numLandBlock != null) e["quadra"] = String(doc.numLandBlock)
  if (doc.numLandLot != null) e["lote"] = String(doc.numLandLot)
  if (texto(doc.desAddressObservation)) e["observacaoEndereco"] = texto(doc.desAddressObservation)
  if (texto(doc.desObservation)) e["observacao"] = texto(doc.desObservation)
  if (texto(doc.desBranchActivity)) e["ramoAtividade"] = texto(doc.desBranchActivity)
  if (doc.flg360 != null) e["tem360"] = !!doc.flg360
  if (doc.flgHideValSaleSite != null) e["ocultarValorVenda"] = !!doc.flgHideValSaleSite
  if (doc.flgHideValLocationSite != null) e["ocultarValorLocacao"] = !!doc.flgHideValLocationSite
  if (doc.flgHighlight != null) e["destaque"] = !!doc.flgHighlight
  if (texto(doc.dtaRegister)) e["dtaRegister"] = doc.dtaRegister
  if (texto(doc.namCondominiumPlant)) e["plantaCondominio"] = texto(doc.namCondominiumPlant)
  if (texto(doc.desAddressObservationCondominium)) e["observacaoEnderecoCondominio"] = texto(doc.desAddressObservationCondominium)
```

(b) Em `hashDeDoc`, acrescentar ao array (após `doc.jsonCharacteristics,`):

```ts
    doc.jsonCondominiumCharacteristics, doc.namStreet, doc.numNumber, doc.numPostalArea,
    doc.numFloor, doc.latitudeAndLongitude, doc.namCondominium, doc.desTitleSite,
    doc.desInformationSite, doc.urlVideo, doc.desObservation,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/fontes/moldsystems/solr-mapper.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/fontes/moldsystems/solr-mapper.ts src/fontes/moldsystems/solr-mapper.test.ts
git commit -m "feat(moldsystems): map remaining fiscal/misc fields to extras; hash condo+address"
```

---

## Task 9: Read-model expõe os novos campos

**Files:**
- Modify: `src/domain/leitura/recurso-imovel.ts`
- Modify: `src/domain/leitura/recurso-imovel.caracteristicas.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/domain/leitura/recurso-imovel.caracteristicas.test.ts` (dentro do `describe` existente ou um novo):

```ts
describe("recurso-imovel — localização, mídia e condomínio", () => {
  const CTX = { clienteId: "innove", origin: "https://imobiliariainnove.com.br", extraidoEm: "2026-06-28T12:00:00.000Z" }

  it("expõe endereço estruturado, geo, título/descrição, vídeo e comodidades do condomínio", () => {
    const r = imoveisDeSolrDoc(imovel3339, CTX).find((x) => x.ok)
    expect(r?.ok).toBe(true)
    if (!r || !r.ok) return
    const rec = imovelParaRecurso(r.value)

    expect(rec.localizacao.rua).toBe("Rua Pará")
    expect(rec.localizacao.numero).toBe("70")
    expect(rec.localizacao.cep).toBe("16011015")
    expect(rec.localizacao.andar).toBe(4)
    expect(rec.localizacao.condominio).toBe("Residencial Madri")
    expect(rec.localizacao.geo).toEqual({ lat: -21.21126, lng: -50.44073 })

    expect(rec.caracteristicas.titulo).toBe("Apartamento 3 dormitórios no Centro")
    expect(rec.caracteristicas.descricao).toContain("reformado")
    expect(rec.media.video).toBe("https://youtube.com/shorts/abc123")

    // comodidades do condomínio entram com marcador 'condominio' + slug específico
    expect(rec.caracteristicas.comodidades).toContain("condominio")
    expect(rec.caracteristicas.comodidades).toContain("playground")
    // item rico carrega a origem
    expect(rec.caracteristicas.itens.find((i) => i.chave === "playground")?.origem).toBe("CONDOMINIO")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/domain/leitura/recurso-imovel.caracteristicas.test.ts`
Expected: FAIL — `rec.localizacao.rua` / `comodidades` sem 'condominio'.

- [ ] **Step 3: Implement in `src/domain/leitura/recurso-imovel.ts`**

(a) Estender a interface `RecursoImovel`:

- `localizacao` passa a:
```ts
  localizacao: {
    zonaTexto: string
    bairro?: string
    cidade?: string
    estado?: string
    rua?: string
    numero?: string
    cep?: string
    andar?: number
    pontoReferencia?: string
    condominio?: string
    geo?: { lat: number; lng: number }
  }
```
- em `caracteristicas`, adicionar `titulo?: string` e `descricao?: string` (após `casasBanho`), e em cada item de `itens` adicionar `origem: "IMOVEL" | "CONDOMINIO"`.
- `media` passa a:
```ts
  media: { fotoPrincipal?: string; video?: string; fotosCondominio?: string[] }
```

(b) No `imovelParaRecurso`:

- Substituir o bloco `localizacao: { ... }` por:
```ts
    localizacao: {
      zonaTexto: imovel.localizacao.zonaTexto,
      bairro: imovel.localizacao.bairro,
      cidade: imovel.localizacao.cidade,
      estado: imovel.localizacao.estado,
      rua: imovel.localizacao.rua,
      numero: imovel.localizacao.numero,
      cep: imovel.localizacao.cep,
      andar: imovel.localizacao.andar,
      pontoReferencia: imovel.localizacao.pontoReferencia,
      condominio: imovel.localizacao.condominio,
      geo: imovel.localizacao.geo ? { lat: imovel.localizacao.geo.lat, lng: imovel.localizacao.geo.lng } : undefined,
    },
```

- No IIFE de `caracteristicas`, incluir `origem` no map de `itens` e ajustar `comodidades` para o marcador de condomínio, e adicionar `titulo`/`descricao` no retorno:
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
        origem: i.origem,
      }))
      const comodidades = [
        ...new Set(
          itens
            .filter((i) => i.tipo === "BOOLEANA" && i.valorBool === true)
            .flatMap((i) => {
              const base = i.grupo ? [i.chave, i.grupo] : [i.chave]
              return i.origem === "CONDOMINIO" ? [...base, "condominio"] : base
            }),
        ),
      ]
      return {
        tipoImovel: imovel.caracteristicas.tipoImovel,
        tipologia: imovel.caracteristicas.tipologia,
        areaM2: imovel.caracteristicas.areaM2,
        quartos: imovel.caracteristicas.quartos,
        casasBanho: imovel.caracteristicas.casasBanho,
        titulo: imovel.caracteristicas.titulo,
        descricao: imovel.caracteristicas.descricao,
        lista: [...imovel.caracteristicas.lista],
        itens,
        comodidades,
      }
    })(),
```

- Substituir o bloco `media: { ... }` por:
```ts
    media: {
      fotoPrincipal: imovel.media.fotoPrincipal,
      video: imovel.media.video,
      fotosCondominio: imovel.media.fotosCondominio ? [...imovel.media.fotosCondominio] : undefined,
    },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/domain/leitura/recurso-imovel.caracteristicas.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/leitura/recurso-imovel.ts src/domain/leitura/recurso-imovel.caracteristicas.test.ts
git commit -m "feat(read-model): expose address, geo, media and condominium amenities"
```

---

## Task 10: Suíte completa + verificação final

**Files:** nenhum (verificação)

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — todos (147 anteriores + novos).

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build sem erros.

- [ ] **Step 4: Final commit (se houver ajustes)**

```bash
git add -A
git commit -m "test: green suite for remaining-fields mapping" || echo "nada a commitar"
```
