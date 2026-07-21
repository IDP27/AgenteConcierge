import { z } from "zod";
import { defineTool } from "../types.js";
import { lockAdapterFor } from "../../../locks/index.js";

/**
 * Chave digital do quarto — o hóspede abre a porta pelo próprio celular, sem
 * passar pela recepção. É o que faz o "check-in digital" cumprir a promessa
 * (a Aviva ainda termina em "retire o cartão no balcão").
 *
 * Seam de integração: o código é provisionado pelo LockAdapter (mock hoje,
 * fechadura real via resort.settings.lockProvider depois). Requer hóspede
 * hospedado (checked_in) e quarto atribuído.
 */
export const getRoomKey = defineTool({
  name: "get_room_key",
  description:
    "Emite (ou reapresenta) a chave digital do quarto do hóspede. Use quando ele pedir a chave, " +
    "perguntar como entrar no quarto, ou logo após a chegada. Só funciona quando o hóspede já " +
    "está hospedado e tem um quarto atribuído.",
  inputSchema: z.object({}),
  guardrail: (_input, ctx) => {
    if (ctx.reservation.status !== "checked_in") {
      return {
        allowed: false,
        reasonForModel:
          "A chave digital só é liberada quando o hóspede está efetivamente hospedado " +
          "(após a chegada/check-in na recepção). Explique isso com gentileza.",
      };
    }
    if (!ctx.reservation.roomNumber) {
      return {
        allowed: false,
        reasonForModel:
          "O quarto ainda não foi atribuído a esta reserva. Diga que a recepção define o quarto " +
          "e a chave fica disponível em seguida.",
      };
    }
    return { allowed: true };
  },
  handler: async (_input, ctx) => {
    const roomNumber = ctx.reservation.roomNumber as string;

    // Reapresenta a chave ativa em vez de emitir outra a cada pedido.
    const existing = await ctx.repos.roomKeys.findActive(ctx.reservation.id);
    if (existing) {
      return {
        output: { code: existing.code, roomNumber, reused: true },
        card: {
          kind: "room_key",
          data: {
            roomNumber,
            code: existing.code,
            expiresAt: existing.expiresAt.toISOString(),
            isMock: existing.provider === "mock",
          },
        },
      };
    }

    const adapter = lockAdapterFor(ctx.resort.settings);
    // Válida até o fim do dia do check-out.
    const expiresAt = new Date(ctx.reservation.checkOut);
    expiresAt.setHours(23, 59, 59, 0);

    const issued = await adapter.issueKey({ roomNumber, expiresAt });
    await ctx.repos.roomKeys.create({
      resortId: ctx.resort.id,
      reservationId: ctx.reservation.id,
      roomNumber,
      code: issued.code,
      provider: adapter.provider,
      expiresAt: issued.expiresAt,
    });

    return {
      output: {
        code: issued.code,
        roomNumber,
        info:
          "Chave digital emitida. Apresente o quarto e diga que a chave está no card acima. " +
          (issued.isMock
            ? "Ambiente de demonstração — não mencione que é simulada, apenas entregue naturalmente."
            : "Oriente a aproximar o celular da fechadura."),
      },
      card: {
        kind: "room_key",
        data: {
          roomNumber,
          code: issued.code,
          expiresAt: issued.expiresAt.toISOString(),
          isMock: issued.isMock,
        },
      },
    };
  },
});
