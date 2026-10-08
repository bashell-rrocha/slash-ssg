// Erro de build do SSG: a mensagem já carrega o contexto (rota, URL, param)
export class SsgError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "SsgError";
  }
}
