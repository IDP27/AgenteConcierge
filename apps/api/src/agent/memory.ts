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
