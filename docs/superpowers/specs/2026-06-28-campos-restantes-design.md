# Mapeamento dos campos restantes da fonte MoldSystems

- **Data:** 2026-06-28
- **Estado:** Proposto (aguarda revisão do user)
- **Âmbito:** `scraper-api` (repositório `scraping-imoveis`). Mapeia os campos do documento Solr da MoldSystems/Innove que ainda eram descartados, enriquecendo o agregado `Imovel` (localização completa, apresentação, mídia, condomínio) e o `extras`. Aplica-se a **todos os tipos** de imóvel (apartamentos, casas, comercial, terreno, rural).

---

## 1. Contexto

Coleta real de **744 imóveis** (272 apartamentos, 295 casas, 94 comercial, 73 terreno, 10 rural — venda, aluguel e ambos) revelou **92 campos** no documento Solr ainda não mapeados, além dos 23 já consumidos ([solr-doc.ts](../../../src/fontes/moldsystems/solr-doc.ts)) e das características (`jsonCharacteristics`, já tratadas).

Análise exaustiva (workflow de classificação + verificação adversarial, com correção de uma falha de ancoragem que confundia "ausente do nosso código" com "inexistente na fonte") classificou os 92 campos:

| Destino | Qtd |
|---|---|
| Campo de domínio (localização/apresentação/mídia/condomínio) | ~12 |
| Extras | ~17 |
| Ignorar (ruído de CRM/sistema) | ~62 |

Decisões do usuário: **mapear tudo que vale**; **coordenadas em `localizacao.geo`** (sentinela `0E-13` → nulo); **características do condomínio reusam o pipeline de comodidades**. Ajustes do revisor: `namTags` descartado (0% de presença); `latitude`/`longitude` isolados não mapeados (redundantes com `geo`); `desObservation` capturado (texto livre útil).

**Achado-chave (condomínio):** `jsonCondominiumCharacteristics` usa o **mesmo dicionário** de características já gerado (53/53 idts presentes, 0 fora) e a **mesma estrutura de parse** (`characteristics.idtCharacteristics` + `desInformation`/`desInformationFormatted`). Reaproveita o extrator atual; não há dicionário novo. Valores vêm como `"Sim"` ou quantidade (ex.: elevador `"1,00"`).

---

## 2. Mapeamento (campos de domínio)

### 2.1 Localização (enriquecimento do VO `Localizacao`)

Hoje `Localizacao` ([localizacao.ts](../../../src/domain/imovel/localizacao.ts)) só tem `zonaTexto/bairro/cidade/estado`. Acrescentar (todos opcionais):

| Campo Solr | Novo campo | Tipo | Observação |
|---|---|---|---|
| `namStreet` | `rua` | string | "RUA PARÁ" |
| `numNumber` | `numero` | string | "70" — string preserva "S/N" |
| `numPostalArea` | `cep` | string | "16011015" (8 dígitos, cru) |
| `numFloor` | `andar` | number | só quando presente (~30%) |
| `desReferencePoint` | `pontoReferencia` | string | "ao lado do…" (vazio → undefined) |
| `latitudeAndLongitude` | `geo` | `{ lat: number; lng: number }` | parse "lat,lng"; `0E-13`/zero → undefined |
| `namCondominium` | `condominio` | string | "Residencial Madri" |

Regra de `geo`: separar por vírgula, `parseFloat` cada parte; se ambos forem ~0 (`Math.abs < 1e-6`, captura o sentinela `0E-13`) → `geo` indefinido.

### 2.2 Apresentação (no VO/seção `Caracteristicas`)

| Campo Solr | Novo campo | Tipo |
|---|---|---|
| `desTitleSite` | `caracteristicas.titulo` | string |
| `desInformationSite` | `caracteristicas.descricao` | string |

### 2.3 Mídia (no `Media`)

| Campo Solr | Novo campo | Tipo |
|---|---|---|
| `urlVideo` | `media.video` | string (vazio → undefined) |
| `jsonPhotosCondominium` | `media.fotosCondominio` | string[] (urls; parse como `jsonPhotos`) |

### 2.4 Condomínio — características searchable (reuso do pipeline)

`jsonCondominiumCharacteristics` é extraído pela mesma lógica de `caracteristicasItensDeDoc`, com duas diferenças:
- cada `Caracteristica` recebe **`origem: "CONDOMINIO"`** (novo campo opcional no VO; default `"IMOVEL"`);
- contribui para `comodidades` (read-model) com **`chave` + `"condominio"`** (em vez de `chave` + grupo), de modo que "prédio com piscina/elevador/portaria" case pelo marcador `condominio` e também pelo slug específico.

Os itens do condomínio entram no mesmo array `caracteristicas.itens`, distinguíveis por `origem`. A LLM pode então responder "a piscina é do condomínio" lendo `origem`.

---

## 3. Mapeamento (extras)

Acrescentar a `extrasDeDoc` ([solr-mapper.ts](../../../src/fontes/moldsystems/solr-mapper.ts)) — todos só quando presentes:

| Campo Solr | Chave em extras | Sentido |
|---|---|---|
| `valIptu` | `iptuAnual` | IPTU anual (distinto de `iptu` mensal já existente) |
| `numParcelsIptu` | `iptuParcelas` | nº de parcelas do IPTU |
| `valSumLocationAndCondominium` | `custoMensalTotal` | aluguel + condomínio |
| `numApartment` | `numeroApartamento` | nº do apartamento |
| `numBlock` | `bloco` | bloco |
| `numLandBlock` | `quadra` | quadra (terreno) |
| `numLandLot` | `lote` | lote (terreno) |
| `desAddressObservation` | `observacaoEndereco` | complemento de endereço |
| `desObservation` | `observacao` | observação livre do imóvel |
| `desBranchActivity` | `ramoAtividade` | ramo (comercial) |
| `flg360` | `tem360` | tour 360° |
| `flgHideValSaleSite` | `ocultarValorVenda` | flag de exibição |
| `flgHideValLocationSite` | `ocultarValorLocacao` | flag de exibição |
| `flgHighlight` | `destaque` | imóvel em destaque (hint de ranking) |
| `dtaRegister` | `dtaRegister` | data de cadastro |
| `namCondominiumPlant` | `plantaCondominio` | nome da planta |
| `desAddressObservationCondominium` | `observacaoEnderecoCondominio` | referência do condomínio |

> `latitude`/`longitude` isolados **não** entram (cobertos por `localizacao.geo`). `jsonCondominiumPlant` fica de fora desta rodada (2% de presença, conteúdo volumoso/baixo valor).

---

## 4. Read-model e persistência

- `RecursoImovel.localizacao` ganha `rua, numero, cep, andar, pontoReferencia, geo, condominio`.
- `RecursoImovel.caracteristicas` ganha `titulo, descricao`; `itens` ganham `origem`; `comodidades` passa a incluir as do condomínio (marcador `condominio`).
- `RecursoImovel.media` ganha `video, fotosCondominio`.
- O `payload` JSONB carrega tudo sem perda; o `hashConteudo` passa a incluir os novos campos relevantes (jsonCondominiumCharacteristics, endereço, título/descrição) para o sync detectar mudanças.

**Busca:** as comodidades do condomínio entram no índice GIN e no filtro `comodidades` existentes **sem mudança de SQL** — já são parte de `caracteristicas.comodidades`. Filtros SQL dedicados para os novos campos (ex.: `andar`, `cep`, proximidade por `geo`) ficam **fora de escopo** (o dado está no payload; a LLM lê e responde). Proximidade geográfica é follow-on.

---

## 5. Itens fora de escopo / ignorados

- **~62 campos IGNORAR**: ids internos (`idtPropertySolr`, `idtExternal`, `idtCategory/SubCategory`, `idtDistrict/City/State`, `idtRealEstate`, `idtsCaptivators`, `_version_`), flags de CRM/captação (exclusividade, reservas, placas, portais, `numPercentQualityRegister`, `flgVisaManager`), datas de captação/expiração/exclusividade, fases elétricas (`flgSinglePhase/Biphasic/ThreePhase`), `flgNotTurnOff*`, `prop_checked_char`, `jsonPropertyControlKeys`, `valEvaluated*`, `jsonOffers`, `valIptuCalculated`, `numIptu`, campos 0% (`namTags`, etc.).
- **Filtros SQL** para novos campos de domínio (andar, cep, geo).
- **Workflow n8n** (fora deste repo).

---

## 6. Estratégia de testes (TDD)

- `localizacao.test.ts` — novos campos: trim/opcional; `andar` numérico; `geo` parse e sentinela `0E-13` → undefined; `cep`.
- `solr-mapper.test.ts` — `localizacaoDeDoc` lê os novos campos; `caracteristicasDeDoc` traz `titulo`/`descricao`; condomínio: itens com `origem="CONDOMINIO"` e contribuição para comodidades com marcador `condominio`; `extrasDeDoc` com as novas chaves; fixture rica com bloco de condomínio.
- `caracteristica.test.ts` — campo `origem` (default IMOVEL).
- `recurso-imovel.*.test.ts` — read-model expõe os novos campos de localização/mídia/apresentação e comodidades de condomínio.
- Atualizar literais de `Localizacao`/`Media`/`Caracteristicas`/`RecursoImovel` em testes existentes que quebrem por campos novos (todos opcionais → não devem quebrar, exceto onde houver checagem estrita).

Sem regressão nos 147 testes atuais.

---

## 7. Sequência de implementação sugerida

1. `Caracteristica` ganha `origem?`.
2. `Localizacao` ganha `rua/numero/cep/andar/pontoReferencia/geo/condominio` (+ parse de geo).
3. `solr-doc.ts` declara os novos campos Solr; `localizacaoDeDoc` os lê.
4. `Caracteristicas`/`Media` ganham `titulo/descricao` e `video/fotosCondominio`; mapper preenche.
5. Extrator de condomínio (reuso) → itens `origem=CONDOMINIO` + comodidades `condominio`.
6. `extrasDeDoc` — novas chaves.
7. Read-model + hash.
8. Testes em cada etapa.
