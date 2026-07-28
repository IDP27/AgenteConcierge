import { z } from "zod";
import { defineTool } from "../types.js";

/**
 * Caso de uso 7 — roteamento inteligente de avaliações (pós-estadia).
 *
 * Depois que o hóspede dá uma nota de satisfação, o destino é decidido de forma
 * DETERMINÍSTICA (não delegada ao modelo), protegendo a nota pública:
 *   - nota >= threshold  → convida a avaliar no canal público (Google/Booking);
 *   - nota <  threshold  → direciona ao canal interno de resolução (needs_human),
 *                          sem expor o link público.
 *
 * O guardrail garante que só rode no pós-estadia (checked_out). A avaliação fica
 * registrada no perfil do hóspede (dado estruturado) e na trilha de auditoria.
 */
export const requestReview = defineTool({
  name: "request_review",
  description:
    "Registra a satisfação do hóspede no pós-estadia e decide o roteamento da avaliação. " +
    "Use DEPOIS de perguntar ao hóspede, em uma escala de 1 a 5, o quanto ele recomendaria o " +
    "resort. Não escolha o destino você mesmo: a ferramenta decide entre convidar para a " +
    "avaliação pública (hóspede satisfeito) ou encaminhar ao atendimento interno (insatisfeito) " +
    "e devolve a mensagem/link certo. Só funciona quando a estadia já terminou.",
  inputSchema: z.object({
    rating: z
      .number()
      .int()
      .min(1)
      .max(5)
      .describe("Nota de 1 a 5 que o hóspede deu para a experiência"),
    comment: z
      .string()
      .max(500)
      .optional()
      .describe("Comentário livre do hóspede sobre a estadia, se houver"),
  }),
  guardrail: (_input, ctx) => {
    if (ctx.reservation.status !== "checked_out") {
      return {
        allowed: false,
        reasonForModel:
          "A solicitação de avaliação só deve acontecer no pós-estadia (após o check-out). " +
          "Como a estadia ainda não terminou, não peça avaliação agora.",
      };
    }
    return { allowed: true };
  },
  handler: async (input, ctx) => {
    const threshold = ctx.resort.settings.review.satisfactionThreshold;
    const satisfied = input.rating >= threshold;
    const route: "public" | "internal" = satisfied ? "public" : "internal";

    // Dado estruturado: fica no perfil para não pedir de novo e realimentar analytics.
    await ctx.repos.guests.mergeProfile(ctx.guest.id, {
      lastReview: {
        rating: input.rating,
        comment: input.comment ?? null,
        route,
        at: ctx.now.toISOString(),
      },
    });

    if (satisfied) {
      return {
        output: {
          route,
          message:
            "Hóspede satisfeito. Agradeça de forma calorosa em uma ou duas frases. O convite " +
            "para avaliar no Google já foi apresentado ao hóspede — NÃO repita o link em " +
            "texto e não prometa recompensas em troca da avaliação.",
        },
        card: {
          kind: "review_link",
          data: { url: ctx.resort.settings.review.publicUrl, rating: input.rating },
        },
      };
    }

    // Insatisfeito: protege a nota pública e encaminha para resolução interna.
    await ctx.repos.conversations.setStatus(ctx.conversationId, "needs_human");
    return {
      output: {
        route,
        message:
          "Hóspede insatisfeito. NÃO envie o link de avaliação pública. Agradeça o feedback, " +
          "demonstre que a equipe vai tratar o ocorrido e avise que um atendente vai retomar o " +
          "contato para resolver.",
      },
      handoff: {
        reason: `Avaliação pós-estadia baixa (nota ${input.rating}/5) — recuperação de serviço`,
      },
    };
  },
});
