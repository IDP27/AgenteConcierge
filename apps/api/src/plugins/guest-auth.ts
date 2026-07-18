import type { FastifyReply, FastifyRequest } from "fastify";
import { reservationRepo } from "../repositories/reservation-repo.js";
import { UnauthorizedError } from "../lib/errors.js";

/** Identidade do hóspede autenticado por magic token (ADR-011). */
export interface GuestAuth {
  resortId: string;
  guestId: string;
  reservationId: string;
}

declare module "fastify" {
  interface FastifyRequest {
    guestAuth?: GuestAuth;
  }
}

/**
 * preHandler de autenticação do hóspede: `?token=` ou `Authorization: Bearer`.
 * Trocar por auth real depois = trocar este arquivo; rotas só leem request.guestAuth.
 */
export async function guestAuth(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const query = request.query as Record<string, unknown>;
  const header = request.headers.authorization;
  const token =
    (typeof query?.token === "string" && query.token) ||
    (header?.startsWith("Bearer ") && header.slice(7)) ||
    null;

  if (!token) throw new UnauthorizedError("Token de acesso ausente");

  const reservation = await reservationRepo.findByMagicToken(token);
  if (!reservation) throw new UnauthorizedError("Token de acesso inválido");

  request.guestAuth = {
    resortId: reservation.resortId,
    guestId: reservation.guestId,
    reservationId: reservation.id,
  };
}

/** Uso interno das rotas: auth garantido após o preHandler. */
export function requireGuestAuth(request: FastifyRequest): GuestAuth {
  if (!request.guestAuth) throw new UnauthorizedError();
  return request.guestAuth;
}
