# Warm-up de cache na cache-api (pre-load no boot) — design

## Contexto / problema

A cache-api (`:3001`) serve o catálogo do tenant lendo a tabela `imovel` (rápido). Para o
**caires** (Kenlo, scraping HTML) não há dados no banco ainda, e um crawl ao vivo do site
inteiro leva **minutos** por request — inviável para o chat. O innove (Solr) é rápido e já
tem dados (carregados pela pipeline n8n).

## Objetivo

No **boot da cache-api**, **pré-carregar** o catálogo dos clientes que precisam (ex.: caires)
para a tabela `imovel`, para que `GET /imoveis?cliente=caires` saia **rápido do cache** em vez
de disparar um crawl por mensagem.

## Não-objetivos (YAGNI)

- Sem refresh periódico (só no boot; atualiza no próximo restart/redeploy).
- Sem warm-up do innove (a pipeline n8n já popula; opt-in evita conflito).
- Sem mudar o `GET /imoveis` da cache-api (warm-up é à parte).

## Decisões (do brainstorming)

1. **Quem escreve:** a **cache-api** faz o warm-up no boot (passa a também *escrever* no `imovel`; hoje só lê).
2. **Escopo:** **opt-in por cliente** via env da cache-api **`PRELOAD_CLIENTES`** (CSV). Só caires por enquanto.
3. **Frescor:** **só no boot**.
4. **Implementação:** warm-up **assíncrono em background** (não bloqueia boot/healthcheck) + **substituição atômica** do catálogo por transação.

## Design

### Config (cache-api)
- Nova env **`PRELOAD_CLIENTES`** (CSV). Vazio → não pré-carrega nada (comportamento atual).
- Reusa `SCRAPER_URL` e o pool do Postgres já existentes.
- **Categorias/escopo** ficam no `CLIENTES` do *scraper* (seeds do caires) — não na cache-api.

### Componente: `src/cache-api/precarregador.ts` (novo)
- `precarregarTodos(deps, clientes: string[]): Promise<void>` — para cada cliente: busca no scraper e substitui o catálogo. Erros por cliente são isolados (um cliente que falha não impede os outros).
- Dependências injetadas (testável sem rede/DB):
  - `buscarNoScraper(cliente: string): Promise<RecursoImovel[]>`
  - `substituirCatalogo(cliente: string, imoveis: RecursoImovel[]): Promise<number>`
- `buscarNoScraper` (impl em `main-cache.ts`): `GET {SCRAPER_URL}/imoveis?cliente=X` → `envelope.imoveis ?? []`.
- Chamado em `main-cache.ts` **depois** do `app.listen`, fire-and-forget com `.catch` (log).

### Escrita no DB — `substituirCatalogo` (em `src/cache-api/imovel-cache.ts`)
- Assinatura: `substituirCatalogo(tx, cliente, imoveis): Promise<number>` — `tx(sql, params)` é a query **dentro de uma transação** (devolve nº inseridos).
- A transação real (BEGIN/COMMIT/ROLLBACK + ciclo do client via `pool.connect()`) é montada em `main-cache.ts` como `comTransacao(fn)` — **não** dá para usar o `consulta` compartilhado, porque o `pool.query` pode pegar uma conexão diferente por chamada e não manteria a transação. A dep injetada no precarregador é `substituirCatalogo(cliente, imoveis) = comTransacao(tx => substituirCatalogoTx(tx, cliente, imoveis))`.
- Dentro da tx: `DELETE FROM imovel WHERE cliente_id=$1` → `INSERT` de cada imóvel. Atômico (MVCC: leitores veem o catálogo antigo até o commit; sem janela vazia). `ON CONFLICT (cliente_id, ref, finalidade) DO UPDATE` por segurança contra refs repetidas no lote. Se algo lançar → ROLLBACK (catálogo intacto).
- Mapeamento `RecursoImovel → colunas`:
  - `cliente_id` = cliente · `ref` = `imovel.ref` · `finalidade` = `imovel.finalidade`
  - `tipo_imovel` = `caracteristicas.tipoImovel` · `quartos` = `caracteristicas.quartos`
  - `preco` = `preco?.valor ?? null` · `cidade`/`bairro` = `localizacao.*`
  - `ativo` = `estado.ativo` · `payload` = o RecursoImovel inteiro (JSONB)

### Fluxo
```
cache-api sobe → app.listen → (background) precarregarTodos(deps, ["caires"]):
  caires: GET scraper/imoveis?cliente=caires → [RecursoImovel]
          se ok e não-vazio → tx: DELETE caires + INSERT novos → commit
          log "caires: N imóveis pré-carregados"
```
Durante o warm-up, `?cliente=caires` na cache-api ainda cai no fallback do scraper (lento);
após o commit, passa a vir do cache (rápido).

### Erros (não derrubar nem zerar)
- Scraper down/timeout/erro → loga warn, **mantém o catálogo atual**, segue. A cache-api continua servindo normalmente.
- Retorno **vazio** (0 imóveis) → **não substitui** (evita zerar o caires por engano).

## Testes
- `precarregador` (fakes): busca ok → chama substituir; busca lança → não substitui e não propaga; vazio → não substitui; vários clientes (um falha, outro segue).
- `substituirCatalogoTx` (fake `tx` capturando SQL/params): mapeia campos certo; emite DELETE escopado por `cliente_id` antes dos INSERT; nº inseridos correto. (O `comTransacao` real — BEGIN/COMMIT/ROLLBACK + client do pool — é glue fino em `main-cache.ts`, coberto na verificação manual do deploy.)
- `GET /imoveis` da cache-api: inalterado (regressão).

## Deploy
- `docker-compose.yml` (cache-api): add `PRELOAD_CLIENTES=caires`.
- `.env` CLIENTES (scraper): caires com os seeds das categorias a pré-carregar — default **residencial** (apartamento, casa, cobertura, sobrado, kitnet, flat, studio, terreno), ajustável (comercial: sala, salao, ponto, loja, barracao, galpao). `kenloMaxPaginas` opcional para bound do crawl.

## Consequências
- A cache-api deixa de ser estritamente read-only (passa a escrever no warm-up). Atualizar o comentário em `db/docker-compose.yml`.
- Boot da cache-api fica rápido (warm-up é background); o caires fica rápido assim que o primeiro warm-up commita.
- Sem refresh: para atualizar o caires, reiniciar/redeploy a cache-api (ou rodar o warm-up manualmente no futuro).
