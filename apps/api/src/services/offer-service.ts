import type { OfferWithStats } from "@concierge/shared";
import { prisma } from "../lib/prisma.js";
import { repos } from "../repositories/index.js";

/**
 * Desempenho por oferta a partir da trilha de auditoria (agent_actions):
 * - sugerida: quantas vezes apareceu no output de um suggest_offers;
 * - aceita: quantas vezes virou item de um create_order (offerId no output).
 * Fonte única de verdade, sem tabela de contadores para manter sincronizada.
 */
export const offerService = {
  async listWithStats(resortId: string): Promise<OfferWithStats[]> {
    const [offers, suggestActions, orderActions] = await Promise.all([
      repos.offers.listAll(resortId),
      prisma.agentAction.findMany({
        where: { toolName: "suggest_offers", status: "success" },
        select: { output: true },
      }),
      prisma.agentAction.findMany({
        where: { toolName: "create_order", status: "success" },
        select: { output: true },
      }),
    ]);

    const suggested = new Map<string, number>();
    for (const action of suggestActions) {
      const out = action.output as { suggestions?: Array<{ id?: string }> } | null;
      for (const s of out?.suggestions ?? []) {
        if (s.id) suggested.set(s.id, (suggested.get(s.id) ?? 0) + 1);
      }
    }

    const accepted = new Map<string, number>();
    for (const action of orderActions) {
      const out = action.output as { items?: Array<{ offerId?: string | null }> } | null;
      for (const item of out?.items ?? []) {
        if (item.offerId) accepted.set(item.offerId, (accepted.get(item.offerId) ?? 0) + 1);
      }
    }

    return offers.map((offer) => ({
      ...offer,
      suggestedCount: suggested.get(offer.id) ?? 0,
      acceptedCount: accepted.get(offer.id) ?? 0,
    }));
  },
};
