import { ConflictError, NotFoundError } from "../lib/errors.js";
import { repos } from "../repositories/index.js";

/** Fila de aprovação humana: destino dos pedidos acima do limite (ADR-009). */
export const approvalService = {
  async approveOrder(orderId: string) {
    const order = await repos.orders.findById(orderId);
    if (!order) throw new NotFoundError("Pedido");
    if (order.status !== "pending_approval") {
      throw new ConflictError(`Pedido não está pendente (status atual: ${order.status})`);
    }
    return repos.orders.setStatus(orderId, "confirmed");
  },

  async cancelOrder(orderId: string) {
    const order = await repos.orders.findById(orderId);
    if (!order) throw new NotFoundError("Pedido");
    if (order.status === "delivered") {
      throw new ConflictError("Pedido já entregue não pode ser cancelado");
    }
    return repos.orders.setStatus(orderId, "cancelled");
  },

  async resolveServiceOrder(serviceOrderId: string) {
    const serviceOrder = await repos.serviceOrders.findById(serviceOrderId);
    if (!serviceOrder) throw new NotFoundError("Ordem de serviço");
    if (serviceOrder.status === "resolved") {
      throw new ConflictError("OS já está resolvida");
    }
    return repos.serviceOrders.resolve(serviceOrderId);
  },
};
