// Spike (throwaway): a página de DETALHE traz o imóvel em JSON limpo no __NEXT_DATA__?
const url =
  process.argv[2] ??
  "https://imobiliariainnove.com.br/imovel/locacao/apartamentos/aracatuba/conjunto-habitacional-pedro-perri/2937"
const res = await fetch(url, {
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Accept-Language": "pt-BR,pt;q=0.9",
  },
})
const html = await res.text()
const data = JSON.parse(html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)[1])
const is = data.props?.initialState ?? {}
console.log("STATUS:", res.status, "| initialState keys:", JSON.stringify(Object.keys(is)))
console.log("result keys:", JSON.stringify(Object.keys(is.result ?? {})))

// Procura o objeto do imóvel: aquele que contém o código 2937 e campos típicos.
let best = null
function find(node, path, depth) {
  if (depth > 9 || node == null || best) return
  if (typeof node === "object" && !Array.isArray(node)) {
    const keys = Object.keys(node)
    const hasCodigo = keys.some((k) => /codigo|c[oó]digo/i.test(k))
    const rich = keys.filter((k) => /valor|pre[çc]o|bairro|cidade|dormit|quart|area|metrag|finalidade|tipo|su[íi]te|vaga|banh/i.test(k))
    if (hasCodigo && rich.length >= 3) {
      best = { path, keys, sample: node }
      return
    }
    for (const k of keys) find(node[k], `${path}.${k}`, depth + 1)
  } else if (Array.isArray(node)) {
    node.forEach((v, i) => find(v, `${path}[${i}]`, depth + 1))
  }
}
find(is, "$.initialState", 0)

if (best) {
  console.log("\n=== IMÓVEL ENCONTRADO ===")
  console.log("PATH:", best.path)
  console.log("CAMPOS:", JSON.stringify(best.keys))
  // imprime campos-chave de forma legível
  const o = best.sample
  const g = (...ks) => {
    for (const k of ks) if (o[k] != null && o[k] !== "") return o[k]
    return undefined
  }
  console.log("\n--- leitura de campos-chave ---")
  console.log(
    JSON.stringify(
      {
        codigo: g("codigo", "Codigo", "id"),
        finalidade: g("finalidade", "Finalidade", "tipoNegocio", "negocio"),
        tipo: g("tipo", "categoria", "Categoria", "subtipo"),
        valorLocacao: g("valorLocacao", "valorAluguel", "valor", "precoLocacao"),
        valorVenda: g("valorVenda", "precoVenda"),
        bairro: g("bairro", "Bairro"),
        cidade: g("cidade", "Cidade"),
        dormitorios: g("dormitorios", "quartos", "Dormitorios"),
        suites: g("suites", "suite"),
        banheiros: g("banheiros", "banheiro"),
        vagas: g("vagas", "garagem", "vagasGaragem"),
        area: g("area", "areaUtil", "areaTotal", "metragem", "areaPrivativa"),
        iptu: g("iptu", "valorIptu"),
        condominio: g("condominio", "valorCondominio"),
      },
      null,
      2,
    ),
  )
  console.log("\n--- JSON completo (truncado 2500c) ---")
  console.log(JSON.stringify(best.sample, null, 2).slice(0, 2500))
} else {
  console.log("\nNão encontrei objeto de imóvel no initialState (detalhe também é client-side).")
  console.log("result.propertys:", Array.isArray(is.result?.propertys) ? `array(${is.result.propertys.length})` : typeof is.result?.propertys)
}
