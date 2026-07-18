import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../config/env.js";
import { UnauthorizedError } from "../lib/errors.js";

/**
 * Auth do painel no MVP: API key no header x-admin-key (ADR-011).
 * Estruturado para trocar por auth real: rotas dependem só deste preHandler.
 */
export async function adminAuth(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const key = request.headers["x-admin-key"];
  if (typeof key !== "string" || key !== env.ADMIN_API_KEY) {
    throw new UnauthorizedError("API key de admin inválida");
  }
}
