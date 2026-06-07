import { Result } from "../../shared/result"
import { ErroValidacao } from "../imovel/erro-validacao"
import { Imovel } from "../imovel/imovel"
import { Preco, Moeda, PeriodoPreco } from "../imovel/preco"
import { isFinalidade } from "../imovel/finalidade"
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
    bairro: imovel.localizacao.bairro,
    cidade: imovel.localizacao.cidade,
    estado: imovel.localizacao.estado,
    zonaTexto: imovel.localizacao.zonaTexto,
    areaM2: imovel.caracteristicas.areaM2,
    quartos: imovel.caracteristicas.quartos,
    casasBanho: imovel.caracteristicas.casasBanho,
    caracteristicas: [...imovel.caracteristicas.lista],
    fotoPrincipal: imovel.media.fotoPrincipal,
    extras: { ...imovel.extras },
    ativo: imovel.estado.ativo,
    extraidoEm: imovel.estado.extraidoEm,
    atualizadoEm: imovel.estado.atualizadoEm,
    hashConteudo: imovel.estado.hashConteudo,
  }
}

export function dtoParaImovel(dto: ImovelDto): Result<Imovel, ErroValidacao[]> {
  const periodo: PeriodoPreco = dto.periodoPreco
    ? (dto.periodoPreco as PeriodoPreco)
    : isFinalidade(dto.finalidade)
      ? Preco.periodoEsperado(dto.finalidade)
      : "TOTAL"

  return Imovel.criar({
    ref: dto.ref,
    clienteId: dto.clienteId,
    urlSite: dto.urlSite,
    finalidade: dto.finalidade,
    preco: {
      valor: dto.preco,
      moeda: dto.moeda as Moeda,
      periodo,
    },
    localizacao: {
      zonaTexto: dto.zonaTexto,
      bairro: dto.bairro,
      cidade: dto.cidade,
      estado: dto.estado,
    },
    caracteristicas: {
      tipoImovel: dto.tipoImovel,
      tipologia: dto.tipologia,
      areaM2: dto.areaM2,
      quartos: dto.quartos,
      casasBanho: dto.casasBanho,
      lista: dto.caracteristicas ?? [],
    },
    media: { fotoPrincipal: dto.fotoPrincipal },
    extras: dto.extras ?? {},
    estado: {
      ativo: dto.ativo,
      extraidoEm: dto.extraidoEm,
      atualizadoEm: dto.atualizadoEm,
      hashConteudo: dto.hashConteudo,
    },
  })
}
