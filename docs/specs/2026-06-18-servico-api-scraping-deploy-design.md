# Spec de Design — Serviço de API + Deploy do Scraping

- **Data:** 2026-06-18
- **Estado:** Rascunho para revisão
- **Autor:** João Careta (com Claude)
- **Âmbito:** evoluir o módulo de scraping para um **serviço HTTP deployável** —
  repositório privado no GitHub, deploy via **docker compose** ao lado do n8n
  self-hosted, e uma **API de leitura** que expõe os imóveis lidos do scraper,
  modelada por **Event Storming (DDD)** e devolvendo um **objeto rico/hierárquico**.
- **Relação com specs anteriores:** complementa
  `2026-06-07-modulo-scraping-imoveis-design.md`. Concretiza a **Fase 4b** (cliente
  HTTP) e a **Fase 6** (entrega via API) dessa spec, no modo *standalone* e *stateless*.

---

## 1. Contexto e decisão

O objetivo do programa maior é uma automação de **auto-atendimento imobiliário**
(via n8n). O scraper é a ferramenta que **coleta e devolve** o inventário de
imóveis de cada cliente; eventualmente haverá um **adaptador por cliente/plataforma**.

Esta spec trata do passo que torna o scraper consumível: um **serviço HTTP próprio**.

**Decisão que substitui o caminho anterior:** abandona-se a ideia de "bloco de
código no n8n". O **n8n passa a consumir a API** deste serviço por um nó
**HTTP Request** (chamando-o pelo nome do serviço na rede docker interna).

### 1.1. Decisões tomadas (brainstorming 2026-06-18)

| Decisão | Escolha | Consequência |
|---------|---------|--------------|
| Estado do serviço | **Stateless** — coleta e devolve | **Sem cache** e **sem persistência**. Cada pedido faz scrape → mapeia → devolve. |
| Falhas | **Devolver mensagem de erro** | HTTP 503/504 com corpo JSON (evento `FonteIndisponivel`). Sem fallback de cache. |
| Hosting | **Mesma VPS do n8n** | API na rede docker do n8n; chamada por `http://scraper-api:3000`. |
| Exposição/Auth | **Só rede interna/VPN** | Sem `ports:` públicos. API key **opcional e desligada** por defeito. |
| Modelagem | **Event Storming (DDD)** | Técnica de **modelagem**, não Event Sourcing — coerente com stateless (ver §3). |
| Contrato de saída | **Read Model rico (`RecursoImovel`)** | Hierárquico, espelha o agregado. O `ImovelDto` plano é **aposentado**. |
| Framework HTTP | **Fastify** | TS-first, validação por JSON schema, logging pino. |
| Build | **tsc → `dist/`** | Completa a dívida do TODO (`tsconfig.build.json`). |
| Repositório | **`scraping-imoveis` (privado)** | Confirmado. |

---

## 2. Objetivos e não-objetivos

### 2.1. Objetivos
- Completar o **cliente HTTP** (`MoldSystemsFonte`) que coleta os imóveis na API
  Solr ao vivo (reusa o mapper puro já testado).
- Expor uma **API de leitura** (`GET /imoveis?filtros`, `GET /imoveis/:ref`,
  `GET /health`) devolvendo um **objeto rico hierárquico** (`RecursoImovel`).
- Servir **stateless**: cada pedido coleta e devolve; em falha, **mensagem de erro**.
- Modelar o domínio por **Event Storming** (linguagem ubíqua, agregado, read model).
- Empacotar o serviço num **container** (docker compose) ao lado do n8n, acessível
  só na rede interna/VPN.
- Publicar o código num **repositório privado** no GitHub.
- Manter a abstração `ImovelRepository` (testabilidade + futura troca de fonte).

### 2.2. Não-objetivos (desta fase)
- **Persistência, cache, diff/estado, scheduler, event store** — fora de âmbito por
  decisão: este serviço é **stateless**. Se for preciso persistir o inventário, isso
  vive no **consumidor** (n8n/Núcleo), não aqui.
- Adaptador DOM/Playwright para sites sem API — fora de âmbito.
- Núcleo de atendimento (triagem LLM, matching, mensagens) — outro bounded context.
- TLS/ingress público, multi-cliente dinâmico — adiados (rede interna por agora).

---

## 3. Event Storming — Bounded Context "Coleta de Imóveis"

Aplicamos Event Storming como **técnica de modelagem** (descobrir linguagem ubíqua,
agregado e read model). **Não** é Event Sourcing: nenhum evento é persistido — os
eventos existem como **vocabulário do domínio** e como **forma da resposta**.

```
 ACTOR            COMMAND              AGGREGATE              DOMAIN EVENTS                 READ MODEL
 n8n /        ► ColetarImoveis  ►   Imovel (raiz)      ►   ColetaIniciada           ►   RecursoImovel
 atendimento     (filtros)          + Value Objects:        DocumentosRecebidos          (rico, hierárquico)
                                     Ref, Preco,             ImovelColetado   (ok)
                                     Localizacao,            ImovelRejeitado  (inválido)  envelope:
                                     Caracteristicas,        ColetaConcluida          ►   ColetaConcluida
                                     Media, EstadoExtracao   FonteIndisponivel            { total, rejeitados }
                                                                   │
                                                                   └► Policy (futura): AlertaDeQuebra
```

**Glossário (linguagem ubíqua):**

| Termo ES | Significado | Onde vive no código |
|----------|-------------|---------------------|
| `ColetarImoveis` (Command) | Pedido de coleta com filtros | `ImovelRepository.buscar(filtros)` |
| `Imovel` (Aggregate) | Raiz + value objects, com invariantes | `src/domain/imovel/imovel.ts` (já existe) |
| `ImovelColetado` (Event) | Imóvel válido extraído | Item em `imoveis[]` |
| `ImovelRejeitado` (Event) | Falhou invariante de domínio | `ResultadoExtracao.rejeitados` (já existe) → `rejeitados` |
| `ColetaConcluida` (Event) | Coleta terminou; resumo | **Envelope** da resposta |
| `FonteIndisponivel` (Event) | Falha ao chegar à fonte | Corpo do erro 503/504 |
| `RecursoImovel` (Read Model) | Projeção rica para leitura | `src/domain/leitura/recurso-imovel.ts` (novo) |

> O **Read Model** do Event Storming é, literalmente, **o objeto rico que a API
> devolve** — espelha o agregado `Imovel`, em vez do `ImovelDto` plano.

---

## 4. Arquitetura (serviço stateless)

```
 n8n  ──HTTP (rede docker interna)──►  scraper-api (Fastify)
                                         GET /health
                                         GET /imoveis?filtros
                                         GET /imoveis/:ref
                                               │
                                        ImovelRepository  (interface — "ColetarImoveis")
                                               │  (sem estado: chama a fonte a cada pedido)
                                               ▼
                                       MoldSystemsFonte  (FonteDeImoveis — Fase 4b)
                                               │ GET /api/solr/search/{json}
                                               ▼
                                  imoveisDeSolrDoc → Imovel → imovelParaRecurso → RecursoImovel[]
```

`ImovelRepository` é a fronteira entre a API e a origem. Hoje:
`FonteImovelRepository` (sem estado) → cada `buscar` chama `FonteDeImoveis`. Amanhã
pode ser outra fonte — a camada HTTP não muda.

---

## 5. Componentes novos

### 5.1. `MoldSystemsFonte implements FonteDeImoveis` (Fase 4b)

Ficheiro: `src/fontes/moldsystems/moldsystems-fonte.ts`.

```ts
interface MoldSystemsFonteDeps {
  origin: string                 // "https://imobiliariainnove.com.br"
  clienteId: string              // "innove"
  numRows: number                // ex.: 5000
  timeoutMs: number              // ex.: 8000
  fetchFn?: typeof fetch         // injetável p/ testes
  agora?: () => Date             // relógio injetável (extraidoEm determinístico)
}

class MoldSystemsFonte implements FonteDeImoveis {
  constructor(deps: MoldSystemsFonteDeps)
  buscarTodos(): Promise<ResultadoExtracao>   // { imoveis, rejeitados }
}
```

Comportamento de `buscarTodos`:
1. `GET ${origin}/api/solr/search/${encodeURI(JSON.stringify({ numRows }))}`
   com headers `User-Agent` (browser) e `Accept: application/json`.
2. `AbortController` com `timeoutMs`; **1–2 retries com backoff** em erro de rede/5xx.
3. Parse → `response.docs` + `response.numFound`.
4. `ctx = { clienteId, origin, extraidoEm: agora().toISOString() }`.
5. `docs.flatMap(d => imoveisDeSolrDoc(d, ctx))` → separa `Result` ok/erro em
   `ResultadoExtracao { imoveis, rejeitados }`.
6. **Salvaguarda:** se `numFound > numRows`, regista aviso (catálogo truncado → §11).
7. Em falha definitiva (rede após retries) → `FonteIndisponivelError`; em timeout →
   `FonteTimeoutError` (a camada HTTP traduz para 503/504).

### 5.2. `RecursoImovel` (Read Model) + `imovelParaRecurso`

Ficheiros: `src/domain/leitura/recurso-imovel.ts` (tipo) e
`.../recurso-imovel-mapper.ts` (mapper, a partir do agregado `Imovel`).

```ts
interface RecursoImovel {
  ref: string
  clienteId: string
  urlSite: string
  finalidade: "ALUGUER" | "VENDA"
  preco:           { valor: number; moeda: string; periodo: string }
  localizacao:     { zonaTexto: string; bairro?: string; cidade?: string; estado?: string }
  caracteristicas: { tipoImovel?: string; tipologia?: string; areaM2?: number;
                     quartos?: number; casasBanho?: number; lista: string[] }
  media:           { fotoPrincipal?: string }
  extras:          Record<string, unknown>
  estado:          { ativo: boolean; extraidoEm: string; atualizadoEm: string; hashConteudo: string }
}

function imovelParaRecurso(imovel: Imovel): RecursoImovel
```

> **Aposentar o plano:** `imovelParaDto`/`dtoParaImovel` e `ImovelDto` deixam de ter
> consumidor neste serviço e são removidos (ou marcados como legado) — a API expõe
> **apenas** `RecursoImovel`. (Decisão do plano: remover já vs marcar legado.)

### 5.3. `ImovelRepository` + `FonteImovelRepository` (sem estado)

Ficheiros: `src/aplicacao/imovel-repository.ts`, `.../fonte-imovel-repository.ts`.

```ts
interface FiltrosImovel {
  finalidade?: "ALUGUER" | "VENDA"
  precoMin?: number;  precoMax?: number
  quartos?: number
  cidade?: string;  bairro?: string;  tipoImovel?: string
  ativo?: boolean          // default: true
}

interface Coleta {                          // resultado de "ColetarImoveis"
  imoveis: RecursoImovel[]
  total: number
  rejeitados: number
  extraidoEm: string
}

interface ImovelRepository {
  buscar(filtros: FiltrosImovel): Promise<Coleta>
  buscarPorRef(ref: string): Promise<Coleta>     // ref pode ter ALUGUER+VENDA
}
```

`FonteImovelRepository`: a cada `buscar`, chama `fonte.buscarTodos()` →
`imovelParaRecurso` → aplica os filtros em memória → devolve `Coleta`. **Sem cache.**

### 5.4. Servidor Fastify + config + entry point

- `src/config.ts` — lê/valida env (§7.1); falha rápido se faltar obrigatória.
- `src/api/server.ts` — instância Fastify, rotas, hook opcional de API key, JSON
  schema nos query params.
- `src/main.ts` — wiring (`config → MoldSystemsFonte → FonteImovelRepository →
  server`), `listen(HOST, PORT)`, shutdown gracioso (SIGTERM/SIGINT).

---

## 6. Contrato da API

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/health` | Liveness. `200 { status: "ok", uptimeMs }`. |
| GET | `/imoveis` | Coleta filtrada. Query = `FiltrosImovel` + `limit`/`offset`. |
| GET | `/imoveis/:ref` | Imóvel(is) por referência. `404` se inexistente. |

**Query params de `/imoveis`** (validados; `400` se inválidos): `finalidade`
(`ALUGUER`|`VENDA`), `precoMin`/`precoMax` (≥0), `quartos` (int ≥0), `cidade`,
`bairro`, `tipoImovel`, `ativo` (bool, default `true`), `limit` (int, default 100,
máx 500), `offset` (int, default 0).

**Resposta `200` (envelope `ColetaConcluida` + read model rico):**
```jsonc
{
  "evento": "ColetaConcluida",
  "extraidoEm": "2026-06-18T10:00:00Z",
  "total": 42,
  "rejeitados": 3,
  "imoveis": [ /* RecursoImovel (ver §5.2) */ ]
}
```

**Erros (corpo JSON com sabor a evento de domínio):**
```jsonc
{ "evento": "FonteIndisponivel", "erro": { "codigo": "FONTE_INDISPONIVEL", "mensagem": "..." } }
```
Códigos HTTP: `400` (params inválidos), `401` (API key — só se o gate estiver
ligado), `404` (`/imoveis/:ref` sem resultado), `503` (fonte indisponível),
`504` (timeout da fonte).

---

## 7. Build, Docker e compose

### 7.1. Variáveis de ambiente (`.env.example`)

| Var | Default | Notas |
|-----|---------|-------|
| `PORT` | `3000` | Porta do serviço. |
| `HOST` | `0.0.0.0` | Bind dentro do container. |
| `CLIENTE_ID` | `innove` | Contexto do mapper. |
| `ORIGIN` | `https://imobiliariainnove.com.br` | Base da API Solr. |
| `SOLR_NUM_ROWS` | `5000` | Tamanho do catálogo a pedir. |
| `FETCH_TIMEOUT_MS` | `8000` | Timeout por chamada à fonte. |
| `LOG_LEVEL` | `info` | Nível do logger pino. |
| `API_KEY` | *(vazia)* | Vazia ⇒ **sem** gate de auth. Preencher ativa o header. |

### 7.2. Build
- `tsconfig.build.json` (estende o `tsconfig.json`, `outDir: dist`, `noEmit:false`).
- Scripts: `build` (`tsc -p tsconfig.build.json`), `start` (`node dist/main.js`),
  `dev` (`tsx watch src/main.ts`).
- `fastify` → `dependencies`; `typescript`/`vitest`/`tsx`/`@types/node` → `devDependencies`.

### 7.3. Dockerfile (multi-stage)
- *build*: `node:20-alpine`, `npm ci`, `npm run build`.
- *runtime*: `node:20-alpine`, `npm ci --omit=dev`, copia `dist/`, **user não-root**,
  `EXPOSE 3000`, `HEALTHCHECK` (wget ao `/health`), `CMD ["node","dist/main.js"]`.

### 7.4. docker-compose.yml
- Serviço `scraper-api`, `build: .`, `env_file: .env`, `restart: unless-stopped`.
- Ligado à **rede docker externa onde já corre o n8n** (`external: true`).
- **Sem `ports:` públicos.** Acesso só pela rede interna/VPN; o n8n chama
  `http://scraper-api:3000`.

---

## 8. Repositório privado GitHub

1. Utilizador corre **`gh auth login`** (token de `Joao-Careta` inválido).
2. `gh repo create scraping-imoveis --private --source=. --remote=origin --push`.
3. Sobe o estado atual + esta spec (`docs/` é versionado neste repo).
4. `.gitignore` já cobre `node_modules/`, `dist/`, `.env*` (exceto `.env.example`).

---

## 9. Estratégia de testes (TDD, Vitest)

- **`MoldSystemsFonte`**: `fetchFn` mockado — sucesso (fixture real 1910), erro de
  rede (`FonteIndisponivelError`), timeout (`FonteTimeoutError`), doc rejeitado
  (entra em `rejeitados`), `numFound > numRows` (aviso). 1 integração real opcional.
- **`imovelParaRecurso`**: agregado `Imovel` → `RecursoImovel` com a hierarquia
  completa (preco/localizacao/caracteristicas/media/estado), incluindo opcionais ausentes.
- **`FonteImovelRepository`**: cada filtro isolado, combinação, `ativo` default,
  `buscarPorRef`, contagem de `total`/`rejeitados` no `Coleta`.
- **Rotas (Fastify `app.inject()`):** `/health`; `/imoveis` sem/com filtros, params
  inválidos (`400`), paginação, **forma do envelope `ColetaConcluida`**;
  `/imoveis/:ref` encontrado e `404`; gate de API key on/off; `503`/`504` em falha da fonte.

---

## 10. Ordem de implementação

1. **`MoldSystemsFonte`** (Fase 4b) — desbloqueia tudo.
2. **`RecursoImovel`** + **`imovelParaRecurso`** (e aposentar o `ImovelDto` plano).
3. **`ImovelRepository`** + **`FonteImovelRepository`** (filtros, `Coleta`).
4. **Config** + **servidor Fastify** + rotas (envelope `ColetaConcluida`) + API key opcional.
5. **Build** (`tsconfig.build.json`) + **Dockerfile** + **docker-compose** + **`.env.example`**.
6. **README** (deploy) + criar/empurrar **repositório** (após `gh auth login`).

---

## 11. Decisões em aberto / a confirmar

1. **Mecanismo da rede interna/VPN na VPS** (rede docker partilhada do n8n?
   Tailscale/WireGuard? rede privada do cloud?) — não muda a API; só o compose.
2. **Paginação Solr** — `numRows: 5000` é *single-shot*. Se `numFound` ultrapassar,
   adicionar loop por `numFound`. Confirmar o total atual do innove.
3. **`ImovelDto` plano** — remover já dos ficheiros vs marcar como legado (decisão do plano).

---

## 12. Evolução futura (fora do âmbito)

- **Persistência do inventário** (se necessária) vive no **consumidor** (n8n/Núcleo),
  não neste serviço stateless.
- **Eventos emitidos** (lista de `ImovelColetado`/`ColetaConcluida` na resposta, ou
  webhooks) — extensão se um consumidor precisar reagir evento-a-evento.
- **Outros bounded contexts** (Atendimento, Canais) — cada um com o seu Event Storming.
- **Adaptador por plataforma/cliente** (config por inquilino; DOM/Playwright p/ sites
  sem API — exige sair do modelo "só API").
- **n8n consumidor**: workflows de auto-atendimento que chamam `GET /imoveis`.
