import { z } from "zod";
import type { CheckinFormData } from "@concierge/shared";
import { missingCheckinFields } from "@concierge/shared";
import { defineTool } from "../types.js";

/**
 * Fecho do check-in conversacional: valida que a FNRH essencial está completa
 * (determinístico), conclui o check-in digital e devolve o gancho de venda
 * antecipada — o fim do check-in é o melhor momento de upsell pré-chegada.
 */
export const completeEarlyCheckin = defineTool({
  name: "complete_early_checkin",
  description:
    "Conclui o check-in digital DEPOIS que update_checkin_form indicar que não falta nenhum " +
    "campo e o hóspede confirmar os dados. Se ainda faltarem campos, a chamada falha e informa " +
    "o que falta. Ao concluir, siga a instrução de venda antecipada devolvida pela ferramenta.",
  inputSchema: z.object({
    confirmedByGuest: z
      .literal(true)
      .describe("O hóspede revisou e confirmou os dados na conversa"),
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
  handler: async (_input, ctx) => {
    const form = await ctx.repos.checkinForms.findByReservation(ctx.reservation.id);
    const data = (form?.data ?? {}) as CheckinFormData;
    const missing = missingCheckinFields(data);
    if (!form || missing.length > 0) {
      return {
        output: {
          error: `Check-in incompleto — faltam: ${missing.join(", ")}. Colete com update_checkin_form antes de concluir.`,
        },
      };
    }

    await ctx.repos.checkinForms.complete(ctx.reservation.id, ctx.now);
    await ctx.repos.reservations.setStatus(ctx.reservation.id, "checked_in_digital");

    // Reaproveitamento: próxima estadia começa com os dados pré-preenchidos.
    await ctx.repos.guests.mergeProfile(ctx.guest.id, {
      checkinDefaults: {
        documentType: data.documentType,
        documentNumber: data.documentNumber,
        birthDate: data.birthDate,
        nationality: data.nationality,
        address: data.address,
      },
    });

    const companions = await ctx.repos.companions.listForReservation(ctx.reservation.id);

    return {
      output: {
        status: "checked_in_digital",
        companionsRegistered: companions.length,
        message:
          "Check-in digital concluído! Na chegada é só retirar o cartão do quarto na recepção " +
          "(quartos liberados a partir das 14h).",
        info:
          "Dê a boa notícia ao hóspede em uma frase. EM SEGUIDA, chame suggest_offers com o " +
          "contexto 'check-in concluído — pré-estadia' para oferecer algo útil para a chegada " +
          "(transfer, jantar do primeiro dia, upgrade). Se o guardrail bloquear, apenas se " +
          "despeça desejando boa viagem — não insista.",
      },
    };
  },
});
