import { describe, expect, it } from "vitest";
import { registerRebookingInterest } from "./index.js";
import { makeToolCtx } from "../test-helpers.js";

describe("register_rebooking_interest", () => {
  it("guardrail bloqueia fora do pós-estadia", () => {
    const { ctx } = makeToolCtx({ reservationStatus: "checked_in" });

    const verdict = registerRebookingInterest.guardrail?.({ desiredPeriod: "réveillon" }, ctx);

    expect(verdict).toMatchObject({ allowed: false });
  });

  it("pós-estadia: grava interesse estruturado no perfil do hóspede", async () => {
    const now = new Date("2026-07-18T12:00:00Z");
    const { ctx, fakes } = makeToolCtx({ reservationStatus: "checked_out", now });

    const result = await registerRebookingInterest.handler(
      { desiredPeriod: "réveillon", occasion: "aniversário de casamento", partySize: 2 },
      ctx,
    );

    expect(fakes.guests.mergeProfile).toHaveBeenCalledWith("guest-1", {
      rebookingInterest: {
        desiredPeriod: "réveillon",
        occasion: "aniversário de casamento",
        partySize: 2,
        previousReservationId: "res-1",
        at: now.toISOString(),
      },
    });
    expect(result.output).toMatchObject({ registered: true });
  });

  it("campos opcionais ausentes viram null (dado estruturado consistente)", async () => {
    const { ctx, fakes } = makeToolCtx({ reservationStatus: "checked_out" });

    await registerRebookingInterest.handler({ desiredPeriod: "julho que vem" }, ctx);

    expect(fakes.guests.mergeProfile).toHaveBeenCalledWith(
      "guest-1",
      expect.objectContaining({
        rebookingInterest: expect.objectContaining({ occasion: null, partySize: null }),
      }),
    );
  });
});
