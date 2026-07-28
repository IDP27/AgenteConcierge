import type { FastifyInstance } from "fastify";
import { whatsappConfig } from "../config/env.js";
import { WhatsAppClient } from "../channels/whatsapp/client.js";
import { processInbound } from "../channels/whatsapp/inbound.js";
import { verifyWebhookSignature } from "../channels/whatsapp/identity.js";

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

