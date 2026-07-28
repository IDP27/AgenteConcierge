/**
 * Cliente fino da Meta WhatsApp Cloud API. Sem SDK: são 3 chamadas HTTP.
 * O adapter depende desta interface — nos testes entra um fake.
 */
export interface WhatsAppMessenger {
  sendText(to: string, body: string): Promise<void>;
  /** Botões interativos (máx. 3; títulos até 20 chars — a Cloud API rejeita acima). */
  sendButtons(to: string, body: string, buttons: Array<{ id: string; title: string }>): Promise<void>;
  /** Baixa mídia recebida (foto de documento no check-in) como base64. */
  downloadMedia(mediaId: string): Promise<{ base64: string; mediaType: string } | null>;
}

const GRAPH_URL = "https://graph.facebook.com/v21.0";
const TIMEOUT_MS = 15_000;

/**
 * Limites duros da Cloud API. Ficam aqui (e não inline) para que o simulador
 * aplique EXATAMENTE os mesmos cortes — um botão truncado no WhatsApp real
 * precisa aparecer truncado no simulador, senão ele mente.
 */
export const WA_LIMITS = {
  textBody: 4096,
  buttonBody: 1024,
  buttonTitle: 20,
  maxButtons: 3,
} as const;

export class WhatsAppClient implements WhatsAppMessenger {
  constructor(
    private readonly accessToken: string,
    private readonly phoneNumberId: string,
  ) {}

  private async post(payload: Record<string, unknown>): Promise<void> {
    const res = await fetch(`${GRAPH_URL}/${this.phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new Error(`WhatsApp Cloud API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    }
  }

  async sendText(to: string, body: string): Promise<void> {
    await this.post({ to, type: "text", text: { body: body.slice(0, WA_LIMITS.textBody) } });
  }

  async sendButtons(
    to: string,
    body: string,
    buttons: Array<{ id: string; title: string }>,
  ): Promise<void> {
    await this.post({
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: body.slice(0, WA_LIMITS.buttonBody) },
        action: {
          buttons: buttons.slice(0, WA_LIMITS.maxButtons).map((b) => ({
            type: "reply",
            reply: { id: b.id.slice(0, 256), title: b.title.slice(0, WA_LIMITS.buttonTitle) },
          })),
        },
      },
    });
  }

  async downloadMedia(mediaId: string): Promise<{ base64: string; mediaType: string } | null> {
    try {
      const headers = { authorization: `Bearer ${this.accessToken}` };
      const meta = await fetch(`${GRAPH_URL}/${mediaId}`, {
        headers,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!meta.ok) return null;
      const { url, mime_type } = (await meta.json()) as { url: string; mime_type: string };
      const media = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!media.ok) return null;
      const buffer = Buffer.from(await media.arrayBuffer());
      return { base64: buffer.toString("base64"), mediaType: mime_type };
    } catch {
      return null;
    }
  }
}
