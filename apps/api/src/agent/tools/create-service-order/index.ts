import { z } from "zod";
import { defineTool } from "../types.js";
import { applyGuestProfileBoost, computeSlaDueAt, inferPriority } from "./severity.js";
import { pmsAdapterFor } from "../../../pms/index.js";

/**
 * Caso de uso 5 — reclamações viram OS com prioridade automática por
 * palavras-chave de severidade E por perfil do hóspede (membros do clube
 * de férias recebem prioridade elevada), com SLA calculado pelos settings.
 */
export const createServiceOrder = defineTool({
  name: "create_service_order",
  description:
    "Abre uma ordem de serviço (OS) para reclamações ou problemas no quarto/resort: " +
    "manutenção, limpeza, barulho, itens faltando. Descreva o problema com as palavras do " +
    "hóspede — a prioridade e o prazo são calculados automaticamente. Se o hóspede ENVIAR UMA " +
    "FOTO do problema, descreva objetivamente o que você vê nela em visualNote (ex.: 'poça " +
    "d'água grande no piso', 'mancha de mofo na parede') — isso dá contexto ao técnico e ajusta " +
    "a prioridade. Sempre confirme ao hóspede que a equipe foi acionada e informe o prazo.",
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
    visualNote: z
      .string()
      .max(300)
      .optional()
      .describe(
        "SÓ quando o hóspede enviar foto do problema: descrição objetiva do que você vê na " +
          "imagem. Não invente — se não houver foto, deixe em branco.",
      ),
  }),
  handler: async (input, ctx) => {
    const priority = applyGuestProfileBoost(
      inferPriority(input.description, input.visualNote),
      ctx.guest.profile,
    );
    const slaDueAt = computeSlaDueAt(ctx.now, priority, ctx.resort.settings.slaHoursByPriority);

    const serviceOrder = await ctx.repos.serviceOrders.create({
      resortId: ctx.resort.id,
      reservationId: ctx.reservation.id,
      category: input.category,
      description: input.description,
      visualNote: input.visualNote ?? null,
      priority,
      slaDueAt,
    });

    // Problema físico evidenciado por foto, com quarto atribuído → também abre
    // chamado no PMS (Governança/Manutenção). No seed, apenas registra; em
    // produção, a mesma chamada posta no OPERA. Não altera a OS nem o card.
    if (input.visualNote && ctx.reservation.roomNumber) {
      const pms = pmsAdapterFor(ctx.resort.settings, ctx.repos);
      await pms.addMaintenance({
        roomNumber: ctx.reservation.roomNumber,
        description: `[${input.category}] ${input.visualNote}`,
        reportedByGuest: true,
      });
    }

    return {
      output: {
        serviceOrderId: serviceOrder.id,
        category: input.category,
        priority,
        hasVisualEvidence: Boolean(input.visualNote),
        slaDueAt: slaDueAt.toISOString(),
        info: `OS aberta com prioridade ${priority}. Prazo de atendimento: ${slaDueAt.toISOString()}.`,
      },
      card: {
        kind: "service_order",
        data: {
          id: serviceOrder.id,
          category: input.category,
          description: input.description,
          visualNote: input.visualNote ?? null,
          priority,
          status: "open",
          slaDueAt: slaDueAt.toISOString(),
        },
      },
    };
  },
});
