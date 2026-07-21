import { randomUUID } from "node:crypto";
import { computeRoomBill, type OrderItem, type RoomBill } from "@concierge/shared";
import type { Repos } from "../repositories/index.js";
import type { PmsAdapter, PmsMaintenanceRef, PmsReservation } from "./pms-adapter.js";

/**
 * PMS de demonstração: serve reserva/folio a partir do NOSSO banco semeado —
 * é o comportamento atual do agente, agora atrás da interface. É o seam que
 * prova o fluxo ponta a ponta; em produção o OperaAdapter lê os mesmos dados
 * do OPERA (OWS/OHIP) sem o agente perceber a troca.
 */
export class SeedPmsAdapter implements PmsAdapter {
  readonly provider = "seed";

  constructor(private readonly repos: Repos) {}

  async getReservation(reservationId: string, resortId: string): Promise<PmsReservation | null> {
    const r = await this.repos.reservations.findById(reservationId, resortId);
    if (!r) return null;

    // Composição do grupo: no OPERA vem de Adultos/Crianças; aqui, dos companions.
    const companions = await this.repos.companions.listForReservation(reservationId);
    const children = companions.filter((c) => c.isChild).length;
    const adults = 1 + companions.filter((c) => !c.isChild).length; // titular + adultos

    return {
      confirmationNumber: r.id, // OPERA usa No.Conf; no seed, o id interno.
      status: r.status,
      roomNumber: r.roomNumber,
      checkIn: r.checkIn,
      checkOut: r.checkOut,
      plan: r.plan,
      adults,
      children,
    };
  }

  async getFolio(reservationId: string): Promise<RoomBill> {
    const orders = await this.repos.orders.listByReservation(reservationId);
    return computeRoomBill(
      orders.map((o) => ({
        items: o.items as unknown as OrderItem[],
        totalCents: o.totalCents,
        status: o.status,
      })),
    );
  }

  async addMaintenance(params: {
    roomNumber: string;
    description: string;
    reportedByGuest: boolean;
  }): Promise<PmsMaintenanceRef> {
    // Sem módulo de Governança no seed: registra no log e devolve um ref
    // sintético. Em produção, o OperaAdapter grava em Governança → Manutenção.
    console.info(
      `[SeedPms] manutenção registrada (simulada) — quarto ${params.roomNumber}` +
        `${params.reportedByGuest ? " · reportado pelo hóspede" : ""}: ${params.description}`,
    );
    return { id: randomUUID(), isSeed: true };
  }
}
