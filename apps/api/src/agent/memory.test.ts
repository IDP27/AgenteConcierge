import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { buildContextMessage, withImageOnLastGuestMessage } from "./memory.js";

const image = { base64: "aGVsbG8=", mediaType: "image/jpeg" as const };

describe("withImageOnLastGuestMessage (OCR multimodal)", () => {
  it("anexa a imagem à última mensagem do hóspede, preservando o texto", () => {
    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: "<contexto-da-conversa>...</contexto-da-conversa>" },
      { role: "user", content: "quero fazer o check-in" },
      { role: "assistant", content: "Claro! Me envia uma foto do documento?" },
      { role: "user", content: "segue a foto" },
    ];

    const result = withImageOnLastGuestMessage(messages, image);

    expect(result).toHaveLength(4);
    expect(result[3]?.content).toEqual([
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "aGVsbG8=" } },
      { type: "text", text: "segue a foto" },
    ]);
    // As demais mensagens ficam intactas (imagem só no turno atual).
    expect(result[1]?.content).toBe("quero fazer o check-in");
  });

  it("sem mensagem de usuário, devolve o array original", () => {
    const messages: Anthropic.MessageParam[] = [{ role: "assistant", content: "olá" }];
    expect(withImageOnLastGuestMessage(messages, image)).toEqual(messages);
  });
});

describe("buildContextMessage — canal", () => {
  const ctx = {
    now: new Date("2026-07-28"),
    guest: { name: "Bruno", profile: {} },
    reservation: {
      checkIn: new Date("2026-07-26"),
      checkOut: new Date("2026-07-30"),
      status: "checked_in",
      plan: "all_inclusive",
      roomNumber: "204",
    },
  } as unknown as Parameters<typeof buildContextMessage>[0];

  it("no WhatsApp, orienta a não repetir o card nem citar tela", () => {
    const content = buildContextMessage(ctx, "whatsapp").content as string;
    expect(content).toContain("NÃO existe card visual");
    expect(content).toContain("NÃO repita em palavras");
    expect(content).toContain("no card acima");
    expect(content).toContain("notificação no celular");
  });

  it("no web, diz que o card é visual e pode ser referenciado", () => {
    const content = buildContextMessage(ctx, "web").content as string;
    expect(content).toContain("card visual");
    expect(content).not.toContain("notificação no celular");
  });

  it("canal desconhecido cai no comportamento do web (padrão seguro)", () => {
    const content = buildContextMessage(ctx, "sms").content as string;
    expect(content).toContain("chat web");
  });
});
