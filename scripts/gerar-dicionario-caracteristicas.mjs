// scripts/gerar-dicionario-caracteristicas.mjs
// Busca a home da Innove, extrai o array allCharacteristics e emite o dicionário TS.
// Uso: node scripts/gerar-dicionario-caracteristicas.mjs
import { writeFileSync } from "node:fs"

const ORIGIN = process.env.ORIGIN ?? "https://imobiliariainnove.com.br"
const SAIDA = "src/fontes/moldsystems/caracteristicas-dicionario.ts"
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
}

function slug(s) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function extrairArray(html, marcador) {
  const start = html.indexOf(marcador)
  if (start < 0) throw new Error(`marcador ausente: ${marcador}`)
  let i = html.indexOf("[", start + marcador.length)
  let depth = 0
  for (let k = i; k < html.length; k++) {
    const ch = html[k]
    if (ch === "[") depth++
    else if (ch === "]") {
      depth--
      if (depth === 0) return JSON.parse(html.slice(i, k + 1))
    }
  }
  throw new Error("array não fechou")
}

const html = await (await fetch(ORIGIN + "/", { headers: HEADERS })).text()
const arr = extrairArray(html, '"allCharacteristics":')

const linhas = arr
  .filter((c) => c.idtCharacteristics != null && c.desCharacteristics)
  .sort((a, b) => a.idtCharacteristics - b.idtCharacteristics)
  .map((c) => {
    const rotulo = String(c.desCharacteristics).replace(/"/g, '\\"')
    return `  ${c.idtCharacteristics}: { chave: "${slug(c.desCharacteristics)}", rotulo: "${rotulo}" },`
  })
  .join("\n")

const BLOCO_CURADO = `
// ---- Curado à mão (preservado pelo gerador) ----
export interface CaracteristicaResolvida {
  chave: string
  rotulo: string
  grupo?: string
}

export const GRUPOS: Record<number, string> = {
  97: "elevador", 96: "elevador", 592: "elevador",
  15: "piscina", 571: "piscina", 73: "piscina", 572: "piscina",
  496: "churrasqueira", 17: "churrasqueira", 615: "churrasqueira",
  235: "sacada", 283: "sacada", 85: "sacada",
  76: "portaria", 312: "portaria", 204: "portaria", 515: "portaria",
  6: "suite", 626: "suite",
}

export function resolverCaracteristica(idt: number): CaracteristicaResolvida | undefined {
  const base = ROTULOS[idt]
  if (!base) return undefined
  const grupo = GRUPOS[idt]
  return grupo ? { ...base, grupo } : { ...base }
}
`

const conteudo = `// GERADO por scripts/gerar-dicionario-caracteristicas.mjs — não editar à mão.
// Dicionário de características EXCLUSIVO da MoldSystems/Innove (${arr.length} entradas).
export interface EntradaDicionario {
  chave: string
  rotulo: string
}

export const ROTULOS: Record<number, EntradaDicionario> = {
${linhas}
}
${BLOCO_CURADO}`

writeFileSync(SAIDA, conteudo)
console.log(`escrito ${SAIDA} com ${arr.length} entradas`)
