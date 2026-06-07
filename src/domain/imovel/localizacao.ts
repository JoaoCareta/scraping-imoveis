import { Result, ok, err } from "../../shared/result"
import { ErroValidacao, erroValidacao } from "./erro-validacao"

export interface PropsLocalizacao {
  zonaTexto: string
  concelho?: string
  distrito?: string
  freguesia?: string
}

export class Localizacao {
  private constructor(
    readonly zonaTexto: string,
    readonly concelho: string | undefined,
    readonly distrito: string | undefined,
    readonly freguesia: string | undefined,
  ) {}

  static criar(props: PropsLocalizacao): Result<Localizacao, ErroValidacao> {
    const zona = (props.zonaTexto ?? "").trim()
    if (zona.length === 0) {
      return err(erroValidacao("zonaTexto", "A localização (zonaTexto) é obrigatória"))
    }
    const opcional = (v: string | undefined): string | undefined => {
      const limpo = (v ?? "").trim()
      return limpo.length === 0 ? undefined : limpo
    }
    return ok(
      new Localizacao(zona, opcional(props.concelho), opcional(props.distrito), opcional(props.freguesia)),
    )
  }
}
