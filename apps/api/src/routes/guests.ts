import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { adminAuth } from "../plugins/admin-auth.js";
import { repos } from "../repositories/index.js";
import { NotFoundError } from "../lib/errors.js";

/**
 * LGPD (ADR-012): direito de eliminação. Anonimiza PII em transação única,
 * preservando registros agregados (métricas) e integridade referencial.
 * Protegido por admin key no MVP — a solicitação chega via equipe do resort.
 */
export async function guestRoutes(app: FastifyInstance): Promise<void> {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.delete(
    "/guests/:id/data",
    { preHandler: [adminAuth], schema: { params: z.object({ id: z.string().uuid() }) } },
    async (request) => {
      const guest = await repos.guests.findById(request.params.id);
      if (!guest) throw new NotFoundError("Hóspede");
      await repos.guests.anonymize(request.params.id);
      return { anonymized: true };
    },
  );
}
