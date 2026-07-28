import { describe, expect, it } from "vitest";
import { SimulatorWhatsAppClient } from "./simulator-client.js";
import { WhatsAppAdapter } from "../whatsapp-adapter.js";

describe("SimulatorWhatsAppClient", () => {
  it("captura o texto em vez de enviar à Meta", async () => {
    const client = new SimulatorWhatsAppClient();
    await client.sendText("5511999999999", "Olá!");
    expect(client.sent).toEqual([{ kind: "text", body: "Olá!" }]);
  });

  it("trunca o título do botão em 20 chars, como a Cloud API", async () => {
    const client = new SimulatorWhatsAppClient();
    await client.sendButtons("5511999999999", "Escolha:", [
      { id: "offer:1", title: "Jantar romântico pé na areia" },
    ]);
    const [msg] = client.sent;
    expect(msg).toMatchObject({ kind: "buttons" });
    // O simulador precisa MOSTRAR o corte — é o bug que ele existe para revelar.
    expect((msg as { buttons: Array<{ title: string }> }).buttons[0]?.title).toBe(
      "Jantar romântico pé ",
    );
  });

  it("limita a 3 botões (resto é descartado pela Cloud API)", async () => {
    const client = new SimulatorWhatsAppClient();
    await client.sendButtons(
      "5511999999999",
      "Opções:",
      Array.from({ length: 5 }, (_, i) => ({ id: `o${i}`, title: `Oferta ${i}` })),
    );
    expect((client.sent[0] as { buttons: unknown[] }).buttons).toHaveLength(3);
  });

  it("devolve a mídia injetada (foto do hóspede) em downloadMedia", async () => {
    const client = new SimulatorWhatsAppClient({ base64: "abc", mediaType: "image/jpeg" });
    await expect(client.downloadMedia()).resolves.toEqual({
      base64: "abc",
      mediaType: "image/jpeg",
    });
  });

  it("sem mídia injetada, downloadMedia devolve null", async () => {
    await expect(new SimulatorWhatsAppClient().downloadMedia()).resolves.toBeNull();
  });
});

describe("WhatsAppAdapter + simulador (renderização que o hóspede vê)", () => {
  it("card de chave vira texto com código, não card rico", async () => {
    const client = new SimulatorWhatsAppClient();
    const adapter = new WhatsAppAdapter(client, "5511999999999");

    await adapter.send({
      type: "card",
      kind: "room_key",
      data: { roomNumber: "204", code: "483035", expiresAt: "", isMock: true },
    });
    adapter.close();

    expect(client.sent[0]).toMatchObject({ kind: "text" });
    expect((client.sent[0] as { body: string }).body).toContain("204");
    expect((client.sent[0] as { body: string }).body).toContain("483035");
  });

  it("extrato vira lista de texto com o total", async () => {
    const client = new SimulatorWhatsAppClient();
    const adapter = new WhatsAppAdapter(client, "5511999999999");

    await adapter.send({
      type: "card",
      kind: "room_bill",
      data: {
        lines: [{ title: "Jantar", qty: 2, totalCents: 90000 }],
        chargedCents: 90000,
        pendingCents: 0,
        hasPending: false,
      },
    });
    adapter.close();

    const body = (client.sent[0] as { body: string }).body;
    expect(body).toContain("2× Jantar");
    expect(body).toContain("R$ 900,00");
  });

  it("texto é bufferizado e sai inteiro (WhatsApp não streama)", async () => {
    const client = new SimulatorWhatsAppClient();
    const adapter = new WhatsAppAdapter(client, "5511999999999");

    await adapter.send({ type: "text_delta", text: "Olá, " });
    await adapter.send({ type: "text_delta", text: "Bruno!" });
    expect(client.sent).toHaveLength(0); // nada saiu ainda
    await adapter.send({ type: "message_end", messageId: "m1" });

    expect(client.sent).toEqual([{ kind: "text", body: "Olá, Bruno!" }]);
  });
});
