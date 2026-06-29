import { FonteDeImoveis } from "../fontes/fonte-de-imoveis"
import { imovelParaRecurso, RecursoImovel } from "../domain/leitura/recurso-imovel"
import { Coleta, FiltrosImovel, ImovelRepository } from "./imovel-repository"
import { ehSemPreferencia } from "./sem-preferencia"
import { limparTermoCondominio, textoCondominio, casaCondominio } from "../shared/condominio-busca"

export interface FonteImovelRepositoryDeps {
  fonte: FonteDeImoveis
  agora?: () => Date
}

export class FonteImovelRepository implements ImovelRepository {
  private readonly fonte: FonteDeImoveis
  private readonly agora: () => Date

  constructor(deps: FonteImovelRepositoryDeps) {
    this.fonte = deps.fonte
    this.agora = deps.agora ?? (() => new Date())
  }

  async buscar(filtros: FiltrosImovel): Promise<Coleta> {
    const { recursos, rejeitados } = await this.coletar()
    const filtrados = recursos.filter((r) => this.combina(r, filtros))
    return this.montar(filtrados, rejeitados, recursos)
  }

  async buscarPorRef(ref: string): Promise<Coleta> {
    const { recursos, rejeitados } = await this.coletar()
    const filtrados = recursos.filter((r) => r.ref === ref)
    return this.montar(filtrados, rejeitados, recursos)
  }

  private async coletar(): Promise<{ recursos: RecursoImovel[]; rejeitados: number }> {
    const r = await this.fonte.buscarTodos()
    return { recursos: r.imoveis.map(imovelParaRecurso), rejeitados: r.rejeitados.length }
  }

  private montar(filtrados: RecursoImovel[], rejeitados: number, todos: RecursoImovel[]): Coleta {
    const extraidoEm = todos[0]?.estado.extraidoEm ?? this.agora().toISOString()
    return { imoveis: filtrados, total: filtrados.length, rejeitados, extraidoEm }
  }

  private combina(r: RecursoImovel, f: FiltrosImovel): boolean {
    const querAtivo = f.ativo ?? true
    const igualTexto = (a?: string, b?: string) =>
      b == null || ehSemPreferencia(b) || (a ?? "").toLowerCase() === b.toLowerCase()

    const passaAtivo = r.estado.ativo === querAtivo
    const passaFinalidade = f.finalidade == null || r.finalidade === f.finalidade
    const passaPrecoMin = f.precoMin == null || (r.preco != null && r.preco.valor >= f.precoMin)
    const passaPrecoMax = f.precoMax == null || (r.preco != null && r.preco.valor <= f.precoMax)
    const passaQuartos = f.quartos == null || r.caracteristicas.quartos === f.quartos
    const passaCidade = igualTexto(r.localizacao.cidade, f.cidade)
    const passaBairro = igualTexto(r.localizacao.bairro, f.bairro)
    const passaTipo = igualTexto(r.caracteristicas.tipoImovel, f.tipoImovel)

    // comodidades: exige que TODAS as pedidas (slug, ex.: "piscina") estejam presentes.
    // Coringas/vazios são ignorados (sem filtro), igual aos demais campos.
    const querComodidades = (f.comodidades ?? [])
      .map((c) => (c ?? "").trim().toLowerCase())
      .filter((c) => c.length > 0 && !ehSemPreferencia(c))
    const passaComodidades =
      querComodidades.length === 0 || querComodidades.every((c) => r.caracteristicas.comodidades.includes(c))

    // condomínio: casa o termo (palavra inteira) no texto combinado (nome + título +
    // descrição + url). Coringas/vazios = sem filtro.
    const termoCond = ehSemPreferencia(f.condominio ?? "") ? null : limparTermoCondominio(f.condominio)
    const passaCondominio =
      termoCond == null ||
      casaCondominio(
        textoCondominio({
          condominio: r.localizacao.condominio,
          titulo: r.caracteristicas.titulo,
          descricao: r.caracteristicas.descricao,
          urlSite: r.urlSite,
        }),
        termoCond,
      )

    return (
      passaAtivo &&
      passaFinalidade &&
      passaPrecoMin &&
      passaPrecoMax &&
      passaQuartos &&
      passaCidade &&
      passaBairro &&
      passaTipo &&
      passaComodidades &&
      passaCondominio
    )
  }
}
