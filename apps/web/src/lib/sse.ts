import type { AgentEvent } from "@concierge/shared";
import { API_URL } from "./api";

/**
 * Consome a resposta SSE de POST /conversations/:id/messages.
 * EventSource não suporta POST, então lemos o body via ReadableStream
 * e separamos os eventos por linha em branco (protocolo SSE).
 */
export interface OutgoingImage {
  base64: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
}

export async function* streamAgentEvents(
  conversationId: string,
  token: string,
  content: string,
  image?: OutgoingImage,
): AsyncGenerator<AgentEvent> {
  const res = await fetch(
    `${API_URL}/api/conversations/${conversationId}/messages?token=${encodeURIComponent(token)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        content,
        ...(image ? { imageBase64: image.base64, imageMediaType: image.mediaType } : {}),
      }),
    },
  );
  if (!res.ok || !res.body) {
    throw new Error(`Falha ao enviar mensagem (HTTP ${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";

    for (const chunk of chunks) {
      const dataLine = chunk.split("\n").find((line) => line.startsWith("data: "));
      if (!dataLine) continue;
      yield JSON.parse(dataLine.slice(6)) as AgentEvent;
    }
  }
}
