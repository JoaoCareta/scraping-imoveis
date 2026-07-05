# Cache no n8n — scraper só faz scraping

**Data:** 2026-07-05 · **Status:** aprovado (decisão do João em conversa) · **Substitui:**
`2026-06-30-cache-fallback-on-miss-design.md` e `2026-06-30-cache-warmup-preload-design.md`.

## Contexto e motivação

O diagnóstico de 2026-07-05 (busca do caires devolvendo 0 imóveis) encontrou duas causas:

1. **Auth quebrada em produção**: a scraper-api exige `x-api-key` (env da VPS), mas a
   cache-api não enviava a chave nem no warm-up nem no fallback — todo caminho de dados
   terminava em 401, devolvido ao bot como corpo de erro com HTTP 200 ("0 imóveis").
2. **Cobertura truncada**: `kenloMaxPaginas=3` coletava 36 de 236 apartamentos à venda do
   caires, e as 3 primeiras páginas são dominadas por um lançamento em Ciudad del Este
   (Paraguai) — nenhum apto de 3 quartos de Araçatuba entrava no universo coletado.

Decisão do João: **o cache deixa de ser responsabilidade do scraper**. O n8n passa a ser o
dono do banco: consulta primeiro, decide quando chamar o scraper, e grava o que ele devolve.
O scraper fica com a única e exclusiva responsabilidade de fazer o scraping.

## Arquitetura

```
chat → [AGENT] Bot de imobiliária (tool buscar_imoveis)
            │ chama sub-workflow
            ▼
       [TOOL] buscar_imoveis ── SELECT em `imovel` (Postgres) ─ achou → responde
            │ 0 resultados
            ├─ catálogo fresco (sincronizado_em < 45 min) → responde 0 (vazio genuíno)
            └─ catálogo vazio/velho → Execute Workflow ─▶ [SYNC] ─▶ re-SELECT → responde
                                                            ▲
       [SYNC] Catálogo imóveis ◀── Schedule Trigger (30 min)┘
            GET scraper /imoveis?cliente=X&limit=5000 (x-api-key)
            upsert em `imovel` + desativa ausentes (por cliente)
```

- **scraper-api** (este repo): stateless, coleta ao vivo, `cliente` obrigatório, auth por
  `x-api-key`. Sem banco, sem cache. A **cache-api é removida** (código, compose, deploy).
- **Banco**: reusa a tabela `imovel` de `db/schema.sql` (multi-tenant por `cliente_id`,
  `payload` JSONB com o RecursoImovel completo, extensão `unaccent`). Quem grava é o n8n.
- **n8n** (3 workflows, em `D:\Documentos\n8n`):
  - `[SYNC] Catalogo imoveis (30min)` — Schedule (30 min) e também acionável por Execute
    Workflow com input `cliente`. Para cada cliente (`innove`, `caires`): uma chamada
    `limit=5000` ao scraper, upsert em `imovel` e desativação dos que sumiram do site.
    Coleta que volta vazia/erro **não** apaga o catálogo (mantém o anterior).
  - `[TOOL] buscar_imoveis (banco)` — sub-workflow chamado pelo agente. Normaliza filtros
    (coringas "tanto faz" → sem filtro; `finalidade` maiúscula; comodidades CSV → slugs),
    SELECT parametrizado (um único parâmetro JSONB — imune a injeção), `ORDER BY preco
    DESC NULLS LAST` (regra do prompt: mais caro primeiro; "sob consulta" no fim).
  - `[AGENT] Bot de imobiliária` — tool HTTP → tool de sub-workflow; system message
    sincronizado com o prompt v2 (ranking decrescente).

## Mudanças no scraper (este repo)

1. **Remover** `src/cache-api/` inteiro, o serviço `cache-api` do `docker-compose.yml`,
   os health checks de `:3001`/`cache.` do `scripts/deploy.sh` e a entry
   `src/cache-api/main-cache.ts` do `tsup.config.ts`.
2. **`limit` máximo: 500 → 5000** em `src/api/server.ts` — o sync do n8n puxa o catálogo
   inteiro numa chamada (caires completo ≈ 700 imóveis; innove ≈ 800), sem paginação no n8n.
3. **Cobertura do caires**: remover `kenloSeeds`/`kenloMaxPaginas` do `.env` → valem os
   defaults da fábrica (36 seeds = 18 tipos × 2 finalidades; até 200 páginas por seed).
   Seeds de tipo inexistente dão 404 na página 1 e são ignoradas. **Replicar no `.env` da
   VPS à mão** (gitignorado).

## Semântica de busca (preservada do cache-api)

- `quartos`: igualdade exata (`NULL` nunca casa).
- `precoMin`/`precoMax`: excluem imóveis sem preço ("sob consulta" fica de fora de busca
  com teto; aparece nas buscas sem teto, no fim da lista).
- `cidade`/`bairro`: `unaccent(lower(...))` — indiferente a acento e caixa.
- `comodidades`: containment JSONB (`@>`) sobre `payload->caracteristicas->comodidades`
  (todas exigidas).
- `finalidade`/`tipoImovel`: igualdade exata com os valores canônicos (`VENDA`/`ALUGUER`,
  slug minúsculo).

## Decisões e trade-offs

- **Fallback só com catálogo vazio ou velho** (> 45 min = 1,5× o intervalo do sync), e não
  em todo "0 filtrado": com o sync de 30 min, um 0 sobre catálogo fresco é um vazio genuíno
  — chamar o scraper ao vivo (~1–3 min com as seeds completas) só repetiria o 0 e travaria
  a conversa. Perfis raros continuam cobertos pelo afrouxamento de filtros do prompt.
- **Sync puxa o catálogo completo por cliente** (sem repassar filtros do usuário): o
  scraper coleta o site inteiro por request de qualquer forma; gravar tudo faz as próximas
  buscas (de qualquer perfil) acertarem o banco.
- **Desativação em vez de delete**: imóveis que saíram do site viram `ativo=false`
  (histórico preservado); a busca só considera `ativo`.
- A env `CLIENTE_PADRAO` morre com a cache-api: o `cliente` é obrigatório e vem do fluxo
  n8n (`$fromAI`, validado no sub-workflow) — tenant errado por omissão deixa de existir.

## Fora de escopo (pendências conhecidas)

- Secrets `VPS_SSH_KEY`/`VPS_SSH_FINGERPRINT` no GitHub (auto-deploy nunca rodou).
- Migração do Postgres para a VPS nova (`db/docker-compose.yml` + `schema.sql` à mão).
- Produto: `quartos` como "3+" e inclusão de "sob consulta" em buscas com teto.
