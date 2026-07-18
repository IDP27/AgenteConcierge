import { resortRepo } from "./resort-repo.js";
import { reservationRepo } from "./reservation-repo.js";
import { conversationRepo } from "./conversation-repo.js";
import { agentActionRepo } from "./agent-action-repo.js";
import { offerRepo } from "./offer-repo.js";
import { orderRepo } from "./order-repo.js";
import { serviceOrderRepo } from "./service-order-repo.js";
import { guestRepo } from "./guest-repo.js";

/**
 * Bag de repositories injetada no ToolContext.
 * Testes unitários substituem por fakes tipados.
 */
export const repos = {
  resorts: resortRepo,
  reservations: reservationRepo,
  conversations: conversationRepo,
  agentActions: agentActionRepo,
  offers: offerRepo,
  orders: orderRepo,
  serviceOrders: serviceOrderRepo,
  guests: guestRepo,
};

export type Repos = typeof repos;
