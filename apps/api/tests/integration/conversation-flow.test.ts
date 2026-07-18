/**
 * Integração: conversa → agent loop → tool call → persistência → resposta.
 * Anthropic API mockada (fluxos determinísticos); Postgres REAL (docker-compose).
 * Fixtures próprias com ids aleatórios — não toca nos dados do seed.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { AgentEvent } from "@concierge/shared";

// --- Mock da Anthropic API (hoisted antes dos imports do service) ---
const streamQueue: Array<() => FakeStream> = [];
vi.mock("../../src/lib/anthropic.js", () => ({
  anthropic: {
    messages: {
      stream: vi.fn(() => {
        const next = streamQueue.shift();
        if (!next) throw new Error("streamQueue vazia — teste mal roteirizado");
        return next();
      }),
    },
  },
}));

import { prisma } from "../../src/lib/prisma.js";
import { conversationService } from "../../src/services/conversation-service.js";
import type { ChannelAdapter } from "../../src/channels/channel-adapter.js";

interface FakeStream {
  [Symbol.asyncIterator](): AsyncIterator<unknown>;
  finalMessage(): Promise<unknown>;
}

/** Stream falso no formato do SDK: deltas de texto + finalMessage. */
function fakeStream(textDeltas: string[], final: { stop_reason: string; content: unknown[] }): FakeStream {
  return {
    async *[Symbol.asyncIterator]() {
      for (const text of textDeltas) {
        yield { type: "content_block_delta", delta: { type: "text_delta", text } };
      }
    },
    finalMessage: async () => final,
  };
}

class CollectingAdapter implements ChannelAdapter {
  events: AgentEvent[] = [];
  closed = false;
  send(event: AgentEvent) {
    this.events.push(event);
  }
  close() {
    this.closed = true;
  }
}

// --- Fixtures isoladas ---
const resortId = randomUUID();
const guestId = randomUUID();
const reservationId = randomUUID();
let conversationId: string;
const auth = { resortId, guestId, reservationId };

beforeAll(async () => {
  await prisma.resort.create({
    data: {
      id: resortId,
      name: "Resort Integração",
      settings: {
        orderAutoApproveLimitCents: 20000,
        maxProactiveOffersPerDay: 1,
        slaHoursByPriority: { low: 24, medium: 8, high: 2, urgent: 1 },
        timezone: "America/Sao_Paulo",
      },
    },
  });
  await prisma.guest.create({
    data: { id: guestId, resortId, name: "Hóspede Integração", profile: { interests: ["spa"] } },
  });
  await prisma.reservation.create({
    data: {
      id: reservationId,
      resortId,
      guestId,
      roomNumber: "999",
      checkIn: new Date(Date.now() - 24 * 3600 * 1000),
      checkOut: new Date(Date.now() + 24 * 3600 * 1000),
      status: "checked_in",
      plan: "all_inclusive",
      magicToken: `tok-test-${randomUUID()}`,
    },
  });
});

beforeEach(async () => {
  streamQueue.length = 0;
  const conversation = await prisma.conversation.create({ data: { resortId, guestId } });
  conversationId = conversation.id;
});

afterAll(async () => {
  // Ordem respeita as FKs; conversas/mensagens/ações caem em cascata.
  await prisma.conversation.deleteMany({ where: { resortId } });
  await prisma.order.deleteMany({ where: { resortId } });
  await prisma.serviceOrder.deleteMany({ where: { resortId } });
  await prisma.offer.deleteMany({ where: { resortId } });
  await prisma.reservation.deleteMany({ where: { resortId } });
  await prisma.guest.deleteMany({ where: { resortId } });
  await prisma.resort.delete({ where: { id: resortId } });
  await prisma.$disconnect();
});

describe("fluxo conversa → tool call → persistência → resposta", () => {
  it("pedido de cortesia: tool_use create_order executa, persiste e responde", async () => {
    // Rodada 1: modelo decide chamar create_order (toalhas, cortesia).
    streamQueue.push(() =>
      fakeStream([], {
        stop_reason: "tool_use",
        content: [
          { type: "text", text: "Claro, já providencio!" },
          {
            type: "tool_use",
            id: "toolu_test_1",
            name: "create_order",
            input: { items: [{ title: "Toalhas extras", qty: 2 }] },
          },
        ],
      }),
    );
    // Rodada 2: modelo confirma para o hóspede.
    streamQueue.push(() =>
      fakeStream(["Prontinho! ", "Suas toalhas chegam em instantes."], {
        stop_reason: "end_turn",
        content: [{ type: "text", text: "Prontinho! Suas toalhas chegam em instantes." }],
      }),
    );

    const adapter = new CollectingAdapter();
    await conversationService.handleGuestMessage({
      auth,
      conversationId,
      content: "Pode mandar 2 toalhas extras no quarto?",
      adapter,
    });

    // Eventos do canal na ordem esperada
    const types = adapter.events.map((e) => e.type);
    expect(types[0]).toBe("message_start");
    expect(types).toContain("tool_started");
    expect(types).toContain("card");
    expect(types[types.length - 1]).toBe("message_end");
    expect(adapter.closed).toBe(true);

    // Persistência: pedido criado (cortesia → confirmed, total 0)
    const order = await prisma.order.findFirst({ where: { resortId } });
    expect(order?.status).toBe("confirmed");
    expect(order?.totalCents).toBe(0);

    // Trilha de auditoria
    const action = await prisma.agentAction.findFirst({
      where: { conversationId, toolName: "create_order" },
    });
    expect(action?.status).toBe("success");

    // Mensagens persistidas (guest + agente com o texto final)
    const messages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
    });
    expect(messages.map((m) => m.role)).toEqual(["guest", "agent"]);
    expect(messages[1]?.content).toContain("toalhas chegam");
  });

  it("pedido caro: guardrail financeiro → pending_approval na fila humana", async () => {
    const offer = await prisma.offer.create({
      data: {
        resortId,
        title: "Jantar de teste",
        description: "Caro",
        priceCents: 45000,
        tags: ["food"],
        active: true,
      },
    });
    streamQueue.push(() =>
      fakeStream([], {
        stop_reason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: "toolu_test_2",
            name: "create_order",
            input: { items: [{ offerId: offer.id, qty: 1 }] },
          },
        ],
      }),
    );
    streamQueue.push(() =>
      fakeStream(["Pedido enviado para confirmação da equipe!"], {
        stop_reason: "end_turn",
        content: [{ type: "text", text: "Pedido enviado para confirmação da equipe!" }],
      }),
    );

    const adapter = new CollectingAdapter();
    await conversationService.handleGuestMessage({
      auth,
      conversationId,
      content: "Quero reservar o jantar de teste",
      adapter,
    });

    const order = await prisma.order.findFirst({
      where: { resortId, totalCents: 45000 },
    });
    expect(order?.status).toBe("pending_approval");

    const card = adapter.events.find((e) => e.type === "card");
    expect(card).toBeDefined();
  });

  it("heurística de handoff: frustração → needs_human sem chamar a Anthropic", async () => {
    const adapter = new CollectingAdapter();
    await conversationService.handleGuestMessage({
      auth,
      conversationId,
      content: "Isso é um absurdo, quero falar com um atendente!",
      adapter,
    });

    const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
    expect(conversation?.status).toBe("needs_human");
    expect(adapter.events.some((e) => e.type === "handoff")).toBe(true);
    expect(streamQueue.length).toBe(0); // nenhuma chamada ao modelo consumida/esperada
  });

  it("Anthropic fora do ar: conversa degrada com evento de erro, sem exceção", async () => {
    streamQueue.push(() => {
      throw new Error("ECONNREFUSED simulado");
    });

    const adapter = new CollectingAdapter();
    await conversationService.handleGuestMessage({
      auth,
      conversationId,
      content: "Qual o horário do café?",
      adapter,
    });

    const error = adapter.events.find((e) => e.type === "error");
    expect(error).toBeDefined();
    expect(adapter.closed).toBe(true);

    // Mensagem do hóspede foi persistida mesmo com a falha do modelo
    const messages = await prisma.message.findMany({ where: { conversationId } });
    expect(messages.some((m) => m.role === "guest")).toBe(true);
  });

  it("tool que falha vira is_error auditado e o modelo se recupera", async () => {
    // input inválido (qty 0) → registry devolve is_error; modelo pede desculpas.
    streamQueue.push(() =>
      fakeStream([], {
        stop_reason: "tool_use",
        content: [
          {
            type: "tool_use",
            id: "toolu_test_3",
            name: "create_order",
            input: { items: [{ title: "x", qty: 0 }] },
          },
        ],
      }),
    );
    streamQueue.push(() =>
      fakeStream(["Tive um problema com o pedido, vou verificar com a equipe."], {
        stop_reason: "end_turn",
        content: [{ type: "text", text: "Tive um problema com o pedido, vou verificar com a equipe." }],
      }),
    );

    const adapter = new CollectingAdapter();
    await conversationService.handleGuestMessage({
      auth,
      conversationId,
      content: "quero um pedido estranho",
      adapter,
    });

    const action = await prisma.agentAction.findFirst({
      where: { conversationId, toolName: "create_order" },
    });
    expect(action?.status).toBe("error");
    expect(adapter.events.at(-1)?.type).toBe("message_end"); // conversa seguiu normal
  });
});
