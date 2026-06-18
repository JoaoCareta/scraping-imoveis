import { Imovel } from "../imovel/imovel"

/** Read Model (Event Storming) — projeção rica/hierárquica do agregado Imovel para leitura via API. */
export interface RecursoImovel {
  ref: string
  clienteId: string
  urlSite: string
  finalidade: string
  preco: { valor: number; moeda: string; periodo: string }
  localizacao: { zonaTexto: string; bairro?: string; cidade?: string; estado?: string }
  caracteristicas: {
    tipoImovel?: string
    tipologia?: string
    areaM2?: number
    quartos?: number
    casasBanho?: number
    lista: string[]
  }
  media: { fotoPrincipal?: string }
  extras: Record<string, unknown>
  estado: { ativo: boolean; extraidoEm: string; atualizadoEm: string; hashConteudo: string }
}

export function imovelParaRecurso(imovel: Imovel): RecursoImovel {
  return {
    ref: imovel.ref.valor,
    clienteId: imovel.clienteId,
    urlSite: imovel.urlSite.valor,
    finalidade: imovel.finalidade,
    preco: { valor: imovel.preco.valor, moeda: imovel.preco.moeda, periodo: imovel.preco.periodo },
    localizacao: {
      zonaTexto: imovel.localizacao.zonaTexto,
      bairro: imovel.localizacao.bairro,
      cidade: imovel.localizacao.cidade,
      estado: imovel.localizacao.estado,
    },
    caracteristicas: {
      tipoImovel: imovel.caracteristicas.tipoImovel,
      tipologia: imovel.caracteristicas.tipologia,
      areaM2: imovel.caracteristicas.areaM2,
      quartos: imovel.caracteristicas.quartos,
      casasBanho: imovel.caracteristicas.casasBanho,
      lista: [...imovel.caracteristicas.lista],
    },
    media: { fotoPrincipal: imovel.media.fotoPrincipal },
    extras: { ...imovel.extras },
    estado: {
      ativo: imovel.estado.ativo,
      extraidoEm: imovel.estado.extraidoEm,
      atualizadoEm: imovel.estado.atualizadoEm,
      hashConteudo: imovel.estado.hashConteudo,
    },
  }
}
