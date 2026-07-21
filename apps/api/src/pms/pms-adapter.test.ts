import { describe, expect, it } from "vitest";
import { parseResortSettings } from "@concierge/shared";
import type { Repos } from "../repositories/index.js";
import { pmsAdapterFor, PmsNotConfiguredError } from "./index.js";
import { SeedPmsAdapter } from "./seed-pms-adapter.js";
import { OperaAdapter } from "./opera-adapter.js";

/** Repos mínimos que o SeedPmsAdapter toca — cada teste sobrescreve o que usa. */
function fakeRepos(over: Partial<Record<string, unknown>> = {}): Repos {
  return {
    reservations: { findById: async () => null },
    companions: { listForReservation: async () => [] },
    orders: { listByReservation: async () => [] },
    ...over,
  } as unknown as Repos;
}

describe("pmsAdapterFor", () => {
  it("cai no SeedPmsAdapter por padrão (pmsProvider=seed)", () => {
    const adapter = pmsAdapterFor(parseResortSettings({}), fakeRepos());
    expect(adapter).toBeInstanceOf(SeedPmsAdapter);
    expect(adapter.provider).toBe("seed");
  });

  it("escolhe o OperaAdapter quando pmsProvider=opera_ows", () => {
    const adapter = pmsAdapterFor(parseResortSettings({ pmsProvider: "opera_ows" }), fakeRepos());
    expect(adapter).toBeInstanceOf(OperaAdapter);
    expect(adapter.provider).toBe("opera_ows");
  });
});

describe("SeedPmsAdapter", () => {
  it("getFolio consolida os pedidos da reserva (cobrado x pendente)", async () => {
    const adapter = new SeedPmsAdapter(
      fakeRepos({
        orders: {
          listByReservation: async () => [
            { items: [{ title: "Vinho", qty: 1, priceCents: 8000 }], totalCents: 8000, status: "delivered" },
            { items: [{ title: "Spa", qty: 1, priceCents: 25000 }], totalCents: 25000, status: "pending_approval" },
          ],
        },
      }),
    );

    const bill = await adapter.getFolio("res-1");

    expect(bill.chargedCents).toBe(8000);
    expect(bill.pendingCents).toBe(25000);
    expect(bill.hasPending).toBe(true);
  });

  it("getReservation deriva a composição do grupo dos companions", async () => {
    const adapter = new SeedPmsAdapter(
      fakeRepos({
        reservations: {
          findById: async () => ({
            id: "res-1",
            roomNumber: "204",
            checkIn: new Date("2026-07-20"),
            checkOut: new Date("2026-07-24"),
            status: "checked_in",
            plan: "all_inclusive",
          }),
        },
        companions: {
          listForReservation: async () => [{ isChild: true }, { isChild: false }],
        },
      }),
    );

    const r = await adapter.getReservation("res-1", "resort-1");

    expect(r).toMatchObject({ confirmationNumber: "res-1", roomNumber: "204", adults: 2, children: 1 });
  });

  it("addMaintenance devolve ref sintético marcado como seed (não foi ao OPERA)", async () => {
    const adapter = new SeedPmsAdapter(fakeRepos());
    const ref = await adapter.addMaintenance({
      roomNumber: "204",
      description: "[maintenance] infiltração no teto",
      reportedByGuest: true,
    });
    expect(ref.isSeed).toBe(true);
    expect(ref.id).toBeTruthy();
  });
});

describe("OperaAdapter", () => {
  it("lança PmsNotConfiguredError enquanto a integração não existir", async () => {
    const adapter = new OperaAdapter({ provider: "opera_ows" });
    await expect(adapter.getFolio("res-1")).rejects.toBeInstanceOf(PmsNotConfiguredError);
    await expect(adapter.getReservation("res-1", "resort-1")).rejects.toBeInstanceOf(
      PmsNotConfiguredError,
    );
  });
});
