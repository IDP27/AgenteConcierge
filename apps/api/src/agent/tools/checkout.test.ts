import { describe, expect, it } from "vitest";
import { computeRoomBill } from "@concierge/shared";
import { getRoomBill } from "./get-room-bill/index.js";
import { requestCheckout } from "./request-checkout/index.js";
import { makeToolCtx } from "./test-helpers.js";

const orders = [
  { items: [{ offerId: "o1", title: "Massagem", qty: 1, priceCents: 28000 }], totalCents: 28000, status: "confirmed" as const },
  { items: [{ offerId: null, title: "Toalhas", qty: 2, priceCents: 0 }], totalCents: 0, status: "delivered" as const },
  { items: [{ offerId: "o2", title: "Jantar", qty: 1, priceCents: 45000 }], totalCents: 45000, status: "pending_approval" as const },
  { items: [{ offerId: "o3", title: "Cancelado", qty: 1, priceCents: 9000 }], totalCents: 9000, status: "cancelled" as const },
];

describe("computeRoomBill", () => {
  it("soma confirmados/entregues, separa pendentes e ignora cancelados", () => {
    const bill = computeRoomBill(orders);
    expect(bill.chargedCents).toBe(28000); // massagem; toalhas = cortesia (0)
    expect(bill.pendingCents).toBe(45000); // jantar aguardando
    expect(bill.hasPending).toBe(true);
    expect(bill.lines.map((l) => l.title)).toEqual(["Massagem", "Toalhas"]);
    expect(bill.lines.find((l) => l.title === "Cancelado")).toBeUndefined();
  });
});

describe("get_room_bill", () => {
  it("guardrail: só durante a estadia", () => {
    const { ctx } = makeToolCtx({ reservationStatus: "checked_out" });
    expect(getRoomBill.guardrail?.({}, ctx)).toMatchObject({ allowed: false });
  });

  it("devolve card room_bill com o consumo da reserva", async () => {
    const { ctx, fakes } = makeToolCtx({ reservationStatus: "checked_in" });
    fakes.orders.listByReservation.mockResolvedValue(orders);

    const result = await getRoomBill.handler({}, ctx);

    expect(fakes.orders.listByReservation).toHaveBeenCalledWith("res-1");
    expect(result.card?.kind).toBe("room_bill");
    expect(result.output).toMatchObject({ chargedCents: 28000 });
  });
});

describe("request_checkout", () => {
  it("guardrail: só quando checked_in", () => {
    const { ctx: c1 } = makeToolCtx({ reservationStatus: "checked_in_digital" });
    expect(requestCheckout.guardrail?.({ confirmedByGuest: true }, c1)).toMatchObject({
      allowed: false,
    });
    const { ctx: c2 } = makeToolCtx({ reservationStatus: "checked_in" });
    expect(requestCheckout.guardrail?.({ confirmedByGuest: true }, c2)).toMatchObject({
      allowed: true,
    });
  });

  it("pendência de aprovação bloqueia o check-out expresso (não transiciona)", async () => {
    const { ctx, fakes } = makeToolCtx({ reservationStatus: "checked_in" });
    fakes.orders.listByReservation.mockResolvedValue(orders); // tem pendente

    const result = await requestCheckout.handler({ confirmedByGuest: true }, ctx);

    expect(result.output).toMatchObject({ blocked: true });
    expect(fakes.reservations.transition).not.toHaveBeenCalled();
  });

  it("sem pendências: transiciona para checked_out e instrui a avaliação", async () => {
    const { ctx, fakes } = makeToolCtx({ reservationStatus: "checked_in" });
    fakes.orders.listByReservation.mockResolvedValue([orders[0], orders[1]]); // sem pendente

    const result = await requestCheckout.handler({ confirmedByGuest: true }, ctx);

    expect(fakes.reservations.transition).toHaveBeenCalledWith("res-1", ctx.resort.id, "checked_out");
    expect(result.output).toMatchObject({
      status: "checked_out",
      info: expect.stringContaining("ask_review_rating"),
    });
  });
});
