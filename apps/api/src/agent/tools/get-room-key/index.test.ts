import { describe, expect, it } from "vitest";
import { getRoomKey } from "./index.js";
import { makeToolCtx } from "../test-helpers.js";

describe("get_room_key", () => {
  it("guardrail: só quando hospedado (checked_in)", () => {
    const { ctx } = makeToolCtx({ reservationStatus: "checked_in_digital" });
    expect(getRoomKey.guardrail?.({}, ctx)).toMatchObject({ allowed: false });
  });

  it("guardrail: bloqueia sem quarto atribuído", () => {
    const { ctx } = makeToolCtx({ reservationStatus: "checked_in" });
    ctx.reservation.roomNumber = null;
    expect(getRoomKey.guardrail?.({}, ctx)).toMatchObject({ allowed: false });
  });

  it("emite a chave via LockAdapter e persiste (provider mock)", async () => {
    const { ctx, fakes } = makeToolCtx({ reservationStatus: "checked_in" });
    ctx.reservation.roomNumber = "204";

    const result = await getRoomKey.handler({}, ctx);

    expect(fakes.roomKeys.create).toHaveBeenCalledWith(
      expect.objectContaining({ roomNumber: "204", provider: "mock" }),
    );
    const card = result.card?.data as { roomNumber: string; code: string; isMock: boolean };
    expect(card.roomNumber).toBe("204");
    expect(card.code).toMatch(/^\d{6}$/); // PIN de 6 dígitos do mock
    expect(card.isMock).toBe(true);
  });

  it("reapresenta a chave ativa em vez de emitir outra", async () => {
    const { ctx, fakes } = makeToolCtx({ reservationStatus: "checked_in" });
    ctx.reservation.roomNumber = "204";
    fakes.roomKeys.findActive.mockResolvedValue({
      code: "123456",
      provider: "mock",
      expiresAt: new Date("2026-07-22T23:59:59Z"),
    });

    const result = await getRoomKey.handler({}, ctx);

    expect(fakes.roomKeys.create).not.toHaveBeenCalled();
    expect(result.output).toMatchObject({ code: "123456", reused: true });
  });
});
