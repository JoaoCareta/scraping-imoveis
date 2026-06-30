# Fallback em cache-miss (cache-api) — design

## Problema

A cache-api decide servir do cache pelo **total do cliente** (`contar(cliente) > 0`), não
pelos filtros. Com cache **parcial** (ex.: só apartamento pré-carregado), uma busca por
`casa` acha 0 no cache mas — como o cliente tem imóveis — a cache-api devolve **"nada"** em
vez de cair pro scraper. Sintoma real: `apartamento` aparecia (cache), `casa` não.

## Objetivo

Quando a busca **filtrada** no cache vier **vazia**, cair pro **scraper com os mesmos
filtros** (em vez de devolver 0 imóveis).

## Decisão (do brainstorming)

- **Fallback simples**: repassa o resultado do scraper; **NÃO grava no cache** (write-through
  fica como evolução futura).

## Mudança

- `src/cache-api/server.ts`, handler `/imoveis`: dentro do `if (total > 0)`, só **retornar do
  cache se `imoveis.length > 0`**. Senão, sair do bloco e cair no `deps.fallback({ ...q,
  cliente })` que já existe (mesmo caminho do cache totalmente vazio).

```
total = contar(cliente)
if (total > 0) {
  imoveis = buscar(filtros)
  if (imoveis.length > 0) return cache(imoveis)   // só serve do cache se achou algo
}
return fallback({ ...filtros, cliente })           // 0 no cache → scraper com os filtros
```

## Trade-off

- Toda busca com **0 resultados** passa a chamar o scraper: innove (Solr) ~3s; **caires
  (Kenlo) ~80s** (crawl ao vivo). Buscas comuns (apartamento/casa, cobertas pelo warm-up)
  seguem vindo do cache (rápidas); só tipos fora do warm-up ou filtros sem match caem no
  scraper.

## Testes

- cache-api server: `contar>0` mas `buscar → []` → `fallback` é chamado (com os filtros +
  cliente); a resposta **não** é o envelope `origem: "cache"`.
- `contar>0` e `buscar → [itens]` → continua vindo do cache (`origem: "cache"`) — regressão.
- Demais comportamentos (cliente obrigatório, fallback quando `total==0`) inalterados.

## Não-objetivos

- Sem write-through (gravar o resultado do fallback no cache).
- Sem mudar a lógica do scraper nem do warm-up.
