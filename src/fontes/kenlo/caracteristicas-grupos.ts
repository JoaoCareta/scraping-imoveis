import { Result } from "../../shared/result"
import { ErroValidacao } from "../../domain/imovel/erro-validacao"
import { Caracteristica } from "../../domain/imovel/caracteristica"

/** Slug estável a partir do rótulo: sem acento, minúsculo, hifenizado. */
export function slugKenlo(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "") // remove diacríticos (combining marks)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

// Mapa curado (slug do rótulo Kenlo → grupo). O GRUPO precisa usar o MESMO
// vocabulário de slugs que o system prompt do bot manda no parâmetro
// comodidades da busca (sacada, academia, espaco-gourmet, ...) — a busca por
// containment só casa se o grupo cair nesse vocabulário. Ampliar conforme
// aparecem novos rótulos no caires.
const GRUPOS: Record<string, string> = {
  piscina: "piscina",
  churrasqueira: "churrasqueira",
  sacada: "sacada",
  varanda: "sacada",
  "varanda-gourmet": "sacada",
  elevador: "elevador",
  portaria: "portaria",
  "portaria-24-horas": "portaria",
  academia: "academia",
  "salao-de-festas": "salao-de-festas",
  "espaco-gourmet": "espaco-gourmet",
  "salao-gourmet": "espaco-gourmet",
  "area-de-lazer": "area-de-lazer",
  "ar-condicionado": "ar-condicionado",
  playground: "playground",
  quadra: "quadra-poliesportiva",
  "quadra-poliesportiva": "quadra-poliesportiva",
  sauna: "sauna",
  "pet-place": "pet-place",
  "condominio-fechado": "condominio-fechado",
  "area-de-servico": "area-de-servico",
}

export function grupoDeChave(chave: string): string | undefined {
  return GRUPOS[chave]
}

/** Rótulo de comodidade do Kenlo → Caracteristica BOOLEANA presente. */
export function caracteristicaBooleanaDeRotulo(rotulo: string): Result<Caracteristica, ErroValidacao> {
  const chave = slugKenlo(rotulo)
  return Caracteristica.criar({
    idtFonte: 0, // Kenlo não tem idt; 0 = sem idt de origem
    chave,
    rotulo: (rotulo ?? "").trim(),
    grupo: grupoDeChave(chave),
    tipo: "BOOLEANA",
    valorBool: true,
  })
}
