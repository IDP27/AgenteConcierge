import type { Guest, Reservation, ReservationStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { ConflictError, NotFoundError } from "../lib/errors.js";

/**
 * Máquina de estados da reserva: transições LEGAIS explícitas. Fora deste
 * mapa, a transição é rejeitada — o ciclo de vida deixa de ser uma via de
 * mão única que travava em checked_in_digital.
 *
 *   confirmed ─┬─▶ checked_in_digital ─▶ checked_in ─▶ checked_out
 *              └──────────────────────▶ checked_in              (chegada sem check-in digital)
 *   (confirmed | checked_in_digital) ─▶ cancelled
 */
const LEGAL_TRANSITIONS: Record<ReservationStatus, ReservationStatus[]> = {
  confirmed: ["checked_in_digital", "checked_in", "cancelled"],
  checked_in_digital: ["checked_in", "cancelled"],
  checked_in: ["checked_out"],
  checked_out: [],
  cancelled: [],
};

export function canTransition(from: ReservationStatus, to: ReservationStatus): boolean {
  return LEGAL_TRANSITIONS[from].includes(to);
}

export const reservationRepo = {
  /** Autenticação do hóspede: magic token → reserva + hóspede (ADR-011). */
  async findByMagicToken(token: string): Promise<(Reservation & { guest: Guest }) | null> {
    return prisma.reservation.findUnique({
      where: { magicToken: token },
      include: { guest: true },
    });
  },

  async findById(id: string, resortId: string): Promise<Reservation | null> {
    return prisma.reservation.findFirst({ where: { id, resortId } });
  },

  /** Reservas do resort para o painel, com nome do hóspede (chegada em breve no topo). */
  async listForResort(resortId: string) {
    return prisma.reservation.findMany({
      where: { resortId },
      orderBy: { checkIn: "asc" },
      include: { guest: { select: { name: true } } },
    });
  },

  async setStatus(id: string, status: ReservationStatus): Promise<Reservation> {
    return prisma.reservation.update({ where: { id }, data: { status } });
  },

  /**
   * Transição guardada: valida a legalidade antes de aplicar. Idempotente
   * (repetir o estado atual não é erro). Usada por tools (via ctx.repos) e
   * pelas ações do painel — um único ponto de verdade para o ciclo de vida.
   */
  async transition(
    id: string,
    resortId: string,
    to: ReservationStatus,
    /** Atribuição de quarto na chegada (habilita a chave digital). */
    roomNumber?: string,
  ): Promise<Reservation> {
    const reservation = await prisma.reservation.findFirst({ where: { id, resortId } });
    if (!reservation) throw new NotFoundError("Reserva");
    if (reservation.status === to && !roomNumber) return reservation;
    if (reservation.status !== to && !canTransition(reservation.status, to)) {
      throw new ConflictError(`Transição inválida: ${reservation.status} → ${to}.`);
    }
    return prisma.reservation.update({
      where: { id },
      data: { status: to, ...(roomNumber ? { roomNumber } : {}) },
    });
  },
};

export type ReservationRepo = typeof reservationRepo;
