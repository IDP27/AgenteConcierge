import type { ServiceOrder } from "@prisma/client";
import { repos } from "../repositories/index.js";

/**
 * Recuperação de serviço (doc de automação, seção 2.4): quando a equipe
 * resolve uma OS, o hóspede recebe follow-up automático de satisfação na
 * conversa — e, em ocorrências graves (high/urgent), um gesto de cortesia
 * de baixo custo, registrado como pedido R$0 para rastreabilidade.
 *
 * Determinístico (template, sem chamada ao modelo): follow-up não pode
 * falhar por indisponibilidade da API nem gerar custo por OS resolvida.
 */
export const serviceRecoveryService = {
  async followUpOnResolvedServiceOrder(serviceOrder: ServiceOrder): Promise<void> {
    const reservation = await repos.reservations.findById(
      serviceOrder.reservationId,
      serviceOrder.resortId,
    );
    if (!reservation) return; // OS órfã — não bloqueia a resolução

    const conversation = await repos.conversations.findOrCreateOpen(
      serviceOrder.resortId,
      reservation.guestId,
      "web",
    );

    const severe = serviceOrder.priority === "high" || serviceOrder.priority === "urgent";

    if (severe) {
      await repos.orders.create({
        resortId: serviceOrder.resortId,
        reservationId: serviceOrder.reservationId,
        items: [
          {
            offerId: null,
            title: "Cortesia — pedimos desculpas pelo transtorno",
            qty: 1,
            priceCents: 0,
          },
        ],
        totalCents: 0,
        status: "confirmed",
      });
    }

    const followUp = severe
      ? "Olá! Nossa equipe concluiu o atendimento da sua solicitação. Pedimos desculpas pelo " +
        "transtorno — como gesto de cortesia, deixamos um mimo por conta da casa (a equipe " +
        "levará ao seu quarto). Ficou tudo resolvido? Se algo ainda não estiver certo, é só me dizer."
      : "Olá! Nossa equipe concluiu o atendimento da sua solicitação. Ficou tudo resolvido? " +
        "Se algo ainda não estiver certo, é só me dizer que eu reabro o chamado na hora.";

    await repos.conversations.addMessage(conversation.id, "agent", followUp);

    // Trilha de auditoria: follow-up é ação automática visível no painel.
    await repos.agentActions.record({
      conversationId: conversation.id,
      toolName: "service_recovery_follow_up",
      input: { serviceOrderId: serviceOrder.id, priority: serviceOrder.priority },
      output: { courtesyOffered: severe },
      status: "success",
    });
  },
};
