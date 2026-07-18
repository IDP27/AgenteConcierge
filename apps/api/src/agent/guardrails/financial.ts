import type { ResortSettings } from "@concierge/shared";

/**
 * Guardrail financeiro (ADR-009): regra de dinheiro é código, não prompt.
 * Pedidos acima do limite do resort nascem pending_approval e vão para a
 * fila de aprovação humana no painel.
 */
export function requiresHumanApproval(totalCents: number, settings: ResortSettings): boolean {
  return totalCents > settings.orderAutoApproveLimitCents;
}
