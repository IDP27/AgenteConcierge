import { describe, expect, it } from "vitest";
import { requestReview } from "./index.js";
import { makeToolCtx } from "../test-helpers.js";

describe("request_review", () => {
  it("nota alta (>= threshold) → rota pública com link, sem handoff", async () => {
    const { ctx, fakes } = makeToolCtx({ reservationStatus: "checked_out" });

    const verdict = await requestReview.guardrail!({ rating: 5 }, ctx);
    expect(verdict.allowed).toBe(true);

    const result = await requestReview.handler({ rating: 5 }, ctx);

    expect(result.output).toMatchObject({ route: "public" });
    // A URL vai no card (botão), não em texto — o modelo não deve repeti-la.
    expect(result.card).toMatchObject({
      kind: "review_link",
      data: { url: "https://g.page/r/resort-teste/review" },
    });
    expect(result.handoff).toBeUndefined();
    expect(fakes.conversations.setStatus).not.toHaveBeenCalled();
    expect(fakes.guests.mergeProfile).toHaveBeenCalledWith(
      "guest-1",
      expect.objectContaining({ lastReview: expect.objectContaining({ rating: 5, route: "public" }) }),
    );
  });

  it("nota baixa (< threshold) → rota interna, handoff e sem link público", async () => {
    const { ctx, fakes } = makeToolCtx({ reservationStatus: "checked_out" });

    const result = await requestReview.handler({ rating: 2, comment: "quarto barulhento" }, ctx);

    expect(result.output).toMatchObject({ route: "internal" });
    expect(result.output).not.toHaveProperty("publicReviewUrl");
    expect(result.handoff).toBeDefined();
    expect(fakes.conversations.setStatus).toHaveBeenCalledWith("conv-1", "needs_human");
    expect(fakes.guests.mergeProfile).toHaveBeenCalledWith(
      "guest-1",
      expect.objectContaining({
        lastReview: expect.objectContaining({ rating: 2, route: "internal", comment: "quarto barulhento" }),
      }),
    );
  });

  it.each(["confirmed", "checked_in_digital", "checked_in"])(
    "guardrail bloqueia fora do pós-estadia (%s)",
    async (status) => {
      const { ctx } = makeToolCtx({ reservationStatus: status });
      const verdict = await requestReview.guardrail!({ rating: 5 }, ctx);
      expect(verdict.allowed).toBe(false);
    },
  );

  it("schema rejeita nota fora de 1..5", () => {
    expect(requestReview.inputSchema.safeParse({ rating: 0 }).success).toBe(false);
    expect(requestReview.inputSchema.safeParse({ rating: 6 }).success).toBe(false);
    expect(requestReview.inputSchema.safeParse({ rating: 4 }).success).toBe(true);
  });
});
