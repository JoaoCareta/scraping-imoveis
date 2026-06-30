# API de Imóveis — Guia de Integração (n8n / Postman)

Serviço HTTP que devolve os imóveis do site, em JSON. A plataforma é **multi-tenant**:
serve vários clientes (ex.: `innove`, `caires`) e o parâmetro **`cliente`** diz de quem
é o catálogo (ver **§2**). Este guia explica como **montar qualquer pesquisa** — não é
preciso decorar URLs prontas.

---

## 1. Endereço base — qual usar em cada caso

O resto do guia escreve `BASE`; substitui pelo endereço certo conforme **onde corre quem chama**:

| Quem chama | `BASE` |
|---|---|
| Browser / Postman (na mesma máquina da API) | `http://localhost:3000` |
| **n8n a correr em Docker** (Docker Desktop) | `http://host.docker.internal:3000` |
| n8n na **mesma rede docker** da API | `http://scraper-api:3000` |
| n8n instalado **nativamente** na máquina | `http://localhost:3000` |

> Porquê? Dentro do container do n8n, `localhost` é o **próprio** n8n, não o PC. Por isso
> usa-se `host.docker.internal` (Docker Desktop) para chegar ao PC onde a API está publicada.

> **Dois serviços, duas portas.** A tabela acima usa a porta `3000` (**scraper-api**, coleta
> ao vivo). Há também a **cache-api** na porta `3001` — o ponto de entrada **multi-tenant** que
> o n8n usa no dia-a-dia (lê o catálogo do banco e cai para o scraper se estiver vazio). O
> **host** (`localhost` / `host.docker.internal` / nome do container) resolve-se da mesma
> forma; muda só a porta (`3001`) e o nome do serviço na rede docker (`cache-api`). Ver **§2**.

---

## 2. Cliente (multi-tenant) — qual passar e porquê

A plataforma serve **vários clientes**. O parâmetro `cliente` identifica **de quem** é o
catálogo a consultar. O valor é o identificador do cliente, definido na configuração da
instância (env `CLIENTE_ID`). Hoje:

| `cliente` | Quem | Plataforma da fonte |
|---|---|---|
| `innove` | Imobiliária Innove | MoldSystems (default) |
| `caires` | Caires Engimob | Kenlo |

> ⚠️ O `cliente` **não escolhe a URL/site** a coletar — isso é fixo por instância (env
> `ORIGIN` / `PLATAFORMA`). O `cliente` apenas diz **de quem** é o catálogo. Cada instância
> serve **um** cliente.

**O `cliente` comporta-se diferente em cada serviço:**

| Serviço | Porta | Papel | Comportamento do `cliente` |
|---|---|---|---|
| **cache-api** | `3001` | Catálogo multi-tenant (lê do banco; cai para o scraper se vazio). **É por aqui que o n8n entra.** | `?cliente=` **escolhe** o catálogo do tenant. Se omitido, assume o `CLIENTE_PADRAO` da instância (hoje `innove`). |
| **scraper-api** | `3000` | Coleta ao vivo do site, stateless. | `?cliente=` é só um **guard**: se diferente do cliente da instância, devolve `409`. Se omitido, serve o cliente da própria instância. |

**Regra prática para o n8n** (entra pela cache-api `:3001`):
- Fluxo do **caires** → **tem de** enviar `cliente=caires`. Sem isso, a cache-api assume
  `innove` e devolve o catálogo **errado**.
- Fluxo do **innove** → pode omitir (assume `innove`), mas o recomendado é enviar
  `cliente=innove` **explícito**.
- O mesmo `cliente` tem de ser usado também ao **gravar no banco** (`cliente_id` em
  `imovel` / `conversa_evento` / `avaliacao_conversa`), senão o tenant desalinha.

Exemplo (caires; venda; 3 quartos; até R$800.000; em Araçatuba):
```
GET  http://cache-api:3001/imoveis?cliente=caires&finalidade=VENDA&quartos=3&precoMax=800000&cidade=Aracatuba
```

---

## 3. Como se monta uma pesquisa

```
GET  BASE/imoveis?filtro1=valor1&filtro2=valor2&filtro3=valor3
```

Regras simples:
- `?` marca o início dos filtros; `&` separa cada filtro; cada filtro é `nome=valor`.
- **Todos os filtros combinam com E (AND)** — quanto mais filtros, mais restrito o resultado. Filtro que não envias = não filtra por isso.
- Valores com espaço ou acento têm de ir **codificados em URL** (espaço → `%20`, `ç` → `%C3%A7`).
  **No Postman e no n8n não precisas de codificar à mão** — eles fazem isso por ti (ver §7 e §8).

Exemplo (apartamentos para **alugar**, até **R$2000**, com **2 quartos**, primeiros **20**):
```
GET  BASE/imoveis?cliente=innove&finalidade=ALUGUER&tipoImovel=apartamento&precoMax=2000&quartos=2&limit=20
```

---

## 4. Filtros disponíveis

| Filtro | Tipo | Valores | O que faz |
|---|---|---|---|
| `cliente` | texto | `innove`, `caires` | **de quem** é o catálogo (ver §2). Na cache-api **escolhe** o tenant; na scraper-api é **guard**. |
| `finalidade` | enum | `ALUGUER` ou `VENDA` | tipo de operação |
| `precoMin` | número | ex. `1000` | preço **≥** ao valor |
| `precoMax` | número | ex. `2500` | preço **≤** ao valor |
| `quartos` | inteiro | ex. `3` | número **exato** de quartos |
| `tipoImovel` | texto | `apartamento`, `casa`, `comercial`, `terreno`, `lote`, `galpao`, `sala` | tipo do imóvel (singular, minúsculas) |
| `cidade` | texto | nome da cidade | match do nome (maiús/minús **indiferente**; **acentos contam**) |
| `bairro` | texto | nome do bairro | idem `cidade` |
| `comodidades` | texto | CSV de slugs, ex. `piscina,portaria` | imóvel tem **todas** as comodidades indicadas |
| `condominio` | texto | nome do condomínio | filtra por nome de condomínio/empreendimento |
| `ativo` | booleano | `true` / `false` (default `true`) | por defeito só traz imóveis ativos |
| `limit` | inteiro | `1`–`500` (default `100`) | quantos imóveis por página |
| `offset` | inteiro | `≥ 0` (default `0`) | a partir de que posição |

**Cidades no catálogo** (exemplos reais): `Araçatuba`, `Birigui`, `Guararapes`, `Rubiacea`,
`Santo Antonio do Aracangua`. Para ver todas, faz um pedido **sem** `cidade` e olha os valores
distintos de `localizacao.cidade` nas respostas. Escreve a cidade com os acentos certos
(o maiús/minús não importa).

---

## 5. Paginação (percorrer todos os resultados)

A resposta traz sempre:
- `total` → quantos imóveis casam os filtros (independente da página);
- `imoveis` → a página atual (no máximo `limit` itens).

Para percorrer tudo: começa em `offset=0` e vai somando `limit` **enquanto `offset < total`**.

```
GET BASE/imoveis?finalidade=VENDA&limit=100&offset=0     → primeiros 100
GET BASE/imoveis?finalidade=VENDA&limit=100&offset=100   → seguintes 100
GET BASE/imoveis?finalidade=VENDA&limit=100&offset=200   → ...
```

> A paginação por `offset` é da **scraper-api** (`:3000`). A **cache-api** (`:3001`) usa só
> `limit`; o catálogo é o do tenant indicado em `cliente`.

---

## 6. O que a resposta devolve

```jsonc
{
  "evento": "ColetaConcluida",
  "extraidoEm": "2026-06-18T22:09:54Z",   // quando foi coletado do site
  "total": 802,                            // total que casa os filtros
  "rejeitados": 0,                         // imóveis descartados na coleta (qualidade dos dados)
  "limit": 20,
  "offset": 0,
  "imoveis": [
    {
      "ref": "1404",                                  // referência única do imóvel
      "finalidade": "VENDA",
      "urlSite": "https://imobiliariainnove.com.br/imovel/.../1404",
      "preco": { "valor": 155000, "moeda": "BRL", "periodo": "TOTAL" },  // periodo: MENSAL (aluguer) ou TOTAL (venda)
      "localizacao": { "zonaTexto": "JARDIM SUMARÉ", "bairro": "JARDIM SUMARÉ", "cidade": "Araçatuba", "estado": "SÃO PAULO" },
      "caracteristicas": { "tipoImovel": "apartamento", "tipologia": "Padrão", "areaM2": 96, "quartos": 2, "casasBanho": 1, "lista": [] },
      "media": { "fotoPrincipal": "https://s3.amazonaws.com/.../1404/...jpg" },
      "extras": { "vagas": 1, "condominio": 940, "iptu": 105 },   // campos extra (variáveis por imóvel)
      "estado": { "ativo": true, "extraidoEm": "...", "atualizadoEm": "...", "hashConteudo": "..." }
    }
  ]
}
```

> **Via cache-api (`:3001`)** o envelope traz `"origem": "cache"` e **não** traz `extraidoEm`/
> `rejeitados`/`offset`. Quando o cache está vazio e cai para o scraper, devolve o envelope do
> scraper (acima). Em **ambos** os casos os imóveis vêm em `imoveis[]`, no mesmo formato
> `RecursoImovel`.

**Endpoint por referência:** `GET BASE/imoveis/{ref}` (ex.: `BASE/imoveis/1404`) devolve o(s)
imóvel(is) dessa referência — um mesmo imóvel pode ter uma linha de `ALUGUER` **e** outra de
`VENDA`. Devolve `404` se a referência não existir.

**Saúde:** `GET BASE/health` → `{ "status": "ok" }`.

---

## 7. No Postman

1. Novo pedido **GET**, URL = `BASE/imoveis`.
2. Aba **Params** → uma linha por filtro (`Key` = `cliente`, `Value` = `caires`; `Key` = `finalidade`, `Value` = `VENDA`, etc.).
3. O Postman monta e **codifica** a URL automaticamente. Enviar.

---

## 8. No n8n (forma recomendada — sem montar URL à mão)

Nó **HTTP Request**:
- **Method:** `GET`
- **URL:** `BASE/imoveis` (só isto, **sem** `?...`)
- **Send Query Parameters:** **ON** → adicionar uma linha **Name / Value** por filtro:
  - `cliente` = `caires`   ⬅️ **obrigatório no fluxo do caires** (sem isto vem o catálogo do `innove`)
  - `finalidade` = `VENDA`
  - `quartos` = `3`
  - `precoMax` = `800000`
  - `limit` = `20`
- O n8n monta e codifica a query — o developer **nunca escreve a query à mão**.
- Os valores podem ser **dinâmicos** (expressões), ex. vindos de uma mensagem do cliente:
  `Value` = `={{ $json.precoMaximo }}`. O `cliente` costuma ser **fixo por fluxo** (ex. `caires`).
- A seguir, um nó **Split Out** sobre o campo `imoveis` → passa a ter **1 item por imóvel** no fluxo.

---

## 9. Erros

| Código | Significado | Causa típica |
|---|---|---|
| `400` | pedido inválido | filtro fora do permitido (`finalidade=XPTO`, `limit` fora de 1–500); ou `cliente` em falta sem `CLIENTE_PADRAO` (cache-api) |
| `404` | não encontrado | `GET /imoveis/{ref}` com referência inexistente |
| `409` | cliente não atendido | `?cliente=` diferente do cliente desta instância (guard da scraper-api) |
| `503` | fonte indisponível | o site de origem não respondeu |
| `504` | timeout da fonte | o site demorou demais |
| `401` | não autorizado | (só se a `API_KEY` estiver ativada) header `x-api-key` em falta/errado |

Corpo dos erros: `{ "evento": "...", "erro": { "codigo": "...", "mensagem": "..." } }`.

---

## 10. Autenticação

Hoje **sem autenticação** na cache-api. A **scraper-api** exige `x-api-key` apenas se a
`API_KEY` estiver ativada na instância — nesse caso envia o header `x-api-key: <valor>` em
todas as chamadas (no n8n: aba **Headers** do nó HTTP Request).
