import { describe, expect, it } from "vitest";
import { applyGuestProfileBoost, inferPriority, computeSlaDueAt } from "./severity.js";
import { createServiceOrder } from "./index.js";
import { makeToolCtx } from "../test-helpers.js";

describe("inferPriority (palavras-chave de severidade)", () => {
  it.each([
    ["o banheiro está alagado, tem água por todo lado", "urgent"],
    ["estou sentindo cheiro de gás no corredor", "urgent"],
    ["a fechadura quebrada, não consigo trancar a porta", "urgent"],
    ["o ar-condicionado não funciona desde ontem", "high"],
    ["o chuveiro está pingando sem parar", "high"],
    ["tem muito barulho no quarto ao lado", "high"],
    ["faltou uma toalha no banheiro do quarto", "medium"],
    ["uma sugestão: poderiam melhorar o café da manhã", "low"],
  ])("'%s' → %s", (description, expected) => {
    expect(inferPriority(description)).toBe(expected);
  });

  it("nota visual escala mesmo com texto pobre (foto de alagamento)", () => {
    // Hóspede digita pouco; a foto revela a gravidade.
    expect(inferPriority("olha isso aqui")).toBe("medium");
    expect(inferPriority("olha isso aqui", "poça d'água grande, piso todo alagado")).toBe("urgent");
  });

  it("água acumulada no piso é urgente (risco de escorregão/dano)", () => {
    // "vazamento" sozinho é high; a poça no piso vista na foto escala p/ urgent.
    expect(inferPriority("tem um vazamento no banheiro")).toBe("high");
    expect(
      inferPriority("tem um vazamento no banheiro", "poça d'água grande no piso do banheiro"),
    ).toBe("urgent");
  });
});

describe("applyGuestProfileBoost (membro do clube de férias)", () => {
  it.each([
    ["low", "high"],
    ["medium", "high"],
    ["high", "high"],
    ["urgent", "urgent"],
  ] as const)("membro do clube: %s → %s", (inferred, expected) => {
    expect(applyGuestProfileBoost(inferred, { clubMember: true })).toBe(expected);
  });

  it("não-membro mantém a prioridade inferida", () => {
    expect(applyGuestProfileBoost("medium", {})).toBe("medium");
    expect(applyGuestProfileBoost("low", { clubMember: false })).toBe("low");
  });
});

describe("computeSlaDueAt", () => {
  it("aplica as horas do settings por prioridade", () => {
    const now = new Date("2026-07-18T12:00:00Z");
    const sla = { low: 24, medium: 8, high: 2, urgent: 1 };
    expect(computeSlaDueAt(now, "urgent", sla).toISOString()).toBe("2026-07-18T13:00:00.000Z");
    expect(computeSlaDueAt(now, "low", sla).toISOString()).toBe("2026-07-19T12:00:00.000Z");
  });
});

describe("create_service_order", () => {
  it("cria OS com prioridade inferida, SLA do resort e card", async () => {
    const now = new Date("2026-07-18T12:00:00Z");
    const { ctx, fakes } = makeToolCtx({ now });

    const result = await createServiceOrder.handler(
      { category: "maintenance", description: "o ar-condicionado não funciona" },
      ctx,
    );

    expect(fakes.serviceOrders.create).toHaveBeenCalledWith(
      expect.objectContaining({
        priority: "high",
        slaDueAt: new Date("2026-07-18T14:00:00Z"), // high = 2h
      }),
    );
    expect(result.card?.kind).toBe("service_order");
  });

  it("triagem por foto: persiste visualNote e reflete no card", async () => {
    const { ctx, fakes } = makeToolCtx();

    const result = await createServiceOrder.handler(
      {
        category: "maintenance",
        description: "manda alguém ver isso",
        visualNote: "mancha de mofo escura no canto do teto do box",
      },
      ctx,
    );

    expect(fakes.serviceOrders.create).toHaveBeenCalledWith(
      expect.objectContaining({ visualNote: "mancha de mofo escura no canto do teto do box" }),
    );
    expect(result.output).toMatchObject({ hasVisualEvidence: true });
    expect((result.card?.data as { visualNote?: string }).visualNote).toContain("mofo");
  });

  it("membro do clube eleva OS medium → high (SLA mais curto)", async () => {
    const now = new Date("2026-07-18T12:00:00Z");
    const { ctx, fakes } = makeToolCtx({ now, profile: { clubMember: true } });

    await createServiceOrder.handler(
      { category: "amenities", description: "faltou uma toalha no banheiro do quarto" },
      ctx,
    );

    expect(fakes.serviceOrders.create).toHaveBeenCalledWith(
      expect.objectContaining({
        priority: "high", // seria medium sem o boost de perfil
        slaDueAt: new Date("2026-07-18T14:00:00Z"),
      }),
    );
  });
});
