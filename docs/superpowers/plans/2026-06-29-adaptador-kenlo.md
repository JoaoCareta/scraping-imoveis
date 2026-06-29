# Adaptador Kenlo (caires) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar um segundo adaptador de fonte — a plataforma **Kenlo** (cliente `caires`, por scraping de HTML) — atrás da porta `FonteDeImoveis`, em paridade com o `moldsystems`/innove, com estratégias intercambiáveis (HTML agora, API oficial depois).

**Architecture:** `KenloFonte implements FonteDeImoveis` delega a uma `EstrategiaColetaKenlo` (`ColetaHtmlKenlo` agora; `ColetaApiKenlo` futuro). Um `criarFonte(config)` por plataforma escolhe o adaptador. Única mudança fora do adaptador: **preço opcional** ("Sob consulta"). Domínio, API HTTP e cache permanecem agnósticos à fonte.

**Tech Stack:** TypeScript (ESM, Node 20), vitest, Fastify (já existente), **cheerio** (novo — parsing de HTML). Padrões reusados de `src/fontes/moldsystems/`.

**Spec:** [docs/superpowers/specs/2026-06-29-adaptador-kenlo-design.md](../specs/2026-06-29-adaptador-kenlo-design.md)

> **Pré-condição:** estamos no branch `main`. A Task 1 cria o branch de trabalho. Idealmente executar num worktree dedicado.

---

## File Structure

**Novos (`src/fontes/kenlo/`):**
- `estrategia.ts` — `KenloContexto` + interface `EstrategiaColetaKenlo`.
- `caracteristicas-grupos.ts` — `slugKenlo()`, mapa curado de grupos, `caracteristicaBooleanaDeRotulo()`.
- `kenlo-detalhe.ts` — `imovelDeHtmlDetalhe(html, url, dica, ctx)`: parser Cheerio de uma página de detalhe → `Result<Imovel, ErroValidacao[]>`.
- `kenlo-listagem.ts` — `urlsDeDetalheDaListagem(html, origin)` e `proximaPaginaUrl(html, paginaAtual, origin)`: crawler.
- `coleta-html.ts` — `ColetaHtmlKenlo implements EstrategiaColetaKenlo` (orquestra crawl + fetch + parse, com timeout/retries/concorrência).
- `kenlo-fonte.ts` — `KenloFonte implements FonteDeImoveis` (segura/delegа a estratégia).
- `fixtures/*.html` — páginas reais salvas (1 listagem + 2 detalhe, incluindo um "Sob consulta").
- testes `*.test.ts` ao lado de cada um.

**Novos (raiz de fontes/app):**
- `src/fontes/fabrica.ts` — `criarFonte(config, deps?)` por `config.plataforma`.

**Modificados:**
- `src/domain/imovel/imovel.ts` — preço opcional.
- `src/domain/leitura/recurso-imovel.ts` — `preco` opcional na projeção.
- `src/config.ts` — campos `plataforma`, `estrategia`.
- `src/main.ts` — usar `criarFonte(config)`.
- `package.json` — dependência `cheerio`.
- `.env.example`, `docker-compose.yml` — instância caires (env).

---

## Task 1: Setup — branch, dependência e spike (fixtures)

**Files:**
- Modify: `package.json` (dep `cheerio`)
- Create: `src/fontes/kenlo/fixtures/listagem-apartamentos-venda.html`
- Create: `src/fontes/kenlo/fixtures/detalhe-ap1048.html`
- Create: `src/fontes/kenlo/fixtures/detalhe-sob-consulta.html`
- Create: `src/fontes/kenlo/fixtures/ACHADOS.md` (notas do spike)

- [ ] **Step 1: Branch de trabalho**

```bash
git checkout -b feat/adaptador-kenlo
```

- [ ] **Step 2: Instalar cheerio**

```bash
npm install cheerio@^1.0.0
```
Expected: `package.json` ganha `"cheerio": "^1.0.0"` em `dependencies`.

- [ ] **Step 3: Salvar fixtures reais (spike)**

Baixar 1 listagem e 2 páginas de detalhe (uma com preço "Sob consulta") e salvá-las cruas:

```bash
curl -sL "https://www.cairesengimob.com.br/imoveis/a-venda/apartamento" -o src/fontes/kenlo/fixtures/listagem-apartamentos-venda.html
curl -sL "https://www.cairesengimob.com.br/imovel/apartamento-ciudad-del-este-3-quartos-95-m/AP1048-CIMB" -o src/fontes/kenlo/fixtures/detalhe-ap1048.html
# Escolher na listagem um imóvel "Sob consulta" e baixar como detalhe-sob-consulta.html
```
Expected: 3 arquivos `.html` não-vazios em `fixtures/`.

- [ ] **Step 4: Inspecionar e registrar achados**

Abrir os fixtures e registrar em `src/fontes/kenlo/fixtures/ACHADOS.md`:
- Como a listagem lista os imóveis: confirmar que os links de detalhe são `<a href*="/imovel/">` (âncora estável usada pelo crawler).
- **Mecanismo de paginação do "Ver mais":** link com `?page=N`/`?pagina=N` (crawler segue href) **ou** botão que dispara XHR (anotar a URL do XHR). Isto decide a Task 5.
- Seletores/âncoras de cada campo no detalhe: rótulos "Quartos", "Banheiros"/"Banheiro", "Suíte(s)", "Área", bloco de preço (e o texto exato de "Sob consulta"), lista de comodidades, fotos `img.kenlo.io`.
- Tipos/finalidades de listagem existentes (a-venda/para-alugar × apartamento/casa/...).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/fontes/kenlo/fixtures/
git commit -m "chore(kenlo): cheerio + fixtures reais e achados do spike"
```

---

## Task 2: Domínio — preço opcional ("Sob consulta")

**Files:**
- Modify: `src/domain/imovel/imovel.ts`
- Modify: `src/domain/leitura/recurso-imovel.ts:50-56`
- Test: `src/domain/imovel/imovel.test.ts`

- [ ] **Step 1: Testes do novo comportamento (falhando)**

Adicionar a `src/domain/imovel/imovel.test.ts` (reusar o objeto base de props já existente no arquivo; aqui chamamos `propsBase` — ajustar ao nome local):

```ts
import { describe, it, expect } from "vitest"
import { Imovel, PropsImovel } from "./imovel"

const base: PropsImovel = {
  ref: "AP1", clienteId: "caires", urlSite: "https://www.cairesengimob.com.br/imovel/x/AP1",
  finalidade: "VENDA",
  preco: { valor: 100000, moeda: "BRL", periodo: "TOTAL" },
  localizacao: { zonaTexto: "Centro", cidade: "Aracatuba" },
  caracteristicas: { lista: [], itens: [] },
  media: {}, extras: {},
  estado: { ativo: true, extraidoEm: "2026-06-29T10:00:00.000Z", atualizadoEm: "2026-06-29T10:00:00.000Z", hashConteudo: "h" },
}

describe("Imovel — preço opcional", () => {
  it("aceita imóvel SEM preço (sob consulta) e fica com preco undefined", () => {
    const { preco, ...semPreco } = base
    const r = Imovel.criar(semPreco as PropsImovel)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.preco).toBeUndefined()
  })

  it("com preço válido continua válido e mantém o preço", () => {
    const r = Imovel.criar(base)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.preco?.valor).toBe(100000)
  })

  it("preço presente porém inválido (<=0) ainda rejeita", () => {
    const r = Imovel.criar({ ...base, preco: { valor: 0, moeda: "BRL", periodo: "TOTAL" } })
    expect(r.ok).toBe(false)
  })

  it("invariante período↔finalidade só vale quando há preço", () => {
    const { preco, ...semPreco } = base
    const r = Imovel.criar({ ...(semPreco as PropsImovel), finalidade: "ALUGUER" })
    expect(r.ok).toBe(true) // sem preço, não checa período
  })
})
```

- [ ] **Step 2: Rodar — falha**

Run: `npx vitest run src/domain/imovel/imovel.test.ts`
Expected: FAIL (hoje `props.preco` é obrigatório e `Imovel.criar` sempre valida preço).

- [ ] **Step 3: Tornar preço opcional em `imovel.ts`**

Em `src/domain/imovel/imovel.ts`: tornar `preco` opcional em `PropsImovel` e no construtor, e ajustar `criar`:

```ts
export interface PropsImovel {
  ref: string
  clienteId: string
  urlSite: string
  finalidade: string
  preco?: { valor: number; moeda: Moeda; periodo: PeriodoPreco } // opcional: ausência = "sob consulta"
  localizacao: PropsLocalizacao
  caracteristicas: Caracteristicas
  media: Media
  extras: Record<string, unknown>
  estado: EstadoExtracao
}
```

Construtor: trocar `readonly preco: Preco,` por `readonly preco: Preco | undefined,`.

Substituir o bloco de preço dentro de `criar` (as linhas que hoje fazem `Preco.criar(...)` e a invariante de período) por:

```ts
    // Preço é OPCIONAL: ausência = "sob consulta". Só valida quando fornecido.
    let preco: Preco | undefined
    if (props.preco) {
      const precoR = Preco.criar(props.preco.valor, props.preco.moeda, props.preco.periodo)
      if (!precoR.ok) {
        erros.push(precoR.error)
      } else {
        preco = precoR.value
        if (finalidadeValida) {
          const esperado = Preco.periodoEsperado(props.finalidade as Finalidade)
          if (preco.periodo !== esperado) {
            erros.push(erroValidacao("preco.periodo", `Para ${props.finalidade} o período tem de ser ${esperado}`))
          }
        }
      }
    }
```

Atualizar a guarda de narrowing (remover `!precoR.ok`, que já não existe nesse escopo) e a chamada do construtor para passar `preco`:

```ts
    if (erros.length > 0) return err(erros)
    if (!refR.ok || !urlR.ok || !locR.ok || !finalidadeValida) {
      return err(erros)
    }
    return ok(
      new Imovel(
        refR.value,
        clienteId,
        urlR.value,
        props.finalidade as Finalidade,
        preco,
        locR.value,
        props.caracteristicas,
        props.media,
        { ...props.extras },
        props.estado,
      ),
    )
```

(`comEstado` já repassa `this.preco` — agora `Preco | undefined`, compila sem mudança.)

- [ ] **Step 4: Read model — preço opcional**

Em `src/domain/leitura/recurso-imovel.ts`: tornar `preco` opcional na interface e na projeção.

Interface (linha ~9):
```ts
  preco?: { valor: number; moeda: string; periodo: string }
```
Projeção dentro de `imovelParaRecurso` (linha ~56):
```ts
    preco: imovel.preco
      ? { valor: imovel.preco.valor, moeda: imovel.preco.moeda, periodo: imovel.preco.periodo }
      : undefined,
```

- [ ] **Step 5: Rodar — passa, sem regressão**

Run: `npx vitest run src/domain && npm run typecheck`
Expected: PASS (domínio) e typecheck limpo. O `moldsystems` sempre fornece preço, logo seus testes seguem verdes.

- [ ] **Step 6: Suíte completa**

Run: `npm test`
Expected: todos verdes (196 + os novos do passo 1).

- [ ] **Step 7: Commit**

```bash
git add src/domain/imovel/imovel.ts src/domain/imovel/imovel.test.ts src/domain/leitura/recurso-imovel.ts
git commit -m "feat(dominio): preço opcional (imóvel 'sob consulta')"
```

---

## Task 3: Características Kenlo (rótulo → `Caracteristica`)

**Files:**
- Create: `src/fontes/kenlo/caracteristicas-grupos.ts`
- Test: `src/fontes/kenlo/caracteristicas-grupos.test.ts`

- [ ] **Step 1: Teste (falhando)**

```ts
import { describe, it, expect } from "vitest"
import { slugKenlo, grupoDeChave, caracteristicaBooleanaDeRotulo } from "./caracteristicas-grupos"

describe("kenlo caracteristicas", () => {
  it("slugKenlo normaliza acento, caixa e espaços", () => {
    expect(slugKenlo("Área de serviço")).toBe("area-de-servico")
    expect(slugKenlo("Portaria 24 Horas")).toBe("portaria-24-horas")
  })

  it("grupoDeChave devolve o grupo curado quando existe", () => {
    expect(grupoDeChave("piscina")).toBe("piscina")
    expect(grupoDeChave("sacada")).toBe("sacada-varanda")
    expect(grupoDeChave("cozinha")).toBeUndefined()
  })

  it("caracteristicaBooleanaDeRotulo cria BOOLEANA presente, com slug e grupo", () => {
    const r = caracteristicaBooleanaDeRotulo("Piscina")
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.chave).toBe("piscina")
      expect(r.value.rotulo).toBe("Piscina")
      expect(r.value.tipo).toBe("BOOLEANA")
      expect(r.value.valorBool).toBe(true)
      expect(r.value.grupo).toBe("piscina")
    }
  })
})
```

- [ ] **Step 2: Rodar — falha**

Run: `npx vitest run src/fontes/kenlo/caracteristicas-grupos.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar**

`src/fontes/kenlo/caracteristicas-grupos.ts`:
```ts
import { Result } from "../../shared/result"
import { ErroValidacao } from "../../domain/imovel/erro-validacao"
import { Caracteristica } from "../../domain/imovel/caracteristica"

/** Slug estável a partir do rótulo: sem acento, minúsculo, hifenizado. */
export function slugKenlo(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove diacríticos (combining marks)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

// Mapa curado (slug → grupo). Pequeno e incremental; começa pelos conceitos
// mais pedidos. Ampliar conforme aparecem novos rótulos no caires.
const GRUPOS: Record<string, string> = {
  piscina: "piscina",
  churrasqueira: "churrasqueira",
  sacada: "sacada-varanda",
  varanda: "sacada-varanda",
  "varanda-gourmet": "sacada-varanda",
  elevador: "elevador",
  "portaria-24-horas": "portaria",
  academia: "lazer",
  "salao-de-festas": "lazer",
  "area-de-servico": "area-de-servico",
}

export function grupoDeChave(chave: string): string | undefined {
  return GRUPOS[chave]
}

/** Rótulo de comodidade do Kenlo → Caracteristica BOOLEANA presente. */
export function caracteristicaBooleanaDeRotulo(rotulo: string): Result<Caracteristica, ErroValidacao> {
  const chave = slugKenlo(rotulo)
  return Caracteristica.criar({
    idtFonte: 0, // Kenlo não tem idt; 0 = sem idt de origem
    chave,
    rotulo: (rotulo ?? "").trim(),
    grupo: grupoDeChave(chave),
    tipo: "BOOLEANA",
    valorBool: true,
  })
}
```

- [ ] **Step 4: Rodar — passa**

Run: `npx vitest run src/fontes/kenlo/caracteristicas-grupos.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/fontes/kenlo/caracteristicas-grupos.ts src/fontes/kenlo/caracteristicas-grupos.test.ts
git commit -m "feat(kenlo): mapeamento de comodidades (rótulo→Caracteristica)"
```

---

> ⚠️ **Atualização pós-spike (Task 1) — vale para as Tasks 4, 5 e 6.** Ver `src/fontes/kenlo/fixtures/ACHADOS.md` (fonte da verdade). Mudanças vs. o desenho original:
> - **JSON-LD existe** em cada página de detalhe: `Product` (`sku`=ref, `name`, `description`, `image`, `offers[].price` só quando há preço — ausência de `offers` = "sob consulta") e `BreadcrumbList` (pos3 finalidade, pos4 tipo, pos5 cidade, pos6 bairro). Preferir JSON-LD para ref/preço/local; DOM para o resto. **Pegadinha:** `PostalAddress`/`GeoCoordinates` do JSON-LD são o endereço da IMOBILIÁRIA, não do imóvel — usar breadcrumb/dica para localização.
> - **Seletores DOM estáveis (BEM, não hashados):** características `span.item-info-title`→`span.item-info-value` (Quartos/Banheiros/Suíte/Área útil); comodidades `div.box-amenities > p` (texto); preço `h6.price-value` (com `span.price-value--full` quando há valor; texto `"Sob consulta"` sem o span quando não há); fotos `img[src*="img.kenlo.io"]` (deduplicar); descrição `div.box-description span`; ref de `link[rel=canonical]` (último segmento).
> - **Fixtures reais:** `detalhe-ap1048.html` (Sob consulta: VENDA, apartamento, 3 quartos, 2 banheiros, 1 suíte, 95 m², comodidades Piscina/Sacada/Churrasqueira/Cozinha/Área de serviço) e `detalhe-com-preco.html` (CA0676-CIMB, casa, VENDA, R$ 100.000). Use estes nomes nos testes (substituem `detalhe-sob-consulta.html`).
> - **Paginação (Task 5/6):** o botão "Ver mais" é JS — **ignorar**. Paginação server-side por `?page=N` (1..), parando em **HTTP 404** ou página com **0 cards**. Logo `proximaPaginaUrl` sai; a iteração de páginas vive na estratégia (Task 6). Links de detalhe: `a.card-with-buttons[href^="/imovel/"]`.

## Task 4: Parser de detalhe (`imovelDeHtmlDetalhe`)

**Files:**
- Create: `src/fontes/kenlo/estrategia.ts` (contexto, usado aqui e na Task 6)
- Create: `src/fontes/kenlo/kenlo-detalhe.ts`
- Test: `src/fontes/kenlo/kenlo-detalhe.test.ts`

- [ ] **Step 1: Contexto da fonte**

`src/fontes/kenlo/estrategia.ts` (só o contexto por enquanto; a interface entra na Task 6):
```ts
export interface KenloContexto {
  clienteId: string
  origin: string
  extraidoEm: string // ISO 8601
}
```

- [ ] **Step 2: Teste do parser contra os fixtures (falhando)**

> Os valores esperados vêm do imóvel real AP1048-CIMB (spike). Se a página viva tiver mudado, ajuste-os ao fixture salvo — o teste é o contrato.

```ts
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { imovelDeHtmlDetalhe } from "./kenlo-detalhe"

const ctx = { clienteId: "caires", origin: "https://www.cairesengimob.com.br", extraidoEm: "2026-06-29T10:00:00.000Z" }
const html = (nome: string) => readFileSync(new URL(`./fixtures/${nome}`, import.meta.url), "utf8")
const URL_AP1048 = "https://www.cairesengimob.com.br/imovel/apartamento-ciudad-del-este-3-quartos-95-m/AP1048-CIMB"

describe("imovelDeHtmlDetalhe", () => {
  it("extrai os campos do imóvel AP1048", () => {
    const r = imovelDeHtmlDetalhe(html("detalhe-ap1048.html"), URL_AP1048, { finalidade: "VENDA", tipoImovel: "apartamento" }, ctx)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const im = r.value
    expect(im.ref.valor).toBe("AP1048-CIMB")
    expect(im.finalidade).toBe("VENDA")
    expect(im.caracteristicas.quartos).toBe(3)
    expect(im.caracteristicas.casasBanho).toBe(2)
    expect(im.caracteristicas.areaM2).toBe(95)
    const chaves = im.caracteristicas.itens.map((i) => i.chave)
    expect(chaves).toContain("piscina")
    expect(chaves).toContain("sacada")
  })

  it("imóvel 'Sob consulta' é aceito com preço ausente", () => {
    const r = imovelDeHtmlDetalhe(html("detalhe-sob-consulta.html"), URL_AP1048, { finalidade: "VENDA", tipoImovel: "apartamento" }, ctx)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.preco).toBeUndefined()
  })
})
```

- [ ] **Step 3: Rodar — falha**

Run: `npx vitest run src/fontes/kenlo/kenlo-detalhe.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 4: Implementar o parser**

`src/fontes/kenlo/kenlo-detalhe.ts`. As âncoras de extração (`valorPorRotulo`, bloco de preço, lista de comodidades) seguem o padrão rótulo→valor; **ajuste os seletores ao fixture salvo até o teste passar** (o spike confirmou que os dados estão no HTML server-rendered; hrefs e rótulos são estáveis).

```ts
import * as cheerio from "cheerio"
import type { CheerioAPI } from "cheerio"
import { Result, ok, err } from "../../shared/result"
import { ErroValidacao } from "../../domain/imovel/erro-validacao"
import { Imovel } from "../../domain/imovel/imovel"
import { Caracteristica } from "../../domain/imovel/caracteristica"
import { parsearAreaM2 } from "../../normalizadores/area"
import { parsearInteiro } from "../../normalizadores/inteiro"
import { parsearValorReais } from "../../normalizadores/valor-reais"
import { caracteristicaBooleanaDeRotulo } from "./caracteristicas-grupos"
import { KenloContexto } from "./estrategia"

/** Dica vinda da listagem de onde a URL de detalhe foi colhida. */
export interface DicaListagem {
  finalidade: "ALUGUER" | "VENDA"
  tipoImovel?: string
}

/** Última parte do path (.../{COD_REF}) → ref. */
function refDePath(url: string): string {
  try {
    const path = url.startsWith("http") ? new URL(url).pathname : url
    const segs = path.split("/").filter(Boolean)
    return (segs[segs.length - 1] ?? "").trim()
  } catch {
    return ""
  }
}

/** Texto do valor associado a um rótulo (ex.: "Quartos" → "3"). Âncora por rótulo. */
function valorPorRotulo($: CheerioAPI, rotulos: string[]): string | undefined {
  const alvo = rotulos.map((r) => r.toLowerCase())
  let achado: string | undefined
  $("li, div, span, p, td").each((_, el) => {
    if (achado) return
    const texto = $(el).text().trim().replace(/\s+/g, " ")
    for (const r of alvo) {
      // "Quartos: 3" | "3 Quartos" | rótulo seguido de número
      if (texto.toLowerCase().includes(r) && /\d/.test(texto)) {
        achado = texto
        return
      }
    }
  })
  return achado
}

export function imovelDeHtmlDetalhe(
  html: string,
  url: string,
  dica: DicaListagem,
  ctx: KenloContexto,
): Result<Imovel, ErroValidacao[]> {
  const $ = cheerio.load(html)
  const ref = refDePath(url)

  const quartos = parsearInteiro(valorPorRotulo($, ["quartos", "dormitórios", "dormitorios"]) ?? "") ?? undefined
  const banheiros = parsearInteiro(valorPorRotulo($, ["banheiros", "banheiro"]) ?? "") ?? undefined
  const areaM2 = parsearAreaM2(valorPorRotulo($, ["área", "area"]) ?? "") ?? undefined

  // Preço: bloco com "R$"; "Sob consulta" (ou ausência de R$) → preço ausente.
  const corpo = $("body").text().replace(/\s+/g, " ")
  const sobConsulta = /sob consulta/i.test(corpo)
  const valor = sobConsulta ? null : parsearValorReais(corpo)
  const preco =
    valor != null && valor > 0
      ? { valor, moeda: "BRL" as const, periodo: dica.finalidade === "ALUGUER" ? ("MENSAL" as const) : ("TOTAL" as const) }
      : undefined

  // Comodidades: rótulos textuais (suíte vira NUMERICA; demais BOOLEANA presente).
  const itens: Caracteristica[] = []
  const suiteTxt = valorPorRotulo($, ["suíte", "suite", "suítes", "suites"])
  const suites = suiteTxt ? parsearInteiro(suiteTxt) : null
  if (suites && suites > 0) {
    const cs = Caracteristica.criar({ idtFonte: 0, chave: "suite", rotulo: "Suíte", grupo: "suite", tipo: "NUMERICA", valorNum: suites })
    if (cs.ok) itens.push(cs.value)
  }
  // Lista de comodidades: âncora a confirmar no fixture (ex.: bloco "Comodidades"/"Características").
  // Estratégia: coletar rótulos curtos de uma lista de amenidades.
  $('[class*="amenit" i], [class*="caracteristic" i], [class*="comodidad" i]').find("li, span").each((_, el) => {
    const rotulo = $(el).text().trim().replace(/\s+/g, " ")
    if (rotulo.length >= 3 && rotulo.length <= 40 && !/\d{3,}/.test(rotulo)) {
      const c = caracteristicaBooleanaDeRotulo(rotulo)
      if (c.ok) itens.push(c.value)
    }
  })

  const lista = itens.filter((i) => i.tipo === "BOOLEANA" && i.valorBool).map((i) => i.rotulo)

  return Imovel.criar({
    ref,
    clienteId: ctx.clienteId,
    urlSite: url,
    finalidade: dica.finalidade,
    preco,
    localizacao: { zonaTexto: $("h1").first().text().trim() || ctx.origin },
    caracteristicas: {
      tipoImovel: dica.tipoImovel,
      areaM2,
      quartos,
      casasBanho: banheiros,
      titulo: $("h1").first().text().trim() || undefined,
      descricao: undefined,
      lista,
      itens,
    },
    media: { fotoPrincipal: $('img[src*="img.kenlo.io"]').first().attr("src") },
    extras: { precoSobConsulta: sobConsulta },
    estado: { ativo: true, extraidoEm: ctx.extraidoEm, atualizadoEm: ctx.extraidoEm, hashConteudo: "" },
  })
}
```

- [ ] **Step 5: Ajustar seletores ao fixture e rodar até passar**

Run: `npx vitest run src/fontes/kenlo/kenlo-detalhe.test.ts`
Expected: PASS. (Ajuste `valorPorRotulo`/seletor de comodidades ao HTML real do fixture se necessário.)

- [ ] **Step 6: Commit**

```bash
git add src/fontes/kenlo/estrategia.ts src/fontes/kenlo/kenlo-detalhe.ts src/fontes/kenlo/kenlo-detalhe.test.ts
git commit -m "feat(kenlo): parser de página de detalhe (Cheerio) → Imovel"
```

---

## Task 5: Crawler de listagem (URLs de detalhe + paginação)

**Files:**
- Create: `src/fontes/kenlo/kenlo-listagem.ts`
- Test: `src/fontes/kenlo/kenlo-listagem.test.ts`

> **Dependência do spike (Task 1, Step 4):** se a paginação for por **href** (`?page=N`), `proximaPaginaUrl` extrai esse link. Se for **XHR**, ajuste `proximaPaginaUrl` para montar a URL do endpoint anotado nos ACHADOS (mesma assinatura).

- [ ] **Step 1: Teste contra o fixture de listagem (falhando)**

```ts
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { urlsDeDetalheDaListagem } from "./kenlo-listagem"

const html = readFileSync(new URL("./fixtures/listagem-apartamentos-venda.html", import.meta.url), "utf8")
const ORIGIN = "https://www.cairesengimob.com.br"

describe("kenlo-listagem", () => {
  it("coleta URLs absolutas e deduplicadas das páginas de detalhe", () => {
    const urls = urlsDeDetalheDaListagem(html, ORIGIN)
    expect(urls.length).toBeGreaterThan(0)
    expect(urls.every((u) => u.startsWith("https://www.cairesengimob.com.br/imovel/"))).toBe(true)
    expect(new Set(urls).size).toBe(urls.length) // sem duplicatas
  })
})
```

- [ ] **Step 2: Rodar — falha**

Run: `npx vitest run src/fontes/kenlo/kenlo-listagem.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar**

`src/fontes/kenlo/kenlo-listagem.ts`:
```ts
import * as cheerio from "cheerio"

/** Normaliza href relativo/absoluto para URL absoluta no origin. */
function absoluta(href: string, origin: string): string | undefined {
  try {
    return new URL(href, origin).toString()
  } catch {
    return undefined
  }
}

/** Todos os links de detalhe (/imovel/.../{ref}) de uma página de listagem, deduplicados. */
export function urlsDeDetalheDaListagem(html: string, origin: string): string[] {
  const $ = cheerio.load(html)
  const set = new Set<string>()
  $('a[href*="/imovel/"]').each((_, el) => {
    const href = $(el).attr("href")
    if (!href) return
    const abs = absoluta(href, origin)
    if (abs && abs.includes("/imovel/")) set.add(abs.split("#")[0].split("?")[0])
  })
  return [...set]
}

/**
 * URL da próxima página de listagem, ou undefined se não houver.
 * Caso href (?page=N): segue o link "próxima". Caso XHR: montar a URL do endpoint
 * anotado no spike (ACHADOS.md) com a página seguinte — mesma assinatura.
 */
export function proximaPaginaUrl(html: string, paginaAtual: string, origin: string): string | undefined {
  const $ = cheerio.load(html)
  let proxima: string | undefined
  $('a[rel="next"], a[href*="page="], a[href*="pagina="]').each((_, el) => {
    if (proxima) return
    const txt = $(el).text().toLowerCase()
    const href = $(el).attr("href")
    if (href && (txt.includes("próxim") || txt.includes("proxim") || txt.includes("ver mais") || $(el).attr("rel") === "next")) {
      proxima = absoluta(href, origin)
    }
  })
  return proxima && proxima !== paginaAtual ? proxima : undefined
}
```

- [ ] **Step 4: Rodar — passa**

Run: `npx vitest run src/fontes/kenlo/kenlo-listagem.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/fontes/kenlo/kenlo-listagem.ts src/fontes/kenlo/kenlo-listagem.test.ts
git commit -m "feat(kenlo): crawler de listagem (URLs de detalhe + paginação)"
```

---

## Task 6: Estratégia `ColetaHtmlKenlo` (orquestração)

**Files:**
- Modify: `src/fontes/kenlo/estrategia.ts` (adicionar a interface)
- Create: `src/fontes/kenlo/coleta-html.ts`
- Test: `src/fontes/kenlo/coleta-html.test.ts`

- [ ] **Step 1: Interface da estratégia**

Adicionar a `src/fontes/kenlo/estrategia.ts`:
```ts
import { ResultadoExtracao } from "../fonte-de-imoveis"

export interface EstrategiaColetaKenlo {
  coletar(ctx: KenloContexto): Promise<ResultadoExtracao>
}
```

- [ ] **Step 2: Teste com `fetchFn` falso servindo fixtures (falhando)**

```ts
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { ColetaHtmlKenlo } from "./coleta-html"

const f = (n: string) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), "utf8")
const ctx = { clienteId: "caires", origin: "https://www.cairesengimob.com.br", extraidoEm: "2026-06-29T10:00:00.000Z" }

function fetchFake(): typeof fetch {
  return (async (input: any) => {
    const url = String(input)
    const body = url.includes("/imoveis/") ? f("listagem-apartamentos-venda.html") : f("detalhe-ap1048.html")
    return new Response(body, { status: 200 })
  }) as unknown as typeof fetch
}

describe("ColetaHtmlKenlo", () => {
  it("crawleia a listagem e parseia os detalhes em Imovel[]", async () => {
    const estrategia = new ColetaHtmlKenlo({
      origin: ctx.origin,
      timeoutMs: 2000,
      fetchFn: fetchFake(),
      seeds: [{ path: "/imoveis/a-venda/apartamento", finalidade: "VENDA", tipoImovel: "apartamento" }],
      concorrencia: 4,
      dormir: async () => {},
    })
    const r = await estrategia.coletar(ctx)
    expect(r.imoveis.length).toBeGreaterThan(0)
    expect(r.imoveis[0].clienteId).toBe("caires")
  })
})
```

- [ ] **Step 3: Rodar — falha**

Run: `npx vitest run src/fontes/kenlo/coleta-html.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 4: Implementar**

`src/fontes/kenlo/coleta-html.ts`:
```ts
import { ResultadoExtracao, ImovelRejeitado } from "../fonte-de-imoveis"
import { FonteIndisponivelError, FonteTimeoutError } from "../erros"
import { Imovel } from "../../domain/imovel/imovel"
import { EstrategiaColetaKenlo, KenloContexto } from "./estrategia"
import { urlsDeDetalheDaListagem, proximaPaginaUrl } from "./kenlo-listagem"
import { imovelDeHtmlDetalhe, DicaListagem } from "./kenlo-detalhe"

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,*/*",
}

export interface SeedListagem {
  path: string // ex.: "/imoveis/a-venda/apartamento"
  finalidade: "ALUGUER" | "VENDA"
  tipoImovel?: string
}

export interface ColetaHtmlKenloDeps {
  origin: string
  timeoutMs: number
  seeds: SeedListagem[]
  retries?: number
  fetchFn?: typeof fetch
  dormir?: (ms: number) => Promise<void>
  avisar?: (msg: string) => void
  concorrencia?: number
}

export class ColetaHtmlKenlo implements EstrategiaColetaKenlo {
  private readonly origin: string
  private readonly timeoutMs: number
  private readonly seeds: SeedListagem[]
  private readonly retries: number
  private readonly fetchFn: typeof fetch
  private readonly dormir: (ms: number) => Promise<void>
  private readonly avisar: (msg: string) => void
  private readonly concorrencia: number

  constructor(deps: ColetaHtmlKenloDeps) {
    this.origin = deps.origin
    this.timeoutMs = deps.timeoutMs
    this.seeds = deps.seeds
    this.retries = deps.retries ?? 3
    this.fetchFn = deps.fetchFn ?? fetch
    this.dormir = deps.dormir ?? ((ms) => new Promise((r) => setTimeout(r, ms)))
    this.avisar = deps.avisar ?? (() => {})
    this.concorrencia = deps.concorrencia ?? 5
  }

  async coletar(ctx: KenloContexto): Promise<ResultadoExtracao> {
    // 1. Enumerar URLs de detalhe (com a dica de finalidade/tipo da seed).
    const alvos = new Map<string, DicaListagem>()
    for (const seed of this.seeds) {
      let pagina: string | undefined = new URL(seed.path, this.origin).toString()
      const visitadas = new Set<string>()
      while (pagina && !visitadas.has(pagina)) {
        visitadas.add(pagina)
        const html = await this.obterHtml(pagina)
        for (const u of urlsDeDetalheDaListagem(html, this.origin)) {
          if (!alvos.has(u)) alvos.set(u, { finalidade: seed.finalidade, tipoImovel: seed.tipoImovel })
        }
        pagina = proximaPaginaUrl(html, pagina, this.origin)
      }
    }

    // 2. Buscar/parsear detalhes com concorrência limitada (politeness).
    const imoveis: Imovel[] = []
    const rejeitados: ImovelRejeitado[] = []
    const entradas = [...alvos.entries()]
    for (let i = 0; i < entradas.length; i += this.concorrencia) {
      const lote = entradas.slice(i, i + this.concorrencia)
      const resultados = await Promise.all(
        lote.map(async ([url, dica]) => {
          const html = await this.obterHtml(url)
          return imovelDeHtmlDetalhe(html, url, dica, ctx)
        }),
      )
      for (let j = 0; j < resultados.length; j++) {
        const r = resultados[j]
        if (r.ok) imoveis.push(r.value)
        else rejeitados.push({ ref: refDe(lote[j][0]), erros: r.error })
      }
    }
    return { imoveis, rejeitados }
  }

  private async obterHtml(url: string): Promise<string> {
    let ultimoErro: unknown
    for (let tentativa = 0; tentativa <= this.retries; tentativa++) {
      try {
        const res = await this.fetchFn(url, { headers: HEADERS, signal: AbortSignal.timeout(this.timeoutMs) })
        if (res.ok) return await res.text()
        if (res.status < 500) throw new FonteIndisponivelError(`Kenlo respondeu HTTP ${res.status} em ${url}`)
        throw new Error(`HTTP ${res.status}`)
      } catch (e) {
        if (e instanceof FonteIndisponivelError) throw e
        if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) {
          throw new FonteTimeoutError(`timeout ao coletar ${url} (${this.timeoutMs}ms)`)
        }
        ultimoErro = e
        if (tentativa < this.retries) await this.dormir(200 * (tentativa + 1))
      }
    }
    const motivo = ultimoErro instanceof Error ? ultimoErro.message : String(ultimoErro)
    throw new FonteIndisponivelError(`Kenlo indisponível em ${url}: ${motivo}`)
  }
}

function refDe(url: string): string {
  const segs = url.split("/").filter(Boolean)
  return segs[segs.length - 1] ?? url
}
```

- [ ] **Step 5: Rodar — passa**

Run: `npx vitest run src/fontes/kenlo/coleta-html.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/fontes/kenlo/estrategia.ts src/fontes/kenlo/coleta-html.ts src/fontes/kenlo/coleta-html.test.ts
git commit -m "feat(kenlo): estratégia ColetaHtmlKenlo (crawl + fetch + parse)"
```

---

## Task 7: `KenloFonte` (porta, delega à estratégia)

**Files:**
- Create: `src/fontes/kenlo/kenlo-fonte.ts`
- Test: `src/fontes/kenlo/kenlo-fonte.test.ts`

- [ ] **Step 1: Teste com estratégia falsa (falhando)**

```ts
import { describe, it, expect } from "vitest"
import { KenloFonte } from "./kenlo-fonte"
import { EstrategiaColetaKenlo, KenloContexto } from "./estrategia"

describe("KenloFonte", () => {
  it("delega à estratégia injetada e repassa o contexto (clienteId/origin)", async () => {
    let ctxRecebido: KenloContexto | undefined
    const estrategia: EstrategiaColetaKenlo = {
      coletar: async (ctx) => {
        ctxRecebido = ctx
        return { imoveis: [], rejeitados: [] }
      },
    }
    const fonte = new KenloFonte({
      origin: "https://www.cairesengimob.com.br",
      clienteId: "caires",
      estrategia,
      agora: () => new Date("2026-06-29T10:00:00.000Z"),
    })
    const r = await fonte.buscarTodos()
    expect(r.imoveis).toEqual([])
    expect(ctxRecebido?.clienteId).toBe("caires")
    expect(ctxRecebido?.origin).toBe("https://www.cairesengimob.com.br")
    expect(ctxRecebido?.extraidoEm).toBe("2026-06-29T10:00:00.000Z")
  })
})
```

- [ ] **Step 2: Rodar — falha**

Run: `npx vitest run src/fontes/kenlo/kenlo-fonte.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar**

`src/fontes/kenlo/kenlo-fonte.ts`:
```ts
import { FonteDeImoveis, ResultadoExtracao } from "../fonte-de-imoveis"
import { EstrategiaColetaKenlo } from "./estrategia"

export interface KenloFonteDeps {
  origin: string
  clienteId: string
  estrategia: EstrategiaColetaKenlo
  agora?: () => Date
}

export class KenloFonte implements FonteDeImoveis {
  constructor(private readonly deps: KenloFonteDeps) {}

  async buscarTodos(): Promise<ResultadoExtracao> {
    const agora = this.deps.agora ?? (() => new Date())
    const ctx = {
      clienteId: this.deps.clienteId,
      origin: this.deps.origin,
      extraidoEm: agora().toISOString(),
    }
    return this.deps.estrategia.coletar(ctx)
  }
}
```

- [ ] **Step 4: Rodar — passa**

Run: `npx vitest run src/fontes/kenlo/kenlo-fonte.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/fontes/kenlo/kenlo-fonte.ts src/fontes/kenlo/kenlo-fonte.test.ts
git commit -m "feat(kenlo): KenloFonte (porta FonteDeImoveis, delega à estratégia)"
```

---

## Task 8: Factory por plataforma + config

**Files:**
- Modify: `src/config.ts`
- Create: `src/fontes/fabrica.ts`
- Modify: `src/main.ts:7-17`
- Test: `src/fontes/fabrica.test.ts`
- Test: `src/config.test.ts` (adicionar)

- [ ] **Step 1: Testes (falhando)**

`src/fontes/fabrica.test.ts`:
```ts
import { describe, it, expect } from "vitest"
import { criarFonte } from "./fabrica"
import { MoldSystemsFonte } from "./moldsystems/moldsystems-fonte"
import { KenloFonte } from "./kenlo/kenlo-fonte"
import { Config } from "../config"

const base: Config = {
  port: 3000, host: "0.0.0.0", clienteId: "x", origin: "https://x", solrNumRows: 5000,
  fetchTimeoutMs: 8000, logLevel: "silent", plataforma: "moldsystems", estrategia: "html",
}

describe("criarFonte", () => {
  it("plataforma moldsystems → MoldSystemsFonte", () => {
    expect(criarFonte({ ...base, plataforma: "moldsystems" })).toBeInstanceOf(MoldSystemsFonte)
  })
  it("plataforma kenlo → KenloFonte", () => {
    expect(criarFonte({ ...base, plataforma: "kenlo", origin: "https://www.cairesengimob.com.br" })).toBeInstanceOf(KenloFonte)
  })
})
```

Adicionar a `src/config.test.ts`:
```ts
it("plataforma e estrategia: defaults e override por env", () => {
  expect(carregarConfig({}).plataforma).toBe("moldsystems")
  expect(carregarConfig({}).estrategia).toBe("html")
  expect(carregarConfig({ PLATAFORMA: "kenlo", ESTRATEGIA: "html" }).plataforma).toBe("kenlo")
})
```
(Importar `carregarConfig` no topo se ainda não estiver.)

- [ ] **Step 2: Rodar — falha**

Run: `npx vitest run src/fontes/fabrica.test.ts src/config.test.ts`
Expected: FAIL (`criarFonte` e campos `plataforma/estrategia` inexistentes).

- [ ] **Step 3: Config — novos campos**

Em `src/config.ts`: adicionar à interface `Config`:
```ts
  plataforma: "moldsystems" | "kenlo"
  estrategia: "html" | "api"
```
E em `carregarConfig`, dentro do objeto retornado:
```ts
    plataforma: env.PLATAFORMA === "kenlo" ? "kenlo" : "moldsystems",
    estrategia: env.ESTRATEGIA === "api" ? "api" : "html",
```

- [ ] **Step 4: Factory**

`src/fontes/fabrica.ts`:
```ts
import { Config } from "../config"
import { FonteDeImoveis } from "./fonte-de-imoveis"
import { MoldSystemsFonte } from "./moldsystems/moldsystems-fonte"
import { KenloFonte } from "./kenlo/kenlo-fonte"
import { ColetaHtmlKenlo, SeedListagem } from "./kenlo/coleta-html"

// Seeds de listagem do caires (paridade: venda + aluguel, principais tipos).
// Confirmar/expandir conforme os ACHADOS do spike.
const SEEDS_KENLO: SeedListagem[] = [
  { path: "/imoveis/a-venda/apartamento", finalidade: "VENDA", tipoImovel: "apartamento" },
  { path: "/imoveis/a-venda/casa", finalidade: "VENDA", tipoImovel: "casa" },
  { path: "/imoveis/para-alugar/apartamento", finalidade: "ALUGUER", tipoImovel: "apartamento" },
  { path: "/imoveis/para-alugar/casa", finalidade: "ALUGUER", tipoImovel: "casa" },
]

export function criarFonte(config: Config): FonteDeImoveis {
  if (config.plataforma === "kenlo") {
    const estrategia = new ColetaHtmlKenlo({
      origin: config.origin,
      timeoutMs: config.fetchTimeoutMs,
      seeds: SEEDS_KENLO,
      avisar: (msg) => console.warn(msg),
    })
    return new KenloFonte({ origin: config.origin, clienteId: config.clienteId, estrategia })
  }
  return new MoldSystemsFonte({
    origin: config.origin,
    clienteId: config.clienteId,
    numRows: config.solrNumRows,
    timeoutMs: config.fetchTimeoutMs,
    avisar: (msg) => console.warn(msg),
  })
}
```

- [ ] **Step 5: Fio em `main.ts`**

Em `src/main.ts`, substituir a construção direta da fonte:
```ts
import { criarFonte } from "./fontes/fabrica"
// ...
export function construirApp(config: Config): FastifyInstance {
  const fonte = criarFonte(config)
  const repo = new FonteImovelRepository({ fonte })
  return criarServidor(repo, config)
}
```
(Remover o `import { MoldSystemsFonte }` agora não usado em `main.ts`.)

- [ ] **Step 6: Rodar — passa, sem regressão**

Run: `npx vitest run src/fontes/fabrica.test.ts src/config.test.ts src/main.test.ts && npm run typecheck`
Expected: PASS e typecheck limpo.

- [ ] **Step 7: Commit**

```bash
git add src/config.ts src/config.test.ts src/fontes/fabrica.ts src/fontes/fabrica.test.ts src/main.ts
git commit -m "feat(fontes): criarFonte por plataforma + config PLATAFORMA/ESTRATEGIA"
```

---

## Task 9: Deploy do caires (env) e verificação final

**Files:**
- Modify: `.env.example`
- Modify: `docker-compose.yml`

- [ ] **Step 1: Documentar as env vars novas**

Em `.env.example`, acrescentar (com comentário):
```
# Plataforma da fonte: moldsystems (default) | kenlo
PLATAFORMA=moldsystems
# Estratégia do Kenlo: html (default) | api
ESTRATEGIA=html
```

- [ ] **Step 2: Exemplo de instância caires no compose**

Em `docker-compose.yml`, adicionar (comentado) um serviço de exemplo para o caires, espelhando `scraper-api` mas com env próprio:
```yaml
  # Instância do scraper para o cliente caires (plataforma Kenlo). Habilitar quando o
  # prospecto fechar. Mesmo image; difere só por env. O guard ?cliente= garante isolamento.
  # scraper-api-caires:
  #   build: .
  #   container_name: scraper-api-caires
  #   restart: unless-stopped
  #   environment:
  #     CLIENTE_ID: caires
  #     ORIGIN: https://www.cairesengimob.com.br
  #     PLATAFORMA: kenlo
  #     ESTRATEGIA: html
  #   ports: ["3002:3000"]
  #   networks: [default, root_default]
```

- [ ] **Step 3: Verificação final — suíte, typecheck, build**

Run:
```bash
npm test && npm run typecheck && npm run build
```
Expected: todos os testes verdes, typecheck limpo, build `tsup` ok.

- [ ] **Step 4: Smoke test real (opcional, exige rede)**

Subir local com env do caires e bater no endpoint:
```bash
CLIENTE_ID=caires ORIGIN=https://www.cairesengimob.com.br PLATAFORMA=kenlo NODE_ENV=production node dist/main.js &
curl -s "http://localhost:3000/imoveis?cliente=caires&limit=3" | head -c 800
```
Expected: envelope `ColetaConcluida` com imóveis do caires (preço ausente nos "Sob consulta"). Parar o processo após.

- [ ] **Step 5: Commit**

```bash
git add .env.example docker-compose.yml
git commit -m "chore(deploy): env PLATAFORMA/ESTRATEGIA e instância caires (exemplo)"
```

---

## Notas de execução

- **TDD em todas as tasks** exceto a 1 (spike/fixtures) e a 9 (config/deploy). Cada teste é escrito e visto falhar antes da implementação.
- **Sem regressão no innove:** o `moldsystems` sempre fornece preço; a única mudança compartilhada (preço opcional) é aditiva. Rodar `npm test` ao fim de cada task.
- **Selectors do Kenlo (Tasks 4–5)** são afinados contra os fixtures salvos na Task 1; o teste com valores reais é o contrato. Se o spike revelar paginação por XHR, ajustar `proximaPaginaUrl` (Task 5) para o endpoint anotado — mesma assinatura, resto inalterado.
- **API oficial Kenlo (futuro):** adicionar `ColetaApiKenlo implements EstrategiaColetaKenlo` e selecionar por `config.estrategia="api"` na `fabrica.ts`. Nenhuma outra camada muda.
