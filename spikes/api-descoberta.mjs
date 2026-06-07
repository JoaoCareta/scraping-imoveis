// Spike (throwaway): descobre o endpoint da API da plataforma MoldSystems nos bundles JS.
const H = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Accept-Language": "pt-BR,pt;q=0.9",
}
const ORIGIN = "https://imobiliariainnove.com.br"
const html = await (await fetch(`${ORIGIN}/alugar/todos`, { headers: H })).text()

const chunks = [...new Set([...html.matchAll(/\/_next\/static\/[^"']+\.js/g)].map((m) => m[0]))]
console.log("chunks JS:", chunks.length)

const hosts = new Set()
const apiUrls = new Set()
const baseHints = new Set()

for (const c of chunks) {
  let js = ""
  try {
    js = await (await fetch(ORIGIN + c, { headers: H })).text()
  } catch {
    continue
  }
  for (const m of js.matchAll(/https?:\/\/[a-z0-9.\-]+(?:\/[a-zA-Z0-9._\-\/{}:]*)?/gi)) {
    const u = m[0]
    if (/_next\/static|fonts\.g|googletag|google-analytics|facebook|instagram|youtube|w3\.org|schema\.org|gstatic|googleapis/i.test(u)) continue
    try {
      hosts.add(new URL(u).host)
    } catch {}
    if (/api|imove|imovel|site|busca|search|propert/i.test(u)) apiUrls.add(u)
  }
  for (const m of js.matchAll(/["'`](\/(?:api|site|imove|imovel|busca|search|propert)[a-zA-Z0-9._\-\/{}:]*)["'`]/gi)) apiUrls.add("REL " + m[1])
  for (const m of js.matchAll(/(?:baseURL|baseUrl|API_URL|BASE_URL|NEXT_PUBLIC_[A-Z_]*URL)["'`:=\s]{1,6}["'`][^"'`]{3,120}["'`]/g)) baseHints.add(m[0].replace(/\s+/g, " ").slice(0, 140))
}

console.log("\n--- hosts (não-estáticos) ---")
console.log([...hosts].join("\n"))
console.log("\n--- URLs/paths api-ish ---")
console.log([...apiUrls].slice(0, 60).join("\n"))
console.log("\n--- pistas de baseURL/env ---")
console.log([...baseHints].slice(0, 30).join("\n"))
