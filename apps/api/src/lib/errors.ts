/**
 * Erros de aplicação com mapeamento consistente para HTTP (ver plugins/error-handler.ts).
 * Services e tools lançam AppError; a borda HTTP traduz. O agent-core nunca
 * deixa um erro de tool derrubar a conversa (vira tool_result com is_error).
 */
export class AppError extends Error {
  constructor(
    message: string,
    readonly statusCode: number = 500,
    readonly code: string = "internal_error",
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} não encontrado(a)`, 404, "not_found");
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Não autorizado") {
    super(message, 401, "unauthorized");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Acesso negado") {
    super(message, 403, "forbidden");
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, "conflict");
  }
}
