import { RecursoImovel } from "../domain/leitura/recurso-imovel"

export interface FiltrosImovel {
  finalidade?: "ALUGUER" | "VENDA"
  precoMin?: number
  precoMax?: number
  quartos?: number
  cidade?: string
  bairro?: string
  tipoImovel?: string
  ativo?: boolean
  comodidades?: string[]
}

/** Resultado de "ColetarImoveis" (envelope ColetaConcluida). */
export interface Coleta {
  imoveis: RecursoImovel[]
  total: number
  rejeitados: number
  extraidoEm: string
}

export interface ImovelRepository {
  buscar(filtros: FiltrosImovel): Promise<Coleta>
  buscarPorRef(ref: string): Promise<Coleta>
}
