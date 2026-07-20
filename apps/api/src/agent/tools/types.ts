import type { z } from "zod";
import type { AgentCardKind, ResortSettings } from "@concierge/shared";
import type { Repos } from "../../repositories/index.js";

/**
 * Contexto entregue a toda tool. O agent-core não conhece HTTP nem canal —
 * tudo que uma tool precisa (tenant, hóspede, reserva, repos) chega por aqui.
 */
export interface ToolContext {
  conversationId: string;
  resort: {
    id: string;
    name: string;
    settings: ResortSettings;
  };
  guest: {
    id: string;
    name: string;
    profile: Record<string, unknown>;
    lastProactiveOfferAt: Date | null;
  };
  reservation: {
    id: string;
    roomNumber: string | null;
    checkIn: Date;
    checkOut: Date;
    status: string;
    plan: string;
  };
  now: Date;
  /** Repositories injetados — testes unitários passam fakes. */
  repos: Repos;
}

/** Card rico renderizado pelo canal — kinds em sincronia com agentEventSchema. */
export interface ToolCard {
  kind: AgentCardKind;
  data: unknown;
}

export interface ToolResult {
  /** Resultado devolvido ao modelo como tool_result (serializado em JSON). */
  output: unknown;
  card?: ToolCard;
  /** Presente quando a conversa deve ser encaminhada a um humano. */
  handoff?: { reason: string };
}

export type GuardrailVerdict =
  | { allowed: true }
  | {
      allowed: false;
      /** Explicação que o modelo recebe para comunicar o bloqueio com elegância. */
      reasonForModel: string;
    };

/**
 * Uma tool é um plugin isolado: schema Zod + handler + guardrail opcional.
 * Registrar uma tool nova não exige mudança no core (ADR-007).
 */
export interface AgentTool<S extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  inputSchema: S;
  /** Checagem determinística executada ANTES do handler (ex.: anti-spam de upsell). */
  guardrail?: (input: z.infer<S>, ctx: ToolContext) => Promise<GuardrailVerdict> | GuardrailVerdict;
  handler: (input: z.infer<S>, ctx: ToolContext) => Promise<ToolResult>;
}

/** Helper de inferência para definir tools com tipagem completa do input. */
export function defineTool<S extends z.ZodTypeAny>(tool: AgentTool<S>): AgentTool<S> {
  return tool;
}
