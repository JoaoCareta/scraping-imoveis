# Adaptador Kenlo (caires) — fonte por scraping, estratégias atrás da porta

- **Data:** 2026-06-29
- **Estado:** Proposto (aguarda revisão do user)
- **Âmbito:** `scraper-api` (repositório `scraping-imoveis`). Adiciona um segundo adaptador de fonte — a plataforma **Kenlo** (cliente `caires`, `cairesengimob.com.br`) — atrás da porta `FonteDeImoveis`, sem tocar em domínio/API/cache além de **uma** mudança contida: preço opcional ("Sob consulta"). Alvo: **paridade** com o adaptador `moldsystems`/innove. Inclui um pequeno factory de fonte por plataforma. NÃO inclui o registry multi-cliente por-request nem a API oficial do Kenlo (futuros).

---

## 1. Contexto e objetivo

O projeto já tem um adaptador por **plataforma** (`src/fontes/moldsystems/`) atrás da porta `FonteDeImoveis` ([fonte-de-imoveis.ts:17](../../../src/fontes/fonte-de-imoveis.ts)). O segundo cliente, **caires**, roda na plataforma **Kenlo** (ex-Ingaia), não no Mold Systems — logo precisa de um adaptador novo.

Diferença mecânica confirmada por inspeção real (2026-06-29) de uma página de detalhe do caires:
- O innove expõe **API JSON (Solr)**: `${origin}/api/solr/search/...` — 1 request traz tudo ([moldsystems-fonte.ts:53](../../../src/fontes/moldsystems/moldsystems-fonte.ts)).
- O Kenlo entrega **HTML server-rendered**: sem JSON-LD, sem `__NEXT_DATA__`/`__NUXT__`, sem endpoint JSON interno visível. Dados no HTML (preço, m², quartos, banheiros, suíte, ref `AP1048-CIMB`, descrição, fotos `img.kenlo.io`, comodidades). Listagens com paginação "Ver mais"; detalhe em `/imovel/{slug}/{COD_REF}`.

### Objetivo

Coletar o catálogo do caires por **scraping de HTML** e mapeá-lo para o mesmo agregado `Imovel`/read model `RecursoImovel`, em **paridade** com o innove, mantendo o caminho aberto para trocar, no futuro, o scraping pela **API oficial da Kenlo** sem mexer em nada downstream — via **estratégias** intercambiáveis dentro do adaptador.

---

## 2. Requisitos

1. **Mesma porta, mesmo output.** `KenloFonte implements FonteDeImoveis`; devolve `ResultadoExtracao` (`Imovel[]` + `rejeitados`). Domínio, read model, API HTTP e cache não mudam (exceto preço opcional, §6).
2. **Estratégias intercambiáveis.** A obtenção do dado bruto fica atrás de uma interface de estratégia: `ColetaHtmlKenlo` (agora) e `ColetaApiKenlo` (futuro), escolhida por config. Trocar é flip de config, não reescrita.
3. **Paridade com o innove.** Todos os tipos e finalidades (venda + aluguel) que o site do caires expõe; características ricas (comodidades) como no innove.
4. **Preço "Sob consulta".** Imóveis sem preço entram no catálogo (preço opcional), não são descartados.
5. **Robustez de scraping.** Âncoras estáveis (URLs/estrutura semântica), nunca classes CSS com hash. Timeout, retries e erros tipados como no `moldsystems`. Politeness no crawl (N requests = 1 por imóvel).
6. **Testável offline.** Parsing/mapeamento são funções puras testadas contra **fixtures de HTML real** salvas (espelha `src/fontes/moldsystems/fixtures/`).

---

## 3. Decisões de design

| # | Decisão | Justificativa |
|---|---------|---------------|
| D1 | **Estratégias atrás da porta**: `KenloFonte` delega a `EstrategiaColetaKenlo` (`html` \| `api`), escolhida por `config.estrategia`. | Pedido do dono; deixa scraping e API oficial coexistirem; o futuro é flip de config. |
| D2 | **Preço opcional no domínio** ("Sob consulta" = ausente). Na prática só o caires produz isso (innove sempre tem preço). | Sem isso, paridade é impossível: o caires perderia os "Sob consulta". Mudança contida; cache já tolera `preco` nulo. |
| D3 | **Características por rótulo de texto** (sem dicionário de idt). Slug do rótulo + tipo BOOLEANA por presença + grupo via mapa curado pequeno. | O Kenlo entrega o rótulo direto (ex.: "Piscina"); não há idt como no Mold Systems. Reaproveita o VO `Caracteristica`. |
| D4 | **Crawler de listagem + parser de detalhe**, em Cheerio, ancorado em hrefs `/imovel/.../{COD_REF}` e estrutura semântica. | HTML server-rendered sem API/JSON; hrefs e rótulos são estáveis, classes podem ser hash. |
| D5 | **Factory de fonte por plataforma** em `main.ts` (`criarFonte(config)`), default `moldsystems`. | Permite subir uma instância caires (`PLATAFORMA=kenlo`) sem o registry por-request. Pequeno e alinhado ao deploy atual (1 container por cliente). |
| D6 | **Reuso do padrão `moldsystems`** para HTTP (timeout/retries/`fetchFn` injetável), erros (`FonteIndisponivel/Timeout`) e `ctx` de mapeamento. | Consistência e testabilidade; a API HTTP já mapeia 503/504. |
| D7 | **Spike primeiro** (página viva): paginação, seletores, fração de "Sob consulta", tipos/finalidades, possível JSON embutido. Gera as fixtures. | Scraping é frágil; de-risca o parser antes de escrever o adaptador. |
| D8 | **Fora**: API oficial Kenlo, registry multi-cliente por-request, coleta agendada. | YAGNI/escopo; a porta e o factory deixam tudo isso para depois sem retrabalho. |

---

## 4. Estrutura do adaptador

```
FonteDeImoveis                         (porta existente — nada downstream muda)
└─ KenloFonte                          implements FonteDeImoveis; segura a estratégia
   └─ EstrategiaColetaKenlo            interface: coletar(ctx): Promise<ResultadoExtracao>
      ├─ ColetaHtmlKenlo   (AGORA)     crawler de listagem + parser Cheerio + mapper
      └─ ColetaApiKenlo    (FUTURO)    cliente da API oficial + mapper  ← só some um arquivo
```

Pasta nova `src/fontes/kenlo/`, irmã de `moldsystems/`:
- `kenlo-fonte.ts` — `class KenloFonte implements FonteDeImoveis`. Deps (`KenloFonteDeps`): `origin`, `clienteId`, `estrategia: 'html'|'api'`, `timeoutMs`, `retries?`, `fetchFn?`, `agora?`, `dormir?`, `avisar?`. `buscarTodos()` = `this.estrategia.coletar(ctx)`. `ctx = { clienteId, origin, extraidoEm }` (mesma forma do `MoldSystemsContexto`).
- `estrategia.ts` — `interface EstrategiaColetaKenlo { coletar(ctx): Promise<ResultadoExtracao> }`.
- `coleta-html/` — `ColetaHtmlKenlo` + crawler + parser + mapper (§5).
- `caracteristicas-grupos.ts` — mapa curado pequeno (rótulo/slug → grupo), começa pelos conceitos mais pedidos. Sem idt.

`KenloFonte` é fino: escolhe/segura a estratégia e delega. A regra "plataforma kenlo" mora no factory (§7), não espalhada.

---

## 5. Estratégia HTML (`ColetaHtmlKenlo`)

Três unidades puras e testáveis, orquestradas por `coletar(ctx)`:

1. **Crawler de listagem** (`enumerarUrlsDetalhe`): a partir das listagens (`/imoveis/{finalidade}/{tipo}` e/ou `/imoveis/{cidade}/{bairro}`), percorre a paginação ("Ver mais" — mecanismo exato confirmado no spike) e coleta as URLs de detalhe (`/imovel/.../{COD_REF}`), deduplicadas. Cobre todos os tipos/finalidades (paridade).
2. **Fetch de detalhe** (`buscarHtml(url)`): `fetchFn` injetável (default `fetch`), com `timeoutMs`, `retries` e `dormir` entre tentativas — igual ao `moldsystems`. Falha de rede → `FonteIndisponivelError`; abort/timeout → `FonteTimeoutError`.
3. **Parser + mapper** (`imovelDeHtmlDetalhe(html, url, ctx): Result<Imovel, ErroValidacao[]>`): Cheerio extrai os campos e chama `Imovel.criar(...)`. `ok` → `imoveis`; `erro` → `rejeitados` (`{ ref, erros }`). Campos: ref (do path/`COD_REF`), finalidade (da seção/URL), preço **ou ausência** (§6), tipo, m², quartos, banheiros, suítes, localização (cidade/bairro/condomínio), descrição, fotos (`img.kenlo.io`), comodidades (§ características).

Concorrência limitada (ex.: 4–6 em voo) com politeness; `extraidoEm`/`hashConteudo` calculados como hoje. Reusa os normalizadores existentes (`area`, `inteiro`, `numero-br`, `valor-reais`, `url`).

---

## 6. Domínio: preço opcional ("Sob consulta")

Única mudança fora do adaptador. Contida:

- `PropsImovel.preco` → opcional ([imovel.ts:15](../../../src/domain/imovel/imovel.ts)).
- `Imovel.preco` → `Preco | undefined`.
- `Imovel.criar`: se `props.preco` presente → valida via `Preco.criar` ([preco.ts:15](../../../src/domain/imovel/preco.ts)); se ausente → `preco = undefined` (sob consulta) e **pula** a invariante período↔finalidade ([imovel.ts:59-64](../../../src/domain/imovel/imovel.ts)). Demais invariantes (ref, urlSite, finalidade, localização) inalteradas.
- `RecursoImovel.preco` → opcional; `imovelParaRecurso` ([recurso-imovel.ts:50](../../../src/domain/leitura/recurso-imovel.ts)) reflete ausência. **Decisão (YAGNI): não adicionar flag extra** — "sob consulta" = `preco` ausente; o bot/n8n infere de ausência. (Se no uso real fizer falta um campo explícito, vira follow-on trivial, dado já está no payload.)
- **Sem efeito no innove**: o `moldsystems` sempre fornece preço, então nada muda no seu mapeamento nem nos testes. (Efeito colateral benigno: um imóvel innove sem preço, hoje rejeitado, passaria a ser aceito sem preço — não ocorre na prática.)
- **Cache já pronto**: `imovel.preco` é nullable; `precoMin/Max` tratam NULL (sob consulta não casa filtro de preço, correto); `ORDER BY preco ASC NULLS LAST` ([imovel-cache.ts](../../../src/cache-api/imovel-cache.ts), [schema.sql](../../../db/schema.sql)). Nada a mudar no SQL.
- **n8n (fora do repo)**: o agente passa a dizer "sob consulta" quando o preço vier ausente.

---

## 7. Factory de fonte por plataforma e perfil do caires

- `src/config.ts`: novos campos `plataforma: 'moldsystems'|'kenlo'` (default `moldsystems`) e `estrategia: 'html'|'api'` (default `html`), lidos de `PLATAFORMA`/`ESTRATEGIA` (espelha `CLIENTE_ID`/`ORIGIN`, [config.ts:24-25](../../../src/config.ts)).
- `src/fontes/fabrica.ts`: `criarFonte(config, deps?): FonteDeImoveis` — `switch(config.plataforma)`: `moldsystems` → `MoldSystemsFonte({...})`; `kenlo` → `KenloFonte({ origin, clienteId, estrategia: config.estrategia, ... })`. Único lugar que conhece o mapa plataforma→classe.
- `src/main.ts`: troca `new MoldSystemsFonte(...)` por `criarFonte(config)` ([main.ts:7-17](../../../src/main.ts)). O resto (`FonteImovelRepository` → `criarServidor`) inalterado.
- Deploy do caires: uma instância `scraper-api` com `CLIENTE_ID=caires`, `ORIGIN=https://www.cairesengimob.com.br`, `PLATAFORMA=kenlo`, `ESTRATEGIA=html`. O guard `?cliente=` ([api/server.ts](../../../src/api/server.ts)) já garante que essa instância só atende `caires`.
- **Dependência**: o registry multi-cliente **por-request** (um scraper servindo vários clientes via `?cliente=`) é spec à parte; este factory é a forma mínima (1 cliente por processo, via env), consistente com o deploy atual e com o scraper DB-free.

---

## 8. Características (Kenlo → `Caracteristica`)

- Cada rótulo de comodidade do HTML (ex.: "Área de serviço", "Churrasqueira", "Cozinha", "Piscina", "Sacada") vira um `Caracteristica` via `Caracteristica.criar` ([caracteristica.ts:32](../../../src/domain/imovel/caracteristica.ts)): `chave` = slug do rótulo, `rotulo` = texto, `tipo = BOOLEANA` (presença), `valorBool = true`, `grupo?` do mapa curado.
- `lista` derivada (rótulos presentes) + `itens` (ricos), igual ao modelo do innove ([spec caracteristicas](2026-06-28-caracteristicas-imoveis-design.md)). Comodidades numéricas/textuais do Kenlo (se houver, ex.: vagas, andar) → `NUMERICA`/`TEXTO` pelo mesmo critério de valor.
- Sem dicionário de idt (D3): o Kenlo já entrega o rótulo. O mapa de **grupos** é o único item curado, pequeno e incremental.
- A coluna `comodidades` do cache é populada (no upsert do n8n) a partir de `itens`, como já especificado para o innove — sem mudança de schema.

---

## 9. Robustez, erros e politeness

- HTTP: `fetchFn` injetável, `timeoutMs`, `retries`, `dormir` entre tentativas (reuso do padrão [moldsystems-fonte.ts:13-23](../../../src/fontes/moldsystems/moldsystems-fonte.ts)).
- Erros tipados: rede/HTTP indisponível → `FonteIndisponivelError`; abort/timeout → `FonteTimeoutError` ([erros.ts](../../../src/fontes/erros.ts)); a API mapeia 503/504 ([api/server.ts](../../../src/api/server.ts)).
- Parsing tolerante: campo ausente/ilegível num imóvel → vai para `rejeitados` com o erro, **sem** derrubar a coleta inteira. Taxa de rejeição observável (já no envelope da resposta).
- Politeness: concorrência limitada e (se necessário) pequeno atraso entre requests, para não martelar o site do cliente. User-Agent genérico de browser.

---

## 10. Estratégia de testes

- **Spike (D7)** salva 2–3 páginas de detalhe + 1 listagem reais como fixtures em `src/fontes/kenlo/fixtures/`.
- `imovel-de-html-detalhe.test.ts` — parser puro contra fixtures: imóvel completo, **"Sob consulta"** (preço ausente → aceito), comodidades, tipos diferentes, campo ausente → rejeitado.
- `crawler.test.ts` — enumeração/paginação contra fixture de listagem; dedup de URLs.
- `caracteristica.test.ts`/grupos — slug do rótulo, grupo, tipo por valor.
- `imovel.test.ts` (domínio) — `criar` **sem preço** (ok, sob consulta) e **com preço** (inalterado); invariante período↔finalidade só quando há preço.
- `fabrica.test.ts` — `plataforma=kenlo` → `KenloFonte`; `moldsystems` → `MoldSystemsFonte`.
- TDD em cada etapa. Sem regressão esperada nos 196 testes atuais (innove inalterado).

---

## 11. Fora de escopo (YAGNI)

- **API oficial Kenlo** (`ColetaApiKenlo`): só quando o prospecto fechar; entra como nova estratégia, flip de config.
- **Registry multi-cliente por-request** (um scraper servindo N clientes via `?cliente=`): spec à parte; aqui basta o factory por env.
- **Coleta agendada** (cron populando o cache): evolução; por ora a 1ª leitura on-demand + cache absorve o custo do crawl.
- **Mudança no workflow n8n**: fora do repo (apenas passa a dizer "sob consulta").

---

## 12. Sequência de implementação sugerida

1. **Spike** (D7): paginação, seletores, fração "Sob consulta", tipos/finalidades; salvar fixtures.
2. **Domínio**: preço opcional (`Imovel`/`Preco`/`PropsImovel`/`RecursoImovel`) — TDD.
3. **Estratégia + porta**: `EstrategiaColetaKenlo`, `KenloFonte`, `ColetaHtmlKenlo` (crawler → fetch → parser/mapper) — TDD com fixtures.
4. **Características** Kenlo + grupos curados.
5. **Factory** `criarFonte` + `config.plataforma/estrategia` + fio em `main.ts`.
6. **Deploy**: instância caires (env) e validação da 1ª leitura → cache.
