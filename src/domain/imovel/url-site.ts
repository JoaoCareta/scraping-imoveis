import { Result, ok, err } from "../../shared/result"
import { ErroValidacao, erroValidacao } from "./erro-validacao"

export class UrlSite {
  private constructor(readonly valor: string) {}

  static criar(valor: string): Result<UrlSite, ErroValidacao> {
    const limpo = (valor ?? "").trim()
    let url: URL
    try {
      url = new URL(limpo)
    } catch {
      return err(erroValidacao("urlSite", "URL do imóvel inválida"))
    }
    const protocoloValido = url.protocol === "http:" || url.protocol === "https:"
    if (!protocoloValido) {
      return err(erroValidacao("urlSite", "A URL tem de ser http ou https"))
    }
    return ok(new UrlSite(url.toString()))
  }
}
