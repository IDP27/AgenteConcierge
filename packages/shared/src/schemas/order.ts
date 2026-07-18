import { z } from "zod";

export const orderStatusSchema = z.enum(["pending_approval", "confirmed", "delivered", "cancelled"]);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

/** Shape do JSONB `orders.items`. */
export const orderItemSchema = z.object({
  offerId: z.string().uuid().nullable(),
  title: z.string(),
  qty: z.number().int().positive(),
  priceCents: z.number().int().nonnegative(),
});
export type OrderItem = z.infer<typeof orderItemSchema>;

export const orderSchema = z.object({
  id: z.string().uuid(),
  resortId: z.string().uuid(),
  reservationId: z.string().uuid(),
  items: z.array(orderItemSchema),
  totalCents: z.number().int().nonnegative(),
  status: orderStatusSchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Order = z.infer<typeof orderSchema>;

export const listOrdersQuerySchema = z.object({
  status: orderStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;
