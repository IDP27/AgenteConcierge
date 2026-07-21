import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  listConversationsQuerySchema,
  listOrdersQuerySchema,
  listServiceOrdersQuerySchema,
  offerInputSchema,
} from "@concierge/shared";
import { adminAuth } from "../plugins/admin-auth.js";
import { approvalService } from "../services/approval-service.js";
import { metricsService } from "../services/metrics-service.js";
import { offerService } from "../services/offer-service.js";
import { prisma } from "../lib/prisma.js";
import { repos } from "../repositories/index.js";
import { NotFoundError } from "../lib/errors.js";
import { syncResortKnowledge } from "../knowledge/sync.js";

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
      const conversations = await prisma.conversation.findMany({
        where: status ? { status } : {},
        orderBy: { updatedAt: "desc" },
        take: limit,
        include: {
          guest: { select: { name: true } },
          _count: { select: { messages: true } },
        },
      });
      // needs_human sempre no topo (a ordem do enum no banco não garante isso)
      return conversations.sort(
        (a, b) => Number(b.status === "needs_human") - Number(a.status === "needs_human"),
      );
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

  // --- Resorts (kill switch financeiro) ---

  r.get("/resorts", async () => repos.resorts.listAll());

  /** Liga/desliga o kill switch: suspende toda ação financeira do agente. */
  r.post(
    "/resorts/:id/kill-switch",
    { schema: { params: idParams, body: z.object({ enabled: z.boolean() }) } },
    async (request) => {
      const resort = await repos.resorts.findById(request.params.id);
      if (!resort) throw new NotFoundError("Resort");
      return repos.resorts.setFinancialKillSwitch(request.params.id, request.body.enabled);
    },
  );

  /** Reingere a base de conhecimento e invalida o cache do agente. */
  r.post("/resorts/:id/knowledge/sync", { schema: { params: idParams } }, async (request) => {
    return syncResortKnowledge(request.params.id);
  });

  // --- Ofertas (catálogo do agente) ---

  r.get("/resorts/:id/offers", { schema: { params: idParams } }, async (request) => {
    const resort = await repos.resorts.findById(request.params.id);
    if (!resort) throw new NotFoundError("Resort");
    return offerService.listWithStats(request.params.id);
  });

  r.post(
    "/resorts/:id/offers",
    { schema: { params: idParams, body: offerInputSchema } },
    async (request, reply) => {
      const resort = await repos.resorts.findById(request.params.id);
      if (!resort) throw new NotFoundError("Resort");
      const offer = await repos.offers.create(request.params.id, request.body);
      return reply.status(201).send(offer);
    },
  );

  const offerParams = z.object({ id: z.string().uuid(), offerId: z.string().uuid() });

  r.put(
    "/resorts/:id/offers/:offerId",
    { schema: { params: offerParams, body: offerInputSchema } },
    async (request) => {
      const offer = await repos.offers.findById(request.params.offerId, request.params.id);
      if (!offer) throw new NotFoundError("Oferta");
      return repos.offers.update(request.params.offerId, request.params.id, request.body);
    },
  );

  r.delete("/resorts/:id/offers/:offerId", { schema: { params: offerParams } }, async (request) => {
    const offer = await repos.offers.findById(request.params.offerId, request.params.id);
    if (!offer) throw new NotFoundError("Oferta");
    await repos.offers.remove(request.params.offerId, request.params.id);
    return { deleted: true };
  });

  // --- Reservas (operação do ciclo de vida sem PMS) ---

  r.get("/resorts/:id/reservations", { schema: { params: idParams } }, async (request) => {
    const resort = await repos.resorts.findById(request.params.id);
    if (!resort) throw new NotFoundError("Resort");
    return repos.reservations.listForResort(request.params.id);
  });

  const reservationTransitionParams = z.object({
    id: z.string().uuid(),
    reservationId: z.string().uuid(),
  });
  const transitionBody = z.object({
    to: z.enum(["checked_in", "checked_out", "cancelled"]),
  });

  /** Aplica uma transição de estado da reserva (validada pela máquina de estados). */
  r.post(
    "/resorts/:id/reservations/:reservationId/transition",
    { schema: { params: reservationTransitionParams, body: transitionBody } },
    async (request) => {
      return repos.reservations.transition(
        request.params.reservationId,
        request.params.id,
        request.body.to,
      );
    },
  );

  // --- Métricas ---

  r.get("/metrics", async () => metricsService.compute());
}
