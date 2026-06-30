import { RecursoImovel } from "../domain/leitura/recurso-imovel"
import { ehSemPreferencia } from "../aplicacao/sem-preferencia"
import { limparTermoCondominio, escaparRegex } from "../shared/condominio-busca"

/** Filtros aceites pela busca no cache (mesma convenção da API do scraper). */
export interface FiltrosCache {
  /** Cliente (tenant) cujo catálogo será consultado. Obrigatório: toda query é escopada. */
  clienteId: string
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

// Toda query é escopada por cliente_id ($1) — isolamento entre tenants e uso do
// índice composto (cliente_id, ...) que escala para muitos clientes.
const SQL_COUNT = "SELECT count(*)::int AS n FROM imovel WHERE cliente_id = $1"

const SQL_BUSCA = `SELECT payload FROM imovel
WHERE cliente_id = $1
  AND ($2::text IS NULL OR finalidade = $2)
  AND ($3::text IS NULL OR tipo_imovel = $3)
  AND ($4::int IS NULL OR quartos = $4)
  AND ($5::numeric IS NULL OR preco >= $5)
  AND ($6::numeric IS NULL OR preco <= $6)
  AND ($7::text IS NULL OR unaccent(lower(cidade)) = unaccent(lower($7)))
  AND ($8::text IS NULL OR unaccent(lower(bairro)) = unaccent(lower($8)))
  AND ($9::jsonb IS NULL OR payload->'caracteristicas'->'comodidades' @> $9::jsonb)
  AND ($10::text IS NULL OR unaccent(lower(concat_ws(' ',
        payload->'localizacao'->>'condominio',
        payload->'caracteristicas'->>'titulo',
        payload->'caracteristicas'->>'descricao',
        payload->>'urlSite'))) ~ ('\\m' || $10 || '\\M'))
  AND ativo = true
ORDER BY preco ASC NULLS LAST
LIMIT $11`

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

export async function contarCache(consulta: Consulta, clienteId: string): Promise<number> {
  const r = await consulta(SQL_COUNT, [clienteId])
  const n = r.rows[0]?.n
  return typeof n === "number" ? n : 0
}

export async function buscarNoCache(
  consulta: Consulta,
  f: FiltrosCache,
): Promise<RecursoImovel[]> {
  const params: unknown[] = [
    f.clienteId,
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

const SQL_DELETE_CLIENTE = "DELETE FROM imovel WHERE cliente_id = $1"

const SQL_UPSERT = `INSERT INTO imovel
  (cliente_id, ref, finalidade, tipo_imovel, quartos, preco, cidade, bairro, ativo, payload)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
ON CONFLICT (cliente_id, ref, finalidade) DO UPDATE SET
  tipo_imovel = EXCLUDED.tipo_imovel, quartos = EXCLUDED.quartos, preco = EXCLUDED.preco,
  cidade = EXCLUDED.cidade, bairro = EXCLUDED.bairro, ativo = EXCLUDED.ativo,
  payload = EXCLUDED.payload, sincronizado_em = now()`

/**
 * Substitui o catálogo do cliente DENTRO de uma transação (`tx`): apaga as linhas
 * do cliente e reinsere as novas. Devolve quantos imóveis foram inseridos.
 * O ciclo de transação (BEGIN/COMMIT/ROLLBACK + client do pool) é do chamador.
 */
export async function substituirCatalogoTx(
  tx: Consulta,
  cliente: string,
  imoveis: RecursoImovel[],
): Promise<number> {
  await tx(SQL_DELETE_CLIENTE, [cliente])
  for (const im of imoveis) {
    await tx(SQL_UPSERT, [
      cliente,
      im.ref,
      im.finalidade,
      im.caracteristicas.tipoImovel ?? null,
      im.caracteristicas.quartos ?? null,
      im.preco?.valor ?? null,
      im.localizacao.cidade ?? null,
      im.localizacao.bairro ?? null,
      im.estado.ativo,
      JSON.stringify(im),
    ])
  }
  return imoveis.length
}
