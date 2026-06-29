# ACHADOS — Spike Kenlo (cairesengimob.com.br)

Notas do spike (Task 1). Tudo aqui foi extraído das fixtures reais salvas nesta pasta.
As tasks seguintes (parser Cheerio + crawler) dependem destas observações.

## Fixtures salvas

| Arquivo | URL de origem | Tamanho | Caso |
|---|---|---|---|
| `listagem-apartamentos-venda.html` | `https://www.cairesengimob.com.br/imoveis/a-venda/apartamento` | ~1.68 MB | listagem |
| `detalhe-ap1048.html` | `.../imovel/apartamento-ciudad-del-este-3-quartos-95-m/AP1048-CIMB` | ~462 KB | detalhe **Sob consulta** (sem preço) |
| `detalhe-com-preco.html` | `.../imovel/casa-aracatuba-2-quartos-50-m/CA0676-CIMB` | ~355 KB | detalhe **com preço R$** (R$ 100.000) |

Fixture com preço FOI encontrada. A listagem `a-venda/apartamento` é 100% "Sob consulta"
(12 imóveis, todos sem preço), mas `a-venda/casa` tem imóveis com `R$` explícito. Peguei o
`CA0676-CIMB` (Casa, R$ 100.000) por ser **venda com preço real**. (O slug original do link da
listagem, `...-150-m`, dá HTTP 301 → slug canônico `...-50-m`; salvei seguindo o redirect com `curl -L`.)

## Como baixar (Windows / schannel)

```
curl --ssl-no-revoke -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36" -L <url> -o <arquivo>
```
`--ssl-no-revoke` é obrigatório (curl puro falha com erro de revogação schannel). `-L` para seguir 301 de slug.

## Stack / observações gerais

- **Framework: Marko** (eBay), NÃO Next.js. Há `data-marko-key=...` por todo lado e ~135 ocorrências de "marko".
  Não há `__NEXT_DATA__` nem `__NUXT__`.
- **HTML é server-rendered** (todos os dados do imóvel já vêm no HTML). Cheerio resolve sem headless browser.
- **CUIDADO — markup duplicado**: o HTML contém uma 2ª cópia *escapada* de todo o bloco de resultados,
  serializada dentro de um script de hidratação do Marko (ex.: `class=\"card-with-buttons ...\"`, `<div`).
  Por isso `grep` "ingênuo" conta tudo em dobro. Cheerio (`load`) parseia só o DOM real → não duplica.
  Ainda assim, ao escrever seletores, ancore no DOM real e **não** em busca textual crua.
- **Classes CSS são semânticas/BEM e estáveis** (`card-with-buttons__code`, `box-amenities`, `price-value`,
  `item-info-title`). NÃO são hashadas. Mesmo assim, prefira ancorar em hrefs/labels onde possível.
- **JSON-LD EXISTE** (correção ao briefing, que dizia "no JSON-LD"): 5 scripts `application/ld+json`
  por página de detalhe: `Product`, `BreadcrumbList`, `RealEstateAgent`, `PostalAddress`, `GeoCoordinates`.
  Útil mas com pegadinha (ver abaixo).

---

## PÁGINA DE LISTAGEM

### Links de detalhe (o que o crawler segue)
Confirmado: cada card é um `<a>` cujo `href` começa com `/imovel/`:
```html
<a class="card-with-buttons borderHover" href=/imovel/apartamento-ciudad-del-este-3-quartos-95-m/AP1048-CIMB target=_blank>
```
- Seletor: `a.card-with-buttons[href^="/imovel/"]` → atributo `href`.
- **A `ref` é o último segmento do path do href**: `/imovel/<slug>/<REF>` → `REF` = `AP1048-CIMB`.
- Atenção: o `<slug>` do href pode estar desatualizado e gerar 301 para o slug canônico
  (a `ref` no fim do path permanece a mesma). Seguir redirect (ou usar só a ref) resolve.

### Estrutura do card (dados resumidos, se quiser evitar baixar o detalhe)
```html
<div class=card-with-buttons__footer>
  <div>
    <div class=card-with-buttons__header><p class=card-with-buttons__code>AP1048-CIMB</p></div>
    <p class=card-with-buttons__title>Apartamento</p>
    <h2 class=card-with-buttons__heading>Área I - Ciudad del Este - AP</h2>
    <ul><li>95.03 m²</li><li>3 Quartos</li><li>...</li></ul>
  </div>
  <div class=card-with-buttons__container-footer><div class=card-with-buttons__baseboard>
    <div class=card-with-buttons__value-container>
      <p class=card-with-buttons__value-title>Venda</p>
      <p class=card-with-buttons__value>Sob consulta</p>   <!-- ou: R$ 100.000  / R$ 1.200/mês -->
    </div></div></div>
</div>
```
- ref: `p.card-with-buttons__code`
- tipo: `p.card-with-buttons__title`
- título/local: `h2.card-with-buttons__heading`
- métricas: `<ul><li>` (área `m²`, `N Quartos`, `N Banheiros` — variam)
- finalidade: `p.card-with-buttons__value-title` ("Venda" / "Aluguel")
- preço: `p.card-with-buttons__value` — `"Sob consulta"` OU `"R$ 100.000"` OU `"R$ 1.200/mês"` (aluguel tem `/mês`)

### PAGINAÇÃO — "Ver mais"  ⭐ (decisão crítica)

**O botão "Ver mais" é um `<button>`, NÃO um `<a href>`:**
```html
<div class=digital-pagination><div class=pagination><div class=pagination-table><div class=pagination-cell>
  <button class="btn btn-md btn-primary btn-next"><span>Ver mais</span></button>
</div></div></div></div>
```
Não tem `href`, nem `data-url`, nem `data-page`. Não há `<link rel="next">`, nem `?page=` em link nenhum
na página. Ou seja: visualmente a paginação é JS (o botão dispara fetch client-side).

**PORÉM — e isto resolve o problema sem headless browser:** a paginação funciona via **query param na própria
URL da listagem**, server-side. Testado empiricamente:

- `GET /imoveis/para-alugar/apartamento`            → página 1 (refs: AP0005, AP0146, AP0632, ...)
- `GET /imoveis/para-alugar/apartamento?page=2`     → HTTP 200, **conjunto totalmente diferente** (AP0502, AP0989, ...)
- `GET /imoveis/para-alugar/apartamento?pagina=2`   → idêntico ao `?page=2` (ambos os nomes funcionam; **use `?page=`**)
- `GET ...?p=2`                                      → HTTP 404 (não funciona)
- `GET ...?page=3`                                   → HTTP 200, 1 card (última página desse tipo)
- `GET ...?page=4` (e além)                          → **HTTP 404**, 0 cards, body com "Não encontramos imóveis para a sua busca"

**Conclusão p/ o crawler:** NÃO precisa de browser/JS nem de descobrir endpoint XHR.
Basta iterar `GET <listagem>?page=N` a partir de `N=1`, incrementando, e **parar quando**:
- a resposta vier **HTTP 404**, OU
- a página não tiver nenhum `a.card-with-buttons[href^="/imovel/"]` (0 cards).

Não confiar na presença/ausência do `btn-next` como sinal de fim — ele aparece até em páginas 404.
Não há contador total de resultados visível na página.

### Tipos / finalidades (categorias de listagem)
Path: `/imoveis/<finalidade>/<tipo>`. Finalidades observadas no menu:
- `a-venda`
- `para-alugar`
- `novos`  (lançamentos)

Tipos (a-venda tem o conjunto completo): `apartamento`, `apartamento-duplex`, `andar-corporativo`,
`area`, `barracao`, `casa`, `chacara`, `cobertura`, `fazenda`, `flat`, `kitnet`, `laje`, `loft`, `loja`,
`ponto`, `rancho`, `sala`, `salao`, `sitio`, `sobrado`, `studio`, `terreno`.
(`novos` e `para-alugar` têm subconjuntos menores.)

Também existem URLs mais específicas de filtro por cidade/bairro/condomínio
(ex.: `/imoveis/a-venda/casa/aracatuba/condominio-barcelona`) — vêm dos links de "bairros/cidades populares".

---

## PÁGINA DE DETALHE

Referência: `detalhe-ap1048.html` (sob consulta) e `detalhe-com-preco.html` (com R$).

### ref (código do imóvel)
Várias fontes redundantes (todas com `AP1048-CIMB` / `CA0676-CIMB`):
- `<link rel="canonical" href="https://www.cairesengimob.com.br/imovel/<slug>/<REF>" />` → último segmento do path.
- `<meta property="og:url" content=".../<REF>">` (idem).
- JSON-LD `Product` → `"sku":"AP1048-CIMB"`  ← **mais limpo de extrair**.
- `<span class=tag>AP1048-CIMB</span>` (logo antes do `<h1>`).
- Breadcrumb: `<li class="item-breadcrumb item-breadcrumb-last">Imóvel AP1048-CIMB</li>`.

### Título
```html
<div class=tags><span class=tag>AP1048-CIMB</span></div>
<h1 style="..."><span>Apartamento com 3 quartos, 95 m² - Área I - Ciudad del Este/AP</span></h1>
```
Seletor: `h1 span` (texto). Também em `<p id=title-share>` e no JSON-LD `Product.name`.

### finalidade + tipo + cidade + bairro  (via breadcrumb)
Melhor fonte estruturada = JSON-LD `BreadcrumbList` (`@type:"BreadcrumbList"`), itens em ordem:
```
pos1 Home
pos2 Imóveis            (/imoveis)
pos3 À venda            (/imoveis/a-venda)            ← finalidade
pos4 Apartamento        (/imoveis/a-venda/apartamento) ← tipo
pos5 Ciudad del Este    (.../apartamento/ciudad-del-este) ← cidade
pos6 Área I             (.../ciudad-del-este/area-i)   ← bairro
pos7 AP1048-CIMB        (.../imovel/<slug>/<ref>)      ← ref
```
No DOM há o mesmo breadcrumb em `<ol>` com `<li class="item-breadcrumb item-breadcrumb1..6">` + `item-breadcrumb-last`
(cada um com `<a>` dentro; o último é texto "Imóvel <REF>"). Para finalidade/tipo/cidade/bairro,
**parsear o JSON-LD BreadcrumbList é o caminho mais robusto**; alternativa é o `<ol>` de `item-breadcrumb`.
- **condomínio**: não há campo dedicado. Quando existe, aparece no título/breadcrumb (a maioria dos imóveis
  não tem condomínio explícito). Os links "condominio-..." no rodapé são apenas "bairros populares", NÃO o condomínio do imóvel.

### Bloco de PREÇO + "Sob consulta"  ⭐
Mesma estrutura nas duas fixtures; só muda o conteúdo do `<h6 class=price-value>`:

Sem preço (`detalhe-ap1048.html`):
```html
<div class="listing-prices dark"><div class=prices>
  <div class=price><p class=price-title>Venda</p><h6 class=price-value>Sob consulta</h6></div>
</div></div>
```
Com preço (`detalhe-com-preco.html`):
```html
<div class=prices>
  <div class=price><p class=price-title>Venda</p>
    <h6 class=price-value><span class=price-value--full>R$ 100.000</span></h6>
    <span class=price-period></span>
  </div>
</div>
```
- finalidade do bloco de preço: `p.price-title` ("Venda" / "Aluguel").
- preço: `h6.price-value`. Se houver `<span class=price-value--full>` dentro → é o valor (`R$ 100.000`).
  Se o texto for exatamente `"Sob consulta"` (sem o span) → preço indisponível.
- **NÃO** detectar preço por busca textual de "Sob consulta" na página inteira: a string
  "Valor sob consulta." também aparece dentro da **descrição** (`box-description`). Ancore no `h6.price-value`.
- período (aluguel): `span.price-period` (vazio em venda).

#### Preço também no JSON-LD `Product.offers` (confiável p/ valor numérico)
- **Com preço**: `Product` tem `"offers":[{"@type":"Offer","price":"100000.00","priceCurrency":"BRL",...}]`.
- **Sob consulta**: `Product` **NÃO tem** chave `offers`. → ausência de `offers` = sem preço.
  Bom como verificação cruzada do `price-value`.

### Características (área / quartos / banheiros / suítes)  ⭐
Bloco estruturado (par título→valor), sob `<h2>Características</h2>`:
```html
<span class=item-info-title>Quartos</span><span class=item-info-value>3</span>
<span class=item-info-title>Banheiros</span><span class=item-info-value>2</span>
<span class=item-info-title>Suíte</span><span class=item-info-value>1</span>
<span class=item-info-title>Área útil</span><span class=item-info-value>95 m²</span>
```
- Seletor: para cada par, `span.item-info-title` (label) + o `span.item-info-value` irmão (valor).
- Labels observadas: `Quartos`, `Banheiros`, `Suíte`, `Área útil` (pode haver `Vagas`/`Garagem` em outros imóveis).
- área vem com `" m²"` (ex.: `95 m²`); o `Product.name`/título traz a área "cheia" (`95,03m²`).
- Há TAMBÉM um resumo compacto com ícones (`<div class="item-info bedrooms"><span> 3 Quartos</span></div>`,
  `... bathrooms ...`) — secundário; prefira os pares `item-info-title`/`item-info-value`.

### Comodidades / características (lista de labels)  ⭐
Sob `<h2>Características</h2>`, dentro de `<div class=box-amenities>`, um `<p>` por comodidade,
cada `<p>` = um `<svg>` (ícone) seguido do texto da label:
```html
<div class=box-amenities>
  <p><svg ...><path ... fill=#239867 /></svg>Piscina</p>
  <p><svg ...>...</svg>Sacada</p>
  <p><svg ...>...</svg>Churrasqueira</p>
  <p><svg ...>...</svg>Cozinha</p>
  <p><svg ...>...</svg>Área de serviço</p>
</div>
```
- Seletor: `div.box-amenities > p` → `.text()` (o texto após o `<svg>` é a label).
- Labels confirmadas no AP1048: `Piscina`, `Sacada`, `Churrasqueira`, `Cozinha`, `Área de serviço`.
- O `<div class=box-amenities>` fica dentro de um `div.toggle-detail`/`div.wrap-toggle` (UI "ver mais") —
  o conteúdo já está no HTML, o toggle é só visual.

### Descrição
Sob `<h2>Descrição</h2>`:
```html
<div ... class=box-description><span>Apartamento à venda em Ciudad del Este, Paraguai.\r\n...</span></div>
```
- Seletor: `div.box-description span` (ou `.text()` do `div.box-description`).
- Contém `\r\n` literais (quebras de linha). Texto também replicado em `<meta name=description>` e em `Product.description`.

### Fotos  ⭐
- URLs em `https://img.kenlo.io/<token-base64ish>.jpg` (token longo com `+`, `-`, `=`, `.jpg`).
- 13 URLs únicas de `img.kenlo.io` no AP1048.
- Cada `<img>` traz fallback: `data-fallback=https://imgs.kenlo.io/<mesmo-token>.jpg`
  (host `imgs.kenlo.io` em vez de `img.kenlo.io`) e `onerror` que troca para o fallback.
- A 1ª imagem também está no JSON-LD `Product.image` e em `<meta property=og:image>`.
- Seletor: pegar `img[src*="img.kenlo.io"]` (atributo `src`) na galeria do imóvel.
  Atenção a duplicatas (galeria + thumbs + cópia escapada de hidratação) → deduplicar.

### ⚠️ Pegadinha do JSON-LD: PostalAddress/GeoCoordinates = endereço da IMOBILIÁRIA, não do imóvel
`PostalAddress` e `GeoCoordinates` (dentro de `RealEstateAgent`) trazem SEMPRE o endereço do escritório
da Caires em Araçatuba/SP (`Avenida Brasília, 1729`, lat -21.22, lng -50.43) — **idêntico** no AP1048
(que é em Ciudad del Este, Paraguai!) e no CA0676. **NÃO usar para localização do imóvel.**
Para cidade/bairro do imóvel, usar o `BreadcrumbList` / breadcrumb do DOM / título.
O que é confiável no JSON-LD por imóvel: `Product` → `sku`(ref), `name`, `description`, `image`, `offers[].price`.

---

## Resumo dos seletores-chave (para a task do parser)

| Campo | Fonte recomendada |
|---|---|
| ref | último segmento de `link[rel=canonical]` href, OU JSON-LD `Product.sku` |
| título | `h1 span` |
| finalidade | JSON-LD BreadcrumbList pos3, OU `p.price-title` |
| tipo | JSON-LD BreadcrumbList pos4 |
| cidade | JSON-LD BreadcrumbList pos5 |
| bairro | JSON-LD BreadcrumbList pos6 |
| preço | `h6.price-value span.price-value--full` (texto); ausência → "Sob consulta". Cruzar com `Product.offers[].price` |
| área | `span.item-info-title`="Área útil" → `span.item-info-value` |
| quartos | `span.item-info-title`="Quartos" → value |
| banheiros | `span.item-info-title`="Banheiros" → value |
| suítes | `span.item-info-title`="Suíte" → value |
| comodidades | `div.box-amenities > p` (.text() de cada) |
| descrição | `div.box-description span` |
| fotos | `img[src*="img.kenlo.io"]` (dedup) |

| Crawler | Mecânica |
|---|---|
| categorias | `/imoveis/<finalidade>/<tipo>` |
| links de detalhe | `a.card-with-buttons[href^="/imovel/"]` |
| paginação | `?page=N` (1..), parar em HTTP 404 ou 0 cards. Botão "Ver mais" é JS — ignorar |
| download | `curl --ssl-no-revoke -A "<UA browser>" -L` |
