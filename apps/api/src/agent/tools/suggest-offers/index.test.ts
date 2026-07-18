import { describe, expect, it } from "vitest";
import { suggestOffers } from "./index.js";
import { makeToolCtx } from "../test-helpers.js";

const OFFERS = [
  {
    id: "o1",
    title: "Massagem",
    description: "Spa",
    priceCents: 28000,
    tags: ["spa", "relax"],
    active: true,
  },
  {
    id: "o2",
    title: "Kids Club",
    description: "Recreação",
    priceCents: 9000,
    tags: ["kids", "family"],
    active: true,
  },
];

describe("suggest_offers", () => {
  it("anti-spam: bloqueia segunda sugestão proativa no mesmo dia", async () => {
    const now = new Date("2026-07-18T18:00:00Z");
    const { ctx } = makeToolCtx({ lastProactiveOfferAt: new Date("2026-07-18T12:00:00Z"), now });

    const verdict = await suggestOffers.guardrail!({ context: "hóspede mencionou cansaço" }, ctx);

    expect(verdict.allowed).toBe(false);
  });

  it("permite sugestão em dia diferente e marca o timestamp", async () => {
    const now = new Date("2026-07-18T18:00:00Z");
    const { ctx, fakes } = makeToolCtx({
      lastProactiveOfferAt: new Date("2026-07-16T12:00:00Z"),
      now,
      profile: { interests: ["spa"] },
    });
    fakes.offers.listActive.mockResolvedValue(OFFERS);

    const verdict = await suggestOffers.guardrail!({ context: "gancho" }, ctx);
    expect(verdict.allowed).toBe(true);

    const result = await suggestOffers.handler({ context: "gancho" }, ctx);
    const output = result.output as { suggestions: Array<{ id: string }> };

    expect(output.suggestions[0]?.id).toBe("o1"); // interesse "spa" pontua mais
    expect(fakes.guests.markProactiveOffer).toHaveBeenCalledWith("guest-1", now);
    expect(result.card?.kind).toBe("offer");
  });

  it("sem match de perfil/momento → não sugere e não gasta a cota do dia", async () => {
    const { ctx, fakes } = makeToolCtx({ profile: { interests: [] }, reservationStatus: "cancelled" });
    fakes.offers.listActive.mockResolvedValue(OFFERS);

    const result = await suggestOffers.handler({ context: "gancho" }, ctx);

    expect((result.output as { suggestions: unknown[] }).suggestions).toHaveLength(0);
    expect(fakes.guests.markProactiveOffer).not.toHaveBeenCalled();
  });
});
