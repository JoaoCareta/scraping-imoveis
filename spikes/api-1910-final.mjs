// Spike (throwaway): consulta o imóvel via /api/solr/search/{json} (padrão idtsPropertys).
const H = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Accept-Language": "pt-BR,pt;q=0.9",
  Accept: "application/json, text/plain, */*",
}
const ORIGIN = "https://imobiliariainnove.com.br"

const queries = [
  { idtsPropertys: [1910], numRows: 1000 },
  { numRows: 3 },
]

for (const q of queries) {
  const url = `${ORIGIN}/api/solr/search/` + encodeURI(JSON.stringify(q))
  try {
    const r = await fetch(url, { headers: H })
    const ct = r.headers.get("content-type") || ""
    const body = await r.text()
    console.log(`\n=== ${JSON.stringify(q)} -> ${r.status} ${ct} len=${body.length}`)
    if (ct.includes("json")) {
      const data = JSON.parse(body)
      const docs = data?.response?.docs ?? data?.docs ?? []
      console.log("numFound:", data?.response?.numFound, "| docs:", docs.length)
      if (docs[0]) {
        console.log("CAMPOS:", JSON.stringify(Object.keys(docs[0])))
        console.log("DOC[0]:", JSON.stringify(docs[0], null, 1).slice(0, 2200))
      }
    } else {
      console.log(body.slice(0, 300))
    }
  } catch (e) {
    console.log("ERR", e?.message)
  }
}
