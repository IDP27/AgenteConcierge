import { WA_LIMITS, type WhatsAppMessenger } from "./client.js";

/** O que sairia no aparelho do hóspede, já com os cortes da Cloud API. */
export type SimulatedOutbound =
  | { kind: "text"; body: string }
  | { kind: "buttons"; body: string; buttons: Array<{ id: string; title: string }> };

/**
 * Cliente de simulação: implementa a mesma interface do WhatsAppClient, mas
 * em vez de chamar a Graph API, captura o que seria enviado.
 *
 * Aplica DELIBERADAMENTE os mesmos limites da Cloud API (WA_LIMITS): um título
 * de botão que o WhatsApp trunca em 20 caracteres precisa aparecer truncado
 * aqui também — um simulador que não reproduz os cortes esconde justamente os
 * bugs que ele deveria revelar.
 *
 * Não fala com a Meta: nada é entregue a um aparelho real.
 */
export class SimulatorWhatsAppClient implements WhatsAppMessenger {
  readonly sent: SimulatedOutbound[] = [];

  /** Mídia que `downloadMedia` devolve — simula a foto anexada pelo hóspede. */
  constructor(private readonly media?: { base64: string; mediaType: string }) {}

  async sendText(_to: string, body: string): Promise<void> {
    this.sent.push({ kind: "text", body: body.slice(0, WA_LIMITS.textBody) });
  }

  async sendButtons(
    _to: string,
    body: string,
    buttons: Array<{ id: string; title: string }>,
  ): Promise<void> {
    this.sent.push({
      kind: "buttons",
      body: body.slice(0, WA_LIMITS.buttonBody),
      buttons: buttons.slice(0, WA_LIMITS.maxButtons).map((b) => ({
        id: b.id,
        title: b.title.slice(0, WA_LIMITS.buttonTitle),
      })),
    });
  }

  async downloadMedia(): Promise<{ base64: string; mediaType: string } | null> {
    return this.media ?? null;
  }
}
