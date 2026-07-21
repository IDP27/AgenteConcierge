import type { RoomKey } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

export const roomKeyRepo = {
  async findActive(reservationId: string): Promise<RoomKey | null> {
    return prisma.roomKey.findFirst({
      where: { reservationId, status: "active" },
      orderBy: { issuedAt: "desc" },
    });
  },

  async create(params: {
    resortId: string;
    reservationId: string;
    roomNumber: string;
    code: string;
    provider: string;
    expiresAt: Date;
  }): Promise<RoomKey> {
    return prisma.roomKey.create({ data: params });
  },

  /** Revoga todas as chaves ativas da reserva (check-out / troca de quarto). */
  async revokeActive(reservationId: string, at: Date): Promise<void> {
    await prisma.roomKey.updateMany({
      where: { reservationId, status: "active" },
      data: { status: "revoked", revokedAt: at },
    });
  },
};

export type RoomKeyRepo = typeof roomKeyRepo;
