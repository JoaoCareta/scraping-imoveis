export const FINALIDADES = ["ALUGUER", "VENDA"] as const
export type Finalidade = (typeof FINALIDADES)[number]

export const isFinalidade = (valor: string): valor is Finalidade =>
  (FINALIDADES as readonly string[]).includes(valor)
