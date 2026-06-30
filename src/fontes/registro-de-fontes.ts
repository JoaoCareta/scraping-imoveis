import { ClienteConfig } from "../config"
import { criarFonte } from "./fabrica"
import { FonteImovelRepository } from "../aplicacao/fonte-imovel-repository"
import { ImovelRepository } from "../aplicacao/imovel-repository"

/** Resolve cliente → repositório (uma fonte por cliente, construída no boot). */
export interface RegistroDeFontes {
  obter(clienteId: string): ImovelRepository | undefined
}

export function criarRegistro(
  clientes: ClienteConfig[],
  infra: { fetchTimeoutMs: number },
): RegistroDeFontes {
  const repos = new Map<string, ImovelRepository>()
  for (const cliente of clientes) {
    const fonte = criarFonte(cliente, infra)
    repos.set(cliente.id, new FonteImovelRepository({ fonte }))
  }
  return { obter: (clienteId) => repos.get(clienteId) }
}
