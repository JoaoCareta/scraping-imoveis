// Spike (throwaway): inspeciona directamente initialState.result.propertys
const url = process.argv[2] ?? "https://imobiliariainnove.com.br/alugar/todos"
const res = await fetch(url, {
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Accept-Language": "pt-BR,pt;q=0.9",
  },
})
const html = await res.text()
const data = JSON.parse(html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)[1])
const result = data.props?.initialState?.result ?? {}
const p = result.propertys

console.log("result keys:", JSON.stringify(Object.keys(result)))
console.log("propertys:", Array.isArray(p) ? `array(${p.length})` : typeof p, "| bounds:", JSON.stringify(result.bounds)?.slice(0, 120))

if (Array.isArray(p) && p.length) {
  console.log("\nCAMPOS de um imóvel:")
  console.log(JSON.stringify(Object.keys(p[0])))
  console.log("\n=== IMÓVEL #1 (JSON) ===")
  console.log(JSON.stringify(p[0], null, 2))
} else {
  console.log("\npropertys vazio. selectedPropertys:", JSON.stringify(result.selectedPropertys)?.slice(0, 200))
  console.log("dump result (raso):")
  for (const k of Object.keys(result)) {
    const v = result[k]
    console.log("  ", k, "->", Array.isArray(v) ? `array(${v.length})` : v && typeof v === "object" ? `object{${Object.keys(v)}}` : JSON.stringify(v))
  }
}
