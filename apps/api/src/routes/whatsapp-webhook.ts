import type { FastifyInstance } from "fastify";
import { whatsappConfig } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import { conversationService } from "../services/conversation-service.js";
import { WhatsAppAdapter } from "../channels/whatsapp-adapter.js";
import { WhatsAppClient } from "../channels/whatsapp/client.js";
import { phonesMatch, verifyWebhookSignature } from "../channels/whatsapp/identity.js";
import type { GuestAuth } from "../plugins/guest-auth.js";
import type { InboundImage } from "../agent/memory.js";

/** Shape (parcial) do payload de webhook da Cloud API. */
interface WebhookPayload {
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: Array<{
          from: string;
          type: string;
          text?: { body: string };
          image?: { id: string; mime_type: string; caption?: string };
          interactive?: { button_reply?: { id: string; title: string } };
        }>;
      };
    }>;
  }>;
}

/**
 * Entrada do canal WhatsApp (ADR-006): webhook da Meta → mesmo
 * ConversationService do webchat. Registrado apenas quando as credenciais
 * existem — sem elas, o canal simplesmente não existe na aplicação.
 */
export async function whatsappWebhookRoutes(app: FastifyInstance): Promise<void> {
  const config = whatsappConfig();
  if (!config) {
    app.log.info("Canal WhatsApp desligado (credenciais ausentes no .env)");
    return;
  }
  const client = new WhatsAppClient(config.accessToken, config.phoneNumberId);

  /** Verificação de webhook exigida pela Meta ao cadastrar a URL. */
  app.get("/webhooks/whatsapp", async (request, reply) => {
    const q = request.query as Record<string, string | undefined>;
    if (q["hub.mode"] === "subscribe" && q["hub.verify_token"] === config.verifyToken) {
      return reply.status(200).send(q["hub.challenge"]);
    }
    return reply.status(403).send("verify token inválido");
  });

  // Escopo com body cru (Buffer): a assinatura HMAC é sobre os bytes originais.
  await app.register(async (scope) => {
    scope.addContentTypeParser(
      "application/json",
      { parseAs: "buffer" },
      (_req, body, done) => done(null, body),
    );

    scope.post("/webhooks/whatsapp", async (request, reply) => {
      const rawBody = request.body as Buffer;
      const signature = request.headers["x-hub-signature-256"] as string | undefined;
      if (!verifyWebhookSignature(rawBody, signature, config.appSecret)) {
        return reply.status(401).send({ error: "assinatura inválida" });
      }

      // 200 imediato (exigência da Meta); o processamento segue em background.
      reply.status(200).send({ received: true });

      let payload: WebhookPayload;
      try {
        payload = JSON.parse(rawBody.toString("utf-8")) as WebhookPayload;
      } catch {
        return;
      }

      for (const entry of payload.entry ?? []) {
        for (const change of entry.changes ?? []) {
          for (const message of change.value?.messages ?? []) {
            processInbound(message, client, app.log).catch((err) =>
              app.log.error(err, "falha ao processar mensagem WhatsApp"),
            );
          }
        }
      }
    });
  });
}

type InboundMessage = NonNullable<
  NonNullable<NonNullable<WebhookPayload["entry"]>[number]["changes"]>[number]["value"]
>["messages"] extends Array<infer M> | undefined
  ? M
  : never;

async function processInbound(
  message: InboundMessage,
  client: WhatsAppClient,
  log: { error: (obj: unknown, msg?: string) => void },
): Promise<void> {
  // Conteúdo por tipo: texto, toque em botão de oferta, ou foto (check-in OCR).
  let content: string | null = null;
  let image: InboundImage | undefined;

  if (message.type === "text") {
    content = message.text?.body ?? null;
  } else if (message.type === "interactive" && message.interactive?.button_reply) {
    content = `Quero aceitar a oferta "${message.interactive.button_reply.title}"`;
  } else if (message.type === "image" && message.image) {
    const media = await client.downloadMedia(message.image.id);
    if (media && ["image/jpeg", "image/png", "image/webp"].includes(media.mediaType)) {
      image = { base64: media.base64, mediaType: media.mediaType as InboundImage["mediaType"] };
    }
    content = message.image.caption ?? "Segue a foto do meu documento.";
  }
  if (!content) return;

  const auth = await resolveGuestByPhone(message.from);
  if (!auth) {
    await client.sendText(
      message.from,
      "Olá! Não encontrei uma reserva ativa vinculada a este número. " +
        "Se você tem uma reserva, confirme com a recepção se este é o telefone do cadastro. 🏝️",
    );
    return;
  }

  const conversation = await conversationService.start(auth, "whatsapp");
  const adapter = new WhatsAppAdapter(client, message.from, log);
  await conversationService.handleGuestMessage({
    auth,
    conversationId: conversation.id,
    content,
    image,
    adapter,
    logger: log,
  });
}

/**
 * Identidade no WhatsApp: o telefone É a autenticação (a Meta garante o
 * remetente). Hóspede → reserva ativa mais recente → mesma GuestAuth do
 * magic token. MVP compara em JS; escala = coluna de telefone normalizado.
 */
async function resolveGuestByPhone(from: string): Promise<GuestAuth | null> {
  const guests = await prisma.guest.findMany({
    where: { phone: { not: null }, consentAt: { not: null } }, // LGPD: só com consentimento
    select: { id: true, phone: true, resortId: true },
  });
  const guest = guests.find((g) => g.phone && phonesMatch(g.phone, from));
  if (!guest) return null;

  const reservation = await prisma.reservation.findFirst({
    where: { guestId: guest.id, status: { not: "cancelled" } },
    orderBy: { checkIn: "desc" },
  });
  if (!reservation) return null;

  return { resortId: guest.resortId, guestId: guest.id, reservationId: reservation.id };
}
