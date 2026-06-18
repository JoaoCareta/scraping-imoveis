import { FonteDeImoveis, ResultadoExtracao, ImovelRejeitado } from "../fonte-de-imoveis"
import { FonteIndisponivelError, FonteTimeoutError } from "../erros"
import { Imovel } from "../../domain/imovel/imovel"
import { imoveisDeSolrDoc } from "./solr-mapper"
import { MoldSystemsSolrDoc } from "./solr-doc"

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
}

export interface MoldSystemsFonteDeps {
  origin: string
  clienteId: string
  numRows: number
  timeoutMs: number
  retries?: number
  fetchFn?: typeof fetch
  agora?: () => Date
  dormir?: (ms: number) => Promise<void>
  avisar?: (msg: string) => void
}

interface RespostaSolr {
  response?: { docs?: MoldSystemsSolrDoc[]; numFound?: number }
}

export class MoldSystemsFonte implements FonteDeImoveis {
  private readonly origin: string
  private readonly clienteId: string
  private readonly numRows: number
  private readonly timeoutMs: number
  private readonly retries: number
  private readonly fetchFn: typeof fetch
  private readonly agora: () => Date
  private readonly dormir: (ms: number) => Promise<void>
  private readonly avisar: (msg: string) => void

  constructor(deps: MoldSystemsFonteDeps) {
    this.origin = deps.origin
    this.clienteId = deps.clienteId
    this.numRows = deps.numRows
    this.timeoutMs = deps.timeoutMs
    this.retries = deps.retries ?? 1
    this.fetchFn = deps.fetchFn ?? fetch
    this.agora = deps.agora ?? (() => new Date())
    this.dormir = deps.dormir ?? ((ms) => new Promise((r) => setTimeout(r, ms)))
    this.avisar = deps.avisar ?? (() => {})
  }

  async buscarTodos(): Promise<ResultadoExtracao> {
    const url = `${this.origin}/api/solr/search/${encodeURI(JSON.stringify({ numRows: this.numRows }))}`
    const data = await this.obter(url)
    const docs = data.response?.docs ?? []
    const numFound = data.response?.numFound ?? docs.length
    if (numFound > this.numRows) {
      this.avisar(`catálogo truncado: numFound=${numFound} > numRows=${this.numRows}`)
    }
    const ctx = { clienteId: this.clienteId, origin: this.origin, extraidoEm: this.agora().toISOString() }
    const imoveis: Imovel[] = []
    const rejeitados: ImovelRejeitado[] = []
    for (const doc of docs) {
      for (const r of imoveisDeSolrDoc(doc, ctx)) {
        if (r.ok) imoveis.push(r.value)
        else rejeitados.push({ ref: String(doc.idtProperty), erros: r.error })
      }
    }
    return { imoveis, rejeitados }
  }

  private async obter(url: string): Promise<RespostaSolr> {
    let ultimoErro: unknown
    for (let tentativa = 0; tentativa <= this.retries; tentativa++) {
      try {
        const res = await this.fetchFn(url, { headers: HEADERS, signal: AbortSignal.timeout(this.timeoutMs) })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return (await res.json()) as RespostaSolr
      } catch (e) {
        // AbortSignal.timeout rejeita com DOMException name="TimeoutError"; abort manual usa "AbortError".
        if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) {
          throw new FonteTimeoutError(`timeout ao coletar de ${this.origin} (${this.timeoutMs}ms)`)
        }
        ultimoErro = e
        if (tentativa < this.retries) await this.dormir(200 * (tentativa + 1))
      }
    }
    const motivo = ultimoErro instanceof Error ? ultimoErro.message : String(ultimoErro)
    throw new FonteIndisponivelError(`fonte indisponível em ${this.origin}: ${motivo}`)
  }
}
