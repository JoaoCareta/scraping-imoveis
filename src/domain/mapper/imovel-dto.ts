export interface ImovelDto {
  ref: string
  clienteId: string
  urlSite: string
  finalidade: string
  tipoImovel?: string
  tipologia?: string
  preco: number
  moeda: string
  periodoPreco?: string
  bairro?: string
  cidade?: string
  estado?: string
  zonaTexto: string
  areaM2?: number
  quartos?: number
  casasBanho?: number
  caracteristicas?: string[]
  fotoPrincipal?: string
  extras: Record<string, unknown>
  ativo: boolean
  extraidoEm: string
  atualizadoEm: string
  hashConteudo: string
}
