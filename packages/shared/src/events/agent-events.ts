import { z } from "zod";

/**
 * Protocolo de streaming do agente (SSE no WebChat; buffering no WhatsApp futuro).
 * O agent-core emite estes eventos; o ChannelAdapter traduz para o canal.
 */

export const agentEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("message_start"),
    conversationId: z.string().uuid(),
  }),
  z.object({
    type: z.literal("text_delta"),
    text: z.string(),
  }),
  z.object({
    type: z.literal("tool_started"),
    toolName: z.string(),
  }),
  z.object({
    type: z.literal("card"),
    kind: z.enum(["offer", "order", "service_order", "review_prompt", "review_link"]),
    data: z.unknown(),
  }),
  z.object({
    type: z.literal("handoff"),
    reason: z.string(),
  }),
  z.object({
    type: z.literal("message_end"),
    messageId: z.string().uuid(),
  }),
  z.object({
    type: z.literal("error"),
    code: z.string(),
    message: z.string(),
  }),
]);

export type AgentEvent = z.infer<typeof agentEventSchema>;
export type AgentEventType = AgentEvent["type"];

/** Tipos de card que um canal sabe renderizar (fonte da verdade do protocolo). */
export type AgentCardKind = Extract<AgentEvent, { type: "card" }>["kind"];
