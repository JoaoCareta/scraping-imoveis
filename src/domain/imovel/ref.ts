import { Result, ok, err } from "../../shared/result"
import { ErroValidacao, erroValidacao } from "./erro-validacao"

export class Ref {
  private constructor(readonly valor: string) {}

  static criar(valor: string): Result<Ref, ErroValidacao> {
    const limpo = (valor ?? "").trim()
    if (limpo.length === 0) {
      return err(erroValidacao("ref", "A referência não pode ser vazia"))
    }
    return ok(new Ref(limpo))
  }

  equals(outra: Ref): boolean {
    return this.valor === outra.valor
  }
}
