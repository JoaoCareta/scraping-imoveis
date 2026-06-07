// Spike (throwaway): pega todos os apartamentos com 3 quartos via API Solr e separa por finalidade.
const H = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
}
const ORIGIN = "https://imobiliariainnove.com.br"
const url = `${ORIGIN}/api/solr/search/` + encodeURI(JSON.stringify({ numRows: 5000 }))
const data = await (await fetch(url, { headers: H })).json()
const docs = data.response.docs
console.log("catálogo total numFound:", data.response.numFound)

const ehApt = (d) => /apartament/i.test(d.namCategory ?? "")
const apt3 = docs.filter((d) => ehApt(d) && d.totalRooms === 3)
console.log("APARTAMENTOS com 3 quartos:", apt3.length)

const brl = (n) => "R$ " + (n || 0).toLocaleString("pt-BR")
const aluguel = apt3.filter((d) => d.valLocation > 0).sort((a, b) => a.valLocation - b.valLocation)
const venda = apt3.filter((d) => d.valSales > 0).sort((a, b) => a.valSales - b.valSales)

console.log(`\n=== ALUGUEL (${aluguel.length}) ===`)
for (const d of aluguel) console.log(`  COD ${String(d.idtProperty).padEnd(5)} ${brl(d.valLocation).padEnd(14)} ${d.namDistrict}, ${d.namCity}`)

console.log(`\n=== VENDA (${venda.length}) ===`)
for (const d of venda) console.log(`  COD ${String(d.idtProperty).padEnd(5)} ${brl(d.valSales).padEnd(16)} ${d.namDistrict}, ${d.namCity}`)

if (aluguel.length) console.log(`\nfaixa aluguel: ${brl(aluguel[0].valLocation)} a ${brl(aluguel.at(-1).valLocation)}`)
if (venda.length) console.log(`faixa venda: ${brl(venda[0].valSales)} a ${brl(venda.at(-1).valSales)}`)
