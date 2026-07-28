import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { registerErrorHandler } from "./plugins/error-handler.js";
import { healthRoutes } from "./routes/health.js";
import { conversationRoutes } from "./routes/conversations.js";
import { adminRoutes } from "./routes/admin.js";
import { guestRoutes } from "./routes/guests.js";
import { whatsappWebhookRoutes } from "./routes/whatsapp-webhook.js";
import { simulatorRoutes } from "./routes/simulator.js";
import { simulatorEnabled } from "./config/env.js";

export type App = FastifyInstance;

/** Monta a aplicação Fastify (separado do server.ts para uso em testes). */
export async function buildApp(): Promise<App> {
  const app = Fastify({
    logger: {
      level: process.env.NODE_ENV === "test" ? "silent" : "info",
    },
    // Foto de documento (OCR do check-in) chega como base64 no JSON:
    // ~5MB de imagem viram ~7MB de body. Default de 1MB não basta.
    bodyLimit: 8 * 1024 * 1024,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(cors, { origin: true });
  registerErrorHandler(app);

  await app.register(healthRoutes, { prefix: "/api" });
  await app.register(conversationRoutes, { prefix: "/api" });
  await app.register(adminRoutes, { prefix: "/api/admin" });
  await app.register(guestRoutes, { prefix: "/api" });
  await app.register(whatsappWebhookRoutes, { prefix: "/api" });

  // Ferramenta de teste: permite conversar como qualquer hóspede — fica fora
  // de produção por padrão (ver simulatorEnabled).
  if (simulatorEnabled()) {
    await app.register(simulatorRoutes, { prefix: "/api" });
    app.log.info("Simulador de WhatsApp ATIVO em /api/simulator (ferramenta de teste)");
  }

  return app;
}
