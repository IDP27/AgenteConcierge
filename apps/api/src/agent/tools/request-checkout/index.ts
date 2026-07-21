import { z } from "zod";
import type { OrderItem } from "@concierge/shared";
import { computeRoomBill } from "@concierge/shared";
import { defineTool } from "../types.js";

/**
 * Check-out expresso pelo chat — fecha a jornada. Mostra o extrato final,
 * transiciona checked_in → checked_out (transição guardada) e abre caminho
 * para a avaliação pós-estadia.
 *
 * O pagamento em si NÃO acontece aqui (é da recepção/PMS): o agente confirma
 * a saída e informa que o consumo é acertado no balcão ou no cartão em conta.
 * Pendências de aprovação BLOQUEIAM o check-out expresso (a equipe precisa
 * fechar antes) — o agente encaminha para a recepção nesse caso.
 */
export const requestCheckout = defineTool({
  name: "request_checkout",
  description:
    "Realiza o check-out expresso do hóspede pelo chat. Antes de chamar, confirme com ele que " +
    "deseja fazer o check-out. Mostre o extrato final. Só funciona quando o hóspede está " +
    "hospedado (checked_in). O pagamento é acertado na recepção — não prometa valores nem cobre nada.",
  inputSchema: z.object({
    confirmedByGuest: z.literal(true).describe("O hóspede confirmou que quer fazer o check-out"),
  }),
  guardrail: (_input, ctx) => {
    if (ctx.reservation.status === "checked_in") return { allowed: true };
    const reasons: Record<string, string> = {
      confirmed: "O hóspede ainda não chegou ao resort — não há check-out a fazer.",
      checked_in_digital:
        "O hóspede fez o check-in digital mas ainda não chegou/retirou o cartão — não há check-out a fazer.",
      checked_out: "Esta reserva já teve o check-out realizado.",
      cancelled: "Esta reserva está cancelada.",
    };
    return {
      allowed: false,
      reasonForModel: reasons[ctx.reservation.status] ?? "Reserva não elegível para check-out.",
    };
  },
  handler: async (_input, ctx) => {
    const orders = await ctx.repos.orders.listByReservation(ctx.reservation.id);
    const bill = computeRoomBill(
      orders.map((o) => ({
        items: o.items as unknown as OrderItem[],
        totalCents: o.totalCents,
        status: o.status,
      })),
    );

    // Pendência de aprovação impede o check-out expresso: a equipe fecha antes.
    if (bill.hasPending) {
      return {
        output: {
          blocked: true,
          info:
            "Há pedido(s) aguardando aprovação da equipe — o check-out expresso não pode ser " +
            "concluído agora. Peça desculpas, diga que a recepção finaliza a conta e faça o " +
            "check-out no balcão. Não conclua o check-out.",
        },
        card: { kind: "room_bill", data: bill },
      };
    }

    await ctx.repos.reservations.transition(ctx.reservation.id, ctx.resort.id, "checked_out");
    // Chave digital deixa de valer na saída (segurança do quarto).
    await ctx.repos.roomKeys.revokeActive(ctx.reservation.id, ctx.now);

    return {
      output: {
        status: "checked_out",
        chargedCents: bill.chargedCents,
        info:
          "Check-out concluído! Agradeça a estadia de forma calorosa, informe que o consumo " +
          "lançado é acertado na recepção/cartão em conta, e deseje boa viagem. EM SEGUIDA, " +
          "convide o hóspede a avaliar a estadia chamando ask_review_rating.",
      },
      card: { kind: "room_bill", data: bill },
    };
  },
});
