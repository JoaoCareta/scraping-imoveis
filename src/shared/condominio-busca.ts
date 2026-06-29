// Busca por nome de condomínio — lógica COMPARTILHADA entre scraper-api (em memória)
// e cache-api (SQL), para garantir paridade.
//
// O nome do condomínio é não-padronizado: às vezes em campo estruturado
// (namCondominium), às vezes só no título, no slug da URL ou na descrição. Por isso
// a busca casa o termo contra o TEXTO COMBINADO, por PALAVRA INTEIRA — assim "elev"
// acha "Condomínio Elev" sem confundir com "elevador".

export function normalizarTexto(s: string | undefined | null): string {
  return (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
}

// Palavras genéricas removidas do TERMO de busca, para "Residencial Elev" casar com
// "Condomínio Elev" (ambos reduzem ao token distintivo "elev").
const GENERICOS = /\b(residencial|condominio|edificio|edif|parque|clube|residence|cond)\b/g

/** Normaliza, remove palavras genéricas e colapsa espaços. Vazio → null. */
export function limparTermoCondominio(termo: string | undefined | null): string | null {
  const base = normalizarTexto(termo).replace(GENERICOS, " ").replace(/\s+/g, " ").trim()
  return base.length === 0 ? null : base
}

/** Escapa metacaracteres de regex (válido p/ JS e p/ ERE do Postgres). */
export function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/** Texto combinado pesquisável de um imóvel (nome + título + descrição + url). */
export function textoCondominio(campos: {
  condominio?: string
  titulo?: string
  descricao?: string
  urlSite?: string
}): string {
  return normalizarTexto([campos.condominio, campos.titulo, campos.descricao, campos.urlSite].filter(Boolean).join(" "))
}

/** Match por palavra inteira do termo (já limpo) no texto combinado normalizado. */
export function casaCondominio(textoCombinadoNormalizado: string, termoLimpo: string): boolean {
  return new RegExp("\\b" + escaparRegex(termoLimpo) + "\\b").test(textoCombinadoNormalizado)
}
