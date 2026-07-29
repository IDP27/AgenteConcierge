import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";
import { simulatorEnabled } from "../config/env.js";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async (_request, reply) => {
    let db: "up" | "down" = "up";
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      db = "down";
    }
    const status = db === "up" ? "ok" : "degraded";
    return reply.status(db === "up" ? 200 : 503).send({
      status,
      db,
      uptimeSeconds: Math.round(process.uptime()),
      // Quem decide se o simulador existe é o backend (é ele que registra ou
      // não a rota). O launcher lê daqui em vez de ter um flag próprio, senão
      // as duas fontes divergem e sobra um link para uma rota que dá 404.
      simulator: simulatorEnabled(),
    });
  });
}
