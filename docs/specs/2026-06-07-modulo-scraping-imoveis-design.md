# Spec de Design — Módulo de Scraping de Imóveis

- **Data:** 2026-06-07
- **Estado:** Rascunho para revisão
- **Autor:** João Careta (com Claude)
- **Âmbito desta spec:** **apenas o Módulo de Scraping** (um dos componentes do programa maior). Os restantes componentes (Núcleo de atendimento, adaptadores de canal) têm specs próprias e ficam aqui apenas como contexto.

---

## 1. Contexto e visão do programa

Estamos a construir um sistema para **auxiliar corretores imobiliários**. A visão completa é um assistente de **primeiro atendimento** que escuta mensagens de clientes em **WhatsApp, Instagram e Facebook Messenger** (via n8n), faz triagem (alugar vs comprar, faixa de preço, tipologia, zona) e responde com **links de imóveis** que batem com os filtros — links do site da imobiliária e do Facebook Marketplace.

### 1.1. Mapa do programa (contexto, fora do âmbito desta spec)

```
                 ┌─────────────────────────────────────────────┐
   WhatsApp  ──► │                                             │
   Instagram ──► │   NÚCLEO PARTILHADO (channel-agnostic)      │ ──► resposta
   Messenger ──► │                                             │     ao cliente
                 └─────────────────────────────────────────────┘
   (adaptadores             • Scraper do site → Inventário   ◄── ESTA SPEC
    finos, 1 por             • Junção com planilha de links Marketplace (por Ref.)
    canal)                   • Triagem LLM (aluguer/compra, preço, tipologia, zona)
                             • Matching filtros → imóveis
                             • Construtor da mensagem (link site + link Marketplace)
                             • Captura de lead / handoff p/ corretor
```

**Decomposição acordada:** 1 Núcleo partilhado + 3 adaptadores de canal. O Núcleo é planeado isolado primeiro. Dentro do Núcleo, o **Módulo de Scraping** é desenhado primeiro **como módulo standalone e vendável**.

### 1.2. Porquê o scraping (e não a API do Facebook Marketplace)

Confirmado por pesquisa (junho 2026): **não existe API oficial para *ler* anúncios do Facebook Marketplace**. As únicas APIs "Marketplace" da Meta são o programa fechado *Marketplace Partner* (publicação de catálogo, por aprovação) e a *Content Library API* (só investigação académica). Scrapers de terceiros do Marketplace violam os Termos da Meta e são frágeis.

**Reformulação que resolve o problema:** a fonte de verdade dos imóveis é o **site da própria imobiliária** (raspar o site do próprio cliente, com a permissão dele, é legítimo). Os links do Marketplace entram por uma **planilha** mantida pelos corretores, ligada por uma **referência única** que existe tanto no site como na planilha. O Marketplace passa a ser apenas mais um *canal de publicação*, não a fonte de dados.

> A junção Ref. ↔ link do Marketplace acontece no **Núcleo**, não neste módulo. O scraper só conhece o site.

### 1.3. O scraping como produto independente

Decisão de negócio: o scraping é um **módulo vendável à parte**. Há clientes que já têm site e só querem o atendimento; outros que só querem extrair dados. Por isso o módulo tem um **contrato de saída próprio e estável**, independente do Núcleo.

---

## 2. Objetivos e não-objetivos

### 2.1. Objetivos

- Extrair imóveis do site de cada cliente e produzir registos **normalizados** (`ImovelDto`).
- Suportar **sites mistos** (HTML servido pelo servidor e SPAs em JavaScript), escolhido por cliente.
- Modelo **"motor partilhado + perfil/adaptador por cliente"** — sem duplicar código por cliente.
- **Onboarding rápido** de um cliente novo via descoberta de campos a partir de uma URL.
- **Resiliência**: falhas e mudanças de layout detetadas e sinalizadas, nunca silenciosas; nunca apagar inventário por engano.
- Funcionar tanto a alimentar o Núcleo como vendido **standalone**.

### 2.2. Não-objetivos (desta spec)

- Triagem por LLM, matching contra filtros de conversa, construção de mensagens — **são do Núcleo**.
- Junção com a planilha de links do Marketplace — **é do Núcleo**.
- Adaptadores de canal (WhatsApp/Instagram/Messenger) — specs próprias.
- Scraping do Facebook Marketplace — **excluído** (sem API; viola ToS).
- UI de configuração visual — pode vir no futuro; nesta fase a configuração é por perfil declarativo + hooks.

---

## 3. Stack e dependências

- **Linguagem:** TypeScript (Node) — mesmo ecossistema do n8n; partilha de tipos; possibilidade futura de expor como nó n8n personalizado.
- **Framework de scraping:** **Crawlee** — unifica `CheerioCrawler` (HTML servido, leve) e `PlaywrightCrawler` (SPA, browser real) sob o mesmo framework. O **modo é escolhido por cliente**, resolvendo o problema dos sites mistos.
- **Base de dados:** *a decidir* (ver §10). PostgreSQL é o encaixe natural por causa do `extras` JSONB e da partilha multi-cliente/Fase 2.
- **Observabilidade:** alertas operacionais encaminhados via **n8n**; erros de código via **Sentry**.

### 3.1. Justificação Python vs TypeScript (registo da decisão)

Python (Scrapy/BeautifulSoup/lxml) é mais forte para scraping **industrial e em escala**. TypeScript (Crawlee/Playwright/Cheerio) vence **neste contexto** por: sites mistos (Playwright nasceu no mundo Node), escala modesta (1 site por cliente, sync periódico — a vantagem de escala do Scrapy não pesa) e integração com o n8n. O fator que faria virar para Python seria uma ambição de plataforma de crawling industrial multi-cliente com anti-bot pesado — que não é o caso.

---

## 4. Arquitetura do módulo

Duas camadas, deliberadamente separadas para conciliar **"motor agnóstico"** com **"domínio rico"**:

```
  ┌─ MOTOR AGNÓSTICO (não sabe o que é um imóvel) ─────────────────────┐
  │  Crawlee (Cheerio/Playwright) · descoberta de campos · paginação   │
  │  · retries/backoff · diff/estado · circuit breaker · scheduler     │
  │                                                                    │
  │  extrai ─► RegistoBruto { url, campos: { nome → textoCru } }       │
  └──────────────────────────┬─────────────────────────────────────────┘
                             │  ◄── PERFIL DO CLIENTE (a "customização":
                             │         que campos salvar e como mapear)
                             ▼
  ┌─ CAMADA DE DOMÍNIO (vertical imobiliário) ─────────────────────────┐
  │  normalizadores ─► Imovel.criar() : Result<Imovel, ErroValidacao[]> │
  │  Imovel = CORE canónico (validado) + extras (flexível)             │
  │  Imovel ──(mapper)──► ImovelDto  (contrato serializável)           │
  └──────────────────────────┬─────────────────────────────────────────┘
                             ▼
  ┌─ PERSISTÊNCIA & ENTREGA ───────────────────────────────────────────┐
  │  tabela `imovel`: colunas canónicas + `extras` JSONB (BD partilhada)│
  │  API REST de query (GET /imoveis?filtros → ImovelDto)              │
  │  + eventos de mudança (opcional)                                   │
  └────────────────────────────────────────────────────────────────────┘
```

### 4.1. Motor agnóstico

Não assume nada sobre imóveis. Responsabilidades:
- Navegar o site (modo Cheerio ou Playwright por cliente), descobrir listagens e paginar.
- **Descobrir campos** candidatos numa página (JSON-LD, microdata, OpenGraph, padrões DOM repetidos, valores rotulados) — usado no onboarding.
- Extrair, via o perfil do cliente, um `RegistoBruto` (campos em texto cru).
- Gerir diff/estado, circuit breaker, retries e agendamento.

### 4.2. Perfil/adaptador por cliente

Ensina o motor a ler o site **daquele** cliente. **Híbrido**: declarativo para o caso comum (~80%), com **hooks de código** TypeScript para o esquisito (~20%: SPA, formatos estranhos).

```ts
interface AdaptadorCliente {
  clienteId: string
  modo: "CHEERIO" | "PLAYWRIGHT"
  urlsSemente: string[]
  descobrirListagens(pagina): UrlImovel[]      // links de imóveis + paginação
  extrairCampos(paginaDetalhe): CamposBrutos   // seletores → campos em bruto
  // Mapeamento campo-bruto → domínio (declarativo, com hooks opcionais):
  mapeamento: MapaDeCampos                      // ex.: "preco_venda" → Imovel.preco(VENDA)
}
```

> **Sem código forkado por cliente.** Existe **um** motor versionado e testado; cada cliente é só um perfil. Bugfix no motor corrige para todos.

### 4.3. Onboarding guiado por descoberta

```
1. Informo a URL  ─►  motor.analisarUrl(url)
2. Motor devolve os campos detetados (valor-exemplo + seletor sugerido):
      preco_venda = "250.000 €"
      tipo        = "Apartamento T3"
      area        = "120 m²"  …
3. Humano mapeia:  preco_venda → Imovel.preco(VENDA) · area → extras.areaM2 · ignora resto
4. Guarda o PERFIL do cliente (declarativo + hooks quando necessário)
```

---

## 5. Modelo de domínio

### 5.1. Princípio

Domínio **rico** (com invariantes e comportamento intrínseco) ≠ contrato de **saída** (DTO serializável). Mantemos os dois com um **mapper**, alinhado com clean architecture.

### 5.2. Value Objects (só onde há invariante real — evitar *primitive obsession* sem cerimónia gratuita)

```ts
class Ref {           // não-vazia (chave de junção com o Marketplace, no Núcleo)
  static criar(v: string): Result<Ref, ErroValidacao>
}
class Preco {         // valor > 0; periodo coerente com finalidade
  constructor(valor: number, moeda: Moeda, periodo: "MENSAL" | "TOTAL")
}
class Localizacao {   // zonaTexto obrigatória; distrito/concelho/freguesia opcionais
  constructor(zonaTexto: string, concelho?: string, distrito?: string, freguesia?: string)
}
type Finalidade = "ALUGUER" | "VENDA"
```

### 5.3. Entidade `Imovel`

Imutável, criada por **factory que falha rápido mas não rebenta o batch** (devolve `Result`):

```ts
class Imovel {
  private constructor(
    readonly ref: Ref,
    readonly clienteId: string,
    readonly urlSite: UrlSite,
    readonly finalidade: Finalidade,
    readonly preco: Preco,
    readonly localizacao: Localizacao,
    readonly caracteristicas: Caracteristicas,   // tipoImovel, tipologia, areaM2, quartos…
    readonly media: Media,                        // fotoPrincipal…
    readonly extras: Record<string, unknown>,     // campos específicos do cliente
    readonly estado: EstadoExtracao,              // ativo, extraidoEm, atualizadoEm, hashConteudo
  ) {}

  static criar(props): Result<Imovel, ErroValidacao[]>  // invariantes aqui
  mudouEmRelacaoA(outro: Imovel): boolean               // via hashConteudo
  comEstado(estado: EstadoExtracao): Imovel             // update imutável
}
```

> A validação fail-fast **é** a rede de deteção de quebra de scraper: um pico na taxa de rejeição sinaliza provável mudança de layout (ver §7).

### 5.4. Contrato de saída `ImovelDto`

Plano, serializável, versionável. Campos **obrigatórios mínimos**: `ref`, `urlSite`, `finalidade`, `preco`, `zonaTexto`. Restantes "melhor ter".

```
ImovelDto {
  ref, clienteId, urlSite,
  finalidade, tipoImovel?, tipologia?,
  preco, moeda, periodoPreco?,
  distrito?, concelho?, freguesia?, zonaTexto,
  areaM2?, quartos?, casasBanho?, caracteristicas?[],
  fotoPrincipal?,
  extras: { ... },                     // campos específicos do cliente
  ativo, extraidoEm, atualizadoEm, hashConteudo
}
```

Mapper bidirecional: `imovelParaDto(imovel)` / `dtoParaImovel(dto): Result<Imovel>`.

---

## 6. Persistência

- **Schema partilhado multi-cliente:** colunas canónicas validadas + coluna **`extras` JSONB** (concilia "agnóstico" com "domínio rico").
- Tabela `imovel`, chave composta única **`(clienteId, ref)`**.
- **Nunca apagar:** imóvel que sai do site fica `ativo = false` (histórico; o Núcleo deixa de o enviar).
- `hashConteudo` para deteção de alterações entre execuções.

---

## 7. Fluxo de execução e resiliência

```
descobrir listagens ─► paginar ─► buscar detalhe ─► extrairCampos (adaptador)
   ─► normalizar ─► Imovel.criar() ──(Result ok)──► diff vs estado anterior
                                  └─(Result erro)─► rejeita + loga (+ alerta se taxa↑)

   diff por Ref:
     • Ref nova ................... INSERT (ativo=true)
     • Ref existente, hash≠ ....... UPDATE (atualizadoEm)
     • Ref existente, hash= ....... no-op
     • Ref sumiu do site .......... marcar ativo=false (nunca apagar)
```

**Salvaguardas:**
- **Circuit breaker:** queda abrupta do total num run (ex.: −50%) → **não** marca tudo inativo e **dispara alerta** (provável bloqueio/mudança de layout). Diferença entre scraper amador e robusto.
- **Taxa de rejeição** acima de um limiar → alerta (sinal de mudança de site).
- **Falha do run** → alerta.
- Retries/backoff nativos do Crawlee; rate-limit educado; respeitar `robots.txt` (é o site do cliente, com permissão, mas boas práticas).
- Alertas via **n8n** (Slack/email/WhatsApp fáceis); erros de código via **Sentry**.

---

## 8. Entrega do output e operação

- **API REST de query** como fronteira primária: `GET /imoveis?clienteId&finalidade&precoMax&zona…` → devolve `ImovelDto`. Serve o Núcleo e a venda standalone de forma igual, sem acoplar consumidores ao schema interno.
- **Eventos de mudança** (opcional / extensão): webhook quando há novos/alterados/removidos, para o n8n reagir.
- **Agendamento:** scheduler por cliente, frequência configurável (ex.: cada 6h), trigger manual via API. Agendador no próprio serviço (controlo + observabilidade), não dependente do cron do n8n.

---

## 9. Estratégia de testes (TDD)

- **Value objects / invariantes** (`Ref`, `Preco`, `Localizacao`) — testes puros.
- **Normalizadores** — tabela de casos no formato BR (`"R$ 1.250/mês"` → `Preco(1250, BRL, MENSAL)`, `"R$ 250.000"` → `Preco(250000, BRL, TOTAL)`, `"3 quartos"`, `"120 m²"`…).
- **Adaptador por cliente** — contra **fixtures de HTML real guardado** (snapshot do site), sem rede.
- **Diff/estado** — novos/alterados/removidos/no-op + circuit breaker.
- **Mapper** `Imovel ↔ ImovelDto` — ida e volta.

---

## 10. Decisões em aberto

1. **Engine de BD exato** — PostgreSQL é o encaixe natural (JSONB, multi-cliente, partilha com Fase 2); confirmar vs infra existente da Zonesoft.
2. **Acesso dos consumidores internos** — API REST (recomendado) vs leitura direta da BD partilhada (mais simples, mas acopla ao schema interno).
3. **Canal preciso dos alertas** — n8n (Slack/email/WhatsApp) e/ou Sentry; definir o mínimo viável.
4. **Eventos de mudança** — incluídos já ou adiados como extensão pós-MVP.

---

## 11. Evolução futura (fora do âmbito)

- **Fase 2:** o site/sistema próprio da Zonesoft substitui o site raspado como fonte de verdade. Graças à interface `FonteDeImoveis`, troca-se a implementação **sem tocar** em matching/mensagens do Núcleo. O scraper torna-se opcional (para clientes que só têm site de terceiros).
- **Núcleo de atendimento** (triagem LLM, matching, mensagens, leads) — spec própria.
- **Adaptadores de canal** WhatsApp → Instagram → Messenger — specs próprias, como deltas finos sobre o Núcleo.
- Possível **UI de configuração** visual para o onboarding por descoberta.

---

## 12. Locale e plataforma (atualização 2026-06-07)

Após o spike de descoberta contra um site real (ver `docs/spikes/2026-06-07-innove-moldsystems.md`):

- **Locale = Brasil (por enquanto).** Moeda do domínio passou para **`BRL`** (implementado na Fase 1). Vocabulário e formatos de normalização seguem BR (R$, m², quartos, vagas, IPTU, condomínio).
- **Localização BR adiada para a Fase 4.** `Localizacao` ainda usa `distrito/concelho/freguesia` (PT). A migração para **bairro/cidade/estado(UF)** faz-se quando o adaptador existir e soubermos a forma real dos campos da plataforma — evita churn especulativo. `zonaTexto` (obrigatório) continua a servir entretanto.
- **Adaptador por plataforma, não só por cliente.** Sites como o testado correm na plataforma multi-inquilino **MoldSystems / msysimob**. Reenquadrar §4.2: um **adaptador por plataforma** (ex.: MoldSystems) + **config por inquilino** (`imob` id) serve N imobiliárias. O "adaptador por cliente" passa a ser o caso de sites próprios/únicos.
- **Estratégia de extração (Fase 4):** preferir a **API da plataforma** (descoberta via observação de rede com Playwright no onboarding; JSON limpo + paginação); fallback **DOM com Cheerio** ancorado em hrefs estáveis. **Proibido** depender de classes CSS com hash (styled-components).
