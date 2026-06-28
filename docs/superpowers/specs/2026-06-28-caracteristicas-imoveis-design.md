# Características de imóveis — captura rica e busca por comodidades

- **Data:** 2026-06-28
- **Estado:** Proposto (aguarda revisão do user)
- **Âmbito:** `scraper-api` (repositório `scraping-imoveis`). Estende a extração da fonte MoldSystems/Innove para capturar **todas** as características dos imóveis (elevador, sacada, piscina, etc.), modelá-las no domínio de forma rica e torná-las pesquisáveis por presença no cache. Começa por **apartamentos**; o mecanismo é genérico para os demais tipos.

---

## 1. Contexto e objetivo

Hoje o mapeador da fonte ([src/fontes/moldsystems/solr-mapper.ts](../../../src/fontes/moldsystems/solr-mapper.ts)) lê do Solr da MoldSystems apenas área (idt 95/2), quartos, banheiros e vagas, e descarta todo o resto — devolvendo `lista: []`. As demais características (elevador, sacada, piscina, churrasqueira, padrão de acabamento, ano de construção, etc.) **chegam na resposta da busca**, mas se perdem no mapeamento.

### Diagnóstico (varredura real, 2026-06-28)

Consulta a `https://imobiliariainnove.com.br/api/solr/search/` (744 imóveis; 272 apartamentos em Araçatuba) confirmou:

- Cada imóvel traz as características em três campos redundantes:
  - `jsonCharacteristics` — array com `idtCharacteristics` **+ valor** (`"Sim"`, número, ou texto). **Único com o valor.**
  - `prop_char_<idt>` — campo espelhado (só valor).
  - `idtsCharacteristics` — string pipe-delimitada só com os ids.
- A resposta da busca traz **apenas o número** (idt), não o rótulo.
- O **dicionário** `idtCharacteristics → desCharacteristics` (625 entradas) está embutido no HTML de **qualquer página** (array `allCharacteristics`), inclusive a home — obtível com **um único request**.
- As amenidades pedidas existem e têm boa cobertura, ex.: Elevador Social (idt 97, 42 apts), Elevador de Serviço (96, 30), Elevadores (592, 15), Sacada (235, 39), Piscina (15, 55), Portaria 24 Hrs (76, 52), Churrasqueira (496, 23), Academia (57, 46).
- Valores variam por característica: booleanas vêm como `"Sim"`; **elevadores também vêm com quantidade** (`"2"`, `"3"`); numéricas como `"96.00"`/`"2"`; categóricas como texto (`"Alto"`, `"Bem conservado"`).

### Objetivo

Capturar todas as características sem perda, modelá-las de forma rica (DDD), e permitir que a LLM de atendimento (n8n) **filtre imóveis por presença** ("tem apartamento com elevador?") **e responda especificidades** lendo o payload ("tem 2 elevadores sociais", "elevador de serviço sim").

---

## 2. Requisitos

1. **Presença + valores numéricos.** A LLM precisa filtrar por presença de comodidades e responder valores (quantidade, ano, padrão).
2. **Generalidade e especificidade simultâneas.** "Tem elevador?" → responder que tem, quais tipos e quantos. "Tem elevador de serviço?" → identificar especificamente. Logo: preservar cada variante (slug bruto) **e** um conceito agrupador ("elevador").
3. **Dicionário exclusivo do site.** Cada cliente/site tem seu próprio dicionário, gerado pela mesma varredura. Não há mapa universal.
4. **Sem perda.** Toda característica (booleana, numérica, texto) fica no payload, mesmo que ainda não filtrável por SQL.
5. **Respeitar a arquitetura.** DDD com modelos ricos e VOs validados; padrão atual de cache (payload JSONB + colunas denormalizadas); funções de mapeamento puras e testáveis.

---

## 3. Decisões de design

| # | Decisão | Justificativa |
|---|---------|---------------|
| D1 | **Modelo rico** com VO `Caracteristica` (slug + rótulo + grupo + tipo + valor), não apenas `lista: string[]`. | Atende presença + valores + agrupamento; encaixa no DDD do projeto. |
| D2 | **Dicionário site-specific gerado** (`caracteristicas-dicionario.ts`) a partir do `allCharacteristics` da home. | Exclusivo do cliente; regenerável quando o site cria características novas. |
| D3 | **Tipo inferido em runtime** pelo valor (`"Sim"`→booleana, número→numérica, resto→texto). | Evita curar 625 tipos; robusto a características novas. |
| D4 | **Grupo curado, pequeno e incremental** (ex.: `elevador` ← social/serviço/elevadores). Começa por apartamentos. | Casa o pedido genérico sem inflar manutenção. |
| D5 | **`itens` é a fonte rica sem perda; `lista` é derivada** (rótulos das booleanas verdadeiras), mantida para retrocompat. | Não quebra read-model/consumidores atuais. |
| D6 | **Filtro por presença agora** (coluna `comodidades TEXT[]` + GIN); **filtro numérico-SQL como follow-on** (dado já no payload). | Cobre o caso dominante; evita inchar SQL/agente prematuramente. |
| D7 | **Mudança no workflow n8n fica fora deste repo.** | Mesmo limite do spec inove-atendimento; o `scraper-api` é stateless. |

---

## 4. Modelo de domínio

Novo Value Object em `src/domain/imovel/caracteristica.ts`:

```ts
type TipoCaracteristica = "BOOLEANA" | "NUMERICA" | "TEXTO"

class Caracteristica {            // VO imutável, criado via factory validada (Result)
  idtFonte: number                // id no site (rastreabilidade/auditoria)
  chave: string                   // slug estável: "elevador-de-servico"
  rotulo: string                  // "Elevador de Serviço"
  grupo?: string                  // "elevador" (mapa curado), opcional
  tipo: TipoCaracteristica
  valorBool?: boolean             // true quando "Sim"
  valorNum?: number               // quantidade (2 elevadores), ano, medida
  valorTexto?: string             // "Alto", "Bem conservado"
}
```

A seção `Caracteristicas` ([src/domain/imovel/tipos.ts](../../../src/domain/imovel/tipos.ts)):

```ts
interface Caracteristicas {
  tipoImovel?, tipologia?, areaM2?, quartos?, casasBanho?   // inalterados — autoritativos nos filtros atuais
  lista: readonly string[]            // mantido; derivado de itens (rótulos das booleanas "tem")
  itens: readonly Caracteristica[]    // NOVO — todas as características, sem perda
}
```

Regras:
- O VO valida o mínimo (chave/rótulo não-vazios; coerência tipo↔valor) no estilo dos VOs existentes ([localizacao.ts](../../../src/domain/imovel/localizacao.ts)).
- Características já refletidas em campos dedicados (área idt 2/95, dormitórios idt 5) **também** aparecem em `itens` (completude); os campos dedicados seguem mandando nos filtros existentes.
- `valorNum` preserva quantidade quando houver (ex.: elevadores).

---

## 5. Dicionário de características (site-specific)

- Módulo gerado `src/fontes/moldsystems/caracteristicas-dicionario.ts`: mapa `idtCharacteristics → { rotulo: string; grupo?: string }` (625 entradas da Innove).
- Script gerador (em `scripts/` ou `spikes/`) que busca a home, extrai o array `allCharacteristics` (parse bracket-balanced) e re-emite o módulo. Reexecutável quando o site adiciona características.
- Mapa de **grupos** curado, pequeno, no próprio módulo (ou anexo): começa pelos conceitos mais pedidos em apartamentos (elevador, piscina, churrasqueira, sacada/varanda, portaria, lazer). Incremental.
- Outros sites: cada um terá seu próprio dicionário gerado pela mesma varredura.

---

## 6. Mapeamento no `solr-mapper`

Fonte: `jsonCharacteristics` (idt + valor). Para cada item:

1. Resolve `idt → { rotulo, grupo? }` no dicionário. Idt ausente do dicionário → ignora com `avisar(...)`, sem quebrar.
2. Classifica o tipo pelo valor:
   - `"Sim"`/`"Não"` (normalizado) → `BOOLEANA` (`valorBool`). `"Não"`/ausente não entra em `lista`.
   - número puro (`"2"`, `"96.00"`) → `NUMERICA` (`valorNum`, via `numero-br`/`inteiro` existentes).
   - resto → `TEXTO` (`valorTexto`).
3. Deriva `chave` = slug do rótulo (helper `slug()` já existente no arquivo); anexa `grupo` do mapa curado.

Funções novas, puras (estilo `areaDeDoc`/`banheirosDeDoc`):
- `caracteristicasItensDeDoc(doc) → Caracteristica[]`.
- `caracteristicasDeDoc` passa a incluir `itens` e derivar `lista`.

Tratamento de ruído (observado nos dados reais):
- `"0"`/`"00"` em numéricas → `valorNum: 0` (não vira "tem").
- Observações de texto longo (idt 160, 211) → `TEXTO`; não poluem `lista`.
- `hashConteudo` ([solr-mapper.ts:148](../../../src/fontes/moldsystems/solr-mapper.ts)) passa a incluir as características, para o sync detectar mudanças.

---

## 7. Read-model, persistência e busca

### 7.1 Read-model

`RecursoImovel.caracteristicas` ([recurso-imovel.ts](../../../src/domain/leitura/recurso-imovel.ts)) ganha `itens: Caracteristica[]` (espelha o domínio). O `payload` JSONB passa a carregar tudo sem perda — a LLM responde qualquer especificidade lendo o imóvel retornado.

### 7.2 Busca por presença (entra agora)

- `db/schema.sql`: coluna `comodidades TEXT[]` na tabela `imovel` + `CREATE INDEX ... USING GIN (comodidades)`.
- A coluna é populada (no sync/upsert) com os slugs das booleanas verdadeiras **e** seus grupos — assim "elevador" (grupo) e "elevador-de-servico" (chave) casam.
- `FiltrosCache` + `SQL_BUSCA` ([imovel-cache.ts](../../../src/cache-api/imovel-cache.ts)): novo parâmetro `comodidades?: string[]` → `WHERE comodidades @> $n` (todas as pedidas presentes). Coringas/"sem preferência" neutralizados pelo helper existente.

### 7.3 Follow-on (não nesta entrega)

- Filtro numérico/categórico em SQL ("≥2 suítes", "ano>2015"). O dado já está no payload; pode ser denormalizado depois sem alterar a extração — o sync de 6h repopula.

### 7.4 Fora deste repo

- Workflow n8n: agente passa `comodidades` via `$fromAI` e é instruído a ler `itens` para responder tipo/quantidade. Igual ao tratado no spec [inove-atendimento](../../specs/2026-06-23-inove-atendimento-design.md).

---

## 8. Estratégia de testes

- `caracteristica.test.ts` — VO: validação, coerência tipo↔valor, slug.
- Dicionário — resolução idt→rótulo/grupo; idt desconhecido.
- `solr-mapper.test.ts` — fixtures reais: elevador "Sim" vs quantidade, sacada, numérica `0`, texto/observação, idt fora do dicionário. Adicionar fixture de apartamento rico (modelo idt 3339, 42 características) ao lado do `imovel-1910`.
- `imovel-cache.test.ts` — filtro `comodidades`: match-all, slug vs grupo, vazio = sem filtro.
- DDL — coluna/índice GIN validados com seed.

Sem regressão esperada nos 116 testes atuais.

---

## 9. Fora de escopo (YAGNI)

- Filtro numérico/categórico em SQL (dado fica no payload; follow-on).
- Mudança no workflow n8n (fora deste repo).
- Curadoria de grupos para casas, comerciais, terrenos (mecanismo já funciona; curadoria começa por apartamentos, incremental).
- Geração de dicionário de outros sites.

---

## 10. Sequência de implementação sugerida

1. Dicionário gerado + script gerador (Innove).
2. VO `Caracteristica` + extensão de `Caracteristicas`/`RecursoImovel`.
3. Mapeamento no `solr-mapper` (itens + lista derivada + hash).
4. `db/schema.sql` (coluna `comodidades` + GIN) e filtro `comodidades` no `imovel-cache`.
5. Testes em cada etapa (TDD).
