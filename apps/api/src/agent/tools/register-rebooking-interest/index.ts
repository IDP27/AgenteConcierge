import { z } from "zod";
import { defineTool } from "../types.js";

/**
 * Caso de uso 8 — rebooking pós-estadia (versão MVP da Onda 4).
 *
 * O objetivo financeiro (doc de automação, seções 2.5/3.1) é trazer o hóspede
 * de volta pelo CANAL DIRETO, sem comissão de OTA. No MVP, a tool captura o
 * interesse de retorno como dado estruturado no perfil — a equipe comercial
 * enxerga e responde com proposta personalizada pelo próprio canal.
 *
 * O guardrail garante que só rode no pós-estadia (checked_out).
 */
export const registerRebookingInterest = defineTool({
  name: "register_rebooking_interest",
  description:
    "Registra o interesse do hóspede em VOLTAR ao resort (pós-estadia). Use quando um hóspede " +
    "que já fez check-out mencionar vontade de retornar, planos de nova viagem, próximas férias " +
    "ou uma data futura (réveillon, aniversário, férias escolares). Capture o período desejado " +
    "com as palavras dele. A equipe comercial prepara uma proposta personalizada e responde por " +
    "este mesmo canal — NÃO prometa descontos nem valores.",
  inputSchema: z.object({
    desiredPeriod: z
      .string()
      .min(3)
      .max(120)
      .describe("Período desejado nas palavras do hóspede (ex.: 'réveillon', 'julho que vem')"),
    occasion: z
      .string()
      .max(120)
      .optional()
      .describe("Ocasião, se mencionada (aniversário, lua de mel, férias com as crianças)"),
    partySize: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .describe("Quantas pessoas viriam, se o hóspede mencionou"),
  }),
  guardrail: (_input, ctx) => {
    if (ctx.reservation.status !== "checked_out") {
      return {
        allowed: false,
        reasonForModel:
          "O registro de rebooking é só para o pós-estadia. Como o hóspede ainda está no resort " +
          "(ou nem chegou), ajude com a estadia atual em vez de registrar retorno.",
      };
    }
    return { allowed: true };
  },
  handler: async (input, ctx) => {
    // Dado estruturado no perfil: vira lead de canal direto para a equipe
    // comercial e realimenta as ofertas personalizadas das próximas conversas.
    await ctx.repos.guests.mergeProfile(ctx.guest.id, {
      rebookingInterest: {
        desiredPeriod: input.desiredPeriod,
        occasion: input.occasion ?? null,
        partySize: input.partySize ?? null,
        previousReservationId: ctx.reservation.id,
        at: ctx.now.toISOString(),
      },
    });

    return {
      output: {
        registered: true,
        message:
          "Interesse registrado. Diga ao hóspede que a equipe vai preparar uma proposta " +
          "personalizada para o período e responder por aqui mesmo — reservando direto conosco " +
          "ele ganha atendimento dedicado. NÃO cite valores nem prometa descontos.",
      },
    };
  },
});
