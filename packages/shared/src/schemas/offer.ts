import { z } from "zod";

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
