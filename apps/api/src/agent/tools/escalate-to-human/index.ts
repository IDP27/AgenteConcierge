import { z } from "zod";
import { defineTool } from "../types.js";

/**
 * Handoff acionado pelo modelo: marca a conversa como needs_human.
 * O service também tem uma heurística de palavras-chave como rede de
 * segurança (guardrails/handoff.ts) — defesa em profundidade.
 */
export const escalateToHuman = defineTool({
  name: "escalate_to_human",
  description:
    "Encaminha a conversa para um atendente humano. Use IMEDIATAMENTE quando o hóspede " +
    "demonstrar frustração/irritação, pedir para falar com uma pessoa (atendente, gerente, " +
    "recepção), ou quando o pedido exigir algo fora das suas ferramentas " +
    "(reembolso, desconto, exceção de política).",
  inputSchema: z.object({
    reason: z.string().describe("Motivo do encaminhamento, em uma frase"),
  }),
  handler: async (input, ctx) => {
    await ctx.repos.conversations.setStatus(ctx.conversationId, "needs_human");
    return {
      output: {
        escalated: true,
        message:
          "Conversa encaminhada à equipe. Avise o hóspede que um atendente humano vai assumir em instantes.",
      },
      handoff: { reason: input.reason },
    };
  },
});
