import type { AgentEvent } from "@concierge/shared";

/**
 * Padrão Channel Adapter (ADR-006): o agent-core emite AgentEvents neutros;
 * cada canal traduz para seu transporte. Adicionar um canal novo = implementar
 * esta interface + uma rota de entrada. Zero mudança no core.
 */
export interface ChannelAdapter {
  send(event: AgentEvent): void | Promise<void>;
  /**
   * Fecha o turno. Pode devolver promessa: canais que enfileiram envios (o
   * WhatsApp serializa para preservar a ordem no celular) só terminam de
   * entregar aqui, e quem chama precisa poder esperar.
   */
  close(): void | Promise<void>;
}
