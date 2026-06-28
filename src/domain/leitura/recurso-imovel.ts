import { Imovel } from "../imovel/imovel"

/** Read Model (Event Storming) — projeção rica/hierárquica do agregado Imovel para leitura via API. */
export interface RecursoImovel {
  ref: string
  clienteId: string
  urlSite: string
  finalidade: "ALUGUER" | "VENDA"
  preco: { valor: number; moeda: string; periodo: string }
  localizacao: { zonaTexto: string; bairro?: string; cidade?: string; estado?: string }
  caracteristicas: {
    tipoImovel?: string
    tipologia?: string
    areaM2?: number
    quartos?: number
    casasBanho?: number
    lista: string[]
    itens: Array<{
      idtFonte: number
      chave: string
      rotulo: string
      grupo?: string
      tipo: "BOOLEANA" | "NUMERICA" | "TEXTO"
      valorBool?: boolean
      valorNum?: number
      valorTexto?: string
    }>
    comodidades: string[]
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
    caracteristicas: (() => {
      const itens = imovel.caracteristicas.itens.map((i) => ({
        idtFonte: i.idtFonte,
        chave: i.chave,
        rotulo: i.rotulo,
        grupo: i.grupo,
        tipo: i.tipo,
        valorBool: i.valorBool,
        valorNum: i.valorNum,
        valorTexto: i.valorTexto,
      }))
      const comodidades = [
        ...new Set(
          itens
            .filter((i) => i.tipo === "BOOLEANA" && i.valorBool === true)
            .flatMap((i) => (i.grupo ? [i.chave, i.grupo] : [i.chave])),
        ),
      ]
      return {
        tipoImovel: imovel.caracteristicas.tipoImovel,
        tipologia: imovel.caracteristicas.tipologia,
        areaM2: imovel.caracteristicas.areaM2,
        quartos: imovel.caracteristicas.quartos,
        casasBanho: imovel.caracteristicas.casasBanho,
        lista: [...imovel.caracteristicas.lista],
        itens,
        comodidades,
      }
    })(),
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
