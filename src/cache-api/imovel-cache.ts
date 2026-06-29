import { RecursoImovel } from "../domain/leitura/recurso-imovel"
import { ehSemPreferencia } from "../aplicacao/sem-preferencia"
import { limparTermoCondominio, escaparRegex } from "../shared/condominio-busca"

/** Filtros aceites pela busca no cache (mesma convenção da API do scraper). */
export interface FiltrosCache {
  finalidade?: string
  tipoImovel?: string
  quartos?: number
  precoMin?: number
  precoMax?: number
  cidade?: string
  bairro?: string
  comodidades?: string[]
  condominio?: string
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
  AND ($8::jsonb IS NULL OR payload->'caracteristicas'->'comodidades' @> $8::jsonb)
  AND ($9::text IS NULL OR unaccent(lower(concat_ws(' ',
        payload->'localizacao'->>'condominio',
        payload->'caracteristicas'->>'titulo',
        payload->'caracteristicas'->>'descricao',
        payload->>'urlSite'))) ~ ('\\m' || $9 || '\\M'))
  AND ativo = true
ORDER BY preco ASC NULLS LAST
LIMIT $10`

/** Coringas ("qualquer", "tanto faz", ...) e vazios viram NULL = sem filtro. */
function semFiltro(valor?: string): string | null {
  if (valor == null) return null
  return ehSemPreferencia(valor) ? null : valor
}

function comodidadesFiltro(valores?: string[]): string | null {
  if (!valores) return null
  // Slugs guardados são minúsculos; minusculizar o input dá paridade com a scraper-api
  // (case-insensitive) — ex.: "Piscina" casa com o slug "piscina".
  const limpas = valores.map((v) => (v ?? "").trim().toLowerCase()).filter((v) => v.length > 0 && !ehSemPreferencia(v))
  return limpas.length === 0 ? null : JSON.stringify(limpas)
}

/** Termo de condomínio limpo (sem genéricos) e escapado para o regex do Postgres. */
function condominioFiltro(valor?: string): string | null {
  if (valor == null || ehSemPreferencia(valor)) return null
  const limpo = limparTermoCondominio(valor)
  return limpo == null ? null : escaparRegex(limpo)
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
    comodidadesFiltro(f.comodidades),
    condominioFiltro(f.condominio),
    f.limit,
  ]
  const r = await consulta(SQL_BUSCA, params)
  return r.rows.map((row) => row.payload as RecursoImovel)
}
