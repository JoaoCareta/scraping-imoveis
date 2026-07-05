import Fastify, { FastifyInstance, FastifyRequest } from "fastify"
import { Config } from "../config"
import { ImovelRepository, FiltrosImovel } from "../aplicacao/imovel-repository"
import { RegistroDeFontes } from "../fontes/registro-de-fontes"
import { FonteIndisponivelError, FonteTimeoutError } from "../fontes/erros"
import { ehSemPreferencia } from "../aplicacao/sem-preferencia"

interface QueryImoveis {
  cliente?: string
  finalidade?: "ALUGUER" | "VENDA"
  precoMin?: number
  precoMax?: number
  quartos?: number
  cidade?: string
  bairro?: string
  tipoImovel?: string
  ativo?: boolean
  comodidades?: string
  condominio?: string
  limit?: number
  offset?: number
}

/** "piscina,portaria" → ["piscina","portaria"]; vazio → undefined. */
function lista(valor?: string): string[] | undefined {
  if (valor == null || valor.trim() === "") return undefined
  const itens = valor.split(",").map((s) => s.trim()).filter((s) => s.length > 0)
  return itens.length > 0 ? itens : undefined
}

const SCHEMA_IMOVEIS = {
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      cliente: { type: "string" },
      finalidade: { type: "string", enum: ["ALUGUER", "VENDA"] },
      precoMin: { type: "number", minimum: 0 },
      precoMax: { type: "number", minimum: 0 },
      quartos: { type: "integer", minimum: 0 },
      cidade: { type: "string" },
      bairro: { type: "string" },
      tipoImovel: { type: "string" },
      ativo: { type: "boolean" },
      comodidades: { type: "string" },
      condominio: { type: "string" },
      // Teto alto: o sync do n8n puxa o catálogo inteiro do cliente numa chamada só.
      limit: { type: "integer", minimum: 1, maximum: 5000, default: 100 },
      offset: { type: "integer", minimum: 0, default: 0 },
    },
  },
}

export function criarServidor(registro: RegistroDeFontes, config: Config): FastifyInstance {
  const app = Fastify({ logger: { level: config.logLevel } })

  if (config.apiKey) {
    const chaveEsperada = config.apiKey
    app.addHook("onRequest", async (req, reply) => {
      if (req.url.startsWith("/health")) return
      if (req.headers["x-api-key"] !== chaveEsperada) {
        return reply.code(401).send({
          evento: "NaoAutorizado",
          erro: { codigo: "API_KEY", mensagem: "x-api-key inválida ou ausente" },
        })
      }
    })
  }

  // Blinda os filtros antes da validação: valores vazios OU "coringa" (qualquer,
  // tanto faz, todos, ambos, indiferente, ...) que o cliente/modelo manda são
  // removidos — viram ausência de filtro em vez de filtrar por um texto inexistente.
  app.addHook("preValidation", async (req) => {
    const q = req.query as Record<string, unknown> | undefined
    if (q && typeof q === "object") {
      for (const chave of Object.keys(q)) {
        const valor = q[chave]
        if (typeof valor === "string" && ehSemPreferencia(valor)) {
          delete q[chave]
        }
      }
    }
  })

  app.setErrorHandler((erroDesconhecido, _req, reply) => {
    const erro = erroDesconhecido as Error & { statusCode?: number }
    if (erro instanceof FonteTimeoutError) {
      return reply.code(504).send({
        evento: "FonteTimeout",
        erro: { codigo: "FONTE_TIMEOUT", mensagem: erro.message },
      })
    }
    if (erro instanceof FonteIndisponivelError) {
      return reply.code(503).send({
        evento: "FonteIndisponivel",
        erro: { codigo: "FONTE_INDISPONIVEL", mensagem: erro.message },
      })
    }
    const status = erro.statusCode ?? 500
    return reply.code(status).send({
      evento: "Erro",
      erro: { codigo: String(status), mensagem: erro.message },
    })
  })

  app.get("/health", async () => ({
    status: "ok",
    uptimeMs: Math.round(process.uptime() * 1000),
  }))

  // cliente é OBRIGATÓRIO: seleciona o repo do cliente pedido no registro.
  // Ausente → 400 CLIENTE_OBRIGATORIO; fora do registro → 400 CLIENTE_DESCONHECIDO.
  function resolverRepo(
    cliente: string | undefined,
    reply: import("fastify").FastifyReply,
  ): ImovelRepository | undefined {
    const id = (cliente ?? "").trim()
    if (!id) {
      reply.code(400).send({
        evento: "Erro",
        erro: { codigo: "CLIENTE_OBRIGATORIO", mensagem: "Parâmetro 'cliente' é obrigatório." },
      })
      return undefined
    }
    const repo = registro.obter(id)
    if (!repo) {
      reply.code(400).send({
        evento: "Erro",
        erro: { codigo: "CLIENTE_DESCONHECIDO", mensagem: `Cliente '${id}' não está registrado.` },
      })
      return undefined
    }
    return repo
  }

  app.get<{ Querystring: QueryImoveis }>(
    "/imoveis",
    { schema: SCHEMA_IMOVEIS },
    async (req: FastifyRequest<{ Querystring: QueryImoveis }>, reply) => {
      const q = req.query
      const repo = resolverRepo(q.cliente, reply)
      if (!repo) return reply
      const limit = q.limit ?? 100
      const offset = q.offset ?? 0
      const filtros: FiltrosImovel = {
        finalidade: q.finalidade,
        precoMin: q.precoMin,
        precoMax: q.precoMax,
        quartos: q.quartos,
        cidade: q.cidade,
        bairro: q.bairro,
        tipoImovel: q.tipoImovel,
        ativo: q.ativo,
        comodidades: lista(q.comodidades),
        condominio: q.condominio,
      }
      const coleta = await repo.buscar(filtros)
      // total = nº de imóveis que casam os filtros (antes da paginação); imoveis = a página.
      return {
        evento: "ColetaConcluida",
        extraidoEm: coleta.extraidoEm,
        total: coleta.total,
        rejeitados: coleta.rejeitados,
        limit,
        offset,
        imoveis: coleta.imoveis.slice(offset, offset + limit),
      }
    },
  )

  app.get<{ Params: { ref: string }; Querystring: { cliente?: string } }>("/imoveis/:ref", async (req, reply) => {
    const repo = resolverRepo(req.query.cliente, reply)
    if (!repo) return reply
    const coleta = await repo.buscarPorRef(req.params.ref)
    if (coleta.total === 0) {
      return reply.code(404).send({
        evento: "ImovelNaoEncontrado",
        erro: { codigo: "NAO_ENCONTRADO", mensagem: `ref ${req.params.ref} não encontrada` },
      })
    }
    return {
      evento: "ColetaConcluida",
      extraidoEm: coleta.extraidoEm,
      total: coleta.total,
      rejeitados: coleta.rejeitados,
      imoveis: coleta.imoveis,
    }
  })

  return app
}
