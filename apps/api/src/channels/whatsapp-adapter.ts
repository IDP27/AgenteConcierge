import type { AgentEvent } from "@concierge/shared";
import type { ChannelAdapter } from "./channel-adapter.js";
import { WA_LIMITS, type WhatsAppMessenger } from "./whatsapp/client.js";
import { toWhatsAppMarkup } from "./whatsapp/markup.js";
import { joinSegments } from "../agent/segments.js";
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
interface PendingCard {
  text: string;
  buttons?: Array<{ id: string; title: string }>;
  /** Texto que o agente escreveu ANTES deste card. */
  lead: string;
}

export class WhatsAppAdapter implements ChannelAdapter {
  /** Segmentos fechados do turno — um por rodada do loop de tool use. */
  private segments: string[] = [];
  /** Segmento em construção (deltas desde a última ferramenta). */
  private current = "";
  private sentAnything = false;
  private queue: Promise<void> = Promise.resolve();
  /**
   * Cards seguram até o fim do turno. O agente às vezes chama as ferramentas
   * todas antes de escrever — e aí o card saía primeiro, deixando o hóspede
   * com uma lista de preços sem contexto antes de saber que o check-in tinha
   * concluído (e quanto seria lançado na conta).
   */
  private pending: PendingCard[] = [];

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

  /**
   * Esvazia os segmentos e devolve o texto já na marcação do WhatsApp.
   *
   * mergeSegments tira a repetição: depois do resultado de uma ferramenta o
   * modelo às vezes reescreve o que já dissera antes de chamá-la, e como
   * aquele texto já foi entregue, a frase chegava duas vezes no celular.
   * O que sobra é unido por linha em branco — a retomada depois de uma
   * ferramenta é outro parágrafo, não continuação da frase.
   */
  private takeBuffer(): string {
    if (this.current.trim()) this.segments.push(this.current);
    this.current = "";
    const text = joinSegments(this.segments);
    this.segments = [];
    return text ? toWhatsAppMarkup(text) : "";
  }

  private sendBody(body: string, buttons?: Array<{ id: string; title: string }>): void {
    if (!body) return;
    this.sentAnything = true;
    void this.enqueue(() =>
      buttons
        ? this.client.sendButtons(this.to, body, buttons)
        : this.client.sendText(this.to, body),
    );
  }

  /**
   * Fecha o turno: o texto do agente sempre precede os cards.
   *
   * O que o agente escreveu DEPOIS do card entra na mensagem dele, acima do
   * conteúdo — não numa mensagem seguinte. Um card de ofertas isolado chega
   * como uma lista de preços sem explicação, e o anúncio que lhe dava sentido
   * chegava no buzz seguinte.
   */
  private flushAll(): void {
    const trailing = this.takeBuffer();
    const cards = this.pending;
    this.pending = [];

    if (cards.length === 0) {
      this.sendBody(trailing);
      return;
    }

    const last = cards.length - 1;
    cards.forEach((card, i) => {
      const parts = [card.lead, i === last ? trailing : "", card.text].filter(Boolean);
      this.sendBody(parts.join("\n\n"), card.buttons);
    });
  }

  /**
   * Como cada card aparece no WhatsApp, que não tem elementos visuais: tudo
   * vira texto (ou botões nativos). Devolve null para os kinds sem
   * representação própria — nesses o texto do agente já dá conta.
   */
  private renderCard(
    event: Extract<AgentEvent, { type: "card" }>,
  ): { text: string; buttons?: Array<{ id: string; title: string }> } | null {
    switch (event.kind) {
      case "review_prompt":
        // Sem card de estrelas no WhatsApp: pede a nota em texto.
        return {
          text:
            "De 1 a 5, o quanto você recomendaria o resort? Responda só com o número — e, se " +
            "quiser, conte o que achou. 🌟",
        };

      case "review_link":
        return {
          text: `Se quiser deixar sua avaliação pública: ${(event.data as { url: string }).url}`,
        };

      case "room_key": {
        const key = event.data as { roomNumber: string; code: string };
        return {
          text:
            `🔑 *Sua chave digital — Quarto ${key.roomNumber}*\nCódigo: *${key.code}*\n` +
            `Aproxime o celular da fechadura do quarto.`,
        };
      }

      case "room_bill": {
        const bill = event.data as {
          lines: Array<{ title: string; qty: number; totalCents: number }>;
          chargedCents: number;
        };
        return {
          text:
            bill.lines.length === 0
              ? "Sua conta está zerada — nenhum consumo lançado."
              : bill.lines
                  .map((l) => `• ${l.qty}× ${l.title} — ${fmtBRL(l.totalCents)}`)
                  .join("\n") + `\n\n*Total lançado: ${fmtBRL(bill.chargedCents)}*`,
        };
      }

      case "offer": {
        const { offers } = event.data as {
          offers: Array<{ id: string; title: string; priceCents: number }>;
        };
        // A Cloud API aceita no máximo 3 botões. O corpo lista SÓ o que é
        // tocável: listar 8 itens com 3 botões deixa 5 opções sem ação.
        const shown = offers.slice(0, WA_LIMITS.maxButtons);
        const rest = offers.length - shown.length;
        return {
          text:
            shown.map((o) => `• ${o.title} — ${fmtBRL(o.priceCents)}`).join("\n") +
            (rest > 0
              ? `\n\n_…e mais ${rest} ${rest === 1 ? "opção" : "opções"} — me diga o que procura._`
              : ""),
          // Título do botão: corte na fronteira de palavra (o título completo
          // está no corpo, logo acima — o botão só precisa identificar a linha).
          buttons: shown.map((o) => ({ id: `offer:${o.id}`, title: toButtonLabel(o.title) })),
        };
      }

      default:
        // order/service_order: o texto do agente já resume; card é redundante.
        return null;
    }
  }

  send(event: AgentEvent): Promise<void> {
    switch (event.type) {
      case "message_start":
        break; // sem equivalente no WhatsApp — o hóspede só vê o resultado

      case "tool_started":
        // Fecha o segmento: o que vier depois é outra rodada do loop, e é aí
        // que a repetição aparece. Sem a fronteira não dá para detectá-la.
        if (this.current.trim()) this.segments.push(this.current);
        this.current = "";
        break;

      case "text_delta":
        this.current += event.text;
        break;

      case "card": {
        const card = this.renderCard(event);
        // Kind sem representação: o texto segue no buffer e sai junto do resto,
        // em vez de virar uma mensagem solta.
        if (!card) break;

        // Guarda o texto de abertura junto do card e adia o envio: só no fim
        // do turno se sabe se ainda vem texto que deveria vir antes dele.
        this.pending.push({ ...card, lead: this.takeBuffer() });
        break;
      }

      case "handoff":
        // Passagem direta (conversa já com humano): sem texto do agente,
        // avisa o hóspede; no fluxo normal o próprio agente explica.
        if (
          !this.sentAnything &&
          !this.current.trim() &&
          this.segments.length === 0 &&
          this.pending.length === 0
        ) {
          this.sentAnything = true;
          void this.enqueue(() => this.client.sendText(this.to, `👤 ${event.reason}`));
        }
        break;

      case "message_end":
        this.flushAll();
        break;

      case "error":
        this.flushAll();
        this.sentAnything = true;
        void this.enqueue(() => this.client.sendText(this.to, `⚠️ ${event.message}`));
        break;
    }
    return this.queue;
  }

  /**
   * Fecha o turno e devolve a fila: os cards só saem daqui, então quem chama
   * PRECISA aguardar. Sem isso o simulador devolveria a resposta antes do
   * último envio, e no webhook real a requisição poderia encerrar no meio.
   */
  close(): Promise<void> {
    this.flushAll();
    return this.queue;
  }
}
