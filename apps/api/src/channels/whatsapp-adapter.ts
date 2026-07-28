import type { AgentEvent } from "@concierge/shared";
import type { ChannelAdapter } from "./channel-adapter.js";
import type { WhatsAppMessenger } from "./whatsapp/client.js";
import { toWhatsAppMarkup } from "./whatsapp/markup.js";
import { toButtonLabel } from "./whatsapp/button-label.js";

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
  /** Uma ferramenta rodou: o próximo texto é outro parágrafo, não continuação. */
  private breakBeforeNextText = false;

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
    // O texto do modelo vem em markdown; o WhatsApp tem marcação própria.
    const body = toWhatsAppMarkup(text);
    void this.enqueue(() => this.client.sendText(this.to, body));
  }

  send(event: AgentEvent): Promise<void> {
    switch (event.type) {
      case "message_start":
        break; // sem equivalente no WhatsApp — o hóspede só vê o resultado

      case "tool_started":
        // O texto retomado depois da ferramenta é um novo parágrafo: sem isto
        // os blocos se colam ("…já salvo!Perfeito, registrado!"). O agent-core
        // já separa seus segmentos com linha em branco; aqui espelhamos isso.
        this.breakBeforeNextText = this.buffer.trim().length > 0;
        break;

      case "text_delta":
        if (this.breakBeforeNextText && event.text.trim().length > 0) {
          if (!/\n\s*$/.test(this.buffer)) this.buffer += "\n\n";
          this.breakBeforeNextText = false;
        }
        this.buffer += event.text;
        break;

      case "card": {
        this.flushText(); // o que veio antes do card sai antes dele
        if (event.kind === "review_prompt") {
          // Sem card de estrelas no WhatsApp: pede a nota em texto.
          this.sentAnything = true;
          void this.enqueue(() =>
            this.client.sendText(
              this.to,
              "De 1 a 5, o quanto você recomendaria o resort? Responda só com o número — e, se " +
                "quiser, conte o que achou. 🌟",
            ),
          );
          break;
        }
        if (event.kind === "review_link") {
          const { url } = event.data as { url: string };
          this.sentAnything = true;
          void this.enqueue(() =>
            this.client.sendText(this.to, `Se quiser deixar sua avaliação pública: ${url}`),
          );
          break;
        }
        if (event.kind === "room_key") {
          const key = event.data as { roomNumber: string; code: string };
          this.sentAnything = true;
          void this.enqueue(() =>
            this.client.sendText(
              this.to,
              `🔑 *Sua chave digital — Quarto ${key.roomNumber}*\nCódigo: *${key.code}*\n` +
                `Aproxime o celular da fechadura do quarto.`,
            ),
          );
          break;
        }
        if (event.kind === "room_bill") {
          const bill = event.data as {
            lines: Array<{ title: string; qty: number; totalCents: number }>;
            chargedCents: number;
          };
          const body =
            bill.lines.length === 0
              ? "Sua conta está zerada — nenhum consumo lançado."
              : bill.lines
                  .map((l) => `• ${l.qty}× ${l.title} — ${fmtBRL(l.totalCents)}`)
                  .join("\n") + `\n\n*Total lançado: ${fmtBRL(bill.chargedCents)}*`;
          this.sentAnything = true;
          void this.enqueue(() => this.client.sendText(this.to, body));
          break;
        }
        if (event.kind === "offer") {
          const offers = (event.data as { offers: Array<{ id: string; title: string; priceCents: number }> })
            .offers;
          const body = offers
            .map((o) => `• ${o.title} — ${fmtBRL(o.priceCents)}`)
            .join("\n");
          // Limite da Cloud API: máx. 3 botões, títulos de até 20 chars — o
          // corte respeita a palavra (o título completo está no corpo acima).
          const buttons = offers
            .slice(0, 3)
            .map((o) => ({ id: `offer:${o.id}`, title: toButtonLabel(o.title) }));
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
