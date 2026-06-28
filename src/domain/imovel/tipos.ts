import { Caracteristica } from "./caracteristica"

export interface Caracteristicas {
  readonly tipoImovel?: string
  readonly tipologia?: string
  readonly areaM2?: number
  readonly quartos?: number
  readonly casasBanho?: number
  readonly titulo?: string
  readonly descricao?: string
  readonly lista: readonly string[]
  readonly itens: readonly Caracteristica[]
}

export interface Media {
  readonly fotoPrincipal?: string
  readonly video?: string
  readonly fotosCondominio?: readonly string[]
}

export interface EstadoExtracao {
  readonly ativo: boolean
  readonly extraidoEm: string // ISO 8601 (calculado fora do domínio — mantém o domínio determinístico)
  readonly atualizadoEm: string // ISO 8601
  readonly hashConteudo: string
}
