import type { Offer, Prisma } from "@prisma/client";
import type { OfferInput } from "@concierge/shared";
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

  // --- Gestão pelo painel (todas as ofertas, ativas ou não) ---

  async listAll(resortId: string): Promise<Offer[]> {
    return prisma.offer.findMany({ where: { resortId }, orderBy: { createdAt: "asc" } });
  },

  async findById(id: string, resortId: string): Promise<Offer | null> {
    return prisma.offer.findFirst({ where: { id, resortId } });
  },

  async create(resortId: string, input: OfferInput): Promise<Offer> {
    return prisma.offer.create({ data: { resortId, ...input } });
  },

  async update(id: string, resortId: string, input: OfferInput): Promise<Offer> {
    // updateMany garante o escopo do tenant no WHERE (multi-tenant seguro).
    await prisma.offer.updateMany({ where: { id, resortId }, data: input as Prisma.OfferUpdateManyMutationInput });
    return prisma.offer.findFirstOrThrow({ where: { id, resortId } });
  },

  async remove(id: string, resortId: string): Promise<void> {
    await prisma.offer.deleteMany({ where: { id, resortId } });
  },
};

export type OfferRepo = typeof offerRepo;
