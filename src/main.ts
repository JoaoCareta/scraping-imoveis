import { FastifyInstance } from "fastify"
import { carregarConfig, Config } from "./config"
import { criarRegistro } from "./fontes/registro-de-fontes"
import { criarServidor } from "./api/server"

export function construirApp(config: Config): FastifyInstance {
  const registro = criarRegistro(config.clientes, { fetchTimeoutMs: config.fetchTimeoutMs })
  return criarServidor(registro, config)
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
