// Spike (throwaway): tenta consultar o imóvel COD 1910 via API Solr da plataforma.
const H = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Accept-Language": "pt-BR,pt;q=0.9",
  Accept: "application/json, text/plain, */*",
}
const ORIGIN = "https://imobiliariainnove.com.br"
const CODE = "1910"

const getTries = [
  `${ORIGIN}/api/solr/search/?codigo=${CODE}`,
  `${ORIGIN}/api/solr/search/?reference=${CODE}`,
  `${ORIGIN}/api/solr/search/?q=${CODE}`,
  `${ORIGIN}/api/solr/search/?code=${CODE}`,
  `${ORIGIN}/api/solr/search/?busca=${CODE}`,
  `${ORIGIN}/api/solr/search/?term=${CODE}`,
  `${ORIGIN}/api/autocomplete/?q=${CODE}`,
  `${ORIGIN}/api/solr/search/`,
]

async function show(label, r) {
  const ct = r.headers.get("content-type") || ""
  const body = await r.text()
  console.log(`\n=== ${label} -> ${r.status} ${ct} len=${body.length}`)
  console.log(body.slice(0, 900))
}

for (const u of getTries) {
  try {
    const r = await fetch(u, { headers: H })
    await show("GET " + u, r)
  } catch (e) {
    console.log("GET", u, "ERR", e?.message)
  }
}

// POST attempts
const postBodies = [
  { codigo: CODE },
  { reference: CODE },
  { q: CODE },
  { search: CODE, page: 1 },
]
for (const b of postBodies) {
  try {
    const r = await fetch(`${ORIGIN}/api/solr/search/`, {
      method: "POST",
      headers: { ...H, "Content-Type": "application/json" },
      body: JSON.stringify(b),
    })
    await show("POST /api/solr/search/ " + JSON.stringify(b), r)
  } catch (e) {
    console.log("POST", JSON.stringify(b), "ERR", e?.message)
  }
}
