# Spike de descoberta — imobiliariainnove.com.br (plataforma MoldSystems)

- **Data:** 2026-06-07
- **Objetivo:** validar o que o scraper conseguiria extrair de um site real e definir a estratégia de extração.
- **Alvo:** `https://imobiliariainnove.com.br/alugar/todos`
- **Scripts:** `spikes/*.mjs` (throwaway, mantidos como registo).

## Resumo executivo

O site expõe **todos os campos de que o domínio precisa**, é **SSR Next.js**, e o **código do imóvel vem no URL** (join key perfeito). O ponto sensível: os dados **não estão em JSON limpo** no HTML — a lista e o detalhe são carregados por **API client-side**. E, decisivo para o negócio: o site corre numa **plataforma multi-inquilino (MoldSystems / msysimob)**.

## Descobertas

### 1. Plataforma multi-inquilino — MoldSystems / msysimob
- Hosts referenciados: `msysimob.com.br`, `www.moldsystems.com.br`, bucket S3 `msys-imob-imobiliariainnove`.
- Routing Next.js: `page = /[imob]/[...pages]`, `query.imob = "msys_imob_imobiliariainnove"`.
- **Implicação:** muitas imobiliárias brasileiras correm nesta mesma plataforma. Um **adaptador por plataforma (MoldSystems)** serve N clientes, com apenas o identificador `imob` a variar. Muda a economia: "adaptador por cliente" → "adaptador por **plataforma** + config por inquilino".
- **Ação:** confirmar quantas imobiliárias-alvo usam msysimob (alavanca de priorização).

### 2. SSR Next.js, mas dados via API client-side
- `STATUS 200`, `text/html`, ~277 KB. `__NEXT_DATA__` presente.
- `props.pageProps = {}` (vazio); **sem** streaming RSC (`__next_f` = 0).
- `props.initialState.result.propertys = array(0)` na lista **e** no detalhe → os imóveis são buscados por **API após hidratação** (Redux inicial vazio).
- Ainda assim, o **DOM servido contém os 12 cards** (preços R$, fotos S3 com o código), por isso há dois caminhos de extração.

### 3. Estratégia de extração (para a Fase 4)
- **Preferida — via API da plataforma:** descobrir o endpoint que o JS chama (observar a rede uma vez com Playwright no onboarding). Dá **JSON limpo + paginação** dos 251 imóveis e **serve todos os inquilinos msysimob**.
- **Fallback — DOM com Cheerio:** ancorar nos hrefs estáveis `/imovel/.../{codigo}` e ler o texto do card. **NUNCA** usar as classes CSS (`sc-vejrxg-15`, `gmAXSd` — *styled-components* com hash, mudam a cada build).
- Browser (Playwright) só é necessário para **observar a API**; a extração em si pode ser HTTP (Cheerio) se a API for acessível, ou DOM-Cheerio no fallback.

### 4. Mapa de campos (URL + card → domínio)
- **URL de detalhe:** `/imovel/{locacao|venda-e-locacao}/{categoria}/{cidade}/{localidade}/{codigo}`
  - `finalidade` ← `locacao` → ALUGUER ; `venda-e-locacao`/`venda` → VENDA (ou ambos)
  - `tipoImovel` ← `apartamentos|casas|comercial`
  - `cidade` ← segmento (ex.: `aracatuba`)
  - `ref` ← último segmento (ex.: `2937`) — **também mostrado como "COD. 2937"**
- **Card / detalhe:** preço (R$), área (m²), quartos, banheiros, vagas, bairro, IPTU, condomínio, fotos (S3).

### 5. Exemplo real (COD. 2937) mapeado para `ImovelDto`
```json
{
  "ref": "2937",
  "clienteId": "imobiliariainnove",
  "urlSite": "https://imobiliariainnove.com.br/imovel/locacao/apartamentos/aracatuba/conjunto-habitacional-pedro-perri/2937",
  "finalidade": "ALUGUER",
  "tipoImovel": "apartamento",
  "preco": 1600.00, "moeda": "BRL", "periodoPreco": "MENSAL",
  "zonaTexto": "Conjunto Habitacional Pedro Perri", "cidade": "Araçatuba",
  "areaM2": 69, "quartos": 2, "casasBanho": 2,
  "fotoPrincipal": "https://s3.amazonaws.com/msys-imob-imobiliariainnove/imovel/fotos/2937/….jpg",
  "extras": { "vagas": 1, "iptu": 150.00, "condominio": 550.00 }
}
```

### 6. Paginação
- Header anuncia **251 imóveis para alugar**; ~12 por página → ~21 páginas. O motor tem de paginar (via parâmetro de URL ou via a API).

## Implicações para o domínio (locale Brasil)
- **Moeda:** o domínio tem `Moeda = "EUR"`; clientes são **brasileiros** → precisa de **BRL** (default).
- **Localização:** `Localizacao` usa `distrito/concelho/freguesia` (divisões de Portugal). Brasil usa **bairro / cidade / estado (UF)**. Alinhar.
- **Vocabulário (opcional):** BR diz *locação/aluguel*, *banheiros*, *vagas*, *casa* (vs PT *arrendar*, *casas de banho*, *moradia*).

## Implicações para a spec
- Reenquadrar §4.2 ("adaptador por cliente") para **adaptador por plataforma + config por inquilino** quando a plataforma é partilhada (ex.: MoldSystems).
- Fase 4: prever passo de **descoberta de API** (Playwright a observar a rede) com fallback DOM-Cheerio; proibir dependência de classes CSS com hash.

---

## API da plataforma MoldSystems — DECIFRADA (2026-06-07)

A plataforma expõe uma **API Solr com JSON limpo e completo**. Para clientes MoldSystems o adaptador é um **cliente de API**, não scraping de DOM (sem Playwright/Cheerio, sem classes CSS). Scripts: `spikes/api-*.mjs`, `spikes/imovel-1910-campos.mjs`.

### Endpoint
`GET {origin}/api/solr/search/{query}` onde `{query} = encodeURI(JSON.stringify(obj))`.

- **Por id/código:** `{ "idtsPropertys": [1910], "numRows": 1000 }` → `response.docs` com o imóvel.
- **Catálogo:** `{ "numRows": 1000 }` → `response.numFound` (total) + `docs` (paginável via numRows/start).
- Resposta no formato Solr: `{ response: { numFound, docs: [...] } }`.
- **`idtProperty` é o próprio código** (COD 1910 = idtProperty 1910) → join key trivial com a planilha do Marketplace.
- Rotas Next.js subjacentes: `/[imob]/api/solr/search/[query]`, `/[imob]/api/solr/search/ids`.

### Outros endpoints úteis
`/api/autocomplete/?q=` (200 JSON), `/api/solr/list/{city|district|categories|condominium|tags|...}`, `/api/site/page`, `/api/site/template`.

### Campos Solr → nosso domínio (exemplo COD 1910)
| Solr | Valor (1910) | → ImovelDto |
|---|---|---|
| `idtProperty` | 1910 | `ref` |
| `indType` | "L"=locação · "SL"=venda+locação | `finalidade` (L→ALUGUER; com venda→VENDA) |
| `valLocation` / `valSales` | 1050 | `preco` (MENSAL/TOTAL, BRL) |
| `valCondominium` / `valMonthIptu` | 940 / 105 | `extras` |
| `totalRooms` | 2 | `quartos` |
| `totalGarages` | 2 | `extras.vagas` |
| `namCategory` / `namSubCategory` | Apartamentos / Padrão | `tipoImovel` / `tipologia` |
| `namDistrict` / `namCity` / `namState` | Vila Estádio / Araçatuba / São Paulo | `bairro` / `cidade` / `estado` |
| `jsonCharacteristics` | área 96 m², banheiros 2… | `areaM2`, `casasBanho`, `extras` |
| `jsonPhotos` | [urls S3] | `fotoPrincipal` |
| `desUriLandingPage` + slugs | …park-mediterraneo | construir `urlSite` |
| `flgShowSite` / `indStatus` / `indBusy` | — | `estado.ativo` |

### Implicação arquitetural (Fase 4)
- **`FonteDeImoveis`** ganha (pelo menos) duas implementações: **API** (MoldSystems, `MoldSystemsFonte`) e **DOM** (Cheerio/Playwright, para sites sem API). MoldSystems é a primeira.
- **Uma integração serve todos os inquilinos MoldSystems** (varia `origin` + `namSchema`).
- Os **normalizadores (Fase 2)** servem o caminho **DOM**; no caminho **API** os dados já vêm tipados → mapeamento de campos, não parsing de texto.
