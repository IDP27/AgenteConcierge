import { z } from "zod";

/**
 * Shape do JSONB `resorts.settings`.
 * Limites de guardrail são configuráveis por resort (multi-tenant).
 */
export const resortSettingsSchema = z.object({
  /** Pedidos com total acima deste valor nascem `pending_approval`. */
  orderAutoApproveLimitCents: z.number().int().nonnegative().default(20000),
  /** Máximo de ofertas proativas (upsell) por hóspede por dia. */
  maxProactiveOffersPerDay: z.number().int().positive().default(1),
  /** SLA em horas por prioridade de OS. */
  slaHoursByPriority: z
    .object({
      low: z.number().positive().default(24),
      medium: z.number().positive().default(8),
      high: z.number().positive().default(2),
      urgent: z.number().positive().default(1),
    })
    .default({}),
  timezone: z.string().default("America/Sao_Paulo"),
  /**
   * Kill switch financeiro: quando true, o agente NÃO executa nenhuma ação
   * com efeito financeiro (pedidos) — a equipe assume. Controle de emergência
   * acionável pelo painel, por resort.
   */
  financialKillSwitch: z.boolean().default(false),
  /**
   * URLs de artigos públicos (ex.: central de ajuda) ingeridos pelo
   * knowledge:sync junto com os arquivos de data/knowledge-sources/.
   */
  knowledgeSourceUrls: z.array(z.string().url()).default([]),
  /** Roteamento inteligente de avaliações (pós-estadia). */
  review: z
    .object({
      /** Link público (Google/Booking) enviado a hóspedes satisfeitos. */
      publicUrl: z.string().url().default("https://g.page/r/resort-paraiso/review"),
      /** Nota mínima (1–5) para direcionar ao canal público; abaixo disso vai ao interno. */
      satisfactionThreshold: z.number().int().min(1).max(5).default(4),
    })
    .default({}),
});

export type ResortSettings = z.infer<typeof resortSettingsSchema>;

/** Parse tolerante: JSONB vazio/parcial vira settings com defaults. */
export function parseResortSettings(raw: unknown): ResortSettings {
  return resortSettingsSchema.parse(raw ?? {});
}
