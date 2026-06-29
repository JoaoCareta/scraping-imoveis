import { Imovel } from "../imovel/imovel"

/** Read Model (Event Storming) — projeção rica/hierárquica do agregado Imovel para leitura via API. */
export interface RecursoImovel {
  ref: string
  clienteId: string
  urlSite: string
  finalidade: "ALUGUER" | "VENDA"
  preco?: { valor: number; moeda: string; periodo: string }
  localizacao: {
    zonaTexto: string
    bairro?: string
    cidade?: string
    estado?: string
    rua?: string
    numero?: string
    cep?: string
    andar?: number
    pontoReferencia?: string
    condominio?: string
    geo?: { lat: number; lng: number }
  }
  caracteristicas: {
    tipoImovel?: string
    tipologia?: string
    areaM2?: number
    quartos?: number
    casasBanho?: number
    titulo?: string
    descricao?: string
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
      origem: "IMOVEL" | "CONDOMINIO"
    }>
    comodidades: string[]
  }
  media: { fotoPrincipal?: string; video?: string; fotosCondominio?: string[] }
  extras: Record<string, unknown>
  estado: { ativo: boolean; extraidoEm: string; atualizadoEm: string; hashConteudo: string }
}

export function imovelParaRecurso(imovel: Imovel): RecursoImovel {
  return {
    ref: imovel.ref.valor,
    clienteId: imovel.clienteId,
    urlSite: imovel.urlSite.valor,
    finalidade: imovel.finalidade,
    preco: imovel.preco
      ? { valor: imovel.preco.valor, moeda: imovel.preco.moeda, periodo: imovel.preco.periodo }
      : undefined,
    localizacao: {
      zonaTexto: imovel.localizacao.zonaTexto,
      bairro: imovel.localizacao.bairro,
      cidade: imovel.localizacao.cidade,
      estado: imovel.localizacao.estado,
      rua: imovel.localizacao.rua,
      numero: imovel.localizacao.numero,
      cep: imovel.localizacao.cep,
      andar: imovel.localizacao.andar,
      pontoReferencia: imovel.localizacao.pontoReferencia,
      condominio: imovel.localizacao.condominio,
      geo: imovel.localizacao.geo ? { lat: imovel.localizacao.geo.lat, lng: imovel.localizacao.geo.lng } : undefined,
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
        origem: i.origem,
      }))
      // Uma comodidade "está presente" se é booleana verdadeira OU é numérica >0
      // de um conceito curado (tem grupo) — ex.: "Elevador Social: 2" conta como
      // ter elevador. O gate por grupo evita poluir com numéricos estruturais
      // (área, dormitórios, salas) que não têm grupo.
      const presente = (i: { tipo: string; valorBool?: boolean; valorNum?: number; grupo?: string }) =>
        (i.tipo === "BOOLEANA" && i.valorBool === true) ||
        (i.tipo === "NUMERICA" && typeof i.valorNum === "number" && i.valorNum > 0 && i.grupo != null)
      const comodidades = [
        ...new Set(
          itens
            .filter(presente)
            .flatMap((i) => {
              const base = i.grupo ? [i.chave, i.grupo] : [i.chave]
              return i.origem === "CONDOMINIO" ? [...base, "condominio"] : base
            }),
        ),
      ]
      return {
        tipoImovel: imovel.caracteristicas.tipoImovel,
        tipologia: imovel.caracteristicas.tipologia,
        areaM2: imovel.caracteristicas.areaM2,
        quartos: imovel.caracteristicas.quartos,
        casasBanho: imovel.caracteristicas.casasBanho,
        titulo: imovel.caracteristicas.titulo,
        descricao: imovel.caracteristicas.descricao,
        lista: [...imovel.caracteristicas.lista],
        itens,
        comodidades,
      }
    })(),
    media: {
      fotoPrincipal: imovel.media.fotoPrincipal,
      video: imovel.media.video,
      fotosCondominio: imovel.media.fotosCondominio ? [...imovel.media.fotosCondominio] : undefined,
    },
    extras: { ...imovel.extras },
    estado: {
      ativo: imovel.estado.ativo,
      extraidoEm: imovel.estado.extraidoEm,
      atualizadoEm: imovel.estado.atualizadoEm,
      hashConteudo: imovel.estado.hashConteudo,
    },
  }
}
