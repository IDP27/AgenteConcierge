import { describe, expect, it } from "vitest";
import { askReviewRating } from "./index.js";
import { requestReview } from "../request-review/index.js";
import { makeToolCtx } from "../test-helpers.js";

describe("ask_review_rating", () => {
  it("pós-estadia sem avaliação prévia: emite o card de estrelas", async () => {
    const { ctx } = makeToolCtx({ reservationStatus: "checked_out" });

    expect(askReviewRating.guardrail?.({}, ctx)).toMatchObject({ allowed: true });
    const result = await askReviewRating.handler({}, ctx);
    expect(result.card?.kind).toBe("review_prompt");
  });

  it("guardrail bloqueia durante a estadia", () => {
    const { ctx } = makeToolCtx({ reservationStatus: "checked_in" });
    expect(askReviewRating.guardrail?.({}, ctx)).toMatchObject({ allowed: false });
  });

  it("guardrail bloqueia quem já avaliou (não pede duas vezes)", () => {
    const { ctx } = makeToolCtx({
      reservationStatus: "checked_out",
      profile: { lastReview: { rating: 5, at: "2026-07-19T12:00:00Z" } },
    });
    expect(askReviewRating.guardrail?.({}, ctx)).toMatchObject({ allowed: false });
  });
});

describe("request_review — card de link público", () => {
  it("nota alta emite card com a URL do resort", async () => {
    const { ctx } = makeToolCtx({ reservationStatus: "checked_out" });

    const result = await requestReview.handler({ rating: 5 }, ctx);

    expect(result.card).toMatchObject({
      kind: "review_link",
      data: { url: ctx.resort.settings.review.publicUrl, rating: 5 },
    });
  });

  it("nota baixa NÃO emite card de link público (protege a nota pública)", async () => {
    const { ctx } = makeToolCtx({ reservationStatus: "checked_out" });

    const result = await requestReview.handler({ rating: 2 }, ctx);

    expect(result.card).toBeUndefined();
    expect(result.handoff).toBeDefined();
  });
});
