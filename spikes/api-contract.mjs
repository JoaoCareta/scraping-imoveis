// Spike (throwaway): extrai dos bundles JS o contrato das chamadas de API (search/detalhe por código).
const H = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Accept-Language": "pt-BR,pt;q=0.9",
}
const ORIGIN = "https://imobiliariainnove.com.br"
const html = await (await fetch(`${ORIGIN}/alugar/todos`, { headers: H })).text()
const chunks = [...new Set([...html.matchAll(/\/_next\/static\/[^"']+\.js/g)].map((m) => m[0]))]

const needles = ["solr/search", "api/solr/list", "api/imove", "/api/property", "getImovel", "getProperty", "byCode", "porCodigo"]
const seen = new Set()
let hits = 0

for (const c of chunks) {
  let js = ""
  try {
    js = await (await fetch(ORIGIN + c, { headers: H })).text()
  } catch {
    continue
  }
  for (const n of needles) {
    let idx = js.indexOf(n)
    while (idx >= 0 && hits < 40) {
      const ctx = js.slice(Math.max(0, idx - 160), idx + 200).replace(/\s+/g, " ")
      if (!seen.has(ctx)) {
        seen.add(ctx)
        hits++
        console.log(`\n[${n}] …${ctx}…`)
      }
      idx = js.indexOf(n, idx + n.length)
    }
  }
}
console.log("\n\n--- hits:", hits, "---")
