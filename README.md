# scraping-imoveis

Módulo de **scraping de imóveis** (TypeScript) — parte do sistema de atendimento para
corretores. A fonte de imóveis vive atrás da interface `FonteDeImoveis`; o primeiro
adaptador é o da plataforma **MoldSystems** (API Solr). Vendável à parte.

> Estado e próximos passos: ver **[TODO.md](./TODO.md)**.

## Requisitos

- **Node.js 20+** (testado em 24) — os spikes usam `fetch` global e top-level `await`.
- npm

## Instalar

```bash
npm install
```

## Testar / correr no VS Code

Abre a pasta `D:\Documentos\scrapping` no VS Code e usa o terminal integrado (`Ctrl+\``):

```bash
npm test            # corre toda a suite (Vitest) — 82 testes
npm run test:watch  # modo watch (re-corre ao guardar)
npm run typecheck   # tsc --noEmit (verifica tipos, sem compilar)

# um ficheiro só:
npx vitest run src/fontes/moldsystems/solr-mapper.test.ts
```

**Dica VS Code:** instala a extensão **Vitest** (publisher: *Vitest*) para correr/depurar
testes no painel *Testing*, ver verde/vermelho inline e pôr breakpoints.

## Correr os "spikes" (demonstrações que batem na API real)

Os scripts em `spikes/` são **exploratórios/throwaway** (JS puro, sem build). Correm com Node:

```bash
node spikes/teste-apartamentos-3q.mjs   # lista apartamentos com 3 quartos (aluguel/venda)
node spikes/imovel-1910-campos.mjs      # campos do imóvel COD 1910
node spikes/api-1910-final.mjs          # consulta crua à API Solr
```

> A versão "a sério" é o adaptador em `src/fontes/moldsystems/` (mapper puro, já feito) +
> o cliente HTTP `MoldSystemsFonte` (**Fase 4b, ainda por fazer** — só aí haverá um
> `npm run scrape` que corre o scraper de ponta a ponta).

## Estrutura

```
src/
  shared/           Result<T,E>
  domain/imovel/    Imovel (entidade rica) + value objects + ImovelDto + mapper
  normalizadores/   parsing BR (preço R$, área m², inteiros, finalidade/tipo/cidade/ref de URL)
  fontes/
    fonte-de-imoveis.ts   interface FonteDeImoveis + ResultadoExtracao
    moldsystems/          adaptador da plataforma MoldSystems (Solr doc -> Imovel)
docs/   specs/ plans/ spikes/  (design, planos TDD, descobertas)
spikes/ scripts exploratórios (.mjs)
```

## Serviço HTTP / API

O scraper corre como **serviço HTTP stateless** (sem cache, sem BD): cada pedido
coleta da API do MoldSystems, mapeia e devolve um Read Model rico (`RecursoImovel`).

### Correr localmente

```bash
npm run dev                  # tsx watch (desenvolvimento)
npm run build && npm start   # produção (dist/main.js)
```

### Endpoints
- `GET /health` → `{ "status": "ok" }`
- `GET /imoveis?finalidade=ALUGUER&precoMax=2000&quartos=3&cidade=Bauru` → envelope `ColetaConcluida`
- `GET /imoveis/:ref`

A resposta de `/imoveis` é um envelope com sabor a evento de domínio:

```jsonc
{ "evento": "ColetaConcluida", "extraidoEm": "...", "total": 42, "rejeitados": 3, "imoveis": [ /* RecursoImovel */ ] }
```

### Deploy (docker compose)

O deploy tem **três peças**, em stacks separados, ligados por uma rede docker
compartilhada (`root_default`):

| Stack | Container(s) | Papel |
|---|---|---|
| `db/docker-compose.yml` | `inove-postgres` | Banco. **Grava:** n8n · **Lê:** cache-api. O scraper NÃO toca aqui. |
| `docker-compose.yml` (raiz) | `scraper-api`, `cache-api` | `scraper-api` só **lê** da fonte (Solr), stateless. `cache-api` lê o catálogo no banco. |
| (avulso) | `n8n` | Orquestra; **grava** no banco após ler do scraper. |

**A rede `root_default` é avulsa** — não é criada por nenhum compose nem pelo n8n.
Crie-a uma vez e ligue o n8n a ela:

```bash
docker network create root_default          # uma vez
docker network connect root_default n8n     # liga o n8n avulso à rede (religar se recriar o n8n)
```

Depois suba os stacks (db primeiro, pois o scraper/cache dependem do banco):

```bash
cp .env.example .env                         # e ajustar
(cd db && docker compose up -d)              # Postgres (reusa o volume de dados existente)
docker compose up -d --build                 # scraper-api (:3000) + cache-api (:3001)
```

Confirmar: `GET http://localhost:3000/health` (scraper) e `:3001/health` (cache).

Para proteger, preencher `API_KEY` no `.env` e enviar o header `x-api-key`.
Dentro da rede `root_default`, os serviços se alcançam pelo nome do container
(`http://scraper-api:3000`, `inove-postgres:5432`).
