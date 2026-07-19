import type { Companion } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

export interface CompanionInput {
  name: string;
  birthDate?: Date | null;
  documentType?: string | null;
  documentNumber?: string | null;
  isChild?: boolean;
}

export const companionRepo = {
  async listForReservation(reservationId: string): Promise<Companion[]> {
    return prisma.companion.findMany({
      where: { reservationId },
      orderBy: { createdAt: "asc" },
    });
  },

  /** Upsert por nome dentro da reserva: repetir o nome atualiza em vez de duplicar. */
  async upsertByName(
    resortId: string,
    reservationId: string,
    input: CompanionInput,
  ): Promise<Companion> {
    const existing = await prisma.companion.findFirst({
      where: { reservationId, name: { equals: input.name, mode: "insensitive" } },
    });
    const data = {
      birthDate: input.birthDate ?? undefined,
      documentType: input.documentType ?? undefined,
      documentNumber: input.documentNumber ?? undefined,
      isChild: input.isChild ?? undefined,
    };
    if (existing) {
      return prisma.companion.update({ where: { id: existing.id }, data });
    }
    return prisma.companion.create({
      data: { resortId, reservationId, name: input.name, ...data, isChild: input.isChild ?? false },
    });
  },
};

export type CompanionRepo = typeof companionRepo;
