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

// Mapa curado (slug → grupo). Pequeno e incremental; começa pelos conceitos
// mais pedidos. Ampliar conforme aparecem novos rótulos no caires.
const GRUPOS: Record<string, string> = {
  piscina: "piscina",
  churrasqueira: "churrasqueira",
  sacada: "sacada-varanda",
  varanda: "sacada-varanda",
  "varanda-gourmet": "sacada-varanda",
  elevador: "elevador",
  "portaria-24-horas": "portaria",
  academia: "lazer",
  "salao-de-festas": "lazer",
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
