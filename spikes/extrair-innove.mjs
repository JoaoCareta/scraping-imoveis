// Spike (throwaway): extrai os imóveis do __NEXT_DATA__ do Next.js e mostra os registos limpos.
const url = process.argv[2] ?? "https://imobiliariainnove.com.br/alugar/todos"
const res = await fetch(url, {
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Accept-Language": "pt-BR,pt;q=0.9",
  },
})
const html = await res.text()

const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
if (!m) {
  console.log("Sem __NEXT_DATA__")
  process.exit(1)
}
const data = JSON.parse(m[1])

// Procura recursiva por arrays de objetos que parecem listagens de imóveis.
const hits = []
function walk(node, path) {
  if (Array.isArray(node)) {
    const objs = node.filter((x) => x && typeof x === "object" && !Array.isArray(x))
    if (objs.length === node.length && objs.length > 0) {
      const keys = Object.keys(objs[0])
      const looks = keys.some((k) => /codigo|c[oó]digo|valor|preco|pre[çc]o|bairro|dormit|quart|area|finalidade|tipo/i.test(k))
      if (looks) {
        hits.push({ path, len: node.length, keys, sample: objs[0] })
        return // não recursar para dentro de uma listagem já encontrada
      }
    }
    node.forEach((v, i) => walk(v, `${path}[${i}]`))
  } else if (node && typeof node === "object") {
    for (const k of Object.keys(node)) walk(node[k], `${path}.${k}`)
  }
}
walk(data, "$")

console.log("pageProps keys:", JSON.stringify(Object.keys(data?.props?.pageProps ?? {})))
console.log("arrays candidatos a listagem:", hits.length)
hits.sort((a, b) => b.len - a.len)

const best = hits[0]
if (!best) {
  console.log("Nenhuma listagem encontrada no __NEXT_DATA__.")
  process.exit(0)
}
console.log("\n=== MELHOR LISTAGEM ===")
console.log("PATH:", best.path)
console.log("Nº de imóveis nesta página:", best.len)
console.log("CAMPOS por imóvel:", JSON.stringify(best.keys, null, 0))

console.log("\n=== AMOSTRA: 2 imóveis (JSON) ===")
for (const im of [best.sample, hits[0] && data && best && best.len > 1 ? walkGet(best) : null].filter(Boolean)) {
  // mostra o primeiro; o segundo é tratado abaixo
}
function pick(o) {
  // imprime o objeto inteiro mas truncado por segurança
  return JSON.stringify(o, null, 2)
}
console.log(pick(best.sample).slice(0, 2200))

// segundo imóvel, se houver
function walkGet() {}
const arr = best.path
  .replace(/^\$\./, "")
  .split(/[.[\]]/)
  .filter(Boolean)
  .reduce((acc, k) => (acc == null ? acc : acc[k]), data)
if (Array.isArray(arr) && arr[1]) {
  console.log("\n--- imóvel #2 (resumo de campos-chave) ---")
  const o = arr[1]
  const g = (...ks) => ks.map((k) => o[k]).find((v) => v != null)
  console.log(
    JSON.stringify({
      codigo: g("codigo", "Codigo", "id"),
      finalidade: g("finalidade", "Finalidade", "tipoNegocio"),
      tipo: g("tipo", "Tipo", "categoria"),
      valor: g("valor", "valorLocacao", "valorVenda", "preco"),
      bairro: g("bairro", "Bairro"),
      cidade: g("cidade", "Cidade"),
      dormitorios: g("dormitorios", "quartos", "Dormitorios"),
      area: g("area", "areaUtil", "areaTotal", "metragem"),
    }),
  )
}

console.log("\n--- total/paginação (se exposto) ---")
const pp = data?.props?.pageProps ?? {}
for (const k of Object.keys(pp)) {
  const v = pp[k]
  if (typeof v === "number" || (v && typeof v === "object" && !Array.isArray(v) && ("total" in v || "totalCount" in v || "count" in v))) {
    console.log(" ", k, "=", typeof v === "object" ? JSON.stringify(v).slice(0, 200) : v)
  }
}
