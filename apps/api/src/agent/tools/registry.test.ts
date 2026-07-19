import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ToolRegistry } from "./registry.js";
import { defineTool, type ToolContext } from "./types.js";
import type { Repos } from "../../repositories/index.js";

function makeCtx() {
  const record = vi.fn().mockResolvedValue(undefined);
  const setStatus = vi.fn().mockResolvedValue(undefined);
  const ctx: ToolContext = {
    conversationId: "00000000-0000-4000-8000-000000000abc",
    resort: {
      id: "a0000000-0000-4000-8000-000000000001",
      name: "Resort Teste",
      settings: {
        orderAutoApproveLimitCents: 20000,
        maxProactiveOffersPerDay: 1,
        slaHoursByPriority: { low: 24, medium: 8, high: 2, urgent: 1 },
        timezone: "America/Sao_Paulo",
        financialKillSwitch: false,
        review: { publicUrl: "https://g.page/r/resort-teste/review", satisfactionThreshold: 4 },
      },
    },
    guest: { id: "g1", name: "Hóspede", profile: {}, lastProactiveOfferAt: null },
    reservation: {
      id: "r1",
      roomNumber: "101",
      checkIn: new Date(),
      checkOut: new Date(),
      status: "checked_in",
      plan: "all_inclusive",
    },
    now: new Date(),
    repos: {
      agentActions: { record },
      conversations: { setStatus },
    } as unknown as Repos,
  };
  return { ctx, record, setStatus };
}

const echoTool = defineTool({
  name: "echo",
  description: "devolve o valor",
  inputSchema: z.object({ value: z.string() }),
  guardrail: (input) =>
    input.value === "proibido"
      ? { allowed: false, reasonForModel: "Valor bloqueado por política" }
      : { allowed: true },
  handler: async (input) => ({
    output: { echoed: input.value },
    card: { kind: "offer", data: { value: input.value } },
  }),
});

const brokenTool = defineTool({
  name: "broken",
  description: "sempre falha",
  inputSchema: z.object({}),
  handler: async () => {
    throw new Error("boom");
  },
});

describe("ToolRegistry", () => {
  it("executa tool válida, retorna card e audita como success", async () => {
    const { ctx, record } = makeCtx();
    const registry = new ToolRegistry().register(echoTool);

    const result = await registry.execute("echo", { value: "oi" }, ctx);

    expect(result.ok).toBe(true);
    expect(result.outputForModel).toEqual({ echoed: "oi" });
    expect(result.card).toEqual({ kind: "offer", data: { value: "oi" } });
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ toolName: "echo", status: "success" }),
    );
  });

  it("input inválido → is_error para o modelo e auditoria de erro", async () => {
    const { ctx, record } = makeCtx();
    const registry = new ToolRegistry().register(echoTool);

    const result = await registry.execute("echo", { value: 42 }, ctx);

    expect(result.ok).toBe(false);
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ status: "error" }));
  });

  it("guardrail bloqueia sem virar erro e audita blocked_by_guardrail", async () => {
    const { ctx, record } = makeCtx();
    const registry = new ToolRegistry().register(echoTool);

    const result = await registry.execute("echo", { value: "proibido" }, ctx);

    expect(result.ok).toBe(true); // não é erro — o modelo comunica o motivo
    expect(result.outputForModel).toEqual({
      allowed: false,
      reason: "Valor bloqueado por política",
    });
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ status: "blocked_by_guardrail" }),
    );
  });

  it("handler que lança não quebra a conversa: vira is_error auditado", async () => {
    const { ctx, record } = makeCtx();
    const registry = new ToolRegistry().register(brokenTool);

    const result = await registry.execute("broken", {}, ctx);

    expect(result.ok).toBe(false);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ status: "error", output: { message: "boom" } }),
    );
  });

  it("tool desconhecida → is_error auditado", async () => {
    const { ctx, record } = makeCtx();
    const registry = new ToolRegistry();

    const result = await registry.execute("nao_existe", {}, ctx);

    expect(result.ok).toBe(false);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ toolName: "nao_existe", status: "error" }),
    );
  });

  it("gera definições Anthropic com JSON Schema de objeto", () => {
    const registry = new ToolRegistry().register(echoTool);
    const [tool] = registry.toAnthropicTools();
    expect(tool?.name).toBe("echo");
    expect(tool?.input_schema).toMatchObject({
      type: "object",
      properties: { value: { type: "string" } },
    });
  });
});
