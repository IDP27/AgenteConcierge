import type { FastifyInstance } from "fastify";
import { hasZodFastifySchemaValidationErrors } from "fastify-type-provider-zod";
import { AppError } from "../lib/errors.js";

/** Formato único de erro da API: { error: { code, message, details? } }. */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      return reply.status(400).send({
        error: {
          code: "validation_error",
          message: "Dados de entrada inválidos",
          details: error.validation.map((v) => ({
            path: v.instancePath,
            message: v.message,
          })),
        },
      });
    }

    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message },
      });
    }

    request.log.error(error, "erro não tratado");
    return reply.status(500).send({
      error: { code: "internal_error", message: "Erro interno. Tente novamente." },
    });
  });
}
