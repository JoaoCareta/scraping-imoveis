# Scraper multi-tenant por registro de clientes — design

## Contexto / problema

Hoje o scraper-api é **single-tenant**: carrega **um** cliente do ambiente
(`CLIENTE_ID/ORIGIN/PLATAFORMA/ESTRATEGIA/...`), `criarFonte(config)` resolve **uma**
fonte e `construirApp` monta um único fonte/repo/server ([fabrica.ts:37](../../../src/fontes/fabrica.ts), [main.ts:7](../../../src/main.ts)).
O `?cliente=` é só um **guard** (`recusaClienteIncompativel`): recusa com 409 quem não é o
cliente da instância ([server.ts:109](../../../src/api/server.ts)). Para atender N clientes hoje seria preciso **um
container por cliente**.

O próprio código antecipa a evolução: *"Quando o roteamento por registry/origin entrar,
esta verificação dá lugar à seleção da fonte."*

## Objetivo

**Um único container de scraper que conhece todos os clientes.** O n8n manda `?cliente=X`
e o scraper **seleciona a fonte daquele cliente** (plataforma/estratégia/origin próprios) e
coleta. Sem container por cliente.

## Não-objetivos (YAGNI)

- Sem registro em banco (o scraper continua **DB-free**).
- Sem config por-cliente para infra global (porta, host, timeout, API key seguem globais).
- Sem hot-reload do registro: mudar clientes = editar env + restart/redeploy.

## Decisões (do brainstorming)

1. **Registro via variável de ambiente** (mantém o scraper DB-free).
2. **Um JSON único `CLIENTES`** parseado e validado no boot.
3. **`cliente` obrigatório**: ausente → `400 CLIENTE_OBRIGATORIO`; desconhecido → `400 CLIENTE_DESCONHECIDO`. Sem default (o default `innove` vive na cache-api).
4. **Registro eager**: no boot, constrói `Map<clienteId → repo>`; falha rápido se a config for inválida.

## Design

### Config (`src/config.ts`)
- Nova `ClienteConfig`:
  ```ts
  interface ClienteConfig {
    id: string
    plataforma: "moldsystems" | "kenlo"
    estrategia: "html" | "api"      // default "html"
    origin: string
    solrNumRows?: number            // só moldsystems (default 5000)
    kenloSeeds?: string             // só kenlo
    kenloMaxPaginas?: number        // só kenlo
  }
  ```
- `Config` passa a ter **`clientes: ClienteConfig[]`** + infra global (`port`, `host`, `fetchTimeoutMs`, `logLevel`, `apiKey`). Saem os campos single-tenant (`clienteId`, `origin`, `plataforma`, `estrategia`, `kenloSeeds`, `kenloMaxPaginas`, `solrNumRows`).
- `carregarConfig(env)`:
  - `JSON.parse(env.CLIENTES)`; valida: lista não-vazia; cada `id` único e não-vazio; `plataforma ∈ {moldsystems, kenlo}`; `origin` presente; `estrategia` default `html`; `kenlo + api` → erro (não implementado, como hoje).
  - Erro de parse/validação **lança** → o container não sobe com config quebrada (fail-fast, log claro).

### Fábrica (`src/fontes/fabrica.ts`)
- `criarFonte(cliente: ClienteConfig, infra: { fetchTimeoutMs: number }): FonteDeImoveis` — mesma lógica de hoje, recebendo **uma** `ClienteConfig` em vez da `Config` global. `SEEDS_KENLO`/`parsearSeeds`/`TIPOS_KENLO` inalterados.

### Registro (`src/fontes/registro-de-fontes.ts`, novo)
- `criarRegistro(config): RegistroDeFontes` — a partir de `config.clientes`, constrói no boot um `Map<clienteId, FonteImovelRepository>` (uma fonte+repo por cliente).
- Expõe `obter(clienteId: string): FonteImovelRepository | undefined`.
- Uma responsabilidade só: resolver cliente → repo. Testável isolado.

### Server (`src/api/server.ts`)
- `criarServidor(registro, config)`.
- Remove `recusaClienteIncompativel`. Em `/imoveis` e `/imoveis/:ref`:
  1. lê `q.cliente`; ausente/vazio → `400 { evento:"Erro", erro:{ codigo:"CLIENTE_OBRIGATORIO" }}`;
  2. `registro.obter(cliente)`; `undefined` → `400 { ... codigo:"CLIENTE_DESCONHECIDO" }`;
  3. consulta o repo do cliente e devolve o envelope. O `clienteId` no payload já sai certo (carimbado pela fonte daquele cliente).
- Demais filtros/validação (`SCHEMA_IMOVEIS`, blindagem de coringas, `apiKey`) inalterados.

### Composition root (`src/main.ts`)
- `construirApp(config)` → `criarRegistro(config)` → `criarServidor(registro, config)`.

### Fluxo de request
```
GET /imoveis?cliente=caires&finalidade=VENDA
  → server lê cliente=caires
  → registro.obter("caires") → repo(KenloFonte caires)
  → buscarTodos → filtra/mapeia → envelope ColetaConcluida (clienteId=caires)
```

### Erros
| Situação | Resposta |
|---|---|
| `CLIENTES` inválido/vazio no boot | processo falha ao subir (log claro) |
| request sem `cliente` | `400 CLIENTE_OBRIGATORIO` |
| `cliente` fora do registro | `400 CLIENTE_DESCONHECIDO` |
| fonte indisponível / timeout | `503` / `504` (inalterado) |

## Deploy
- `docker-compose.yml` (`scraper-api`): trocar as envs single-tenant por **`CLIENTES`** (JSON), ex.:
  ```
  CLIENTES=[
    {"id":"innove","plataforma":"moldsystems","origin":"https://imobiliariainnove.com.br","solrNumRows":5000},
    {"id":"caires","plataforma":"kenlo","estrategia":"html","origin":"https://www.cairesengimob.com.br"}
  ]
  ```
- **Um container serve os dois.** A **cache-api não muda**: já envia `?cliente=`, e o `SCRAPER_URL` único agora atende qualquer tenant (o fallback passa a funcionar para todos os clientes).
- `.env.example` atualizado com o formato `CLIENTES` e exemplos innove + caires.

## Testes
- **config**: parse/validação do `CLIENTES` (válido; JSON inválido; lista vazia; faltando `id`/`origin`; plataforma inválida; `kenlo+api` → erro; default de `estrategia`).
- **fabrica**: `criarFonte` por `ClienteConfig` (moldsystems e kenlo).
- **registro**: `obter` conhecido vs desconhecido; um repo por cliente.
- **server** (com fontes fake, sem rede): sem cliente → 400; desconhecido → 400; `innove` → fonte Mold; `caires` → fonte Kenlo. O teste atual do guard 409 é substituído.
- **main.test**: `construirApp` constrói o app a partir de um `CLIENTES` de teste sem tocar a rede.

## Consequências / migração
- Destrava o caires **sem container extra**: basta incluí-lo no `CLIENTES` e popular o cache com `cliente_id='caires'`.
- Quebra de contrato de config: quem subia o scraper com `CLIENTE_ID/ORIGIN/...` precisa migrar para `CLIENTES`. Atualizar `.env.example` e o README/`docs/API.md` (a seção do scraper).
- O guard 409 (`CLIENTE_NAO_ATENDIDO`) deixa de existir no scraper — agora a resposta para cliente inválido é `400 CLIENTE_DESCONHECIDO`.
