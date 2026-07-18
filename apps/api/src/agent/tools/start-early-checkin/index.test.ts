import { describe, expect, it } from "vitest";
import { startEarlyCheckin } from "./index.js";
import { makeToolCtx } from "../test-helpers.js";

const INPUT = { documentNumber: "123.456.789-00", arrivalTime: "10:30" };

describe("start_early_checkin", () => {
  it("reserva confirmed → marca checked_in_digital e guarda dados no perfil", async () => {
    const { ctx, fakes } = makeToolCtx({ reservationStatus: "confirmed" });

    const verdict = await startEarlyCheckin.guardrail!(INPUT, ctx);
    expect(verdict.allowed).toBe(true);

    await startEarlyCheckin.handler(INPUT, ctx);

    expect(fakes.reservations.setStatus).toHaveBeenCalledWith("res-1", "checked_in_digital");
    expect(fakes.guests.mergeProfile).toHaveBeenCalledWith(
      "guest-1",
      expect.objectContaining({
        earlyCheckin: expect.objectContaining({ documentNumber: INPUT.documentNumber }),
      }),
    );
  });

  it.each(["checked_in_digital", "checked_in", "checked_out", "cancelled"])(
    "guardrail bloqueia reserva %s",
    async (status) => {
      const { ctx } = makeToolCtx({ reservationStatus: status });
      const verdict = await startEarlyCheckin.guardrail!(INPUT, ctx);
      expect(verdict.allowed).toBe(false);
    },
  );

  it("schema exige horário HH:mm válido", () => {
    expect(
      startEarlyCheckin.inputSchema.safeParse({ ...INPUT, arrivalTime: "25:99" }).success,
    ).toBe(false);
  });
});
