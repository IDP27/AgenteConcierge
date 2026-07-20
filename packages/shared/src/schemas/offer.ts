import { z } from "zod";

/** Tags sugeridas no formulário (atalhos). Resorts podem criar outras livremente. */
export const OFFER_TAGS = [
  "spa",
  "relax",
  "food",
  "dinner",
  "breakfast",
  "romantic",
  "kids",
  "adventure",
  "sports",
  "convenience",
] as const;
export type OfferTag = (typeof OFFER_TAGS)[number];

export const offerSchema = z.object({
  id: z.string().uuid(),
  resortId: z.string().uuid(),
  title: z.string(),
  description: z.string(),
  priceCents: z.number().int().nonnegative(),
  tags: z.array(z.string()),
  active: z.boolean(),
});
export type Offer = z.infer<typeof offerSchema>;

/** Corpo de criação/edição de oferta no painel. */
export const offerInputSchema = z.object({
  title: z.string().min(2).max(120),
  description: z.string().min(2).max(400),
  priceCents: z.number().int().nonnegative(),
  // Tags livres (minúsculas, sem espaço): a lista canônica é só sugestão.
  tags: z.array(z.string().min(1).max(30)).max(8),
  active: z.boolean().default(true),
});
export type OfferInput = z.infer<typeof offerInputSchema>;

/** Oferta + desempenho (quantas vezes sugerida pelo agente e aceita). */
export const offerWithStatsSchema = offerSchema.extend({
  suggestedCount: z.number().int(),
  acceptedCount: z.number().int(),
});
export type OfferWithStats = z.infer<typeof offerWithStatsSchema>;
