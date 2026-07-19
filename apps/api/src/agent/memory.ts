import type Anthropic from "@anthropic-ai/sdk";
import type { Message } from "@prisma/client";
import type { ToolContext } from "./tools/types.js";

/**
 * Memória de conversa: reconstrói o histórico persistido como messages[] da
 * Anthropic API. Só texto — tool_use/tool_result de turnos anteriores não são
 * reidratados (a trilha completa vive em agent_actions para auditoria).
 */
export function toModelMessages(dbMessages: Message[]): Anthropic.MessageParam[] {
  return dbMessages.map((m): Anthropic.MessageParam => {
    switch (m.role) {
      case "guest":
        return { role: "user", content: m.content };
      case "agent":
        return { role: "assistant", content: m.content };
      case "human_agent":
        return { role: "assistant", content: `[Atendente humano] ${m.content}` };
      case "system":
        return { role: "user", content: `<nota-do-sistema>${m.content}</nota-do-sistema>` };
    }
  });
}

export interface InboundImage {
  base64: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
}

/**
 * OCR multimodal: anexa a foto (ex.: documento no check-in) à última mensagem
 * do hóspede como bloco de imagem. A imagem vive só neste turno — o histórico
 * persistido guarda apenas o texto (LGPD: foto de documento não é armazenada).
 */
export function withImageOnLastGuestMessage(
  messages: Anthropic.MessageParam[],
  image: InboundImage,
): Anthropic.MessageParam[] {
  const lastUserIdx = messages.map((m) => m.role).lastIndexOf("user");
  const last = lastUserIdx === -1 ? undefined : messages[lastUserIdx];
  if (!last) return messages;
  const text = typeof last.content === "string" ? last.content : "";
  return [
    ...messages.slice(0, lastUserIdx),
    {
      role: "user",
      content: [
        {
          type: "image",
          source: { type: "base64", media_type: image.mediaType, data: image.base64 },
        },
        { type: "text", text },
      ],
    },
    ...messages.slice(lastUserIdx + 1),
  ];
}

/**
 * Contexto dinâmico (hóspede, reserva, data) injetado como primeira mensagem —
 * e não no system prompt — para preservar o cache do prefixo (ADR-010).
 */
export function buildContextMessage(ctx: ToolContext): Anthropic.MessageParam {
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const r = ctx.reservation;
  return {
    role: "user",
    content: `<contexto-da-conversa>
Esta nota é do sistema, não do hóspede. Dados da sessão autenticada:
- Hoje: ${fmt(ctx.now)}
- Hóspede: ${ctx.guest.name}
- Perfil: ${JSON.stringify(ctx.guest.profile)}
- Reserva: check-in ${fmt(r.checkIn)} → check-out ${fmt(r.checkOut)} · status: ${r.status} · plano: ${r.plan} · quarto: ${r.roomNumber ?? "ainda não atribuído"}
</contexto-da-conversa>`,
  };
}
