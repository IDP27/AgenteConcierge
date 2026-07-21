import { ToolRegistry } from "./registry.js";
import { escalateToHuman } from "./escalate-to-human/index.js";
import { getReservation } from "./get-reservation/index.js";
import { updateCheckinForm } from "./early-checkin/update-form.js";
import { completeEarlyCheckin } from "./early-checkin/complete.js";
import { listOffers } from "./list-offers/index.js";
import { createOrder } from "./create-order/index.js";
import { getRoomBill } from "./get-room-bill/index.js";
import { requestCheckout } from "./request-checkout/index.js";
import { createServiceOrder } from "./create-service-order/index.js";
import { suggestOffers } from "./suggest-offers/index.js";
import { askReviewRating } from "./ask-review-rating/index.js";
import { requestReview } from "./request-review/index.js";
import { registerRebookingInterest } from "./register-rebooking-interest/index.js";
import { muteOffers } from "./mute-offers/index.js";
import { getDailySchedule } from "./get-daily-schedule/index.js";

/**
 * Registry padrão do agente. Registrar tool nova = 1 import + 1 linha aqui;
 * o core (agent.ts) não muda (ADR-007).
 */
export function buildDefaultRegistry(): ToolRegistry {
  return new ToolRegistry()
    .register(getReservation)
    .register(getDailySchedule)
    .register(updateCheckinForm)
    .register(completeEarlyCheckin)
    .register(listOffers)
    .register(createOrder)
    .register(getRoomBill)
    .register(requestCheckout)
    .register(createServiceOrder)
    .register(suggestOffers)
    .register(muteOffers)
    .register(askReviewRating)
    .register(requestReview)
    .register(registerRebookingInterest)
    .register(escalateToHuman);
}
