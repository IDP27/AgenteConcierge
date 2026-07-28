import type { Channel } from "@prisma/client";
import { parseResortSettings } from "@concierge/shared";
import { prisma } from "../lib/prisma.js";
import { anthropic } from "../lib/anthropic.js";
import { NotFoundError } from "../lib/errors.js";
import { repos } from "../repositories/index.js";
import { runAgentTurn } from "../agent/agent.js";
import { buildDefaultRegistry } from "../agent/tools/index.js";
import type { ToolContext } from "../agent/tools/types.js";
import {
  buildContextMessage,
  toModelMessages,
  withImageOnLastGuestMessage,
  type InboundImage,
} from "../agent/memory.js";
import { detectHandoffReason } from "../agent/guardrails/handoff.js";
import type { ChannelAdapter } from "../channels/channel-adapter.js";
import type { GuestAuth } from "../plugins/guest-auth.js";

const registry = buildDefaultRegistry();

export const conversationService = {
  async start(auth: GuestAuth, channel: Channel) {
    return repos.conversations.findOrCreateOpen(auth.resortId, auth.guestId, channel);
  },

  async getWithMessages(auth: GuestAuth, conversationId: string) {
    const conversation = await repos.conversations.findForGuest(conversationId, auth.guestId);
    if (!conversation) throw new NotFoundError("Conversa");
    const messages = await repos.conversations.listMessages(conversationId);
    return { conversation, messages };
  },

  /**
   * Caminho crítico: mensagem do hóspede → agente → stream pelo canal.
   * O adapter é a única coisa específica de canal; o restante é neutro.
   */
  async handleGuestMessage(params: {
    auth: GuestAuth;
    conversationId: string;
    content: string;
    /** Foto do turno (OCR de documento) — usada agora e descartada (LGPD). */
    image?: InboundImage;
    adapter: ChannelAdapter;
    logger?: { error: (obj: unknown, msg?: string) => void };
  }): Promise<void> {
    const { auth, conversationId, content, adapter } = params;

    const conversation = await repos.conversations.findForGuest(conversationId, auth.guestId);
    if (!conversation) throw new NotFoundError("Conversa");

    await repos.conversations.addMessage(conversationId, "guest", content);
    await adapter.send({ type: "message_start", conversationId });

    try {
      // Conversa já em atendimento humano: o agente não responde.
      if (conversation.status === "needs_human") {
        await adapter.send({
          type: "handoff",
          reason: "Conversa em atendimento humano — sua mensagem foi registrada.",
        });
        return;
      }

      // Rede de segurança de handoff (defesa em profundidade, ADR-009).
      const handoffReason = detectHandoffReason(content);
      if (handoffReason) {
        await repos.conversations.setStatus(conversationId, "needs_human");
        await repos.agentActions.record({
          conversationId,
          toolName: "handoff_heuristic",
          input: { content },
          output: { reason: handoffReason },
          status: "success",
        });
        const reply =
          "Entendi! Já estou te conectando com um atendente da nossa equipe — alguém assume esta conversa em instantes.";
        const saved = await repos.conversations.addMessage(conversationId, "agent", reply);
        await adapter.send({ type: "handoff", reason: handoffReason });
        await adapter.send({ type: "text_delta", text: reply });
        await adapter.send({ type: "message_end", messageId: saved.id });
        return;
      }

      const ctx = await buildToolContext(auth, conversationId);
      const dbMessages = await repos.conversations.listMessages(conversationId);
      // O canal entra no contexto: web mostra card visual, WhatsApp só texto —
      // sem saber onde escreve, o agente duplica dados e cita cards que não existem.
      let history = [
        buildContextMessage(ctx, conversation.channel),
        ...toModelMessages(dbMessages),
      ];
      if (params.image) history = withImageOnLastGuestMessage(history, params.image);

      const turn = runAgentTurn(ctx, history, { anthropic, registry, logger: params.logger });

      // Consome o generator repassando eventos ao canal e capturando o desfecho.
      let outcome = await turn.next();
      while (!outcome.done) {
        await adapter.send(outcome.value);
        outcome = await turn.next();
      }
      const { finalText, errored } = outcome.value;

      if (finalText.trim()) {
        const saved = await repos.conversations.addMessage(conversationId, "agent", finalText);
        if (!errored) await adapter.send({ type: "message_end", messageId: saved.id });
      }
    } catch (err) {
      params.logger?.error(err, "falha ao processar mensagem do hóspede");
      await adapter.send({
        type: "error",
        code: "internal_error",
        message: "Tive um problema técnico. Tente novamente em instantes.",
      });
    } finally {
      adapter.close();
    }
  },
};

async function buildToolContext(auth: GuestAuth, conversationId: string): Promise<ToolContext> {
  const [resort, reservation, guest] = await Promise.all([
    repos.resorts.findById(auth.resortId),
    repos.reservations.findById(auth.reservationId, auth.resortId),
    prisma.guest.findUnique({ where: { id: auth.guestId } }),
  ]);
  if (!resort || !reservation || !guest) throw new NotFoundError("Reserva");

  return {
    conversationId,
    resort: { id: resort.id, name: resort.name, settings: parseResortSettings(resort.settings) },
    guest: {
      id: guest.id,
      name: guest.name,
      profile: (guest.profile ?? {}) as Record<string, unknown>,
      lastProactiveOfferAt: guest.lastProactiveOfferAt,
    },
    reservation: {
      id: reservation.id,
      roomNumber: reservation.roomNumber,
      checkIn: reservation.checkIn,
      checkOut: reservation.checkOut,
      status: reservation.status,
      plan: reservation.plan,
    },
    now: new Date(),
    repos,
  };
}
