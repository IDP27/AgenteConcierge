import { z } from "zod";

export const serviceOrderCategorySchema = z.enum([
  "maintenance",
  "housekeeping",
  "noise",
  "amenities",
  "other",
]);
export type ServiceOrderCategory = z.infer<typeof serviceOrderCategorySchema>;

export const prioritySchema = z.enum(["low", "medium", "high", "urgent"]);
export type Priority = z.infer<typeof prioritySchema>;

export const serviceOrderStatusSchema = z.enum(["open", "in_progress", "resolved", "cancelled"]);
export type ServiceOrderStatus = z.infer<typeof serviceOrderStatusSchema>;

export const serviceOrderSchema = z.object({
  id: z.string().uuid(),
  resortId: z.string().uuid(),
  reservationId: z.string().uuid(),
  category: serviceOrderCategorySchema,
  description: z.string(),
  priority: prioritySchema,
  status: serviceOrderStatusSchema,
  slaDueAt: z.coerce.date(),
  resolvedAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
});
export type ServiceOrder = z.infer<typeof serviceOrderSchema>;

export const listServiceOrdersQuerySchema = z.object({
  status: serviceOrderStatusSchema.optional(),
  priority: prioritySchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListServiceOrdersQuery = z.infer<typeof listServiceOrdersQuerySchema>;
