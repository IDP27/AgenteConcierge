import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { withImageOnLastGuestMessage } from "./memory.js";

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
