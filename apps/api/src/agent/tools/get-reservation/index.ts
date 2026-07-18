import { z } from "zod";
import { defineTool } from "../types.js";

/**
 * Caso de uso 2 — dados da estadia do hóspede AUTENTICADO.
 * Escopo garantido por construção: a reserva vem do contexto (magic token),
 * nunca de um parâmetro do modelo — impossível consultar reserva de terceiros.
 */
export const getReservation = defineTool({
  name: "get_reservation",
  description:
    "Consulta os dados da reserva do hóspede desta conversa: datas de check-in/check-out, " +
    "status, plano contratado e número do quarto. Use sempre que o hóspede perguntar sobre " +
    "a própria estadia.",
  inputSchema: z.object({}),
  handler: async (_input, ctx) => {
    const r = ctx.reservation;
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    return {
      output: {
        guestName: ctx.guest.name,
        checkIn: fmt(r.checkIn),
        checkOut: fmt(r.checkOut),
        status: r.status,
        plan: r.plan,
        roomNumber: r.roomNumber ?? "ainda não atribuído",
      },
    };
  },
});
