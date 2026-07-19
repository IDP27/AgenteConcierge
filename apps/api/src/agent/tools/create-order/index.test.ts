import { describe, expect, it } from "vitest";
import { createOrder } from "./index.js";
import { makeToolCtx } from "../test-helpers.js";

const OFFER = {
  id: "d0000000-0000-4000-8000-000000000001",
  title: "Massagem",
  description: "Spa",
  priceCents: 28000,
  tags: ["spa"],
  active: true,
};

describe("create_order", () => {
  it("preço vem do catálogo, nunca do modelo — total acima do limite → pending_approval", async () => {
    const { ctx, fakes } = makeToolCtx();
    fakes.offers.findManyByIds.mockResolvedValue([OFFER]);

    const result = await createOrder.handler(
      { items: [{ offerId: OFFER.id, qty: 1 }] },
      ctx,
    );

    expect(fakes.orders.create).toHaveBeenCalledWith(
      expect.objectContaining({ totalCents: 28000, status: "pending_approval" }),
    );
    expect(result.card?.kind).toBe("order");
    expect((result.output as { status: string }).status).toBe("pending_approval");
  });

  it("total dentro do limite → confirmed", async () => {
    const { ctx, fakes } = makeToolCtx();
    fakes.offers.findManyByIds.mockResolvedValue([{ ...OFFER, priceCents: 9000 }]);

    await createOrder.handler({ items: [{ offerId: OFFER.id, qty: 2 }] }, ctx);

    expect(fakes.orders.create).toHaveBeenCalledWith(
      expect.objectContaining({ totalCents: 18000, status: "confirmed" }),
    );
  });

  it("cortesia sem offerId tem preço zero (toalhas)", async () => {
    const { ctx, fakes } = makeToolCtx();

    await createOrder.handler({ items: [{ title: "Toalhas extras", qty: 2 }] }, ctx);

    expect(fakes.orders.create).toHaveBeenCalledWith(
      expect.objectContaining({ totalCents: 0, status: "confirmed" }),
    );
  });

  it("offerId inexistente no resort → erro orientando o modelo (sem criar pedido)", async () => {
    const { ctx, fakes } = makeToolCtx();
    fakes.offers.findManyByIds.mockResolvedValue([]);

    const result = await createOrder.handler(
      { items: [{ offerId: "d0000000-0000-4000-8000-00000000dead", qty: 1 }] },
      ctx,
    );

    expect(fakes.orders.create).not.toHaveBeenCalled();
    expect((result.output as { error?: string }).error).toMatch(/não encontrada/);
  });

  it("guardrail: pedidos só durante a estadia", async () => {
    const { ctx } = makeToolCtx({ reservationStatus: "checked_out" });
    const verdict = await createOrder.guardrail!({ items: [{ title: "x", qty: 1 }] }, ctx);
    expect(verdict.allowed).toBe(false);
  });

  it("guardrail: kill switch financeiro bloqueia qualquer pedido, mesmo na estadia", async () => {
    const { ctx } = makeToolCtx({ reservationStatus: "checked_in", financialKillSwitch: true });
    const verdict = await createOrder.guardrail!({ items: [{ title: "x", qty: 1 }] }, ctx);
    expect(verdict.allowed).toBe(false);
    if (!verdict.allowed) expect(verdict.reasonForModel).toContain("suspensos");
  });
});
