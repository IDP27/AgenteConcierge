import { z } from "zod";
import type { OrderItem } from "@concierge/shared";
import { computeRoomBill } from "@concierge/shared";
import { defineTool } from "../types.js";

/**
 * Extrato da conta do quarto — transparência de consumo durante a estadia
 * e no check-out. Consolida os pedidos da reserva (confirmados/entregues =
 * cobrados; pendentes à parte). Fecha uma lacuna de confiança: até então o
 * hóspede acumulava gastos sem nunca poder consultá-los.
 */
export const getRoomBill = defineTool({
  name: "get_room_bill",
  description:
    "Mostra o extrato da conta do quarto: tudo o que o hóspede consumiu na estadia (pedidos, " +
    "serviços, taxas) com o total lançado. Use quando ele perguntar o quanto gastou, pedir a " +
    "conta/extrato, ou antes de um check-out. Só durante a estadia (após a chegada).",
  inputSchema: z.object({}),
  guardrail: (_input, ctx) => {
    const s = ctx.reservation.status;
    if (s === "checked_in" || s === "checked_in_digital") return { allowed: true };
    return {
      allowed: false,
      reasonForModel:
        s === "checked_out"
          ? "A estadia já foi encerrada. Se o hóspede tiver dúvida sobre a conta, oriente-o a falar com a recepção."
          : "O extrato só está disponível durante a estadia (após a chegada ao resort).",
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

    return {
      output: {
        ...bill,
        info:
          bill.lines.length === 0
            ? "Nenhum consumo lançado ainda. Diga ao hóspede que a conta está zerada."
            : "Apresente o total de forma clara. Consumos são pagos no check-out. Não invente itens.",
      },
      card: { kind: "room_bill", data: bill },
    };
  },
});
