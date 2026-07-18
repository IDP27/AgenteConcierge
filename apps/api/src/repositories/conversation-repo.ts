import type {
  Channel,
  Conversation,
  ConversationStatus,
  Message,
  MessageRole,
} from "@prisma/client";
import { prisma } from "../lib/prisma.js";

export const conversationRepo = {
  async findOrCreateOpen(
    resortId: string,
    guestId: string,
    channel: Channel,
  ): Promise<Conversation> {
    const existing = await prisma.conversation.findFirst({
      where: { resortId, guestId, channel, status: { in: ["open", "needs_human"] } },
      orderBy: { createdAt: "desc" },
    });
    if (existing) return existing;
    return prisma.conversation.create({ data: { resortId, guestId, channel } });
  },

  async findForGuest(id: string, guestId: string): Promise<Conversation | null> {
    return prisma.conversation.findFirst({ where: { id, guestId } });
  },

  async setStatus(id: string, status: ConversationStatus): Promise<void> {
    await prisma.conversation.update({ where: { id }, data: { status } });
  },

  async addMessage(conversationId: string, role: MessageRole, content: string): Promise<Message> {
    const [message] = await prisma.$transaction([
      prisma.message.create({ data: { conversationId, role, content } }),
      prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } }),
    ]);
    return message;
  },

  async listMessages(conversationId: string, limit = 40): Promise<Message[]> {
    const messages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return messages.reverse();
  },
};

export type ConversationRepo = typeof conversationRepo;
