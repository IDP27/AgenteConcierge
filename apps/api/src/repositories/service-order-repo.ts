import type { Priority, ServiceOrder, ServiceOrderCategory, ServiceOrderStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

export const serviceOrderRepo = {
  async create(params: {
    resortId: string;
    reservationId: string;
    category: ServiceOrderCategory;
    description: string;
    priority: Priority;
    slaDueAt: Date;
  }): Promise<ServiceOrder> {
    return prisma.serviceOrder.create({ data: { ...params, status: "open" } });
  },

  async findById(id: string): Promise<ServiceOrder | null> {
    return prisma.serviceOrder.findUnique({ where: { id } });
  },

  async resolve(id: string): Promise<ServiceOrder> {
    return prisma.serviceOrder.update({
      where: { id },
      data: { status: "resolved", resolvedAt: new Date() },
    });
  },

  async list(filters: { status?: ServiceOrderStatus; priority?: Priority; limit: number }) {
    return prisma.serviceOrder.findMany({
      where: {
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.priority ? { priority: filters.priority } : {}),
      },
      orderBy: [{ status: "asc" }, { slaDueAt: "asc" }],
      take: filters.limit,
      include: { reservation: { include: { guest: { select: { name: true } } } } },
    });
  },
};

export type ServiceOrderRepo = typeof serviceOrderRepo;
