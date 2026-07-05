# scraping-imoveis

Módulo de **scraping de imóveis** (TypeScript) — parte do sistema de atendimento para
corretores. A fonte de imóveis vive atrás da interface `FonteDeImoveis`; o primeiro
adaptador é o da plataforma **MoldSystems** (API Solr). Vendável à parte.

> Estado e próximos passos: ver **[TODO.md](./TODO.md)**.

## Requisitos

- **Node.js 20+** (testado em 24) — os spikes usam `fetch` global e top-level `await`.
- npm

## Instalar

```bash
npm install
```

## Testar / correr no VS Code

Abre a pasta `D:\Documentos\scrapping` no VS Code e usa o terminal integrado (`Ctrl+\``):

```bash
npm test            # corre toda a suite (Vitest) — 82 testes
npm run test:watch  # modo watch (re-corre ao guardar)
npm run typecheck   # tsc --noEmit (verifica tipos, sem compilar)

# um ficheiro só:
npx vitest run src/fontes/moldsystems/solr-mapper.test.ts
```

**Dica VS Code:** instala a extensão **Vitest** (publisher: *Vitest*) para correr/depurar
testes no painel *Testing*, ver verde/vermelho inline e pôr breakpoints.

## Correr os "spikes" (demonstrações que batem na API real)

Os scripts em `spikes/` são **exploratórios/throwaway** (JS puro, sem build). Correm com Node:

```bash
node spikes/teste-apartamentos-3q.mjs   # lista apartamentos com 3 quartos (aluguel/venda)
node spikes/imovel-1910-campos.mjs      # campos do imóvel COD 1910
node spikes/api-1910-final.mjs          # consulta crua à API Solr
```

> A versão "a sério" é o adaptador em `src/fontes/moldsystems/` (mapper puro, já feito) +
> o cliente HTTP `MoldSystemsFonte` (**Fase 4b, ainda por fazer** — só aí haverá um
> `npm run scrape` que corre o scraper de ponta a ponta).

## Estrutura

```
src/
  shared/           Result<T,E>
  domain/imovel/    Imovel (entidade rica) + value objects + ImovelDto + mapper
  normalizadores/   parsing BR (preço R$, área m², inteiros, finalidade/tipo/cidade/ref de URL)
  fontes/
    fonte-de-imoveis.ts   interface FonteDeImoveis + ResultadoExtracao
    moldsystems/          adaptador da plataforma MoldSystems (Solr doc -> Imovel)
docs/   specs/ plans/ spikes/  (design, planos TDD, descobertas)
spikes/ scripts exploratórios (.mjs)
```

## Serviço HTTP / API

O scraper corre como **serviço HTTP stateless** (sem cache, sem BD): cada pedido
coleta da API do MoldSystems, mapeia e devolve um Read Model rico (`RecursoImovel`).

### Correr localmente

```bash
npm run dev                  # tsx watch (desenvolvimento)
npm run build && npm start   # produção (dist/main.js)
```

### Endpoints
- `GET /health` → `{ "status": "ok" }`
- `GET /imoveis?finalidade=ALUGUER&precoMax=2000&quartos=3&cidade=Bauru` → envelope `ColetaConcluida`
- `GET /imoveis/:ref`

A resposta de `/imoveis` é um envelope com sabor a evento de domínio:

```jsonc
{ "evento": "ColetaConcluida", "extraidoEm": "...", "total": 42, "rejeitados": 3, "imoveis": [ /* RecursoImovel */ ] }
```

### Deploy (VPS Hostinger · docker compose + Traefik)

Tudo roda numa única VPS (`srv1800774.hstgr.cloud`), em stacks separados ligados
pela rede docker `n8n-ww9q_default` (criada pelo stack do n8n):

| Stack | Onde vive (VPS) | Container(s) | Papel |
|---|---|---|---|
| traefik | `/docker/traefik` | `traefik-traefik-1` | Proxy reverso (rede host). TLS via Let's Encrypt; só roteia quem tem `traefik.enable=true`. |
| n8n | `/docker/n8n-ww9q` | `n8n-ww9q-n8n-1` | Orquestra e é o **dono do cache**: consulta o banco primeiro e, no miss/sync, chama o scraper e **grava** o resultado. |
| este repo | `/root/scraping-imoveis` | `scraper-api` | Só **scraping**, stateless — coleta ao vivo da fonte de cada cliente. Sem banco, sem cache. |
| `db/docker-compose.yml` | (pendente na VPS nova) | `inove-postgres` | Banco. **Grava/Lê:** n8n (catálogo `imovel`, chat memory, conversas). O scraper NÃO toca aqui. |

Rotas públicas (via Traefik, HTTPS automático):

- `https://scraper.srv1800774.hstgr.cloud` → `scraper-api` (porta interna 3000)

Primeira instalação na VPS (uma vez só):

```bash
cd /root/scraping-imoveis
cp .env.example .env                         # e ajustar (API_KEY, CLIENTES…)
(cd db && docker compose up -d)              # Postgres (pendente: ainda não sobe na VPS nova)
docker compose up -d --build
```

Atualizar (rotina): **automático** — todo push na `main` dispara o workflow
[deploy-vps](.github/workflows/deploy.yml), que conecta na VPS por SSH, faz
`git reset --hard origin/main` (o clone lá é só de deploy; o `.env` é gitignorado
e sobrevive) e roda [scripts/deploy.sh](scripts/deploy.sh) — build + espera os
`/health` (direto e via Traefik) responderem 200. Se o código novo não ficar
saudável, o workflow faz **rollback** para o commit anterior e o run fica vermelho.
Requer 2 secrets no GitHub (Settings → Secrets and variables → Actions):
`VPS_SSH_KEY` (chave privada de deploy) e `VPS_SSH_FINGERPRINT` (host key da VPS)
— como gerá-los está no cabeçalho do próprio workflow.

Deploy manual (fallback, ou se o Actions estiver fora):

```bash
cd /root/scraping-imoveis
git fetch origin main && git reset --hard origin/main
bash scripts/deploy.sh                       # NÃO repetir o cp do .env — sobrescreveria o real
```

Confirmar: `curl https://scraper.srv1800774.hstgr.cloud/health` (ou, direto no host, `:3000`).

Autenticação: preencher `API_KEY` no `.env` ativa o header `x-api-key` no scraper-api.
Os workflows do n8n que chamam o scraper ([TOOL] buscar_imoveis e [SYNC] Catalogo imoveis)
usam a credencial "Scraper Auth" com essa mesma chave.
Dentro da rede `n8n-ww9q_default`, os serviços se alcançam pelo nome do container
(`http://scraper-api:3000`, `inove-postgres:5432`).
