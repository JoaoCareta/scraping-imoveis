-- Atendimento Inove — schema event-driven, multi-tenant por cliente_id.
-- Aplicado automaticamente pelo postgres na primeira subida (docker-entrypoint-initdb.d).
-- Idempotente (IF NOT EXISTS + migrações guardadas) para reaplicar à mão sem erro,
-- inclusive sobre uma base single-tenant antiga (backfill do tenant 'innove').

-- Busca de cidade/bairro insensível a acentos (modelo às vezes manda "Aracatuba" sem ç).
CREATE EXTENSION IF NOT EXISTS unaccent;
-- Permite índice GIN composto (escalar + jsonb): cliente_id + comodidades num só índice.
CREATE EXTENSION IF NOT EXISTS btree_gin;

-- =========================================================
-- ① Catálogo de imóveis — multi-tenant. Populado pelo n8n
--    ([SYNC] Catalogo imoveis, 30 min + cache-miss da tool
--    buscar_imoveis); lido pelas buscas do bot.
-- =========================================================
CREATE TABLE IF NOT EXISTS imovel (
  cliente_id      TEXT NOT NULL,            -- tenant: 'innove', 'caires', ...
  ref             TEXT NOT NULL,
  finalidade      TEXT NOT NULL,            -- 'ALUGUER' | 'VENDA'
  tipo_imovel     TEXT,
  quartos         INTEGER,
  preco           NUMERIC(12,2),
  cidade          TEXT,
  bairro          TEXT,
  ativo           BOOLEAN NOT NULL DEFAULT TRUE,
  payload         JSONB   NOT NULL,         -- RecursoImovel completo (resposta do scraper)
  sincronizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (cliente_id, ref, finalidade) -- um ref pode ter ALUGUER e VENDA, por cliente
);

-- Migração para instalações anteriores (tabela sem cliente_id). Idempotente:
-- não faz nada numa base já nova.
ALTER TABLE imovel ADD COLUMN IF NOT EXISTS cliente_id TEXT;
UPDATE imovel SET cliente_id = 'innove' WHERE cliente_id IS NULL;   -- backfill do tenant legado
ALTER TABLE imovel ALTER COLUMN cliente_id SET NOT NULL;
DO $$
BEGIN
  -- Recompõe a PK para incluir cliente_id, se ainda não inclui.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid = 'imovel'::regclass AND c.contype = 'p'
      AND (SELECT attnum FROM pg_attribute
            WHERE attrelid = 'imovel'::regclass AND attname = 'cliente_id') = ANY (c.conkey)
  ) THEN
    ALTER TABLE imovel DROP CONSTRAINT IF EXISTS imovel_pkey;
    ALTER TABLE imovel ADD CONSTRAINT imovel_pkey PRIMARY KEY (cliente_id, ref, finalidade);
  END IF;
END $$;

-- Índices liderados por cliente_id → toda query por tenant usa o índice e escala em massa.
-- Recriados (DROP+CREATE) porque a definição mudou de single-tenant para tenant-first.
DROP INDEX IF EXISTS idx_imovel_filtros;
DROP INDEX IF EXISTS idx_imovel_preco;
DROP INDEX IF EXISTS idx_imovel_comodidades;
CREATE INDEX IF NOT EXISTS idx_imovel_filtros
  ON imovel (cliente_id, finalidade, tipo_imovel, quartos, cidade, bairro);
CREATE INDEX IF NOT EXISTS idx_imovel_preco
  ON imovel (cliente_id, preco);

-- Busca por presença de comodidades (slugs + grupos no payload), escopada por tenant.
-- jsonb_path_ops: só precisamos do operador de contenção (@>). O btree_gin permite
-- combinar cliente_id no mesmo índice GIN → containment já filtrado pelo tenant.
CREATE INDEX IF NOT EXISTS idx_imovel_comodidades
  ON imovel USING GIN (cliente_id, (payload->'caracteristicas'->'comodidades') jsonb_path_ops);

-- =========================================================
-- ② Conversas (event store, append-only) — multi-tenant
-- =========================================================
CREATE TABLE IF NOT EXISTS conversa_evento (
  id          BIGSERIAL PRIMARY KEY,
  cliente_id  TEXT,                         -- tenant (preenchido pelo fluxo n8n do cliente)
  sessao_id   TEXT NOT NULL,
  tipo        TEXT NOT NULL,                -- ConversaIniciada | MensagemRecebida | RespostaEnviada
                                            -- | BuscaExecutada | LeadQualificado | ConversaEncerrada
  payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
  ocorrido_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE conversa_evento ADD COLUMN IF NOT EXISTS cliente_id TEXT;
CREATE INDEX IF NOT EXISTS idx_evento_sessao  ON conversa_evento (sessao_id, ocorrido_em);
CREATE INDEX IF NOT EXISTS idx_evento_tipo    ON conversa_evento (tipo);
CREATE INDEX IF NOT EXISTS idx_evento_cliente ON conversa_evento (cliente_id, sessao_id, ocorrido_em);

-- =========================================================
-- ③ Avaliações (saída do analisador Ollama) — multi-tenant
-- =========================================================
CREATE TABLE IF NOT EXISTS avaliacao_conversa (
  id                 BIGSERIAL PRIMARY KEY,
  cliente_id         TEXT,                  -- tenant
  sessao_id          TEXT NOT NULL,
  nota_agilidade     INTEGER,               -- 0..10
  aderencia_fluxo    INTEGER,               -- 0..10
  problemas          JSONB NOT NULL DEFAULT '[]'::jsonb,
  sugestoes_melhoria JSONB NOT NULL DEFAULT '[]'::jsonb,
  resumo             TEXT,
  modelo             TEXT,                  -- ex.: 'qwen3:8b'
  avaliado_em        TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE avaliacao_conversa ADD COLUMN IF NOT EXISTS cliente_id TEXT;
CREATE INDEX IF NOT EXISTS idx_avaliacao_sessao  ON avaliacao_conversa (sessao_id, avaliado_em);
CREATE INDEX IF NOT EXISTS idx_avaliacao_cliente ON avaliacao_conversa (cliente_id, sessao_id, avaliado_em);

-- =========================================================
-- Read-models (cliente_id exposto ao final — adição não-quebra-consumidor)
-- =========================================================
CREATE OR REPLACE VIEW conversa_resumo AS
SELECT
  e.sessao_id,
  min(e.ocorrido_em) AS iniciada_em,
  max(e.ocorrido_em) AS ultima_em,
  count(*) FILTER (WHERE e.tipo = 'MensagemRecebida')  AS msgs_lead,
  count(*) FILTER (WHERE e.tipo = 'RespostaEnviada')   AS msgs_bot,
  bool_or(e.tipo = 'BuscaExecutada')                   AS buscou,
  bool_or(e.tipo = 'ConversaEncerrada')                AS encerrada,
  (SELECT r.payload->>'status' FROM conversa_evento r
     WHERE r.sessao_id = e.sessao_id AND r.tipo = 'RespostaEnviada'
     ORDER BY r.ocorrido_em DESC LIMIT 1)              AS ultimo_status,
  (SELECT r.payload->>'perfil' FROM conversa_evento r
     WHERE r.sessao_id = e.sessao_id AND r.tipo = 'RespostaEnviada'
     ORDER BY r.ocorrido_em DESC LIMIT 1)              AS perfil,
  max(e.cliente_id)                                    AS cliente_id
FROM conversa_evento e
GROUP BY e.sessao_id;

CREATE OR REPLACE VIEW metricas_agilidade AS
SELECT
  e.sessao_id,
  EXTRACT(EPOCH FROM (max(e.ocorrido_em) - min(e.ocorrido_em)))::int AS duracao_seg,
  count(*) FILTER (WHERE e.tipo = 'MensagemRecebida') AS turnos_lead,
  bool_or(e.tipo = 'LeadQualificado')                 AS qualificou,
  bool_or(e.tipo = 'BuscaExecutada')                  AS buscou,
  max(e.cliente_id)                                   AS cliente_id
FROM conversa_evento e
GROUP BY e.sessao_id;
