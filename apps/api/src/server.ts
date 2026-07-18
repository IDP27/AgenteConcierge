import { env } from "./config/env.js";
import { buildApp } from "./app.js";

const app = await buildApp();

try {
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
  app.log.info(`🏝️  Agente Concierge API em http://localhost:${env.PORT}/api/health`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
