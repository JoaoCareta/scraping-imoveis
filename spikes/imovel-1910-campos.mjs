// Spike (throwaway): campos limpos do imóvel 1910.
const H = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
}
const ORIGIN = "https://imobiliariainnove.com.br"
const url = `${ORIGIN}/api/solr/search/` + encodeURI(JSON.stringify({ idtsPropertys: [1910], numRows: 1000 }))
const data = await (await fetch(url, { headers: H })).json()
const d = data.response.docs[0]

const fmt = (v) => (typeof v === "number" ? v.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : v)
console.log("idtProperty:", d.idtProperty, "| tipo:", d.indType === "L" ? "LOCAÇÃO" : d.indType)
console.log("categoria:", d.namCategory, "/", d.namSubCategory)
console.log("valLocation (aluguel): R$", fmt(d.valLocation))
console.log("valCondominium: R$", fmt(d.valCondominium))
console.log("valMonthIptu (IPTU/mês): R$", fmt(d.valMonthIptu))
console.log("valSumLocationAndCondominium: R$", fmt(d.valSumLocationAndCondominium))
console.log("totalRooms (quartos):", d.totalRooms)
console.log("totalGarages (vagas):", d.totalGarages)
console.log("bairro:", d.namDistrict, "| cidade:", d.namCity, "-", d.namState)
console.log("endereço:", d.fullAddress)
console.log("landing:", d.desUriLandingPage)
console.log("resumo:", d.desResumeCharacteristics)
try {
  const chars = JSON.parse(d.jsonCharacteristics || "[]")
  console.log("\njsonCharacteristics:")
  for (const c of chars) console.log("  ", JSON.stringify(c))
} catch (e) {
  console.log("chars parse err")
}
