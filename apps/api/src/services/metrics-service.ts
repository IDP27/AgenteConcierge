import type { Metrics } from "@concierge/shared";
import { prisma } from "../lib/prisma.js";

export const metricsService = {
  /**
   * Métricas do painel (GET /api/admin/metrics).
   * Conversão de upsell: conversas em que suggest_offers rodou e, depois dela,
   * um create_order foi executado com sucesso (trilha agent_actions).
   */
  async compute(): Promise<Metrics> {
    const [
      conversationsTotal,
      conversationsNeedsHuman,
      conversationsClosed,
      closedThatNeededHuman,
      ordersCreated,
      ordersPendingApproval,
      serviceOrdersOpen,
      serviceOrdersResolved,
      suggestActions,
      orderActions,
    ] = await Promise.all([
      prisma.conversation.count(),
      prisma.conversation.count({ where: { status: "needs_human" } }),
      prisma.conversation.count({ where: { status: "closed" } }),
      prisma.conversation.count({
        where: {
          status: "closed",
          agentActions: { some: { toolName: { in: ["escalate_to_human", "handoff_heuristic"] } } },
        },
      }),
      prisma.order.count(),
      prisma.order.count({ where: { status: "pending_approval" } }),
      prisma.serviceOrder.count({ where: { status: { in: ["open", "in_progress"] } } }),
      prisma.serviceOrder.count({ where: { status: "resolved" } }),
      prisma.agentAction.findMany({
        where: { toolName: "suggest_offers", status: "success" },
        select: { conversationId: true, createdAt: true },
      }),
      prisma.agentAction.findMany({
        where: { toolName: "create_order", status: "success" },
        select: { conversationId: true, createdAt: true },
      }),
    ]);

    const firstSuggestionByConversation = new Map<string, Date>();
    for (const action of suggestActions) {
      const existing = firstSuggestionByConversation.get(action.conversationId);
      if (!existing || action.createdAt < existing) {
        firstSuggestionByConversation.set(action.conversationId, action.createdAt);
      }
    }
    const convertedConversations = new Set<string>();
    for (const order of orderActions) {
      const suggestedAt = firstSuggestionByConversation.get(order.conversationId);
      if (suggestedAt && order.createdAt > suggestedAt) {
        convertedConversations.add(order.conversationId);
      }
    }

    return {
      resolutionWithoutHumanRate:
        conversationsClosed > 0 ? (conversationsClosed - closedThatNeededHuman) / conversationsClosed : null,
      conversationsTotal,
      conversationsNeedsHuman,
      ordersCreated,
      ordersPendingApproval,
      serviceOrdersOpen,
      serviceOrdersResolved,
      upsellSuggested: suggestActions.length,
      upsellConverted: convertedConversations.size,
    };
  },
};
