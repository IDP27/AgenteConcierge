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
    await adapter.close();

    const buttons = calls[0]?.buttons ?? [];
    expect(buttons.map((b) => b.title)).toEqual(["Massagem relaxante…", "Cesta de frutas…"]);
    // O id da oferta segue no botão — é ele que o hóspede devolve ao tocar.
    expect(buttons.map((b) => b.id)).toEqual(["offer:o1", "offer:o2"]);
  });

  it("funde o texto de abertura na mensagem do card (uma notificação, não duas)", async () => {
    const { client, calls } = makeFakeClient();
    const adapter = new WhatsAppAdapter(client, "5511999990000");

    await adapter.send({ type: "text_delta", text: "Deixa eu verificar o extrato!" });
    await adapter.send({
      type: "card",
      kind: "room_bill",
      data: { lines: [], chargedCents: 0, pendingCents: 0, hasPending: false },
    });
    await adapter.close();

    // Antes: 2 mensagens (2 buzzes no celular) para uma ideia só.
    expect(calls).toHaveLength(1);
    expect(calls[0]?.body).toBe("Deixa eu verificar o extrato!\n\nSua conta está zerada — nenhum consumo lançado.");
  });

  it("card sem representação não força o texto a virar mensagem solta", async () => {
    const { client, calls } = makeFakeClient();
    const adapter = new WhatsAppAdapter(client, "5511999990000");

    await adapter.send({ type: "text_delta", text: "Abrindo sua OS." });
    // service_order não tem card próprio no WhatsApp.
    await adapter.send({
      type: "card",
      kind: "service_order",
      data: { id: "os1", category: "maintenance", priority: "high" },
    });
    await adapter.send({ type: "text_delta", text: " Equipe acionada!" });
    await adapter.send({ type: "message_end", messageId: "m1" });

    expect(calls).toEqual([{ kind: "text", body: "Abrindo sua OS. Equipe acionada!" }]);
  });

  it("corpo lista só o que é tocável e avisa quantas opções sobraram", async () => {
    const { client, calls } = makeFakeClient();
    const adapter = new WhatsAppAdapter(client, "5511999990000");

    await adapter.send({
      type: "card",
      kind: "offer",
      data: {
        offers: Array.from({ length: 8 }, (_, i) => ({
          id: `o${i}`,
          title: `Oferta ${i}`,
          priceCents: 10000 + i,
        })),
      },
    });
    await adapter.close();

    const [msg] = calls;
    // Antes: corpo com 8 itens e só 3 botões — 5 opções sem como tocar.
    expect(msg?.buttons).toHaveLength(3);
    expect(msg?.body).toContain("Oferta 0");
    expect(msg?.body).toContain("Oferta 2");
    expect(msg?.body).not.toContain("Oferta 3");
    expect(msg?.body).toContain("e mais 5 opções");
  });

  it("sem sobra de ofertas, não adiciona o aviso", async () => {
    const { client, calls } = makeFakeClient();
    const adapter = new WhatsAppAdapter(client, "5511999990000");

    await adapter.send({
      type: "card",
      kind: "offer",
      data: { offers: [{ id: "o1", title: "Spa", priceCents: 28000 }] },
    });
    await adapter.close();

    expect(calls[0]?.body).not.toContain("e mais");
  });

  it("card de ofertas vira botões, com o texto de abertura na mesma mensagem", async () => {
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

    // Uma mensagem só: o texto escrito depois do card entra nela, acima da
    // lista. Antes saíam duas, e a segunda chegava depois dos preços.
    expect(calls.map((c) => c.kind)).toEqual(["buttons"]);
    expect(calls[0]?.body).toContain("Separei isso para você:");
    expect(calls[0]?.body).toContain("Quer que eu reserve?");
    expect(calls[0]?.body).toContain("R$ 280,00");
    // Todo o texto precede a lista de preços.
    expect(calls[0]?.body.indexOf("Quer que eu reserve?")).toBeLessThan(
      calls[0]?.body.indexOf("R$ 280,00") ?? -1,
    );
    // Título de botão respeita o limite de 20 chars da Cloud API:
    expect(calls[0]?.buttons?.every((b) => b.title.length <= 20)).toBe(true);
    expect(calls[0]?.buttons?.[0]?.id).toBe("offer:o1");
  });

  it("fecho do check-in: o anúncio vem antes das ofertas, não depois", async () => {
    const { client, calls } = makeFakeClient();
    const adapter = new WhatsAppAdapter(client, "5511999990000");

    // Sequência real da jornada: o agente chamou as DUAS ferramentas antes de
    // escrever, então o card foi emitido com o buffer ainda vazio.
    await adapter.send({ type: "tool_started", toolName: "complete_early_checkin" });
    await adapter.send({ type: "tool_started", toolName: "suggest_offers" });
    await adapter.send({
      type: "card",
      kind: "offer",
      data: { offers: [{ id: "o1", title: "Massagem no Spa", priceCents: 28000 }] },
    });
    await adapter.send({
      type: "text_delta",
      text: "Check-in concluído! Será lançada a taxa ambiental: R$ 32,00.",
    });
    await adapter.send({ type: "message_end", messageId: "m1" });

    // Antes: o hóspede recebia a lista de preços e SÓ DEPOIS descobria que o
    // check-in fechou e que havia uma taxa — a divulgação chegava atrasada.
    expect(calls).toHaveLength(1);
    const body = calls[0]?.body ?? "";
    expect(body.indexOf("R$ 32,00")).toBeGreaterThanOrEqual(0);
    expect(body.indexOf("R$ 32,00")).toBeLessThan(body.indexOf("Massagem no Spa"));
  });

  it("dois cards no mesmo turno preservam a ordem entre si", async () => {
    const { client, calls } = makeFakeClient();
    const adapter = new WhatsAppAdapter(client, "5511999990000");

    await adapter.send({ type: "card", kind: "review_prompt", data: { guestName: "Carla" } });
    await adapter.send({
      type: "card",
      kind: "review_link",
      data: { url: "https://g.page/r/resort/review", rating: 5 },
    });
    await adapter.send({ type: "text_delta", text: "Obrigado pelo retorno!" });
    await adapter.send({ type: "message_end", messageId: "m1" });

    expect(calls).toHaveLength(2);
    expect(calls[0]?.body).toContain("De 1 a 5");
    // O texto final acompanha o último card, sem virar uma terceira mensagem.
    expect(calls[1]?.body).toContain("Obrigado pelo retorno!");
    expect(calls[1]?.body).toContain("https://g.page/r/resort/review");
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
    await adapter.close();
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
