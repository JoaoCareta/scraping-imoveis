import { Result, ok, err } from "../../shared/result"
import { ErroValidacao, erroValidacao } from "./erro-validacao"
import { Finalidade } from "./finalidade"

export type Moeda = "EUR"
export type PeriodoPreco = "MENSAL" | "TOTAL"

export class Preco {
  private constructor(
    readonly valor: number,
    readonly moeda: Moeda,
    readonly periodo: PeriodoPreco,
  ) {}

  static criar(
    valor: number,
    moeda: Moeda,
    periodo: PeriodoPreco,
  ): Result<Preco, ErroValidacao> {
    if (!Number.isFinite(valor) || valor <= 0) {
      return err(erroValidacao("preco", "O preço tem de ser maior que zero"))
    }
    return ok(new Preco(valor, moeda, periodo))
  }

  static periodoEsperado(finalidade: Finalidade): PeriodoPreco {
    return finalidade === "ALUGUER" ? "MENSAL" : "TOTAL"
  }
}
