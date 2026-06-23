# Atendimento Inove — Persistência de conversas, cache de catálogo e analisador Ollama

- **Data:** 2026-06-23
- **Estado:** Proposto (aguarda revisão do user)
- **Âmbito:** Evolução do fluxo n8n `[IA] Teste de redirecionamento` + nova infra PostgreSQL. O `scraper-api` (repositório `scraping-imoveis`) permanece **stateless e inalterado**.

---

## 1. Contexto e objetivo

O fluxo n8n atual faz o primeiro atendimento de leads imobiliários (DMs do Instagram): um **AI Agent** (Ollama `qwen3:8b`, local) qualifica a busca e chama a ferramenta `buscar_imoveis`, que hoje é um `httpRequestTool` apontando ao vivo para o `scraper-api` (`GET /imoveis`). Há uma `Simple Memory` (buffer de 10 mensagens em RAM) e um pós-processamento (`Code` → `If` → `Chat`) que extrai um bloco `<JSON>` da resposta.

Limitações atuais:
- **Sem persistência.** Nada do que foi conversado/acertado sobrevive ao fim da sessão.
- **Cada conversa bate na rede.** Toda busca chama o `scraper-api` (que chama o Solr da MoldSystems) — lento (~14 s observados) e repetitivo.
- **Sem visão de qualidade.** Não há como avaliar a agilidade do atendimento nem os pontos de melhoria do prompt do agente.
- **Dois bugs no pós-processamento:** o nó `Code in JavaScript` tem markdown colado no fim do `jsCode` (erro de sintaxe); o nó `If` compara `status === "completo"`, valor que **nunca** ocorre (os status reais são `qualificando/respondido/redirecionado/concluido`).

Objetivos:
1. **Persistir todas as conversas** num modelo **event-driven** (event store) com read-models ricos.
2. **Cache local do catálogo** de imóveis, atualizado periodicamente; o agente consulta o banco e só chama a API quando o cache está vazio.
3. **Analisador Ollama sob demanda** que lê as conversas e produz avaliações (agilidade, aderência ao fluxo, pontos de melhoria do prompt).

---

## 2. Decisões de design

| # | Decisão | Justificativa |
|---|---------|---------------|
| D1 | **n8n grava direto no Postgres**, mas num **schema event-driven** (event store + read-models). Sem serviço novo. | Atende "classes ricas, event-driven" sem mais um container/serviço para manter. As "classes ricas" são os tipos de evento + views. |
| D2 | **Um container PostgreSQL** novo no `docker compose`, base `inove`. | Infra única e local, como o resto. |
| D3 | **`scraper-api` continua stateless.** O cache vive no Postgres do lado consumidor. | Mantém a decisão original do scraper; separa responsabilidades. |
| D4 | **Cache-aside** no `buscar_imoveis`: consulta `imovel`; **se a tabela estiver vazia**, chama o scraper, grava e devolve. | Respostas rápidas; API só em cache frio ou no sync. |
| D5 | **"Vazio" = tabela sem nenhum imóvel** (cache frio), **não** "filtro sem resultado". | Filtro sem match devolve "nenhum imóvel" — não chama a API à toa. |
| D6 | **Sync agendado a cada 6 h** (4×/dia). | Catálogo muda devagar (~818 imóveis); equilíbrio frescura/carga. |
| D7 | **Analisador sob demanda**, escopo = **conversas encerradas ainda não avaliadas**. | Você dispara quando quiser; não reprocessa o que já analisou. |
| D8 | **Persistência é best-effort:** falha de gravação **nunca** quebra a resposta ao lead. | A experiência do cliente é prioridade sobre o registo. |
| D9 | Artefactos no repo `scraping-imoveis` (`docs/specs`, DDL, `docker-compose`, JSONs do n8n). | Convenção local: `docs/` é versionado. |

---

## 3. Arquitetura geral

Três subsistemas independentes sobre um PostgreSQL compartilhado, orquestrados por três workflows n8n. (Ver diagrama no chat de design.)

- **① Catálogo (cache):** `Sync (agendado)` → `scraper-api` → tabela `imovel`. O agente consulta `imovel` (fallback ao scraper se vazia).
- **② Conversas (event store):** o `Chat workflow` grava eventos em `conversa_evento` a cada turno; read-models em views.
- **③ Analisador (Ollama):** workflow sob demanda lê `conversa_evento`, chama o Ollama e grava `avaliacao_conversa`.

---

## 4. Infra compartilhada

- **PostgreSQL** (imagem `postgres:16`) como serviço novo no `docker-compose.yml`, com volume nomeado e healthcheck. Base `inove`, usuário/senha via `.env`.
- **Credencial Postgres no n8n** apontando para o container (host `host.docker.internal` ou rede docker compartilhada com o n8n — a definir no plano conforme a rede atual do n8n).
- **Ollama** já existente (credencial *"Ollama account"*, `qwen3:8b`). Reutilizado pelo agente e pelo analisador.
- **DDL versionada** em `db/schema.sql` no repo do scraper.

---

## 5. Subsistema ① — Catálogo de imóveis (cache)

### 5.1 Esquema

```sql
CREATE TABLE imovel (
  ref             TEXT NOT NULL,
  finalidade      TEXT NOT NULL,          -- 'ALUGUER' | 'VENDA'
  tipo_imovel     TEXT,
  quartos         INTEGER,
  preco           NUMERIC(12,2),
  cidade          TEXT,
  bairro          TEXT,
  ativo           BOOLEAN NOT NULL DEFAULT TRUE,
  payload         JSONB   NOT NULL,        -- RecursoImovel completo (resposta do scraper)
  sincronizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ref, finalidade)            -- um ref pode ter ALUGUER e VENDA
);
CREATE INDEX idx_imovel_filtros ON imovel (finalidade, tipo_imovel, quartos, cidade, bairro);
CREATE INDEX idx_imovel_preco   ON imovel (preco);
```

> Chave composta `(ref, finalidade)` porque o scraper devolve 818 `RecursoImovel` a partir de 766 docs — o mesmo `ref` pode aparecer como ALUGUER **e** VENDA.

### 5.2 Sync workflow (novo, agendado)

`Schedule Trigger (a cada 6 h)` → `HTTP GET {scraper}/imoveis?limit=500` (amplo, sem filtros) → `Split Out` (imoveis[]) → `Postgres Upsert` em `imovel` com `ON CONFLICT (ref, finalidade) DO UPDATE` (atualiza colunas + `payload` + `sincronizado_em`).

- **Resiliência:** se o scraper falhar/timeout, **o cache antigo é mantido** (não há `DELETE`/`TRUNCATE` antes do upsert). Próxima execução retenta.
- (Opcional, plano) marcar como `ativo = false` os refs não vistos no último sync, em vez de apagar.

### 5.3 `buscar_imoveis` vira sub-workflow (cache-aside)

Substituir o `httpRequestTool` por um **Tool Workflow** que chama o sub-workflow `buscar_imoveis_cache`:

1. Entrada: filtros do agente via `$fromAI` (`finalidade`, `tipoImovel`, `quartos`, `precoMin`, `precoMax`, `cidade`, `bairro`, `limit`). Coringas em `cidade/bairro` já viram `""` pelo prompt (e são ignorados na cláusula `WHERE`).
2. `SELECT count(*) FROM imovel`:
   - **= 0 (cache frio)** → `HTTP GET {scraper}/imoveis?<filtros>` → grava no `imovel` → devolve a resposta.
   - **> 0** → `SELECT payload FROM imovel WHERE <filtros aplicáveis> LIMIT {limit||10}` → devolve.
3. **Saída no mesmo formato da API** (`{ evento: "ColetaConcluida", total, imoveis: [...] }`) para o agente apresentar os imóveis sem mudar o prompt.

> A cláusula `WHERE` só aplica filtros não-vazios (mesma semântica do scraper: vazio/coringa = sem filtro). `finalidade`/`tipoImovel` casam exato; `quartos` exato; `precoMin/Max` faixa; `cidade/bairro` case-insensitive.

---

## 6. Subsistema ② — Persistência de conversas (event store)

### 6.1 Esquema

```sql
CREATE TABLE conversa_evento (
  id          BIGSERIAL PRIMARY KEY,
  sessao_id   TEXT NOT NULL,
  tipo        TEXT NOT NULL,             -- ver tipos abaixo
  payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
  ocorrido_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_evento_sessao ON conversa_evento (sessao_id, ocorrido_em);
CREATE INDEX idx_evento_tipo   ON conversa_evento (tipo);
```

### 6.2 Tipos de evento (linguagem do domínio)

| Tipo | Quando | `payload` |
|------|--------|-----------|
| `ConversaIniciada` | 1.ª mensagem de uma `sessao_id` | `{ canal: "instagram" }` |
| `MensagemRecebida` | toda mensagem do lead | `{ texto }` |
| `RespostaEnviada` | toda resposta do agente | `{ texto, status, perfil, perfil_busca, contato, contexto }` (o `<JSON>` parseado) |
| `BuscaExecutada` | quando `buscar_imoveis` rodou no turno | `{ filtros, total }` |
| `LeadQualificado` | `perfil_busca` atinge o mínimo do prompt: `finalidade` + `tipoImovel` + (`quartos` ou `precoMax`) | `{ perfil_busca }` |
| `ConversaEncerrada` | `status ∈ {concluido, redirecionado}` | `{ status, canal_destino }` |

### 6.3 Captura no Chat workflow

Depois do nó `Code` (que extrai o `<JSON>`), inserir nós **Postgres Insert** (com *continue on fail* — ver D8):
- `MensagemRecebida` (texto do lead vindo do `chatTrigger`).
- `RespostaEnviada` (texto limpo + campos do `<JSON>`).
- `BuscaExecutada` / `LeadQualificado` / `ConversaEncerrada` condicionais (via `If`/`Switch` sobre os campos parseados).
- `sessao_id` = id de sessão do `When chat message received`.
- `ConversaIniciada` quando não existir evento prévio para a `sessao_id` (consulta leve ou `INSERT ... WHERE NOT EXISTS`).

### 6.4 Read-models (views)

- **`conversa_resumo`**: por `sessao_id` → `iniciada_em`, `ultima_em`, `msgs_lead`, `msgs_bot`, `buscou` (bool), `encerrada` (bool), `ultimo_status`, `perfil`, `contato` (do último `RespostaEnviada`).
- **`metricas_agilidade`**: por `sessao_id` → `turnos_ate_busca`, `duracao_seg`, `qualificou` (bool). Base para o analisador e para métricas agregadas.

### 6.5 Correções pré-requisito (no Chat workflow)

- **Nó `Code`:** remover o markdown colado no fim do `jsCode` (` ``` ` + texto "Depois um IF node…" + ` ``` ` + `{{ $json.status === "concluido" }}`). Sem isso o nó lança SyntaxError e nada a jusante grava.
- **Nó `If`:** trocar `status === "completo"` (nunca casa) por uma condição real — ex.: `status ∈ {concluido, redirecionado}` para separar "encerrada" das demais, ou remover o `If` se ambos os ramos só mandam `resposta_limpa`.

---

## 7. Subsistema ③ — Analisador (Ollama, sob demanda)

### 7.1 Esquema

```sql
CREATE TABLE avaliacao_conversa (
  id                 BIGSERIAL PRIMARY KEY,
  sessao_id          TEXT NOT NULL,
  nota_agilidade     INTEGER,            -- 0..10
  aderencia_fluxo    INTEGER,            -- 0..10
  problemas          JSONB NOT NULL DEFAULT '[]'::jsonb,  -- ["...", "..."]
  sugestoes_melhoria JSONB NOT NULL DEFAULT '[]'::jsonb,  -- melhorias do prompt do agente
  resumo             TEXT,
  modelo             TEXT,               -- ex.: "qwen3:8b"
  avaliado_em        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_avaliacao_sessao ON avaliacao_conversa (sessao_id, avaliado_em);
```

### 7.2 Analyzer workflow (novo, sob demanda)

`Manual Trigger` (+ `Webhook` opcional para disparar por URL) →
1. `Postgres SELECT` das **conversas encerradas ainda não avaliadas**:
   ```sql
   SELECT r.sessao_id
   FROM conversa_resumo r
   WHERE (r.encerrada OR r.ultimo_status IN ('concluido','redirecionado'))
     AND NOT EXISTS (SELECT 1 FROM avaliacao_conversa a WHERE a.sessao_id = r.sessao_id);
   ```
2. Para cada sessão: `Postgres SELECT` dos eventos ordenados → montar transcript (lead/bot por turno).
3. `Ollama` (LLM node) com **prompt de QA** → saída JSON estruturada.
4. `Postgres Insert` em `avaliacao_conversa`.

### 7.3 O que o analisador avalia (prompt de QA)

O prompt instrui o Ollama a devolver **apenas JSON** `{ nota_agilidade, aderencia_fluxo, problemas[], sugestoes_melhoria[], resumo }`, avaliando:
- **Agilidade:** nº de turnos até qualificar/buscar; fez uma pergunta por vez?; buscou cedo demais (antes do mínimo finalidade+tipo+(quartos|orçamento))?; repetiu perguntas já respondidas?
- **Aderência ao prompt do agente:** respondeu sempre em PT-BR; ≤3 linhas; ≤3-4 imóveis; só falou de imóveis retornados pela tool; respeitou redirecionamentos (cliente/proprietário/parceria).
- **Pontos de melhoria do prompt** (acionáveis): o que ajustar nas instruções do agente para atender melhor/mais rápido.

> O analisador **não** altera o prompt automaticamente — apenas sugere. Humano revisa.

---

## 8. Tratamento de erros

| Situação | Comportamento |
|----------|---------------|
| Scraper down/timeout no **Sync** | Mantém cache antigo (sem wipe); loga; retenta no próximo ciclo. |
| Cache vazio **e** scraper down no `buscar_imoveis` | Devolve `total: 0` graciosamente; o agente diz "não encontrei nada agora". Nunca quebra o chat. |
| **Postgres down** durante o chat | Inserts de evento com *continue on fail* — a resposta ao lead **sempre** segue (D8). Perde-se só o registo daquele turno. |
| Falha numa conversa no **Analisador** | Isola e continua para a próxima; aquela sessão fica "não avaliada" e entra no próximo disparo. |
| Ollama indisponível no Analisador | Aborta a execução com erro visível; nenhuma avaliação parcial é gravada. |

---

## 9. Estratégia de testes

- **`scraper-api`:** inalterado (116 testes verdes). Sem regressão esperada.
- **DDL + queries:** script de *seed* com conversas/imóveis de exemplo; validar `conversa_resumo`, `metricas_agilidade`, a query de "encerradas não avaliadas" e o `WHERE` de filtros do cache.
- **Cache-aside:** testar os dois caminhos — (a) tabela vazia → chama scraper e popula; (b) tabela cheia → só `SELECT`, sem chamada externa.
- **Analyzer prompt:** rodar contra 2-3 transcripts de exemplo e confirmar que o Ollama devolve JSON parseável com os campos esperados.
- **Workflows n8n:** verificação manual por execução (n8n não é unit-testável); o *seed* + execuções servem de aceitação.

---

## 10. Fora de escopo (YAGNI)

- Integração real com a API do Instagram (mantém-se o `chatTrigger` do n8n).
- Dashboard/BI sobre `avaliacao_conversa` (só tabelas/views por agora).
- Autenticação no webhook do analisador (uso local).
- Aplicar automaticamente as sugestões do analisador ao prompt do agente.
- Multi-tenant / múltiplas imobiliárias.

---

## 11. Sequência de implementação sugerida

1. **Infra:** serviço Postgres no `docker-compose` + `db/schema.sql` (3 tabelas + 2 views) + credencial Postgres no n8n.
2. **① Catálogo:** Sync workflow + tabela `imovel`; trocar `buscar_imoveis` para o sub-workflow cache-aside. Aceitação: chat responde mais rápido e o scraper só é chamado no sync/cache frio.
3. **② Conversas:** corrigir `Code`/`If`; inserts de evento; views. Aceitação: eventos aparecem em `conversa_evento` e `conversa_resumo` reflete a conversa.
4. **③ Analisador:** workflow sob demanda + tabela `avaliacao_conversa` + prompt de QA. Aceitação: disparar gera avaliações parseáveis das conversas encerradas.

---

## 12. Notas de implementação (defaults a confirmar no plano)

- **Rede Postgres ↔ n8n:** default = pôr o Postgres no **mesmo `docker compose` do n8n** e aceder pelo nome do serviço; se o n8n estiver fora do compose, usar `host.docker.internal`. (Confirmar no plano conforme como o n8n está a correr.)
- **Paginação do Sync:** default = `limit=500` cobre o catálogo atual (~818, mas a maioria é uma finalidade). Se `total > 500`, paginar com `limit/offset` no Sync.
- **Modelo do analisador:** default = reutilizar `qwen3:8b`. Como a análise não é sensível a latência, pode-se subir para um modelo maior se o hardware permitir (decisão de operação, não bloqueia o design).
