import type { AgentActionStatus, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

export interface AgentActionEntry {
  conversationId: string;
  toolName: string;
  input: unknown;
  output: unknown;
  status: AgentActionStatus;
}

export const agentActionRepo = {
  /** Trilha de auditoria: toda ação do agente é registrada (inclusive bloqueios). */
  async record(entry: AgentActionEntry): Promise<void> {
    await prisma.agentAction.create({
      data: {
        conversationId: entry.conversationId,
        toolName: entry.toolName,
        input: (entry.input ?? {}) as Prisma.InputJsonValue,
        output: (entry.output ?? {}) as Prisma.InputJsonValue,
        status: entry.status,
      },
    });
  },

  async listForConversation(conversationId: string) {
    return prisma.agentAction.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
    });
  },
};

export type AgentActionRepo = typeof agentActionRepo;
