import type { AgentEvent } from "@concierge/shared";
import type { ChannelAdapter } from "./channel-adapter.js";

/**
 * FUTURO — WhatsApp Business API (fora do MVP).
 *
 * Plano de implementação sem tocar no core:
 * 1. Rota de webhook (POST /api/webhooks/whatsapp) recebe a mensagem,
 *    resolve o hóspede pelo telefone e chama o mesmo ConversationService.
 * 2. Este adapter faz buffering dos text_delta (WhatsApp não streama) e
 *    envia a mensagem completa no message_end via Cloud API.
 * 3. Cards viram templates/botões interativos do WhatsApp.
 */
export class WhatsAppAdapter implements ChannelAdapter {
  send(_event: AgentEvent): void {
    throw new Error("WhatsAppAdapter ainda não implementado (fora do MVP)");
  }

  close(): void {
    // noop
  }
}
