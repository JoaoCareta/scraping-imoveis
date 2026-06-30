import { FastifyInstance } from "fastify"
import { carregarConfig, Config, ClienteConfig } from "./config"
import { criarFonte } from "./fontes/fabrica"
import { FonteImovelRepository } from "./aplicacao/fonte-imovel-repository"
import { criarServidor } from "./api/server"

export function construirApp(config: Config): FastifyInstance {
  const cliente: ClienteConfig = {
    id: config.clienteId, plataforma: config.plataforma, estrategia: config.estrategia,
    origin: config.origin, solrNumRows: config.solrNumRows,
    kenloSeeds: config.kenloSeeds, kenloMaxPaginas: config.kenloMaxPaginas,
  }
  const fonte = criarFonte(cliente, { fetchTimeoutMs: config.fetchTimeoutMs })
  const repo = new FonteImovelRepository({ fonte })
  return criarServidor(repo, config)
}

export async function iniciar(): Promise<void> {
  const config = carregarConfig(process.env)
  const app = construirApp(config)
  const fechar = async () => {
    await app.close()
    process.exit(0)
  }
  process.on("SIGTERM", fechar)
  process.on("SIGINT", fechar)
  await app.listen({ host: config.host, port: config.port })
}

// Arranca só quando executado diretamente (não em testes).
if (process.env.NODE_ENV !== "test") {
  iniciar().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
