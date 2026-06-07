import { Imovel } from "../imovel/imovel"
import { ImovelDto } from "./imovel-dto"

export function imovelParaDto(imovel: Imovel): ImovelDto {
  return {
    ref: imovel.ref.valor,
    clienteId: imovel.clienteId,
    urlSite: imovel.urlSite.valor,
    finalidade: imovel.finalidade,
    tipoImovel: imovel.caracteristicas.tipoImovel,
    tipologia: imovel.caracteristicas.tipologia,
    preco: imovel.preco.valor,
    moeda: imovel.preco.moeda,
    periodoPreco: imovel.preco.periodo,
    distrito: imovel.localizacao.distrito,
    concelho: imovel.localizacao.concelho,
    freguesia: imovel.localizacao.freguesia,
    zonaTexto: imovel.localizacao.zonaTexto,
    areaM2: imovel.caracteristicas.areaM2,
    quartos: imovel.caracteristicas.quartos,
    casasBanho: imovel.caracteristicas.casasBanho,
    caracteristicas: [...imovel.caracteristicas.lista],
    fotoPrincipal: imovel.media.fotoPrincipal,
    extras: imovel.extras,
    ativo: imovel.estado.ativo,
    extraidoEm: imovel.estado.extraidoEm,
    atualizadoEm: imovel.estado.atualizadoEm,
    hashConteudo: imovel.estado.hashConteudo,
  }
}
