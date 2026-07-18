import { z } from "zod";
import { defineTool } from "../types.js";

function sameCalendarDay(a: Date, b: Date, timeZone: string): boolean {
  const fmt = (d: Date) => d.toLocaleDateString("en-CA", { timeZone });
  return fmt(a) === fmt(b);
}

/** Momento da jornada → tags que fazem sentido sugerir. */
function tagsForMoment(status: string): string[] {
  switch (status) {
    case "confirmed": // pré-estadia
      return ["convenience", "kids", "romantic", "breakfast"];
    case "checked_in_digital":
    case "checked_in": // durante a estadia
      return ["spa", "food", "adventure", "sports", "kids", "romantic", "relax", "dinner"];
    case "checked_out": // pós-estadia (próxima visita)
      return ["romantic", "spa", "adventure"];
    default:
      return [];
  }
}

/**
 * Caso de uso 6 — upsell contextual: cruza o perfil do hóspede (JSONB) com as
 * tags das ofertas e o momento da estadia.
 *
 * Guardrail anti-spam (ADR-009): no máximo 1 sugestão PROATIVA por dia por
 * hóspede — controlado por guests.last_proactive_offer_at, não por prompt.
 * Se o hóspede pedir ("o que tem de spa?"), o caminho é list_offers, sem limite.
 */
export const suggestOffers = defineTool({
  name: "suggest_offers",
  description:
    "Sugere PROATIVAMENTE ofertas personalizadas com base no perfil do hóspede e no momento " +
    "da estadia. Use com parcimônia, quando houver um gancho natural na conversa (ex.: hóspede " +
    "menciona cansaço → spa; menciona filhos → kids club). Limitado a 1 sugestão proativa por " +
    "dia. Se o hóspede PEDIU para ver opções, use list_offers em vez desta.",
  inputSchema: z.object({
    context: z
      .string()
      .min(5)
      .max(200)
      .describe("O gancho da conversa que motivou a sugestão, em uma frase"),
  }),
  guardrail: (_input, ctx) => {
    const last = ctx.guest.lastProactiveOfferAt;
    if (last && sameCalendarDay(last, ctx.now, ctx.resort.settings.timezone)) {
      return {
        allowed: false,
        reasonForModel:
          "Limite de 1 sugestão proativa por dia já atingido para este hóspede. Não sugira " +
          "ofertas agora — apenas continue ajudando no que foi pedido.",
      };
    }
    return { allowed: true };
  },
  handler: async (input, ctx) => {
    const interests = Array.isArray(ctx.guest.profile.interests)
      ? (ctx.guest.profile.interests as string[])
      : [];
    const momentTags = tagsForMoment(ctx.reservation.status);

    const all = await ctx.repos.offers.listActive(ctx.resort.id);
    const scored = all
      .map((o) => ({
        offer: o,
        score:
          o.tags.filter((t) => interests.includes(t)).length * 2 +
          o.tags.filter((t) => momentTags.includes(t)).length,
      }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    if (scored.length === 0) {
      return {
        output: {
          suggestions: [],
          info: "Nenhuma oferta combina com o perfil/momento — não sugira nada agora.",
        },
      };
    }

    await ctx.repos.guests.markProactiveOffer(ctx.guest.id, ctx.now);

    const suggestions = scored.map(({ offer }) => ({
      id: offer.id,
      title: offer.title,
      description: offer.description,
      priceCents: offer.priceCents,
      tags: offer.tags,
    }));

    return {
      output: {
        suggestions,
        context: input.context,
        info: "Apresente no máximo estas sugestões, de forma natural e sem pressão.",
      },
      card: { kind: "offer", data: { offers: suggestions } },
    };
  },
});
