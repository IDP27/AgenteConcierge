import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { WhatsAppAdapter } from "./whatsapp-adapter.js";
import { normalizePhone, phonesMatch, verifyWebhookSignature } from "./whatsapp/identity.js";
import type { WhatsAppMessenger } from "./whatsapp/client.js";

function makeFakeClient() {
  const calls: Array<{ kind: string; body: string; buttons?: Array<{ id: string; title: string }> }> = [];
  const client: WhatsAppMessenger = {
    sendText: vi.fn(async (_to, body) => {
      calls.push({ kind: "text", body });
    }),
    sendButtons: vi.fn(async (_to, body, buttons) => {
      calls.push({ kind: "buttons", body, buttons });
    }),
    downloadMedia: vi.fn(async () => null),
  };
  return { client, calls };
}

describe("WhatsAppAdapter", () => {
  it("bufferiza text_delta e envia mensagem única no message_end", async () => {
    const { client, calls } = makeFakeClient();
    const adapter = new WhatsAppAdapter(client, "5511999990000");

    await adapter.send({ type: "message_start", conversationId: "c1" });
    await adapter.send({ type: "text_delta", text: "Olá, " });
    await adapter.send({ type: "text_delta", text: "tudo bem?" });
    await adapter.send({ type: "message_end", messageId: "m1" });

    expect(calls).toEqual([{ kind: "text", body: "Olá, tudo bem?" }]);
  });

  it("separa em parágrafos o texto retomado depois de uma ferramenta", async () => {
    const { client, calls } = makeFakeClient();
    const adapter = new WhatsAppAdapter(client, "5511999990000");

    await adapter.send({ type: "text_delta", text: "Já salvo essas informações!" });
    await adapter.send({ type: "tool_started", toolName: "update_checkin_form" });
    await adapter.send({ type: "text_delta", text: "Perfeito, registrado!" });
    await adapter.send({ type: "message_end", messageId: "m1" });

    // Antes saía colado: "…informações!Perfeito, registrado!"
    expect(calls).toEqual([
      { kind: "text", body: "Já salvo essas informações!\n\nPerfeito, registrado!" },
    ]);
  });

  it("não insere parágrafo quando a ferramenta abre o turno (sem texto antes)", async () => {
    const { client, calls } = makeFakeClient();
    const adapter = new WhatsAppAdapter(client, "5511999990000");

    await adapter.send({ type: "tool_started", toolName: "get_room_bill" });
    await adapter.send({ type: "text_delta", text: "Aqui está o extrato." });
    await adapter.send({ type: "message_end", messageId: "m1" });

    expect(calls).toEqual([{ kind: "text", body: "Aqui está o extrato." }]);
  });

  it("rótulo do botão corta na palavra, sem cortar no meio", async () => {
    const { client, calls } = makeFakeClient();
    const adapter = new WhatsAppAdapter(client, "5511999990000");

    await adapter.send({
      type: "card",
      kind: "offer",
      data: {
        offers: [
          { id: "o1", title: "Massagem relaxante no Spa Mar Azul", priceCents: 28000 },
          { id: "o2", title: "Cesta de frutas e espumante no quarto", priceCents: 11000 },
        ],
      },
    });
    adapter.close();

    const buttons = calls[0]?.buttons ?? [];
    expect(buttons.map((b) => b.title)).toEqual(["Massagem relaxante…", "Cesta de frutas…"]);
    // O id da oferta segue no botão — é ele que o hóspede devolve ao tocar.
    expect(buttons.map((b) => b.id)).toEqual(["offer:o1", "offer:o2"]);
  });

  it("card de ofertas vira botões, preservando a ordem texto → card", async () => {
    const { client, calls } = makeFakeClient();
    const adapter = new WhatsAppAdapter(client, "5511999990000");

    await adapter.send({ type: "text_delta", text: "Separei isso para você:" });
    await adapter.send({
      type: "card",
      kind: "offer",
      data: {
        offers: [
          { id: "o1", title: "Massagem relaxante no Spa Mar Azul", priceCents: 28000 },
          { id: "o2", title: "Jantar romântico", priceCents: 45000 },
        ],
      },
    });
    await adapter.send({ type: "text_delta", text: "Quer que eu reserve?" });
    await adapter.send({ type: "message_end", messageId: "m1" });

    expect(calls.map((c) => c.kind)).toEqual(["text", "buttons", "text"]);
    expect(calls[1]?.body).toContain("R$ 280,00");
    // Título de botão respeita o limite de 20 chars da Cloud API:
    expect(calls[1]?.buttons?.every((b) => b.title.length <= 20)).toBe(true);
    expect(calls[1]?.buttons?.[0]?.id).toBe("offer:o1");
  });

  it("card de avaliação vira pedido de nota em texto (sem estrelas no WhatsApp)", async () => {
    const { client, calls } = makeFakeClient();
    const adapter = new WhatsAppAdapter(client, "5511999990000");

    await adapter.send({ type: "card", kind: "review_prompt", data: { guestName: "Carla" } });
    await adapter.send({
      type: "card",
      kind: "review_link",
      data: { url: "https://g.page/r/resort/review", rating: 5 },
    });
    await adapter.send({ type: "message_end", messageId: "m1" });

    expect(calls[0]?.kind).toBe("text");
    expect(calls[0]?.body).toContain("De 1 a 5");
    expect(calls[1]?.body).toContain("https://g.page/r/resort/review");
  });

  it("handoff sem texto do agente (passagem direta) avisa o hóspede", async () => {
    const { client, calls } = makeFakeClient();
    const adapter = new WhatsAppAdapter(client, "5511999990000");

    await adapter.send({ type: "message_start", conversationId: "c1" });
    await adapter.send({ type: "handoff", reason: "Conversa em atendimento humano." });
    adapter.close();
    await adapter.send({ type: "message_end", messageId: "x" }); // drena a fila

    expect(calls[0]).toEqual({ kind: "text", body: "👤 Conversa em atendimento humano." });
  });

  it("erro no meio do stream: envia o parcial e a mensagem de erro", async () => {
    const { client, calls } = makeFakeClient();
    const adapter = new WhatsAppAdapter(client, "5511999990000");

    await adapter.send({ type: "text_delta", text: "Deixa eu ver..." });
    await adapter.send({ type: "error", code: "internal_error", message: "Tente novamente." });

    expect(calls.map((c) => c.kind)).toEqual(["text", "text"]);
    expect(calls[1]?.body).toContain("Tente novamente.");
  });
});

describe("identidade WhatsApp", () => {
  it("normaliza e casa telefones BR com/sem código do país", () => {
    expect(normalizePhone("+55 (11) 98888-0001")).toBe("5511988880001");
    expect(phonesMatch("+55 11 98888-0001", "5511988880001")).toBe(true);
    expect(phonesMatch("11 98888-0001", "5511988880001")).toBe(true);
    expect(phonesMatch("+55 11 98888-0001", "5511977770002")).toBe(false);
  });

  it("valida assinatura HMAC do webhook e rejeita adulteração", () => {
    const secret = "app-secret";
    const body = Buffer.from('{"entry":[]}');
    const good = "sha256=" + createHmac("sha256", secret).update(body).digest("hex");

    expect(verifyWebhookSignature(body, good, secret)).toBe(true);
    expect(verifyWebhookSignature(Buffer.from('{"entry":[1]}'), good, secret)).toBe(false);
    expect(verifyWebhookSignature(body, undefined, secret)).toBe(false);
    expect(verifyWebhookSignature(body, "sha256=deadbeef", secret)).toBe(false);
  });
});
