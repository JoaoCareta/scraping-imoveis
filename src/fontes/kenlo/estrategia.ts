export interface KenloContexto {
  clienteId: string
  origin: string
  extraidoEm: string // ISO 8601
}

/** Dica vinda da listagem de onde a URL de detalhe foi colhida. */
export interface DicaListagem {
  finalidade: "ALUGUER" | "VENDA"
  tipoImovel?: string
}
