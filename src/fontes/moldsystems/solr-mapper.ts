import { Finalidade } from "../../domain/imovel/finalidade"
import { PeriodoPreco } from "../../domain/imovel/preco"
import { MoldSystemsSolrDoc } from "./solr-doc"

export interface OperacaoPreco {
  finalidade: Finalidade
  valor: number
  periodo: PeriodoPreco
}

export function finalidadesDeDoc(doc: MoldSystemsSolrDoc): OperacaoPreco[] {
  const out: OperacaoPreco[] = []
  if (typeof doc.valLocation === "number" && doc.valLocation > 0) {
    out.push({ finalidade: "ALUGUER", valor: doc.valLocation, periodo: "MENSAL" })
  }
  if (typeof doc.valSales === "number" && doc.valSales > 0) {
    out.push({ finalidade: "VENDA", valor: doc.valSales, periodo: "TOTAL" })
  }
  return out
}
