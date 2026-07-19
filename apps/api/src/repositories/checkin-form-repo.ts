import type { CheckinForm, Prisma } from "@prisma/client";
import type { CheckinFormData } from "@concierge/shared";
import { prisma } from "../lib/prisma.js";

export const checkinFormRepo = {
  async findByReservation(reservationId: string): Promise<CheckinForm | null> {
    return prisma.checkinForm.findUnique({ where: { reservationId } });
  },

  /** Persistência incremental: merge raso do patch (address é mesclado à parte). */
  async upsertMerge(
    resortId: string,
    reservationId: string,
    patch: CheckinFormData,
  ): Promise<CheckinForm> {
    const existing = await prisma.checkinForm.findUnique({ where: { reservationId } });
    const current = (existing?.data ?? {}) as CheckinFormData;
    const merged: CheckinFormData = {
      ...current,
      ...patch,
      ...(patch.address || current.address
        ? { address: { ...current.address, ...patch.address } }
        : {}),
    };
    return prisma.checkinForm.upsert({
      where: { reservationId },
      create: {
        resortId,
        reservationId,
        data: merged as Prisma.InputJsonValue,
      },
      update: { data: merged as Prisma.InputJsonValue },
    });
  },

  async complete(reservationId: string, at: Date): Promise<CheckinForm> {
    return prisma.checkinForm.update({
      where: { reservationId },
      data: { status: "completed", completedAt: at },
    });
  },
};

export type CheckinFormRepo = typeof checkinFormRepo;
