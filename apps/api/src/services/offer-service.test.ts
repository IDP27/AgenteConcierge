import { beforeEach, describe, expect, it, vi } from "vitest";
import { offerService } from "./offer-service.js";
import { prisma } from "../lib/prisma.js";
import { repos } from "../repositories/index.js";

vi.mock("../lib/prisma.js", () => ({
  prisma: { agentAction: { findMany: vi.fn() } },
}));
vi.mock("../repositories/index.js", () => ({
  repos: { offers: { listAll: vi.fn() } },
}));

const mockedPrisma = vi.mocked(prisma, { partial: true }) as unknown as {
  agentAction: { findMany: ReturnType<typeof vi.fn> };
};
const mockedRepos = vi.mocked(repos, { partial: true }) as unknown as {
  offers: { listAll: ReturnType<typeof vi.fn> };
};

describe("offerService.listWithStats", () => {
  beforeEach(() => vi.clearAllMocks());

  it("conta sugeridas e aceitas por oferta a partir da trilha de auditoria", async () => {
    mockedRepos.offers.listAll.mockResolvedValue([
      { id: "off-spa", title: "Spa", active: true },
      { id: "off-din", title: "Jantar", active: true },
      { id: "off-new", title: "Nova", active: false },
    ]);
    mockedPrisma.agentAction.findMany
      // suggest_offers: spa sugerida 2x, jantar 1x
      .mockResolvedValueOnce([
        { output: { suggestions: [{ id: "off-spa" }, { id: "off-din" }] } },
        { output: { suggestions: [{ id: "off-spa" }] } },
      ])
      // create_order: spa aceita 1x (jantar nenhuma)
      .mockResolvedValueOnce([
        { output: { items: [{ offerId: "off-spa" }, { offerId: null }] } },
      ]);

    const result = await offerService.listWithStats("resort-1");

    expect(result.find((o) => o.id === "off-spa")).toMatchObject({
      suggestedCount: 2,
      acceptedCount: 1,
    });
    expect(result.find((o) => o.id === "off-din")).toMatchObject({
      suggestedCount: 1,
      acceptedCount: 0,
    });
    // Oferta sem histórico zera os contadores (não some da lista).
    expect(result.find((o) => o.id === "off-new")).toMatchObject({
      suggestedCount: 0,
      acceptedCount: 0,
    });
  });
});
