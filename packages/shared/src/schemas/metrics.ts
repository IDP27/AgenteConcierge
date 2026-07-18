import { z } from "zod";

/** Payload de GET /api/admin/metrics. */
export const metricsSchema = z.object({
  /** Conversas fechadas sem virar needs_human / total de conversas fechadas. */
  resolutionWithoutHumanRate: z.number().min(0).max(1).nullable(),
  conversationsTotal: z.number().int(),
  conversationsNeedsHuman: z.number().int(),
  ordersCreated: z.number().int(),
  ordersPendingApproval: z.number().int(),
  serviceOrdersOpen: z.number().int(),
  serviceOrdersResolved: z.number().int(),
  /** Ofertas proativas sugeridas → pedidos originados de upsell. */
  upsellSuggested: z.number().int(),
  upsellConverted: z.number().int(),
});
export type Metrics = z.infer<typeof metricsSchema>;
