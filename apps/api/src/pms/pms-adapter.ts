import type { RoomBill } from "@concierge/shared";

/**
 * Seam de integração com o PMS (mesmo princípio do ChannelAdapter e do
 * LockAdapter): o agente lê reserva/folio e devolve informação de manutenção
 * por ESTA interface. Cada PMS a implementa. Trocar de fonte = implementar
 * isto + apontar resort.settings.pmsProvider. O core não muda.
 *
 * Referência real: Oracle OPERA 5 (Costa do Sauípe/Aviva). O mapeamento de
 * cada método para as telas do OPERA está anotado abaixo e no OperaAdapter.
 *
 * Fora do v1, documentados como as próximas costuras (o seed não tem fonte
 * honesta para servi-las — só o OPERA tem):
 *   getProfile(guestId): PmsProfile   → Cadastro + painel "Futuro" + Passport
 *   searchAvailability(criteria)       → Pesquisa de Tarifa + Mapa de Aptos
 */

/** Uma estadia (passada ou futura) do hóspede — painel "Futuro" do Cadastro. */
export interface PmsStayRef {
  /** No.Conf no OPERA. */
  confirmationNumber: string;
  checkIn: Date;
  checkOut: Date;
  status: string;
}

/** Reserva vista pelo agente — tela "Busca de Reserva" do OPERA. */
export interface PmsReservation {
  /** Localizador — No.Conf no OPERA (id interno no seed). */
  confirmationNumber: string;
  status: string;
  /** Apto atribuído (null antes da chegada). */
  roomNumber: string | null;
  checkIn: Date;
  checkOut: Date;
  plan: string;
  /** Composição do grupo (Adultos/Crianças no OPERA; companions no seed). */
  adults: number;
  children: number;
}

/**
 * Perfil do hóspede — tela "Cadastro/Busca Cadastro" do OPERA, incluindo o
 * painel "Futuro" (próximas estadias) e o campo Passport No. (FNRH estrangeiro).
 * Tipo já definido para a próxima costura (getProfile); ver comentário do topo.
 */
export interface PmsProfile {
  guestId: string;
  name: string;
  /** "cpf" | "passaporte" | null — dá suporte a hóspede estrangeiro. */
  documentType: string | null;
  document: string | null;
  nationality: string | null;
  /** Já tem histórico de estadias — habilita tratamento de recorrente. */
  isReturning: boolean;
  /** Próximas reservas do perfil (painel "Futuro"). */
  futureStays: PmsStayRef[];
}

/** Retorno de um registro de manutenção aberto no PMS. */
export interface PmsMaintenanceRef {
  id: string;
  /** true no seed: o registro NÃO foi para o OPERA, é só a costura. */
  isSeed: boolean;
}

export interface PmsAdapter {
  readonly provider: string;

  /** Lê a reserva (Busca de Reserva). */
  getReservation(reservationId: string, resortId: string): Promise<PmsReservation | null>;

  /**
   * Extrato/conta do quarto (módulo Caixa/Contas → coluna Saldo, Receita).
   * Reusa o mesmo shape RoomBill que o card do hóspede já renderiza.
   */
  getFolio(reservationId: string): Promise<RoomBill>;

  /**
   * Abre um registro de manutenção (módulo Governança → Manutenção).
   * É o par de ESCRITA da triagem por foto: a OS gerada de uma foto do
   * hóspede vira um chamado no sistema que a equipe da Aviva já opera.
   */
  addMaintenance(params: {
    roomNumber: string;
    description: string;
    reportedByGuest: boolean;
  }): Promise<PmsMaintenanceRef>;
}

/** Erro lançado por adapters de PMS ainda não conectados (ex.: OperaAdapter). */
export class PmsNotConfiguredError extends Error {
  constructor(provider: string, operation: string) {
    super(
      `PMS "${provider}" não configurado: operação "${operation}" exige a integração real ` +
        `(OWS/OHIP). Enquanto isso, use pmsProvider="seed".`,
    );
    this.name = "PmsNotConfiguredError";
  }
}
