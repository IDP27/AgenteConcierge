import type { Order, OrderStatus, Prisma } from "@prisma/client";
import type { OrderItem } from "@concierge/shared";
import { prisma } from "../lib/prisma.js";

export const orderRepo = {
  async create(params: {
    resortId: string;
    reservationId: string;
    items: OrderItem[];
    totalCents: number;
    status: OrderStatus;
  }): Promise<Order> {
    return prisma.order.create({
      data: {
        resortId: params.resortId,
        reservationId: params.reservationId,
        items: params.items as unknown as Prisma.InputJsonValue,
        totalCents: params.totalCents,
        status: params.status,
      },
    });
  },

  async findById(id: string): Promise<Order | null> {
    return prisma.order.findUnique({ where: { id } });
  },

  async setStatus(id: string, status: OrderStatus): Promise<Order> {
    return prisma.order.update({ where: { id }, data: { status } });
  },

  async list(filters: { status?: OrderStatus; limit: number }) {
    return prisma.order.findMany({
      where: { ...(filters.status ? { status: filters.status } : {}) },
      orderBy: { createdAt: "desc" },
      take: filters.limit,
      include: { reservation: { include: { guest: { select: { name: true } } } } },
    });
  },
};

export type OrderRepo = typeof orderRepo;
