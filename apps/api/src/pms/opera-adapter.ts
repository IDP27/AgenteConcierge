import type { RoomBill } from "@concierge/shared";
import {
  PmsNotConfiguredError,
  type PmsAdapter,
  type PmsMaintenanceRef,
  type PmsReservation,
} from "./pms-adapter.js";

/**
 * Esqueleto da integração real com o Oracle OPERA (Costa do Sauípe/Aviva).
 * Ainda NÃO conectado: cada método lança PmsNotConfiguredError. Os pontos de
 * integração estão documentados para quando o time de TI liberar as
 * credenciais. Conectar = trocar os `throw` por chamadas reais; o agente não
 * muda (consome só a interface PmsAdapter).
 *
 * Superfícies do OPERA 5 on-premise (5.5.x, como o ambiente da Aviva):
 *   • OWS  — OPERA Web Services (SOAP): leitura/escrita de reserva, perfil,
 *            folio, disponibilidade. É a API principal do OPERA 5.
 *   • OXI / Business Events — o OPERA publica eventos (check-in, mudança de
 *            status de quarto). Espinha dorsal da camada proativa
 *            ("seu quarto está pronto" vem da Governança/housekeeping).
 *   • IFC8 / FIAS — camada de dispositivos: é por aqui que a chave da
 *            fechadura é encodada (conecta com o LockAdapter) e que o status
 *            de quarto trafega. Migração futura p/ OPERA Cloud troca OWS por
 *            OHIP (REST) mantendo esta MESMA interface.
 */
export interface OperaConfig {
  provider: "opera_ows" | "opera_cloud";
  baseUrl?: string;
  /** Credenciais reais entram por env, nunca no código (ver .env / whatsappConfig). */
  username?: string;
  password?: string;
  hotelCode?: string; // "BRISA" no ambiente da Aviva
}

export class OperaAdapter implements PmsAdapter {
  readonly provider: string;

  constructor(private readonly config: OperaConfig) {
    this.provider = config.provider;
  }

  async getReservation(_reservationId: string, _resortId: string): Promise<PmsReservation | null> {
    // OWS: FetchBookingRequest (Reservation.ws) → No.Conf, status, apto,
    // chegada/saída, plano, Adultos/Crianças. Mapear para PmsReservation.
    throw new PmsNotConfiguredError(this.provider, "getReservation");
  }

  async getFolio(_reservationId: string): Promise<RoomBill> {
    // OWS: GuestServices/Cashiering (folio postings) → consolidar em RoomBill,
    // mesmo shape que o SeedPmsAdapter já devolve (Saldo/Receita do módulo Caixa).
    throw new PmsNotConfiguredError(this.provider, "getFolio");
  }

  async addMaintenance(_params: {
    roomNumber: string;
    description: string;
    reportedByGuest: boolean;
  }): Promise<PmsMaintenanceRef> {
    // OWS/OXI: abrir registro em Governança → Manutenção (room maintenance /
    // out-of-order trace) com a descrição da triagem por foto. É o par de
    // escrita que fecha o círculo hóspede → OPERA.
    throw new PmsNotConfiguredError(this.provider, "addMaintenance");
  }
}
