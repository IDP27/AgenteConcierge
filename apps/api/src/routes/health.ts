import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";

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
    });
  });
}
