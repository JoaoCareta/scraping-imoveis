import { ResultadoExtracao, ImovelRejeitado } from "../fonte-de-imoveis"
import { FonteIndisponivelError, FonteTimeoutError } from "../erros"
import { Imovel } from "../../domain/imovel/imovel"
import { EstrategiaColetaKenlo, KenloContexto, DicaListagem } from "./estrategia"
import { urlsDeDetalheDaListagem } from "./kenlo-listagem"
import { imovelDeHtmlDetalhe } from "./kenlo-detalhe"

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,*/*",
}

export interface SeedListagem {
  path: string // ex.: "/imoveis/a-venda/apartamento"
  finalidade: "ALUGUER" | "VENDA"
  tipoImovel?: string
}

export interface ColetaHtmlKenloDeps {
  origin: string
  timeoutMs: number
  seeds: SeedListagem[]
  retries?: number
  fetchFn?: typeof fetch
  dormir?: (ms: number) => Promise<void>
  avisar?: (msg: string) => void
  concorrencia?: number
  maxPaginas?: number
}

function refDe(url: string): string {
  const segs = url.split("?")[0].split("/").filter(Boolean)
  return segs[segs.length - 1] ?? url
}

export class ColetaHtmlKenlo implements EstrategiaColetaKenlo {
  private readonly origin: string
  private readonly timeoutMs: number
  private readonly seeds: SeedListagem[]
  private readonly retries: number
  private readonly fetchFn: typeof fetch
  private readonly dormir: (ms: number) => Promise<void>
  private readonly avisar: (msg: string) => void
  private readonly concorrencia: number
  private readonly maxPaginas: number

  constructor(deps: ColetaHtmlKenloDeps) {
    this.origin = deps.origin
    this.timeoutMs = deps.timeoutMs
    this.seeds = deps.seeds
    this.retries = deps.retries ?? 3
    this.fetchFn = deps.fetchFn ?? fetch
    this.dormir = deps.dormir ?? ((ms) => new Promise((r) => setTimeout(r, ms)))
    this.avisar = deps.avisar ?? (() => {})
    this.concorrencia = deps.concorrencia ?? 5
    this.maxPaginas = deps.maxPaginas ?? 200
  }

  async coletar(ctx: KenloContexto): Promise<ResultadoExtracao> {
    // 1) Enumerar URLs de detalhe iterando ?page=N por seed (para em 404 ou 0 cards).
    const alvos = new Map<string, DicaListagem>()
    for (const seed of this.seeds) {
      for (let page = 1; page <= this.maxPaginas; page++) {
        const url = `${this.origin}${seed.path}?page=${page}`
        const html = await this.obterHtml(url, true) // nuloEm404: fim da paginação
        if (html == null) break
        const urls = urlsDeDetalheDaListagem(html, this.origin)
        if (urls.length === 0) break
        for (const u of urls) {
          if (!alvos.has(u)) alvos.set(u, { finalidade: seed.finalidade, tipoImovel: seed.tipoImovel })
        }
      }
    }

    // 2) Buscar/parsear detalhes em lotes (politeness/concorrência limitada).
    const imoveis: Imovel[] = []
    const rejeitados: ImovelRejeitado[] = []
    const entradas = [...alvos.entries()]
    for (let i = 0; i < entradas.length; i += this.concorrencia) {
      const lote = entradas.slice(i, i + this.concorrencia)
      const resultados = await Promise.all(
        lote.map(async ([url, dica]) => {
          const html = await this.obterHtml(url)
          return html == null ? null : imovelDeHtmlDetalhe(html, url, dica, ctx)
        }),
      )
      for (let j = 0; j < resultados.length; j++) {
        const r = resultados[j]
        if (r == null) continue
        if (r.ok) imoveis.push(r.value)
        else rejeitados.push({ ref: refDe(lote[j][0]), erros: r.error })
      }
    }
    return { imoveis, rejeitados }
  }

  /** GET com timeout/retries. Lança FonteIndisponivel/Timeout em falha. nuloEm404=true → 404 devolve null (fim da paginação). */
  private async obterHtml(url: string, nuloEm404 = false): Promise<string | null> {
    let ultimoErro: unknown
    for (let tentativa = 0; tentativa <= this.retries; tentativa++) {
      try {
        const res = await this.fetchFn(url, { headers: HEADERS, signal: AbortSignal.timeout(this.timeoutMs) })
        if (res.ok) return await res.text()
        if (res.status === 404 && nuloEm404) return null
        if (res.status < 500) throw new FonteIndisponivelError(`Kenlo respondeu HTTP ${res.status} em ${url}`)
        throw new Error(`HTTP ${res.status}`)
      } catch (e) {
        if (e instanceof FonteIndisponivelError) throw e
        if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) {
          throw new FonteTimeoutError(`timeout ao coletar ${url} (${this.timeoutMs}ms)`)
        }
        ultimoErro = e
        if (tentativa < this.retries) await this.dormir(200 * (tentativa + 1))
      }
    }
    const motivo = ultimoErro instanceof Error ? ultimoErro.message : String(ultimoErro)
    throw new FonteIndisponivelError(`Kenlo indisponível em ${url}: ${motivo}`)
  }
}
