import type { Guest, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

export const guestRepo = {
  async findById(id: string): Promise<Guest | null> {
    return prisma.guest.findUnique({ where: { id } });
  },

  async mergeProfile(id: string, patch: Record<string, unknown>): Promise<void> {
    const guest = await prisma.guest.findUnique({ where: { id }, select: { profile: true } });
    const current = (guest?.profile ?? {}) as Record<string, unknown>;
    await prisma.guest.update({
      where: { id },
      data: { profile: { ...current, ...patch } as Prisma.InputJsonValue },
    });
  },

  async markProactiveOffer(id: string, at: Date): Promise<void> {
    await prisma.guest.update({ where: { id }, data: { lastProactiveOfferAt: at } });
  },

  /**
   * LGPD (ADR-012): anonimização em transação única. Remove PII e conteúdo
   * de mensagens/auditoria, preservando registros agregados para métricas.
   */
  async anonymize(id: string): Promise<void> {
    const conversations = await prisma.conversation.findMany({
      where: { guestId: id },
      select: { id: true },
    });
    const conversationIds = conversations.map((c) => c.id);

    await prisma.$transaction([
      prisma.guest.update({
        where: { id },
        data: {
          name: "Hóspede removido (LGPD)",
          phone: null,
          email: null,
          consentAt: null,
          profile: {},
          lastProactiveOfferAt: null,
        },
      }),
      prisma.message.updateMany({
        where: { conversationId: { in: conversationIds } },
        data: { content: "[conteúdo removido a pedido do titular — LGPD]" },
      }),
      prisma.agentAction.updateMany({
        where: { conversationId: { in: conversationIds } },
        data: { input: { redacted: true }, output: { redacted: true } },
      }),
    ]);
  },
};

export type GuestRepo = typeof guestRepo;
