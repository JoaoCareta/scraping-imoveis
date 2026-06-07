// Spike (throwaway): descobre ONDE vivem os dados (RSC stream? API backend? DOM?).
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
if (m) {
  const data = JSON.parse(m[1])
  console.log("NEXT keys:", JSON.stringify(Object.keys(data)))
  console.log("buildId:", data.buildId, "| page:", data.page, "| query:", JSON.stringify(data.query))
  console.log("props keys:", JSON.stringify(Object.keys(data.props ?? {})))
  console.log("props.pageProps (300c):", JSON.stringify(data.props?.pageProps ?? {}).slice(0, 300))
  console.log("runtimeConfig:", JSON.stringify(data.runtimeConfig ?? {}).slice(0, 400))
}

console.log("\n__next_f.push (RSC streaming) count:", (html.match(/__next_f\.push/g) || []).length)

const urls = [...html.matchAll(/https?:\/\/[^\s"'<>\\]+/g)].map((x) => x[0])
const hosts = [...new Set(urls.map((u) => {
  try {
    return new URL(u).host
  } catch {
    return u
  }
}))]
console.log("\nhosts referenciados:", JSON.stringify(hosts))

const apiish = [...new Set(urls.filter((u) => /(api|backend|\.json|imovel)/i.test(u) && !/_next\/static/.test(u)))]
console.log("\nURLs api-ish:")
apiish.slice(0, 25).forEach((u) => console.log("  ", u))

const anchors = [...new Set([...html.matchAll(/href=["'](\/imovel\/[^"']+)["']/g)].map((x) => x[1]))]
console.log("\nâncoras de detalhe na página:", anchors.length)
anchors.slice(0, 5).forEach((a) => console.log("  ", a))

// Quanta info por card está no DOM? Conta blocos com link de detalhe + preço próximo.
const cards = (html.match(/\/imovel\/[a-z-]+\/[a-z-]+\/[a-z-]+\/[a-z-]+\/\d+/g) || [])
console.log("\nmatches de URL de imóvel no HTML:", cards.length, "| distintos:", new Set(cards).size)
