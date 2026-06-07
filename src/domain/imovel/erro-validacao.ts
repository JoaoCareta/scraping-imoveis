export interface ErroValidacao {
  readonly campo: string
  readonly mensagem: string
}

export const erroValidacao = (campo: string, mensagem: string): ErroValidacao => ({
  campo,
  mensagem,
})
