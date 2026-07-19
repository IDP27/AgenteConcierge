import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ServiceOrder } from "@prisma/client";
import { serviceRecoveryService } from "./service-recovery-service.js";
import { repos } from "../repositories/index.js";

vi.mock("../repositories/index.js", () => ({
  repos: {
    reservations: { findById: vi.fn() },
    conversations: { findOrCreateOpen: vi.fn(), addMessage: vi.fn() },
    orders: { create: vi.fn() },
    agentActions: { record: vi.fn() },
  },
}));

const mocked = vi.mocked(repos, { partial: true }) as unknown as {
  reservations: { findById: ReturnType<typeof vi.fn> };
  conversations: {
    findOrCreateOpen: ReturnType<typeof vi.fn>;
    addMessage: ReturnType<typeof vi.fn>;
  };
  orders: { create: ReturnType<typeof vi.fn> };
  agentActions: { record: ReturnType<typeof vi.fn> };
};

function makeServiceOrder(priority: ServiceOrder["priority"]): ServiceOrder {
  return {
    id: "os-1",
    resortId: "resort-1",
    reservationId: "res-1",
    category: "maintenance",
    description: "ar-condicionado não funciona",
    priority,
    status: "resolved",
    slaDueAt: new Date(),
    resolvedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  } as ServiceOrder;
}

describe("serviceRecoveryService.followUpOnResolvedServiceOrder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocked.reservations.findById.mockResolvedValue({ id: "res-1", guestId: "guest-1" });
    mocked.conversations.findOrCreateOpen.mockResolvedValue({ id: "conv-1" });
  });

  it("posta follow-up de satisfação na conversa do hóspede", async () => {
    await serviceRecoveryService.followUpOnResolvedServiceOrder(makeServiceOrder("medium"));

    expect(mocked.conversations.addMessage).toHaveBeenCalledWith(
      "conv-1",
      "agent",
      expect.stringContaining("Ficou tudo resolvido?"),
    );
    // OS medium: sem gesto de cortesia
    expect(mocked.orders.create).not.toHaveBeenCalled();
    expect(mocked.agentActions.record).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: "service_recovery_follow_up",
        output: { courtesyOffered: false },
      }),
    );
  });

  it("OS grave (high/urgent) inclui gesto de cortesia R$0 confirmado", async () => {
    await serviceRecoveryService.followUpOnResolvedServiceOrder(makeServiceOrder("high"));

    expect(mocked.orders.create).toHaveBeenCalledWith(
      expect.objectContaining({
        totalCents: 0,
        status: "confirmed",
        items: [expect.objectContaining({ priceCents: 0 })],
      }),
    );
    expect(mocked.conversations.addMessage).toHaveBeenCalledWith(
      "conv-1",
      "agent",
      expect.stringContaining("cortesia"),
    );
  });

  it("reserva inexistente: não posta nada e não lança erro", async () => {
    mocked.reservations.findById.mockResolvedValue(null);

    await expect(
      serviceRecoveryService.followUpOnResolvedServiceOrder(makeServiceOrder("high")),
    ).resolves.toBeUndefined();
    expect(mocked.conversations.addMessage).not.toHaveBeenCalled();
    expect(mocked.orders.create).not.toHaveBeenCalled();
  });
});
