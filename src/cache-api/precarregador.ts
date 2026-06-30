import { RecursoImovel } from "../domain/leitura/recurso-imovel"

export interface PrecarregadorDeps {
  /** Busca o catálogo completo do cliente no scraper. */
  buscarNoScraper: (cliente: string) => Promise<RecursoImovel[]>
  /** Substitui (atômico) o catálogo do cliente no cache; devolve nº inserido. */
  substituirCatalogo: (cliente: string, imoveis: RecursoImovel[]) => Promise<number>
  log?: (msg: string) => void
  avisar?: (msg: string) => void
}

/**
 * Pré-carrega o catálogo de cada cliente. Erros são isolados por cliente (um que
 * falha não impede os outros) e NUNCA derrubam o processo. Retorno vazio do scraper
 * não substitui (evita zerar o catálogo por engano).
 */
export async function precarregarTodos(deps: PrecarregadorDeps, clientes: string[]): Promise<void> {
  for (const cliente of clientes) {
    try {
      const imoveis = await deps.buscarNoScraper(cliente)
      if (imoveis.length === 0) {
        deps.avisar?.(`pre-load ${cliente}: scraper devolveu 0 imóveis — catálogo mantido`)
        continue
      }
      const n = await deps.substituirCatalogo(cliente, imoveis)
      deps.log?.(`pre-load ${cliente}: ${n} imóveis carregados no cache`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      deps.avisar?.(`pre-load ${cliente} falhou: ${msg} — catálogo mantido`)
    }
  }
}
