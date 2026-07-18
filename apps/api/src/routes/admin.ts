import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  listConversationsQuerySchema,
  listOrdersQuerySchema,
  listServiceOrdersQuerySchema,
} from "@concierge/shared";
import { adminAuth } from "../plugins/admin-auth.js";
import { approvalService } from "../services/approval-service.js";
import { metricsService } from "../services/metrics-service.js";
import { prisma } from "../lib/prisma.js";
import { repos } from "../repositories/index.js";
import { NotFoundError } from "../lib/errors.js";

const idParams = z.object({ id: z.string().uuid() });

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();
  r.addHook("preHandler", adminAuth);

  // --- Conversas ---

  r.get(
    "/conversations",
    { schema: { querystring: listConversationsQuerySchema } },
    async (request) => {
      const { status, limit } = request.query;
      return prisma.conversation.findMany({
        where: status ? { status } : {},
        orderBy: [{ status: "asc" }, { updatedAt: "desc" }], // needs_human primeiro (enum order)
        take: limit,
        include: {
          guest: { select: { name: true } },
          _count: { select: { messages: true } },
        },
      });
    },
  );

  /** Detalhe: transcript completo + trilha de ações do agente (auditoria). */
  r.get("/conversations/:id", { schema: { params: idParams } }, async (request) => {
    const conversation = await prisma.conversation.findUnique({
      where: { id: request.params.id },
      include: { guest: { select: { name: true, profile: true } } },
    });
    if (!conversation) throw new NotFoundError("Conversa");
    const [messages, actions] = await Promise.all([
      repos.conversations.listMessages(conversation.id, 200),
      repos.agentActions.listForConversation(conversation.id),
    ]);
    return { conversation, messages, actions };
  });

  /** Devolve a conversa ao agente (open) ou encerra (closed). */
  r.post(
    "/conversations/:id/resolve",
    {
      schema: { params: idParams, body: z.object({ status: z.enum(["open", "closed"]) }) },
    },
    async (request) => {
      const conversation = await prisma.conversation.findUnique({
        where: { id: request.params.id },
      });
      if (!conversation) throw new NotFoundError("Conversa");
      await repos.conversations.setStatus(request.params.id, request.body.status);
      return { id: request.params.id, status: request.body.status };
    },
  );

  // --- Pedidos (fila de aprovação) ---

  r.get("/orders", { schema: { querystring: listOrdersQuerySchema } }, async (request) => {
    return repos.orders.list(request.query);
  });

  r.post("/orders/:id/approve", { schema: { params: idParams } }, async (request) => {
    return approvalService.approveOrder(request.params.id);
  });

  r.post("/orders/:id/cancel", { schema: { params: idParams } }, async (request) => {
    return approvalService.cancelOrder(request.params.id);
  });

  // --- Ordens de serviço ---

  r.get(
    "/service-orders",
    { schema: { querystring: listServiceOrdersQuerySchema } },
    async (request) => {
      return repos.serviceOrders.list(request.query);
    },
  );

  r.post("/service-orders/:id/resolve", { schema: { params: idParams } }, async (request) => {
    return approvalService.resolveServiceOrder(request.params.id);
  });

  // --- Métricas ---

  r.get("/metrics", async () => metricsService.compute());
}
