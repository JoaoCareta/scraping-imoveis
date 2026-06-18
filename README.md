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

1. `cp .env.example .env` e ajustar.
2. `docker compose up -d --build`.
3. A API fica acessível em `http://localhost:3000` (e na rede local, porta 3000)
   enquanto o container correr. Confirmar com `GET http://localhost:3000/health`.

Para proteger, preencher `API_KEY` no `.env` e enviar o header `x-api-key`.
Para integrar com o n8n no mesmo host, ligar o serviço à rede docker do n8n
(ver comentário em `docker-compose.yml`) e chamar por `http://scraper-api:3000`.
