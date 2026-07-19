import type { AgentEvent } from "@concierge/shared";
import type { ChannelAdapter } from "./channel-adapter.js";
import type { WhatsAppMessenger } from "./whatsapp/client.js";

const fmtBRL = (cents: number) => `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`;

/**
 * Canal WhatsApp (ADR-006): mesmo agent-core, outro transporte.
 *
 * - WhatsApp não streama: text_delta é bufferizado e enviado inteiro no
 *   message_end (ou antes de um card, para preservar a ordem).
 * - Card de ofertas vira botões interativos nativos — aceitar uma oferta é
 *   um toque, melhor que texto livre.
 * - Envios são serializados numa fila interna: a ordem das mensagens no
 *   celular é a ordem dos eventos do agente.
 */
export class WhatsAppAdapter implements ChannelAdapter {
  private buffer = "";
  private sentAnything = false;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly client: WhatsAppMessenger,
    private readonly to: string,
    private readonly logger?: { error: (obj: unknown, msg?: string) => void },
  ) {}

  private enqueue(op: () => Promise<void>): Promise<void> {
    this.queue = this.queue.then(op).catch((err) => {
      this.logger?.error(err, "falha ao enviar mensagem WhatsApp");
    });
    return this.queue;
  }

  private flushText(): void {
    const text = this.buffer.trim();
    this.buffer = "";
    if (!text) return;
    this.sentAnything = true;
    void this.enqueue(() => this.client.sendText(this.to, text));
  }

  send(event: AgentEvent): Promise<void> {
    switch (event.type) {
      case "message_start":
      case "tool_started":
        break; // sem equivalente no WhatsApp — o hóspede só vê o resultado

      case "text_delta":
        this.buffer += event.text;
        break;

      case "card": {
        this.flushText(); // o que veio antes do card sai antes dele
        if (event.kind === "offer") {
          const offers = (event.data as { offers: Array<{ id: string; title: string; priceCents: number }> })
            .offers;
          const body = offers
            .map((o) => `• ${o.title} — ${fmtBRL(o.priceCents)}`)
            .join("\n");
          // Limite da Cloud API: máx. 3 botões, títulos de até 20 chars.
          const buttons = offers
            .slice(0, 3)
            .map((o) => ({ id: `offer:${o.id}`, title: o.title.slice(0, 20) }));
          this.sentAnything = true;
          void this.enqueue(() => this.client.sendButtons(this.to, body, buttons));
        }
        // order/service_order: o texto do agente já resume; card é redundante aqui.
        break;
      }

      case "handoff":
        // Passagem direta (conversa já com humano): sem texto do agente,
        // avisa o hóspede; no fluxo normal o próprio agente explica.
        if (!this.sentAnything && !this.buffer.trim()) {
          this.sentAnything = true;
          void this.enqueue(() => this.client.sendText(this.to, `👤 ${event.reason}`));
        }
        break;

      case "message_end":
        this.flushText();
        break;

      case "error":
        this.flushText();
        this.sentAnything = true;
        void this.enqueue(() => this.client.sendText(this.to, `⚠️ ${event.message}`));
        break;
    }
    return this.queue;
  }

  close(): void {
    this.flushText(); // rede de segurança: nada fica preso no buffer
  }
}
