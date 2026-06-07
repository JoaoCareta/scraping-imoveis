// Spike de descoberta (throwaway) — NÃO faz parte do módulo.
// Busca a página real e caracteriza a sua estrutura para informar o adaptador da Fase 4.
const url = process.argv[2] ?? "https://imobiliariainnove.com.br/alugar/todos"

let res, html
try {
  res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "pt-BR,pt;q=0.9",
    },
  })
  html = await res.text()
} catch (e) {
  console.log("FETCH_ERROR:", e?.message ?? e)
  process.exit(1)
}

const has = (re) => (html.match(re) || []).length
console.log("STATUS:", res.status, "| content-type:", res.headers.get("content-type"))
console.log("HTML length:", html.length)

console.log("\n--- SSR vs SPA ---")
console.log("__NEXT_DATA__ (Next.js):", html.includes("__NEXT_DATA__"))
console.log("data-reactroot / id=root|app|__next:", /id=["'](root|app|__next)["']|data-reactroot/.test(html))
console.log("script tags:", has(/<script[\s>]/g))
const bodyText = (html.split(/<body[^>]*>/i)[1] ?? "").replace(/<script[\s\S]*?<\/script>/gi, "")
console.log("approx visible text length (body minus scripts):", bodyText.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().length)

console.log("\n--- Dados estruturados ---")
const ld = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
console.log("JSON-LD blocks:", ld.length)
for (const m of ld.slice(0, 6)) {
  try {
    const d = JSON.parse(m[1].trim())
    const arr = Array.isArray(d) ? d : [d]
    console.log("  @type:", JSON.stringify(arr.map((x) => x["@type"])), "| keys:", JSON.stringify(Object.keys(arr[0] ?? {}).slice(0, 12)))
  } catch {
    console.log("  (parse falhou, len", m[1].length, ")")
  }
}
const og = [...html.matchAll(/<meta[^>]+property=["']og:([^"']+)["'][^>]+content=["']([^"']*)["']/gi)].map((m) => [m[1], m[2]])
console.log("OpenGraph:", JSON.stringify(og.slice(0, 8)))
console.log("microdata itemprop count:", has(/itemprop=/g))

console.log("\n--- Heurística de campos (ocorrências no HTML) ---")
console.log('preço "R$":', has(/R\$\s?\d/g))
console.log("área m²/m2:", has(/m²|m2\b/g))
console.log("quartos/dormitórios:", has(/quartos?|dormit[óo]rios?/gi))
console.log("vagas/garagem:", has(/vagas?|garagem/gi))
console.log("banheiros:", has(/banheiros?/gi))
console.log("ref/código:", has(/(refer[êe]ncia|c[óo]digo|\bref\b|c[óo]d\.?)/gi))
console.log("suíte(s):", has(/su[íi]tes?/gi))

const links = [...html.matchAll(/href=["']([^"']+)["']/gi)].map((m) => m[1])
const detail = [...new Set(links.filter((h) => /(imovel|imoveis|alugar|aluguel|comprar|venda|\/ref|\/cod|\/\d{3,})/i.test(h)))]
console.log("\n--- Links candidatos a detalhe ---")
console.log("total links:", links.length, "| candidatos:", detail.length)
console.log(detail.slice(0, 20).join("\n"))

console.log("\n--- Amostras de contexto de preço ---")
;[...html.matchAll(/.{50}R\$\s?[\d.,]+.{25}/g)]
  .slice(0, 6)
  .forEach((m) => console.log("  …", m[0].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()))
