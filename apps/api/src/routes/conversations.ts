import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { createConversationBodySchema, sendMessageBodySchema } from "@concierge/shared";
import { guestAuth, requireGuestAuth } from "../plugins/guest-auth.js";
import { conversationService } from "../services/conversation-service.js";
import { WebChatAdapter } from "../channels/web-chat-adapter.js";

const paramsSchema = z.object({ id: z.string().uuid() });

export async function conversationRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.post(
    "/conversations",
    { preHandler: [guestAuth], schema: { body: createConversationBodySchema } },
    async (request, reply) => {
      const auth = requireGuestAuth(request);
      const conversation = await conversationService.start(auth, request.body.channel);
      return reply.status(201).send(conversation);
    },
  );

  r.get(
    "/conversations/:id",
    { preHandler: [guestAuth], schema: { params: paramsSchema } },
    async (request) => {
      const auth = requireGuestAuth(request);
      return conversationService.getWithMessages(auth, request.params.id);
    },
  );

  /**
   * Mensagem do hóspede → resposta do agente em SSE (ADR-005).
   * hijack(): a resposta é o próprio stream; o WebChatAdapter cuida dos headers.
   */
  r.post(
    "/conversations/:id/messages",
    {
      preHandler: [guestAuth],
      schema: { params: paramsSchema, body: sendMessageBodySchema },
    },
    async (request, reply) => {
      const auth = requireGuestAuth(request);
      reply.hijack();
      const adapter = new WebChatAdapter(reply.raw);
      await conversationService.handleGuestMessage({
        auth,
        conversationId: request.params.id,
        content: request.body.content,
        adapter,
        logger: request.log,
      });
    },
  );
}
