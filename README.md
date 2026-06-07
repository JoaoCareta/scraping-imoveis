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

## Integrar com o n8n

O n8n é Node, mas **não importa o código TypeScript diretamente**. Caminhos possíveis:

1. **Já hoje (teste rápido no n8n):** nó **HTTP Request** a chamar a API MoldSystems
   diretamente —
   `GET https://imobiliariainnove.com.br/api/solr/search/{json}` (ver `docs/spikes/`) —
   e um nó **Code** para filtrar/mapear. É o que os spikes fazem, mas dentro do n8n.
2. **Caminho limpo (planeado):** o serviço expõe uma **API REST** própria
   (`GET /imoveis?filtros` → `ImovelDto`); o n8n chama via **HTTP Request**. Requer a
   **Fase 4b** (cliente) + **Fase 6** (API REST). É a forma recomendada.
3. **Avançado:** compilar TS→JS (`tsconfig.build.json` + `tsc`), publicar como pacote npm
   e construir um **nó n8n personalizado**.

**Recomendado:** opção 2. Por agora, a opção 1 serve para validar o fluxo no n8n.
```
