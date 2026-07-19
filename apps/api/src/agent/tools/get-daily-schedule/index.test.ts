import { describe, expect, it } from "vitest";
import { getDailySchedule, weekdayFor } from "./index.js";
import { makeToolCtx } from "../test-helpers.js";

describe("weekdayFor", () => {
  it("resolve o dia da semana no fuso do resort", () => {
    // 2026-07-18 é sábado; 2026-07-20 é segunda.
    expect(weekdayFor("2026-07-18", "America/Sao_Paulo")).toBe("sat");
    expect(weekdayFor("2026-07-20", "America/Sao_Paulo")).toBe("mon");
  });
});

describe("get_daily_schedule", () => {
  // O ctx de teste usa o resort seed — a agenda real de data/agenda é lida.
  it("filtra por dia da semana e ordena por horário", async () => {
    const { ctx } = makeToolCtx();

    const result = await getDailySchedule.handler({ date: "2026-07-18" }, ctx); // sábado

    const output = result.output as { weekday: string; entries: Array<{ title: string; time: string }> };
    expect(output.weekday).toBe("sat");
    expect(output.entries.some((e) => e.title.includes("Luau"))).toBe(true); // só sábado
    const times = output.entries.map((e) => e.time);
    expect([...times].sort()).toEqual(times);
  });

  it("filtra por público kids e exclui atividades de dia errado", async () => {
    const { ctx } = makeToolCtx();

    const result = await getDailySchedule.handler({ date: "2026-07-20", audience: "kids" }, ctx); // segunda

    const output = result.output as { entries: Array<{ title: string; audience: string }> };
    expect(output.entries.length).toBeGreaterThan(0);
    expect(output.entries.every((e) => e.audience === "kids" || e.audience === "all")).toBe(true);
    expect(output.entries.some((e) => e.title.includes("Luau"))).toBe(false);
  });

  it("resort sem agenda cadastrada degrada com orientação", async () => {
    const { ctx } = makeToolCtx();
    ctx.resort.id = "00000000-0000-4000-8000-00000000nada";

    const result = await getDailySchedule.handler({}, ctx);

    expect(result.output).toMatchObject({
      entries: [],
      info: expect.stringContaining("recepção"),
    });
  });
});
