// Spike (throwaway): encontra os imóveis em props.initialState / initialProps (array OU mapa keyed-by-id).
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
const data = JSON.parse(m[1])
const props = data.props ?? {}

const RE = /codigo|c[oó]digo|valor|pre[çc]o|bairro|dormit|quart|finalidade|tipo|cidade|area|metrag/i
const out = []
function find(node, path, depth) {
  if (depth > 8 || node == null) return
  if (Array.isArray(node)) {
    const objs = node.filter((x) => x && typeof x === "object" && !Array.isArray(x))
    if (objs.length === node.length && objs.length > 0 && Object.keys(objs[0]).some((k) => RE.test(k))) {
      out.push({ path, kind: "array", len: node.length, keys: Object.keys(objs[0]), sample: objs[0] })
      return
    }
    node.forEach((v, i) => find(v, `${path}[${i}]`, depth + 1))
  } else if (typeof node === "object") {
    const vals = Object.values(node)
    const objVals = vals.filter((x) => x && typeof x === "object" && !Array.isArray(x))
    if (objVals.length >= 3 && objVals.length === vals.length && Object.keys(objVals[0]).some((k) => RE.test(k))) {
      out.push({ path, kind: "map", len: vals.length, keys: Object.keys(objVals[0]), sample: objVals[0] })
      return
    }
    for (const k of Object.keys(node)) find(node[k], `${path}.${k}`, depth + 1)
  }
}
find(props.initialState, "$.initialState", 0)
find(props.initialProps, "$.initialProps", 0)

console.log("initialState keys:", JSON.stringify(Object.keys(props.initialState ?? {})))
console.log("initialProps keys:", JSON.stringify(Object.keys(props.initialProps ?? {})))
console.log("\ncoleções de imóveis encontradas:", out.length)
out.sort((a, b) => b.len - a.len)

const best = out[0]
if (!best) {
  console.log("Nada encontrado — a fazer dump raso do initialState:")
  const is = props.initialState ?? {}
  for (const k of Object.keys(is)) {
    const v = is[k]
    console.log(" ", k, "->", Array.isArray(v) ? `array(${v.length})` : v && typeof v === "object" ? `object{${Object.keys(v).slice(0, 12)}}` : typeof v)
  }
} else {
  console.log("PATH:", best.path, "| tipo:", best.kind, "| nº imóveis:", best.len)
  console.log("CAMPOS:", JSON.stringify(best.keys))
  console.log("\n=== AMOSTRA (1 imóvel, JSON truncado) ===")
  console.log(JSON.stringify(best.sample, null, 2).slice(0, 2600))
}
