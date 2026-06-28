import { Result, ok, err } from "../../shared/result"
import { ErroValidacao, erroValidacao } from "./erro-validacao"

export type TipoCaracteristica = "BOOLEANA" | "NUMERICA" | "TEXTO"
export type OrigemCaracteristica = "IMOVEL" | "CONDOMINIO"

export interface PropsCaracteristica {
  idtFonte: number
  chave: string
  rotulo: string
  grupo?: string
  tipo: TipoCaracteristica
  valorBool?: boolean
  valorNum?: number
  valorTexto?: string
  origem?: OrigemCaracteristica
}

export class Caracteristica {
  private constructor(
    readonly idtFonte: number,
    readonly chave: string,
    readonly rotulo: string,
    readonly grupo: string | undefined,
    readonly tipo: TipoCaracteristica,
    readonly valorBool: boolean | undefined,
    readonly valorNum: number | undefined,
    readonly valorTexto: string | undefined,
    readonly origem: OrigemCaracteristica,
  ) {}

  static criar(props: PropsCaracteristica): Result<Caracteristica, ErroValidacao> {
    const chave = (props.chave ?? "").trim()
    if (chave.length === 0) return err(erroValidacao("chave", "chave é obrigatória"))

    const rotulo = (props.rotulo ?? "").trim()
    if (rotulo.length === 0) return err(erroValidacao("rotulo", "rotulo é obrigatório"))

    if (props.tipo === "BOOLEANA" && typeof props.valorBool !== "boolean") {
      return err(erroValidacao("valor", "BOOLEANA requer valorBool"))
    }
    if (props.tipo === "NUMERICA" && !Number.isFinite(props.valorNum)) {
      return err(erroValidacao("valor", "NUMERICA requer valorNum finito"))
    }
    const texto = (props.valorTexto ?? "").trim()
    if (props.tipo === "TEXTO" && texto.length === 0) {
      return err(erroValidacao("valor", "TEXTO requer valorTexto não-vazio"))
    }

    const grupo = (props.grupo ?? "").trim()
    return ok(
      new Caracteristica(
        props.idtFonte,
        chave,
        rotulo,
        grupo.length === 0 ? undefined : grupo,
        props.tipo,
        props.tipo === "BOOLEANA" ? props.valorBool : undefined,
        props.tipo === "NUMERICA" ? props.valorNum : undefined,
        props.tipo === "TEXTO" ? texto : undefined,
        props.origem ?? "IMOVEL",
      ),
    )
  }
}
