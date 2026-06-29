import { FonteDeImoveis, ResultadoExtracao } from "../fonte-de-imoveis"
import { EstrategiaColetaKenlo } from "./estrategia"

export interface KenloFonteDeps {
  origin: string
  clienteId: string
  estrategia: EstrategiaColetaKenlo
  agora?: () => Date
}

export class KenloFonte implements FonteDeImoveis {
  constructor(private readonly deps: KenloFonteDeps) {}

  async buscarTodos(): Promise<ResultadoExtracao> {
    const agora = this.deps.agora ?? (() => new Date())
    const ctx = {
      clienteId: this.deps.clienteId,
      origin: this.deps.origin,
      extraidoEm: agora().toISOString(),
    }
    return this.deps.estrategia.coletar(ctx)
  }
}
