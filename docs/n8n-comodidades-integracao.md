# Integração n8n — filtro por comodidades

> ⚠️ **DESATUALIZADO (2026-07-05):** este guia descreve a arquitetura antiga (tool
> HTTP direto + cache-api `:3001`, que foi **removida**). A tool `buscar_imoveis`
> agora é um sub-workflow que consulta o banco (ver
> [specs/2026-07-05-cache-no-n8n-design.md](superpowers/specs/2026-07-05-cache-no-n8n-design.md)
> e [API.md](API.md)). O **vocabulário de slugs** da tabela abaixo continua válido
> e é a parte que ainda vale ler; ignore os passos de configuração de nó HTTP e
> os exemplos sem `?cliente=`.

Guia para o agente n8n (`buscar_imoveis`) usar o novo filtro `comodidades` da API.
O lado do scraper/cache está pronto; falta o n8n **passar o parâmetro** e o agente **falar o vocabulário certo**.

> ⚠️ **Bloqueador de produto:** o filtro casa por **slug exato**. Se o agente mandar a fala crua do cliente ("portaria 24h"), não casa e a busca volta `total: 0` **silenciosamente** — o atendimento conclui "não temos imóveis" quando o problema era o vocabulário. Por isso a tabela abaixo é obrigatória no prompt.

---

## 1. Mudança no nó `buscar_imoveis` (HTTP Request Tool)

Adicione **um Query Parameter** à chamada `GET /imoveis`:

| Campo | Valor |
|---|---|
| **Name** | `comodidades` |
| **Value** | `={{ $fromAI('comodidades', 'Comodidades desejadas como SLUGS minúsculos separados por vírgula (ex: piscina,portaria,academia). Use o vocabulário controlado. Vazio se o cliente não pediu nenhuma.', 'string') }}` |

Os demais parâmetros (`finalidade`, `tipoImovel`, `quartos`, `precoMin/Max`, `cidade`, `bairro`) permanecem como estão. A semântica é **E** (AND): a API só devolve imóveis que têm **todas** as comodidades pedidas.

---

## 2. Bloco a acrescentar no prompt do agente

```
## Comodidades (filtro buscar_imoveis)
Ao chamar buscar_imoveis, traduza o que o cliente pede para SLUGS do vocabulário
abaixo e mande no parâmetro `comodidades` (minúsculo, separado por vírgula).
NUNCA invente slug nem mande a frase crua do cliente.

Vocabulário (fala do cliente → slug a enviar):
- elevador / com elevador ....................... elevador
- piscina ....................................... piscina
- churrasqueira ................................. churrasqueira
- sacada / varanda .............................. sacada
- portaria / portaria 24h / portaria 24 horas ... portaria
- academia / espaço fitness ..................... academia
- salão de festas ............................... salao-de-festas
- salão gourmet / espaço gourmet ................ espaco-gourmet
- área de lazer / lazer ......................... area-de-lazer
- ar condicionado / ar-condicionado ............. ar-condicionado
- playground .................................... playground
- quadra / quadra poliesportiva ................. quadra-poliesportiva
- coworking / espaço de trabalho ................ coworking
- sauna ......................................... sauna
- pet / pet place ............................... pet-place
- brinquedoteca ................................. brinquedoteca
- mini mercado / mercadinho ..................... mini-mercado
- mobiliado / com móveis ........................ mobilia
- condomínio fechado ............................ condominio-fechado

Regras:
1. Concatene múltiplas com vírgula: "apto com piscina e portaria" → piscina,portaria.
2. "X do condomínio" ou "prédio com X": mande só o slug de X (as comodidades do
   condomínio já entram no mesmo filtro). Para "quero em condomínio/prédio com
   área comum", pode usar o slug `condominio`.
3. Mande SÓ o que o cliente pediu explicitamente. Não adicione comodidades por conta própria.
4. Se a busca voltar 0 imóveis, NÃO conclua "não temos". Tente de novo afrouxando:
   remova a comodidade menos importante e busque de novo; ou busque sem o filtro de
   comodidade e confira, no campo `itens` de cada imóvel retornado, quais possuem o
   que o cliente quer (incl. comodidades cadastradas como quantidade — ver abaixo).
5. Se o cliente usar um termo fora da tabela, prefira buscar sem esse filtro e
   peneirar lendo `itens`, em vez de inventar um slug.
```

---

## 3. Como ler o resultado (campos novos no payload)

Cada imóvel retornado traz, além dos campos antigos:

- `caracteristicas.comodidades` — slugs presentes (unidade + condomínio; o marcador `condominio` indica que há comodidade de condomínio).
- `caracteristicas.itens[]` — lista rica: `{ chave, rotulo, tipo, valorBool, valorNum, valorTexto, grupo, origem }`. `origem` = `IMOVEL` ou `CONDOMINIO` (ex.: responder "a piscina é do condomínio").
- `localizacao` — `rua, numero, cep, andar, pontoReferencia, condominio, geo{lat,lng}`.
- `media.video`, `media.fotosCondominio`.
- `caracteristicas.titulo`, `caracteristicas.descricao`.
- `extras` — `iptuAnual, custoMensalTotal, numeroApartamento, bloco, quadra, lote, observacao, ...`.

---

## 4. Limitações conhecidas (atenção no atendimento)

1. **Comodidade numérica de conceito SEM grupo curado não entra no filtro.** O filtro
   `comodidades` considera itens "Sim" **e** numéricos >0 que pertencem a um grupo curado
   (ex.: "Elevador Social: 2" agora conta como `elevador` ✅). Mas numéricos sem grupo
   (ex.: nº de garagens) continuam fora. Ao não achar, leia `itens` (a quantidade está em
   `valorNum`) antes de afirmar ausência.
2. **Conceitos genéricos sem grupo voltam vazio se mandar a frase.** Só `elevador, piscina,
   churrasqueira, sacada, portaria` são "guarda-chuva" (pegam variantes). O resto exige o
   slug exato da tabela.
3. **"Condomínio fechado" tem dado escasso** na base atual — pouquíssimos imóveis têm essa
   marcação, então `condominio-fechado` pode voltar vazio mesmo havendo casas em condomínio.
   Sinal alternativo: `localizacao.condominio` preenchido (lido de `itens`/payload).

> Follow-on recomendado: expandir os GRUPOS curados (lazer, segurança, garagem) além dos 5
> atuais — aumenta a cobertura de termos genéricos (limitação #2). A limitação de comodidade
> numérica (antes #1) já foi mitigada: numéricos >0 de grupos curados contam como presença.

---

## 5. Pré-requisitos de deploy

1. **Rebuild/redeploy** dos containers (scraper-api e cache-api) a partir da `main`.
2. **Re-sync** do cache (tabela `imovel`) para os payloads conterem `comodidades`.
3. (Opcional, performance) criar o índice GIN `idx_imovel_comodidades` na base existente.

### Teste rápido (sem n8n)

```
# scraper-api (porta 3000) — agora aceita o filtro:
GET http://<host>:3000/imoveis?tipoImovel=apartamento&cidade=Araçatuba&comodidades=piscina,portaria

# cache-api (porta 3001) — mesmo resultado (case-insensitive):
GET http://<host>:3001/imoveis?tipoImovel=apartamento&comodidades=Piscina,Portaria
```

Deve voltar só apartamentos com piscina **e** portaria, com os campos novos no payload.
