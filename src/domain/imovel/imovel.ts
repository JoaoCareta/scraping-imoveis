import { Result, ok, err } from "../../shared/result"
import { ErroValidacao, erroValidacao } from "./erro-validacao"
import { Finalidade, isFinalidade } from "./finalidade"
import { Ref } from "./ref"
import { Preco, Moeda, PeriodoPreco } from "./preco"
import { Localizacao, PropsLocalizacao } from "./localizacao"
import { UrlSite } from "./url-site"
import { Caracteristicas, Media, EstadoExtracao } from "./tipos"

export interface PropsImovel {
  ref: string
  clienteId: string
  urlSite: string
  finalidade: string
  preco?: { valor: number; moeda: Moeda; periodo: PeriodoPreco }
  localizacao: PropsLocalizacao
  caracteristicas: Caracteristicas
  media: Media
  extras: Record<string, unknown>
  estado: EstadoExtracao
}

export class Imovel {
  private constructor(
    readonly ref: Ref,
    readonly clienteId: string,
    readonly urlSite: UrlSite,
    readonly finalidade: Finalidade,
    readonly preco: Preco | undefined,
    readonly localizacao: Localizacao,
    readonly caracteristicas: Caracteristicas,
    readonly media: Media,
    readonly extras: Record<string, unknown>,
    readonly estado: EstadoExtracao,
  ) {}

  static criar(props: PropsImovel): Result<Imovel, ErroValidacao[]> {
    const erros: ErroValidacao[] = []

    const refR = Ref.criar(props.ref)
    if (!refR.ok) erros.push(refR.error)

    const clienteId = (props.clienteId ?? "").trim()
    if (clienteId.length === 0) erros.push(erroValidacao("clienteId", "clienteId é obrigatório"))

    const urlR = UrlSite.criar(props.urlSite)
    if (!urlR.ok) erros.push(urlR.error)

    const finalidadeValida = isFinalidade(props.finalidade)
    if (!finalidadeValida) erros.push(erroValidacao("finalidade", "finalidade tem de ser ALUGUER ou VENDA"))

    // Preço é OPCIONAL: ausência = "sob consulta". Só valida quando fornecido.
    let preco: Preco | undefined
    if (props.preco) {
      const precoR = Preco.criar(props.preco.valor, props.preco.moeda, props.preco.periodo)
      if (!precoR.ok) {
        erros.push(precoR.error)
      } else {
        preco = precoR.value
        if (finalidadeValida) {
          const esperado = Preco.periodoEsperado(props.finalidade as Finalidade)
          if (preco.periodo !== esperado) {
            erros.push(erroValidacao("preco.periodo", `Para ${props.finalidade} o período tem de ser ${esperado}`))
          }
        }
      }
    }

    const locR = Localizacao.criar(props.localizacao)
    if (!locR.ok) erros.push(locR.error)

    if (erros.length > 0) return err(erros)

    // Guarda de narrowing: inalcançável (acima já retornámos se houve erros).
    // Existe só para o TypeScript estreitar os Result para o construtor — não lança.
    if (!refR.ok || !urlR.ok || !locR.ok || !finalidadeValida) {
      return err(erros)
    }

    return ok(
      new Imovel(
        refR.value,
        clienteId,
        urlR.value,
        props.finalidade as Finalidade,
        preco,
        locR.value,
        props.caracteristicas,
        props.media,
        { ...props.extras },
        props.estado,
      ),
    )
  }

  mudouEmRelacaoA(outro: Imovel): boolean {
    return this.estado.hashConteudo !== outro.estado.hashConteudo
  }

  comEstado(estado: EstadoExtracao): Imovel {
    return new Imovel(
      this.ref,
      this.clienteId,
      this.urlSite,
      this.finalidade,
      this.preco,
      this.localizacao,
      this.caracteristicas,
      this.media,
      this.extras,
      estado,
    )
  }
}
