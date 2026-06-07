# TODO / Roadmap — scraping-imoveis

Atualizado: 2026-06-07 · Legenda: `[x]` feito · `[ ]` pendente · `[~]` parcial

## Visão (programa completo)

Sistema de atendimento para corretores (WhatsApp/Instagram/Messenger via n8n) =
**Núcleo partilhado** + **3 adaptadores de canal**. O **módulo de scraping** (este repo)
é uma peça vendável à parte que alimenta o Núcleo *ou* se vende sozinha.

---

## Módulo de Scraping

### ✅ Feito
- [x] **Fase 1 — Núcleo de domínio:** `Imovel` (entidade rica), value objects
  (`Ref`/`Preco`/`Localizacao`/`UrlSite` + `Finalidade`), `ImovelDto` + mapper bidirecional.
- [x] **Moeda BRL** + **localização BR** (`bairro`/`cidade`/`estado`).
- [x] **Fase 2 — Normalizadores BR:** `parsearNumeroBr`, `parsearValorReais`, `parsearAreaM2`,
  `parsearInteiro`, e `finalidade/tipo/cidade/refDeUrl`.
- [x] **Descoberta da API MoldSystems (Solr)** — documentada em `docs/spikes/`.
- [x] **Fase 4a — Adaptador MoldSystems:** mapper puro `Solr doc → Imovel`
  (`imoveisDeSolrDoc`), validado com a fixture **real do COD 1910**.
- [x] **82 testes verdes**, typecheck limpo, revisões spec+qualidade aplicadas.

### ⏳ Pendente
- [ ] **Fase 4b — `MoldSystemsFonte implements FonteDeImoveis` (cliente HTTP):**
  - [ ] `fetch` de `/api/solr/search/{json}` com `{ numRows }` + **paginação** (via `numFound`)
  - [ ] montagem com `imoveisDeSolrDoc` → `ResultadoExtracao` (válidos + rejeitados)
  - [ ] timeouts, retries/backoff, tratamento de erros de rede
  - [ ] testes com `fetch` mockado + 1 teste de integração real (opcional)
  - [ ] **entry point** `npm run scrape` (correr o scraper ao vivo) ← desbloqueia "executar no VS Code"
- [ ] **Fase 3 — Persistência (PostgreSQL):** `ImovelRepository`, schema core + `extras` JSONB,
  chave `(clienteId, ref, finalidade)`, diff/estado (novos/alterados/removidos), **circuit-breaker**.
- [ ] **Fase 5 — Execução & resiliência:** scheduler por cliente, alertas (taxa de rejeição,
  queda abrupta) via n8n/Sentry.
- [ ] **Fase 6 — Entrega:** **API REST** de query (`GET /imoveis?filtros` → `ImovelDto`) +
  eventos de mudança. **(É por aqui que o n8n consome.)**
- [ ] **Adaptador DOM** (Cheerio/Playwright) para sites *sem* API — reutiliza os normalizadores da Fase 2.

### 🔧 Dívida técnica / refinamentos
- [ ] `localizacao.estado` guarda o nome por extenso ("São Paulo") → normalizar para UF ("SP").
- [ ] `areaDeDoc`/`banheirosDeDoc` dependem de `idtCharacteristics`/resumo → validar estabilidade
  entre inquilinos MoldSystems.
- [ ] Confirmar semântica de `indStatus` (hoje só `flgShowSite`/`indBusy` definem `ativo`;
  `indStatus` vai para `extras`).
- [ ] `tsconfig.build.json` + build TS→JS se for preciso pacote npm / nó n8n.
- [ ] Publicar repositório num remoto (GitHub) — atualmente é só local.

### ❓ Decisões em aberto (spec §10)
- [ ] Engine de BD (recomendado: **PostgreSQL**).
- [ ] Acesso dos consumidores: **API REST** (recomendado) vs leitura direta da BD.
- [ ] Canal preciso dos alertas (n8n / Sentry).

---

## Outros módulos (depois do scraping)
- [ ] **Núcleo de atendimento:** triagem LLM, matching filtros→imóveis, construtor de mensagem,
  captura de lead/handoff.
- [ ] **Adaptadores de canal:** WhatsApp → Instagram → Messenger (deltas finos sobre o Núcleo).
- [ ] **Junção com a planilha de links do Marketplace** (por `ref`) — vive no Núcleo.
