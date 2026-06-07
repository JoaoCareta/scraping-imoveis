import { Imovel } from "../domain/imovel/imovel"
import { ErroValidacao } from "../domain/imovel/erro-validacao"

/** Um imóvel rejeitado na extração (não passou nas invariantes do domínio). */
export interface ImovelRejeitado {
  readonly ref: string
  readonly erros: readonly ErroValidacao[]
}

/** Resultado de uma extração: imóveis válidos + rejeitados (para alertas/taxa de rejeição). */
export interface ResultadoExtracao {
  readonly imoveis: readonly Imovel[]
  readonly rejeitados: readonly ImovelRejeitado[]
}

/** Fonte de imóveis — implementada por API (MoldSystems) ou DOM (Cheerio/Playwright). */
export interface FonteDeImoveis {
  buscarTodos(): Promise<ResultadoExtracao>
}
