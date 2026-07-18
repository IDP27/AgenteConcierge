import { z } from "zod";
import type { OrderItem } from "@concierge/shared";
import { requiresHumanApproval } from "../../guardrails/financial.js";
import { defineTool } from "../types.js";

/**
 * Caso de uso 4b — pedidos na estadia (toalhas, comida na piscina, serviços).
 *
 * Guardrails (ADR-009):
 * - Preço NUNCA vem do modelo: itens pagos referenciam ofertas por id e o
 *   preço é resolvido no banco. Itens sem offerId são cortesias (preço 0).
 * - Total acima do limite do resort → pedido nasce pending_approval e vai
 *   para a fila de aprovação humana no painel.
 * - Pedidos só durante a estadia (checked_in / checked_in_digital).
 */
export const createOrder = defineTool({
  name: "create_order",
  description:
    "Cria um pedido para o hóspede: itens do catálogo (use list_offers antes para obter o id " +
    "e confirmar o preço) e/ou cortesias sem custo (ex.: toalhas extras, travesseiro adicional). " +
    "Confirme com o hóspede antes de criar. Pedidos de valor alto podem ficar pendentes de " +
    "aprovação da equipe — nesse caso avise com naturalidade.",
  inputSchema: z.object({
    items: z
      .array(
        z.object({
          offerId: z
            .string()
            .uuid()
            .optional()
            .describe("Id da oferta do catálogo (obrigatório para itens pagos)"),
          title: z
            .string()
            .min(2)
            .max(120)
            .optional()
            .describe("Descrição do item de cortesia (quando não vem do catálogo)"),
          qty: z.number().int().min(1).max(10),
        }),
      )
      .min(1)
      .max(10),
    notes: z.string().max(300).optional().describe("Observações do hóspede (ex.: sem cebola)"),
  }),
  guardrail: (_input, ctx) => {
    const status = ctx.reservation.status;
    if (status === "checked_in" || status === "checked_in_digital") return { allowed: true };
    return {
      allowed: false,
      reasonForModel:
        "Pedidos só podem ser feitos durante a estadia. A reserva deste hóspede está " +
        `com status "${status}" — explique com gentileza e ofereça ajudar com outra coisa.`,
    };
  },
  handler: async (input, ctx) => {
    // Resolve preços no banco — item pago sem oferta válida é rejeitado.
    const offerIds = input.items.flatMap((i) => (i.offerId ? [i.offerId] : []));
    const offers = await ctx.repos.offers.findManyByIds(ctx.resort.id, offerIds);
    const offerById = new Map(offers.map((o) => [o.id, o]));

    const items: OrderItem[] = [];
    for (const item of input.items) {
      if (item.offerId) {
        const offer = offerById.get(item.offerId);
        if (!offer) {
          return {
            output: {
              error:
                `Oferta ${item.offerId} não encontrada no catálogo deste resort. ` +
                "Use list_offers para obter ids válidos.",
            },
          };
        }
        items.push({
          offerId: offer.id,
          title: offer.title,
          qty: item.qty,
          priceCents: offer.priceCents,
        });
      } else {
        if (!item.title) {
          return {
            output: { error: "Item de cortesia precisa de title descrevendo o que foi pedido." },
          };
        }
        items.push({ offerId: null, title: item.title, qty: item.qty, priceCents: 0 });
      }
    }

    const totalCents = items.reduce((sum, i) => sum + i.priceCents * i.qty, 0);
    const pending = requiresHumanApproval(totalCents, ctx.resort.settings);

    const order = await ctx.repos.orders.create({
      resortId: ctx.resort.id,
      reservationId: ctx.reservation.id,
      items,
      totalCents,
      status: pending ? "pending_approval" : "confirmed",
    });

    return {
      output: {
        orderId: order.id,
        status: order.status,
        totalCents,
        items,
        notes: input.notes ?? null,
        ...(pending
          ? {
              info:
                "Pedido acima do limite de auto-aprovação do resort: ficou pendente de " +
                "confirmação da equipe. Avise o hóspede que confirmam em instantes.",
            }
          : { info: "Pedido confirmado e encaminhado à equipe." }),
      },
      card: {
        kind: "order",
        data: { id: order.id, items, totalCents, status: order.status },
      },
    };
  },
});
