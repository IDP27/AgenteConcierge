import { z } from "zod";
import { defineTool } from "../types.js";
import { computeSlaDueAt, inferPriority } from "./severity.js";

/**
 * Caso de uso 5 — reclamações viram OS com prioridade automática por
 * palavras-chave de severidade e SLA calculado pelos settings do resort.
 */
export const createServiceOrder = defineTool({
  name: "create_service_order",
  description:
    "Abre uma ordem de serviço (OS) para reclamações ou problemas no quarto/resort: " +
    "manutenção, limpeza, barulho, itens faltando. Descreva o problema com as palavras do " +
    "hóspede — a prioridade e o prazo são calculados automaticamente. Sempre confirme ao " +
    "hóspede que a equipe foi acionada e informe o prazo.",
  inputSchema: z.object({
    category: z
      .enum(["maintenance", "housekeeping", "noise", "amenities", "other"])
      .describe(
        "maintenance = defeitos/manutenção · housekeeping = limpeza · noise = barulho · " +
          "amenities = itens faltando · other = demais casos",
      ),
    description: z
      .string()
      .min(10)
      .max(500)
      .describe("Descrição do problema, preservando as palavras do hóspede"),
  }),
  handler: async (input, ctx) => {
    const priority = inferPriority(input.description);
    const slaDueAt = computeSlaDueAt(ctx.now, priority, ctx.resort.settings.slaHoursByPriority);

    const serviceOrder = await ctx.repos.serviceOrders.create({
      resortId: ctx.resort.id,
      reservationId: ctx.reservation.id,
      category: input.category,
      description: input.description,
      priority,
      slaDueAt,
    });

    return {
      output: {
        serviceOrderId: serviceOrder.id,
        category: input.category,
        priority,
        slaDueAt: slaDueAt.toISOString(),
        info: `OS aberta com prioridade ${priority}. Prazo de atendimento: ${slaDueAt.toISOString()}.`,
      },
      card: {
        kind: "service_order",
        data: {
          id: serviceOrder.id,
          category: input.category,
          description: input.description,
          priority,
          status: "open",
          slaDueAt: slaDueAt.toISOString(),
        },
      },
    };
  },
});
