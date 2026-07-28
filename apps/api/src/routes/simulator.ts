import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { prisma } from "../lib/prisma.js";
import { repos } from "../repositories/index.js";
import { SimulatorWhatsAppClient } from "../channels/whatsapp/simulator-client.js";
import { processInbound, resolveGuestByPhone } from "../channels/whatsapp/inbound.js";

const sendBodySchema = z.object({
  /** Telefone do hóspede (o simulador o trata como o remetente do WhatsApp). */
  from: z.string().min(8),
  text: z.string().min(1).max(4000).optional(),
  /** Toque em botão de oferta: reproduz o interactive.button_reply da Cloud API. */
  button: z.object({ id: z.string(), title: z.string() }).optional(),
  /** Foto anexada (base64 puro, sem data: URI) — exercita o caminho multimodal. */
  image: z
    .object({
      base64: z.string(),
      mediaType: z.enum(["image/jpeg", "image/png", "image/webp"]),
      caption: z.string().max(500).optional(),
    })
    .optional(),
});

/**
 * Simulador do canal WhatsApp — ferramenta de teste, registrada apenas onde
 * simulatorEnabled() permite (nunca em produção por padrão).
 *
 * NÃO é um agente paralelo: a mensagem percorre o MESMO processInbound do
 * webhook real (parsing por tipo, identificação por telefone, agent-core,
 * WhatsAppAdapter). Só o transporte final muda — em vez de ir à Meta, o
 * conteúdo é capturado e devolvido, já com os cortes da Cloud API aplicados.
 * Assim dá para ver o que o hóspede receberia sem depender de entrega real.
 */
export async function simulatorRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  /** Hóspedes "discáveis": quem tem telefone cadastrado. */
  r.get("/simulator/guests", async () => {
    const guests = await prisma.guest.findMany({
      where: { phone: { not: null } },
      select: {
        id: true,
        name: true,
        phone: true,
        consentAt: true,
        reservations: {
          orderBy: { checkIn: "desc" },
          take: 1,
          select: { status: true, roomNumber: true },
        },
      },
      orderBy: { name: "asc" },
    });

    return guests.map((g) => {
      const reservation = g.reservations[0];
      return {
        name: g.name,
        phone: g.phone as string,
        roomNumber: reservation?.roomNumber ?? null,
        reservationStatus: reservation?.status ?? null,
        // Sem consentimento o agente não responde (LGPD) — a UI avisa antes.
        reachable: Boolean(g.consentAt) && Boolean(reservation) && reservation?.status !== "cancelled",
      };
    });
  });

  /** Envia uma mensagem como se fosse o hóspede e devolve o que sairia no aparelho. */
  r.post("/simulator/whatsapp/send", { schema: { body: sendBodySchema } }, async (request, reply) => {
    const { from, text, button, image } = request.body;
    if (!text && !button && !image) {
      return reply.status(400).send({ error: "informe text, button ou image" });
    }

    const client = new SimulatorWhatsAppClient(
      image ? { base64: image.base64, mediaType: image.mediaType } : undefined,
    );

    const message = button
      ? { from, type: "interactive", interactive: { button_reply: button } }
      : image
        ? { from, type: "image", image: { id: "sim-media", caption: image.caption ?? text } }
        : { from, type: "text", text: { body: text as string } };

    const result = await processInbound(message, client, app.log);
    return { ...result, messages: client.sent };
  });

  /**
   * Fecha a conversa aberta do hóspede: o próximo envio começa do zero, com o
   * agente sem memória do que veio antes — para rodar um cenário limpo.
   */
  r.post(
    "/simulator/whatsapp/reset",
    { schema: { body: z.object({ from: z.string().min(8) }) } },
    async (request) => {
      const auth = await resolveGuestByPhone(request.body.from);
      if (!auth) return { reset: false, reason: "hóspede não encontrado para este telefone" };
      const conversation = await repos.conversations.findOrCreateOpen(
        auth.resortId,
        auth.guestId,
        "whatsapp",
      );
      await repos.conversations.setStatus(conversation.id, "closed");
      return { reset: true };
    },
  );
}
