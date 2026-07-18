import { vi } from "vitest";
import type { Repos } from "../../repositories/index.js";
import type { ToolContext } from "./types.js";

export interface FakeRepos {
  agentActions: { record: ReturnType<typeof vi.fn> };
  conversations: { setStatus: ReturnType<typeof vi.fn> };
  reservations: { setStatus: ReturnType<typeof vi.fn> };
  guests: { mergeProfile: ReturnType<typeof vi.fn>; markProactiveOffer: ReturnType<typeof vi.fn> };
  offers: { listActive: ReturnType<typeof vi.fn>; findManyByIds: ReturnType<typeof vi.fn> };
  orders: { create: ReturnType<typeof vi.fn> };
  serviceOrders: { create: ReturnType<typeof vi.fn> };
}

/** Contexto de tool com repos fake — cada teste sobrescreve o que precisa. */
export function makeToolCtx(overrides?: {
  reservationStatus?: string;
  lastProactiveOfferAt?: Date | null;
  profile?: Record<string, unknown>;
  now?: Date;
}): { ctx: ToolContext; fakes: FakeRepos } {
  const fakes: FakeRepos = {
    agentActions: { record: vi.fn().mockResolvedValue(undefined) },
    conversations: { setStatus: vi.fn().mockResolvedValue(undefined) },
    reservations: { setStatus: vi.fn().mockResolvedValue(undefined) },
    guests: {
      mergeProfile: vi.fn().mockResolvedValue(undefined),
      markProactiveOffer: vi.fn().mockResolvedValue(undefined),
    },
    offers: {
      listActive: vi.fn().mockResolvedValue([]),
      findManyByIds: vi.fn().mockResolvedValue([]),
    },
    orders: {
      create: vi.fn().mockImplementation(async (params: Record<string, unknown>) => ({
        id: "order-1",
        ...params,
      })),
    },
    serviceOrders: {
      create: vi.fn().mockImplementation(async (params: Record<string, unknown>) => ({
        id: "os-1",
        ...params,
      })),
    },
  };

  const ctx: ToolContext = {
    conversationId: "conv-1",
    resort: {
      id: "a0000000-0000-4000-8000-000000000001",
      name: "Resort Teste",
      settings: {
        orderAutoApproveLimitCents: 20000,
        maxProactiveOffersPerDay: 1,
        slaHoursByPriority: { low: 24, medium: 8, high: 2, urgent: 1 },
        timezone: "America/Sao_Paulo",
      },
    },
    guest: {
      id: "guest-1",
      name: "Hóspede Teste",
      profile: overrides?.profile ?? { interests: ["spa"] },
      lastProactiveOfferAt: overrides?.lastProactiveOfferAt ?? null,
    },
    reservation: {
      id: "res-1",
      roomNumber: "101",
      checkIn: new Date("2026-07-16"),
      checkOut: new Date("2026-07-20"),
      status: overrides?.reservationStatus ?? "checked_in",
      plan: "all_inclusive",
    },
    now: overrides?.now ?? new Date("2026-07-18T15:00:00Z"),
    repos: fakes as unknown as Repos,
  };

  return { ctx, fakes };
}
