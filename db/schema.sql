-- Atendimento Inove — schema event-driven
-- Aplicado automaticamente pelo postgres na primeira subida (docker-entrypoint-initdb.d).
-- Idempotente (IF NOT EXISTS) para reaplicar à mão sem erro.

-- Busca de cidade/bairro insensível a acentos (modelo às vezes manda "Aracatuba" sem ç).
CREATE EXTENSION IF NOT EXISTS unaccent;

-- =========================================================
-- ① Catálogo de imóveis (cache do scraper-api)
-- =========================================================
CREATE TABLE IF NOT EXISTS imovel (
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
  PRIMARY KEY (ref, finalidade)             -- um ref pode ter ALUGUER e VENDA
);
CREATE INDEX IF NOT EXISTS idx_imovel_filtros ON imovel (finalidade, tipo_imovel, quartos, cidade, bairro);
CREATE INDEX IF NOT EXISTS idx_imovel_preco   ON imovel (preco);

-- Busca por presença de comodidades (slugs + grupos no payload).
-- jsonb_path_ops: índice menor/mais rápido — só precisamos do operador de contenção (@>).
CREATE INDEX IF NOT EXISTS idx_imovel_comodidades
  ON imovel USING GIN ((payload->'caracteristicas'->'comodidades') jsonb_path_ops);

-- =========================================================
-- ② Conversas (event store, append-only)
-- =========================================================
CREATE TABLE IF NOT EXISTS conversa_evento (
  id          BIGSERIAL PRIMARY KEY,
  sessao_id   TEXT NOT NULL,
  tipo        TEXT NOT NULL,                -- ConversaIniciada | MensagemRecebida | RespostaEnviada
                                            -- | BuscaExecutada | LeadQualificado | ConversaEncerrada
  payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
  ocorrido_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_evento_sessao ON conversa_evento (sessao_id, ocorrido_em);
CREATE INDEX IF NOT EXISTS idx_evento_tipo   ON conversa_evento (tipo);

-- =========================================================
-- ③ Avaliações (saída do analisador Ollama)
-- =========================================================
CREATE TABLE IF NOT EXISTS avaliacao_conversa (
  id                 BIGSERIAL PRIMARY KEY,
  sessao_id          TEXT NOT NULL,
  nota_agilidade     INTEGER,               -- 0..10
  aderencia_fluxo    INTEGER,               -- 0..10
  problemas          JSONB NOT NULL DEFAULT '[]'::jsonb,
  sugestoes_melhoria JSONB NOT NULL DEFAULT '[]'::jsonb,
  resumo             TEXT,
  modelo             TEXT,                  -- ex.: 'qwen3:8b'
  avaliado_em        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_avaliacao_sessao ON avaliacao_conversa (sessao_id, avaliado_em);

-- =========================================================
-- Read-models
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
     ORDER BY r.ocorrido_em DESC LIMIT 1)              AS perfil
FROM conversa_evento e
GROUP BY e.sessao_id;

CREATE OR REPLACE VIEW metricas_agilidade AS
SELECT
  e.sessao_id,
  EXTRACT(EPOCH FROM (max(e.ocorrido_em) - min(e.ocorrido_em)))::int AS duracao_seg,
  count(*) FILTER (WHERE e.tipo = 'MensagemRecebida') AS turnos_lead,
  bool_or(e.tipo = 'LeadQualificado')                 AS qualificou,
  bool_or(e.tipo = 'BuscaExecutada')                  AS buscou
FROM conversa_evento e
GROUP BY e.sessao_id;
