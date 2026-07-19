import { describe, expect, it } from "vitest";
import { muteOffers } from "./index.js";
import { suggestOffers } from "../suggest-offers/index.js";
import { makeToolCtx } from "../test-helpers.js";

describe("mute_offers", () => {
  it("silencia: grava offersMuted no perfil do hóspede", async () => {
    const { ctx, fakes } = makeToolCtx();

    const result = await muteOffers.handler({ muted: true }, ctx);

    expect(fakes.guests.mergeProfile).toHaveBeenCalledWith("guest-1", { offersMuted: true });
    expect(result.output).toMatchObject({ offersMuted: true });
  });

  it("reativa: offersMuted volta a false", async () => {
    const { ctx, fakes } = makeToolCtx({ profile: { offersMuted: true } });

    await muteOffers.handler({ muted: false }, ctx);

    expect(fakes.guests.mergeProfile).toHaveBeenCalledWith("guest-1", { offersMuted: false });
  });
});

describe("suggest_offers respeita o opt-out", () => {
  it("guardrail bloqueia sugestão proativa para hóspede silenciado", () => {
    const { ctx } = makeToolCtx({ profile: { offersMuted: true } });

    const verdict = suggestOffers.guardrail?.({ context: "hóspede comentou cansaço" }, ctx);

    expect(verdict).toMatchObject({ allowed: false });
  });

  it("sem opt-out, guardrail segue liberando (anti-spam à parte)", () => {
    const { ctx } = makeToolCtx({ profile: { interests: ["spa"] } });

    const verdict = suggestOffers.guardrail?.({ context: "hóspede comentou cansaço" }, ctx);

    expect(verdict).toMatchObject({ allowed: true });
  });
});
