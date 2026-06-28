import { Result, ok, err } from "../../shared/result"
import { ErroValidacao, erroValidacao } from "./erro-validacao"

export interface Geo {
  lat: number
  lng: number
}

export interface PropsLocalizacao {
  zonaTexto: string
  bairro?: string
  cidade?: string
  estado?: string // UF, ex.: "SP"
  rua?: string
  numero?: string
  cep?: string
  andar?: number
  pontoReferencia?: string
  condominio?: string
  geo?: Geo
}

export class Localizacao {
  private constructor(
    readonly zonaTexto: string,
    readonly bairro: string | undefined,
    readonly cidade: string | undefined,
    readonly estado: string | undefined,
    readonly rua: string | undefined,
    readonly numero: string | undefined,
    readonly cep: string | undefined,
    readonly andar: number | undefined,
    readonly pontoReferencia: string | undefined,
    readonly condominio: string | undefined,
    readonly geo: Geo | undefined,
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
    const andar = typeof props.andar === "number" && Number.isFinite(props.andar) ? props.andar : undefined
    const geo =
      props.geo && Number.isFinite(props.geo.lat) && Number.isFinite(props.geo.lng) ? props.geo : undefined
    return ok(
      new Localizacao(
        zona,
        opcional(props.bairro),
        opcional(props.cidade),
        uf ? uf.toUpperCase() : undefined,
        opcional(props.rua),
        opcional(props.numero),
        opcional(props.cep),
        andar,
        opcional(props.pontoReferencia),
        opcional(props.condominio),
        geo,
      ),
    )
  }
}
