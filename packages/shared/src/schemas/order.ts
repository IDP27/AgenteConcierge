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

// --- Extrato da conta do quarto (folio) ---

export interface RoomBillLine {
  title: string;
  qty: number;
  totalCents: number;
}
export interface RoomBill {
  lines: RoomBillLine[];
  /** Lançado (pedidos confirmados/entregues) — o que o hóspede paga. */
  chargedCents: number;
  /** Aguardando confirmação da equipe — ainda não conta no total. */
  pendingCents: number;
  hasPending: boolean;
}

/**
 * Consolida os pedidos de uma reserva num extrato. Cortesias (preço 0)
 * entram como linha "cortesia"; cancelados são ignorados; pendentes de
 * aprovação ficam à parte (não somam no total cobrado).
 */
export function computeRoomBill(
  orders: Array<Pick<Order, "items" | "totalCents" | "status">>,
): RoomBill {
  const lines: RoomBillLine[] = [];
  let chargedCents = 0;
  let pendingCents = 0;

  for (const order of orders) {
    if (order.status === "cancelled") continue;
    if (order.status === "pending_approval") {
      pendingCents += order.totalCents;
      continue;
    }
    chargedCents += order.totalCents;
    for (const item of order.items) {
      lines.push({ title: item.title, qty: item.qty, totalCents: item.priceCents * item.qty });
    }
  }

  return { lines, chargedCents, pendingCents, hasPending: pendingCents > 0 };
}
