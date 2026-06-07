import { Result, ok, err } from "../../shared/result"
import { ErroValidacao, erroValidacao } from "./erro-validacao"

export interface PropsLocalizacao {
  zonaTexto: string
  bairro?: string
  cidade?: string
  estado?: string // UF, ex.: "SP"
}

export class Localizacao {
  private constructor(
    readonly zonaTexto: string,
    readonly bairro: string | undefined,
    readonly cidade: string | undefined,
    readonly estado: string | undefined,
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
    const uf = opcional(props.estado)
    return ok(new Localizacao(zona, opcional(props.bairro), opcional(props.cidade), uf ? uf.toUpperCase() : undefined))
  }
}
