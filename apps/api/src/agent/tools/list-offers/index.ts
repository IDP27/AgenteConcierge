import { z } from "zod";
import { defineTool } from "../types.js";

/**
 * Caso de uso 4a — catálogo de ofertas ativas do resort.
 * Única fonte de preços permitida ao modelo (regra anti-alucinação).
 */
export const listOffers = defineTool({
  name: "list_offers",
  description:
    "Lista as ofertas e serviços pagos disponíveis no resort (spa, passeios, jantares, " +
    "late checkout etc.) com preços oficiais. Use quando o hóspede perguntar o que há " +
    "disponível ou antes de criar um pedido de item pago. Filtre por tags quando fizer sentido.",
  inputSchema: z.object({
    tags: z
      .array(z.string())
      .optional()
      .describe('Filtro opcional por tags, ex.: ["spa"], ["kids"], ["food", "romantic"]'),
  }),
  handler: async (input, ctx) => {
    const offers = await ctx.repos.offers.listActive(ctx.resort.id, input.tags);
    const items = offers.map((o) => ({
      id: o.id,
      title: o.title,
      description: o.description,
      priceCents: o.priceCents,
      tags: o.tags,
    }));
    return {
      output: { offers: items, count: items.length },
      card: items.length > 0 ? { kind: "offer", data: { offers: items } } : undefined,
    };
  },
});
