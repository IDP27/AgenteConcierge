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
 * O agente escreve o MESMO conteúdo para canais que o apresentam de formas
 * diferentes. No web, o resultado das ferramentas vira card visual ao lado da
 * conversa; no WhatsApp vira mensagem de texto — então repetir os dados em
 * palavras duplica a informação, e citar "o card acima" aponta para algo que
 * não existe. Sem esta nota o agente não tem como saber onde está escrevendo.
 */
const CHANNEL_GUIDANCE: Record<string, string> = {
  whatsapp: `- Canal: WhatsApp. NÃO existe card visual: o que as ferramentas mostram chega ao hóspede como mensagem de texto, escrita pelo sistema.
- NÃO repita em palavras o que a ferramenta já mostrou (código da chave, itens e total do extrato, lista de ofertas com preços). Complemente em uma frase curta ou apenas siga a conversa — nunca recite os mesmos dados.
- NUNCA diga que algo "apareceu na tela", "no card acima" ou "aí para você": não há nada visual.
- Cada mensagem sua vira uma notificação no celular. Não anuncie passos ("deixa eu verificar…", "um momento") — faça e responda. Uma frase curta de acolhimento antes de agir continua bem-vinda quando o hóspede relata um problema.`,
  web: `- Canal: chat web. O resultado das ferramentas aparece como card visual na conversa — você pode se referir a ele e não precisa repetir os dados em texto.`,
};

/**
 * Contexto dinâmico (hóspede, reserva, data, canal) injetado como primeira
 * mensagem — e não no system prompt — para preservar o cache do prefixo (ADR-010).
 */
export function buildContextMessage(
  ctx: ToolContext,
  channel: string = "web",
): Anthropic.MessageParam {
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

Como este canal apresenta suas respostas:
${CHANNEL_GUIDANCE[channel] ?? CHANNEL_GUIDANCE.web}
</contexto-da-conversa>`,
  };
}
