import type { Guest, Reservation } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

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
};

export type ReservationRepo = typeof reservationRepo;
