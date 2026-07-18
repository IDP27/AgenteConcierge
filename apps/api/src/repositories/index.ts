import { resortRepo } from "./resort-repo.js";
import { reservationRepo } from "./reservation-repo.js";
import { conversationRepo } from "./conversation-repo.js";
import { agentActionRepo } from "./agent-action-repo.js";

/**
 * Bag de repositories injetada no ToolContext.
 * Testes unitários substituem por fakes tipados (satisfies Repos).
 * Fase 3 adiciona: offers, orders, serviceOrders, guests.
 */
export const repos = {
  resorts: resortRepo,
  reservations: reservationRepo,
  conversations: conversationRepo,
  agentActions: agentActionRepo,
};

export type Repos = typeof repos;
