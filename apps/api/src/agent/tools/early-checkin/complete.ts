import { z } from "zod";
import type { CheckinFormData, OrderItem } from "@concierge/shared";
import { missingCheckinFields } from "@concierge/shared";
import { requiresHumanApproval } from "../../guardrails/financial.js";
import { computeExtras, describeCharge, nightsOf } from "./extras.js";
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
    await ctx.repos.reservations.transition(ctx.reservation.id, ctx.resort.id, "checked_in_digital");
    // Mantém o contexto do turno em dia: as tools seguintes (ex.: suggest_offers
    // no fecho do check-in) precisam ver o novo estado, não o de antes.
    ctx.reservation.status = "checked_in_digital";

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

    // Taxas/serviços do check-in: obrigatórios + aceitos viram um pedido
    // rastreável. O cálculo vem de computeExtras — o MESMO que gerou a prévia
    // mostrada ao hóspede em update_checkin_form, para o cobrado não divergir
    // do combinado.
    const persons = 1 + companions.length;
    const nights = nightsOf(ctx.reservation.checkIn, ctx.reservation.checkOut);
    const charge = computeExtras({
      extras: ctx.resort.settings.checkinExtras,
      acceptedIds: data.acceptedExtras ?? [],
      persons,
      nights,
    });
    let extrasOrder: { totalCents: number; status: string } | null = null;
    if (charge.lines.length > 0 && !ctx.resort.settings.financialKillSwitch) {
      const items: OrderItem[] = charge.lines.map((l) => ({
        offerId: null,
        title: `${l.title} (check-in)`,
        qty: l.qty,
        priceCents: l.priceCents,
      }));
      const order = await ctx.repos.orders.create({
        resortId: ctx.resort.id,
        reservationId: ctx.reservation.id,
        items,
        totalCents: charge.totalCents,
        status: requiresHumanApproval(charge.totalCents, ctx.resort.settings)
          ? "pending_approval"
          : "confirmed",
      });
      extrasOrder = { totalCents: charge.totalCents, status: order.status };
    }

    return {
      output: {
        status: "checked_in_digital",
        companionsRegistered: companions.length,
        ...(extrasOrder
          ? {
              extrasOrder: {
                ...extrasOrder,
                totalFormatted: charge.totalFormatted,
                // Texto já montado: a conta é determinística e o modelo só
                // precisa repassá-la. Deixá-lo somar foi o que fez um hóspede
                // ouvir R$ 144 e ter R$ 240 lançados na conta.
                breakdown: describeCharge(charge, persons, nights),
                info:
                  "OBRIGATÓRIO: reproduza `breakdown` na resposta, com os valores exatos, ANTES " +
                  "de qualquer oferta. É o que o hóspede vai pagar — omitir uma taxa que já foi " +
                  "lançada não é opção. Não recalcule nem converta para diária.",
              },
            }
          : {}),
        message:
          "Check-in digital concluído! Na chegada é só retirar o cartão do quarto na recepção " +
          "(quartos liberados a partir das 14h).",
        info:
          "Dê a boa notícia ao hóspede em uma frase e, se houver extrasOrder, apresente o " +
          "breakdown logo em seguida. SÓ DEPOIS chame suggest_offers com o contexto 'check-in " +
          "concluído — pré-estadia' para oferecer algo útil para a chegada (transfer, jantar do " +
          "primeiro dia, upgrade). Se o guardrail bloquear, apenas se despeça desejando boa " +
          "viagem — não insista.",
      },
    };
  },
});
