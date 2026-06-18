export class FonteIndisponivelError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "FonteIndisponivelError"
  }
}

export class FonteTimeoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "FonteTimeoutError"
  }
}
