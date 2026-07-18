import { z } from "zod";
import { defineTool } from "../types.js";

/**
 * Caso de uso 3 — check-in antecipado digital.
 * O modelo coleta os dados faltantes conversando com o hóspede e só então
 * chama a tool. Guardrail: apenas reservas `confirmed` podem fazer check-in
 * digital (transições de estado são código, não prompt).
 */
export const startEarlyCheckin = defineTool({
  name: "start_early_checkin",
  description:
    "Realiza o check-in antecipado digital da reserva do hóspede. Antes de chamar, colete " +
    "na conversa: número do documento (CPF ou passaporte) e horário previsto de chegada. " +
    "Placa do carro é opcional (só se o hóspede vier de carro). Só funciona para reservas " +
    "confirmadas que ainda não fizeram check-in.",
  inputSchema: z.object({
    documentNumber: z
      .string()
      .min(5)
      .max(20)
      .describe("CPF ou passaporte informado pelo hóspede"),
    arrivalTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "formato HH:mm")
      .describe("Horário previsto de chegada, formato HH:mm"),
    carPlate: z.string().max(10).optional().describe("Placa do carro, se vier de carro"),
  }),
  guardrail: (_input, ctx) => {
    if (ctx.reservation.status === "confirmed") return { allowed: true };
    const reasons: Record<string, string> = {
      checked_in_digital: "O check-in digital desta reserva já foi realizado.",
      checked_in: "O hóspede já está hospedado — check-in já concluído.",
      checked_out: "Esta reserva já foi encerrada (check-out realizado).",
      cancelled: "Esta reserva está cancelada — orientar o hóspede a falar com a recepção.",
    };
    return {
      allowed: false,
      reasonForModel:
        reasons[ctx.reservation.status] ?? "Reserva não elegível para check-in digital.",
    };
  },
  handler: async (input, ctx) => {
    await ctx.repos.guests.mergeProfile(ctx.guest.id, {
      earlyCheckin: {
        documentNumber: input.documentNumber,
        arrivalTime: input.arrivalTime,
        carPlate: input.carPlate ?? null,
        completedAt: ctx.now.toISOString(),
      },
    });
    await ctx.repos.reservations.setStatus(ctx.reservation.id, "checked_in_digital");
    return {
      output: {
        status: "checked_in_digital",
        message:
          "Check-in digital concluído. Na chegada, o hóspede só retira o cartão do quarto na " +
          "recepção (quartos liberados a partir das 14h).",
      },
    };
  },
});
