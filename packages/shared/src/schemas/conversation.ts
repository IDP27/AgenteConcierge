import { z } from "zod";

export const channelSchema = z.enum(["web", "whatsapp"]);
export type Channel = z.infer<typeof channelSchema>;

export const conversationStatusSchema = z.enum(["open", "needs_human", "closed"]);
export type ConversationStatus = z.infer<typeof conversationStatusSchema>;

export const messageRoleSchema = z.enum(["guest", "agent", "human_agent", "system"]);
export type MessageRole = z.infer<typeof messageRoleSchema>;

export const messageSchema = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  role: messageRoleSchema,
  content: z.string(),
  createdAt: z.coerce.date(),
});
export type Message = z.infer<typeof messageSchema>;

export const conversationSchema = z.object({
  id: z.string().uuid(),
  resortId: z.string().uuid(),
  guestId: z.string().uuid(),
  channel: channelSchema,
  status: conversationStatusSchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Conversation = z.infer<typeof conversationSchema>;

// ---- Requests ----

export const createConversationBodySchema = z.object({
  channel: channelSchema.default("web"),
});
export type CreateConversationBody = z.infer<typeof createConversationBodySchema>;

export const sendMessageBodySchema = z.object({
  content: z.string().min(1).max(4000),
});
export type SendMessageBody = z.infer<typeof sendMessageBodySchema>;

export const listConversationsQuerySchema = z.object({
  status: conversationStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListConversationsQuery = z.infer<typeof listConversationsQuerySchema>;
