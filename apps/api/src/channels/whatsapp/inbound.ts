import { prisma } from "../../lib/prisma.js";
import { conversationService } from "../../services/conversation-service.js";
import { WhatsAppAdapter } from "../whatsapp-adapter.js";
import { phonesMatch } from "./identity.js";
import type { WhatsAppMessenger } from "./client.js";
import type { GuestAuth } from "../../plugins/guest-auth.js";
import type { InboundImage } from "../../agent/memory.js";

/** Mensagem recebida, no shape da Cloud API (subconjunto que consumimos). */
export interface InboundWhatsAppMessage {
  from: string;
  type: string;
  text?: { body: string };
  image?: { id: string; mime_type?: string; caption?: string };
  interactive?: { button_reply?: { id: string; title: string } };
}

export type InboundResult =
  /** Tipo de mensagem sem conteúdo aproveitável (áudio, sticker, etc.). */
  | { status: "ignored" }
  /** Telefone sem hóspede/reserva ativa — o remetente recebe orientação. */
  | { status: "unknown_guest" }
  | { status: "handled"; conversationId: string };

/**
 * Processamento de uma mensagem recebida no WhatsApp: parsing por tipo →
 * identificação do hóspede pelo telefone → mesmo ConversationService do
 * webchat, com o WhatsAppAdapter na saída.
 *
 * Depende de WhatsAppMessenger (interface), não do cliente concreto: em
 * produção entra o WhatsAppClient (Cloud API); no simulador, um cliente que
 * captura o que seria enviado. O caminho percorrido é o mesmo.
 */
export async function processInbound(
  message: InboundWhatsAppMessage,
  client: WhatsAppMessenger,
  log: { error: (obj: unknown, msg?: string) => void },
): Promise<InboundResult> {
  // Conteúdo por tipo: texto, toque em botão de oferta, ou foto (check-in OCR).
  let content: string | null = null;
  let image: InboundImage | undefined;

  if (message.type === "text") {
    content = message.text?.body ?? null;
  } else if (message.type === "interactive" && message.interactive?.button_reply) {
    // O id do botão carrega a oferta exata ("offer:<uuid>"). Sem repassá-lo, o
    // agente teria só o TÍTULO — que o WhatsApp trunca em 20 chars — e
    // precisaria reprocurar no catálogo, podendo casar com a oferta errada.
    const reply = message.interactive.button_reply;
    const offerId = reply.id.startsWith("offer:") ? reply.id.slice("offer:".length) : null;
    // O id é metadado, não fala do hóspede: vai numa nota de sistema à parte,
    // senão o modelo o repete de volta e o UUID aparece no celular.
    content = offerId
      ? `Quero aceitar a oferta "${reply.title}".\n` +
        `<nota-do-sistema>O hóspede tocou no botão da oferta ${offerId}. Use este id direto em ` +
        `create_order, sem procurar no catálogo, e NUNCA mencione o id na sua resposta.</nota-do-sistema>`
      : `Quero aceitar a oferta "${reply.title}"`;
  } else if (message.type === "image" && message.image) {
    const media = await client.downloadMedia(message.image.id);
    if (media && ["image/jpeg", "image/png", "image/webp"].includes(media.mediaType)) {
      image = { base64: media.base64, mediaType: media.mediaType as InboundImage["mediaType"] };
    }
    content = message.image.caption ?? "Segue a foto do meu documento.";
  }
  if (!content) return { status: "ignored" };

  const auth = await resolveGuestByPhone(message.from);
  if (!auth) {
    await client.sendText(
      message.from,
      "Olá! Não encontrei uma reserva ativa vinculada a este número. " +
        "Se você tem uma reserva, confirme com a recepção se este é o telefone do cadastro. 🏝️",
    );
    return { status: "unknown_guest" };
  }

  const conversation = await conversationService.start(auth, "whatsapp");
  const adapter = new WhatsAppAdapter(client, message.from, log);
  await conversationService.handleGuestMessage({
    auth,
    conversationId: conversation.id,
    content,
    image,
    adapter,
    logger: log,
  });
  return { status: "handled", conversationId: conversation.id };
}

/**
 * Identidade no WhatsApp: o telefone É a autenticação (a Meta garante o
 * remetente). Hóspede → reserva ativa mais recente → mesma GuestAuth do
 * magic token. MVP compara em JS; escala = coluna de telefone normalizado.
 */
export async function resolveGuestByPhone(from: string): Promise<GuestAuth | null> {
  const guests = await prisma.guest.findMany({
    where: { phone: { not: null }, consentAt: { not: null } }, // LGPD: só com consentimento
    select: { id: true, phone: true, resortId: true },
  });
  const guest = guests.find((g) => g.phone && phonesMatch(g.phone, from));
  if (!guest) return null;

  const reservation = await prisma.reservation.findFirst({
    where: { guestId: guest.id, status: { not: "cancelled" } },
    orderBy: { checkIn: "desc" },
  });
  if (!reservation) return null;

  return { resortId: guest.resortId, guestId: guest.id, reservationId: reservation.id };
}
