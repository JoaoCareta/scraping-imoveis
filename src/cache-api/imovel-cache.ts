import { RecursoImovel } from "../domain/leitura/recurso-imovel"
import { ehSemPreferencia } from "../aplicacao/sem-preferencia"

/** Filtros aceites pela busca no cache (mesma convenção da API do scraper). */
export interface FiltrosCache {
  finalidade?: string
  tipoImovel?: string
  quartos?: number
  precoMin?: number
  precoMax?: number
  cidade?: string
  bairro?: string
  limit: number
}

/** Função de consulta injetável (pg.Pool.query em produção; fake em testes). */
export type Consulta = (
  sql: string,
  params: unknown[],
) => Promise<{ rows: Array<Record<string, unknown>> }>

const SQL_COUNT = "SELECT count(*)::int AS n FROM imovel"

const SQL_BUSCA = `SELECT payload FROM imovel
WHERE ($1::text IS NULL OR finalidade = $1)
  AND ($2::text IS NULL OR tipo_imovel = $2)
  AND ($3::int IS NULL OR quartos = $3)
  AND ($4::numeric IS NULL OR preco >= $4)
  AND ($5::numeric IS NULL OR preco <= $5)
  AND ($6::text IS NULL OR unaccent(lower(cidade)) = unaccent(lower($6)))
  AND ($7::text IS NULL OR unaccent(lower(bairro)) = unaccent(lower($7)))
  AND ativo = true
ORDER BY preco ASC NULLS LAST
LIMIT $8`

/** Coringas ("qualquer", "tanto faz", ...) e vazios viram NULL = sem filtro. */
function semFiltro(valor?: string): string | null {
  if (valor == null) return null
  return ehSemPreferencia(valor) ? null : valor
}

export async function contarCache(consulta: Consulta): Promise<number> {
  const r = await consulta(SQL_COUNT, [])
  const n = r.rows[0]?.n
  return typeof n === "number" ? n : 0
}

export async function buscarNoCache(
  consulta: Consulta,
  f: FiltrosCache,
): Promise<RecursoImovel[]> {
  const params: unknown[] = [
    semFiltro(f.finalidade),
    semFiltro(f.tipoImovel),
    f.quartos ?? null,
    f.precoMin ?? null,
    f.precoMax ?? null,
    semFiltro(f.cidade),
    semFiltro(f.bairro),
    f.limit,
  ]
  const r = await consulta(SQL_BUSCA, params)
  return r.rows.map((row) => row.payload as RecursoImovel)
}
