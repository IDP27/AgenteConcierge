import type { Offer } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

export const offerRepo = {
  async listActive(resortId: string, tags?: string[]): Promise<Offer[]> {
    return prisma.offer.findMany({
      where: {
        resortId,
        active: true,
        ...(tags && tags.length > 0 ? { tags: { hasSome: tags } } : {}),
      },
      orderBy: { priceCents: "asc" },
    });
  },

  /** Preços SEMPRE saem daqui — nunca do modelo (ADR-009). */
  async findManyByIds(resortId: string, ids: string[]): Promise<Offer[]> {
    return prisma.offer.findMany({ where: { resortId, id: { in: ids }, active: true } });
  },
};

export type OfferRepo = typeof offerRepo;
