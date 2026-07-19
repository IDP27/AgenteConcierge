import { z } from "zod";
import { defineTool } from "../types.js";

/**
 * Salvaguarda de experiência (doc de automação, seção 6): o hóspede pode
 * silenciar ofertas a qualquer momento — upsell invasivo destrói a
 * experiência que deveria melhorar. A preferência fica no perfil e é
 * respeitada por guardrail determinístico no suggest_offers (não depende
 * de o modelo "lembrar").
 */
export const muteOffers = defineTool({
  name: "mute_offers",
  description:
    "Silencia (ou reativa) as sugestões proativas de ofertas para este hóspede. CHAME com " +
    "muted=true assim que o hóspede pedir para parar de receber ofertas/sugestões — mesmo de " +
    "forma indireta ('chega de ofertas', 'não me ofereça nada'). ATENÇÃO: dizer 'anotado' sem " +
    "chamar esta ferramenta NÃO salva nada — a preferência só vale após a chamada. Chame com " +
    "muted=false se ele pedir para voltar a receber. Nunca insista depois de silenciar.",
  inputSchema: z.object({
    muted: z
      .boolean()
      .describe("true = parar sugestões proativas · false = voltar a sugerir"),
  }),
  handler: async (input, ctx) => {
    await ctx.repos.guests.mergeProfile(ctx.guest.id, { offersMuted: input.muted });

    return {
      output: {
        offersMuted: input.muted,
        message: input.muted
          ? "Preferência registrada: não faça mais sugestões proativas de ofertas para este " +
            "hóspede. Confirme em uma frase e siga ajudando. Se ele PEDIR para ver opções, " +
            "list_offers continua disponível."
          : "Sugestões proativas reativadas para este hóspede.",
      },
    };
  },
});
