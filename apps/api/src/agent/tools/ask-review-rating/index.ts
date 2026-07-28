import { z } from "zod";
import { defineTool } from "../types.js";

/**
 * Caso de uso 7 (entrada) — apresenta o card interativo de avaliação.
 *
 * Separado de request_review de propósito: esta tool só RENDERIZA o card de
 * estrelas; a nota volta como mensagem do hóspede e aí sim request_review
 * decide o roteamento. Assim o canal escolhe a melhor UI (estrelas no web,
 * texto no WhatsApp) sem o agent-core saber de interface.
 */
export const askReviewRating = defineTool({
  name: "ask_review_rating",
  description:
    "Apresenta ao hóspede o pedido de nota (1 a 5) no pós-estadia. Chame esta " +
    "ferramenta EM VEZ de pedir a nota por escrito — ela já apresenta a pergunta de forma " +
    "interativa. Depois de chamar, apenas aguarde: a nota chega como mensagem do hóspede e só " +
    "então você usa request_review. Não repita a pergunta em texto nem insista se ele não responder.",
  inputSchema: z.object({}),
  guardrail: (_input, ctx) => {
    if (ctx.reservation.status !== "checked_out") {
      return {
        allowed: false,
        reasonForModel:
          "A avaliação só deve ser pedida no pós-estadia (após o check-out). Como a estadia " +
          "ainda não terminou, não peça avaliação agora.",
      };
    }
    if (ctx.guest.profile.lastReview) {
      return {
        allowed: false,
        reasonForModel:
          "Este hóspede já avaliou a estadia. Agradeça se ele tocar no assunto, mas NÃO peça " +
          "avaliação de novo.",
      };
    }
    return { allowed: true };
  },
  handler: async (_input, ctx) => ({
    output: {
      shown: true,
      message:
        "Pedido de avaliação já apresentado ao hóspede. Faça um convite curto e caloroso em UMA frase " +
        "(sem repetir a escala nem a pergunta — já foram apresentadas) e aguarde a resposta dele.",
    },
    card: {
      kind: "review_prompt",
      data: { guestName: ctx.guest.name },
    },
  }),
});
