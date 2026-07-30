import Anthropic from "@anthropic-ai/sdk";
import type { AgentEvent } from "@concierge/shared";
import { buildSystemBlocks, loadKnowledge } from "./prompt.js";
import { joinSegments } from "./segments.js";
import type { ToolRegistry } from "./tools/registry.js";
import type { ToolContext } from "./tools/types.js";

export const AGENT_MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 2048;
/** Trava de segurança contra loops de tool use. */
const MAX_ITERATIONS = 8;

export interface AgentTurnDeps {
  anthropic: Anthropic;
  registry: ToolRegistry;
  logger?: { error: (obj: unknown, msg?: string) => void };
}

export interface AgentTurnOutcome {
  /** Texto final do agente (para persistir como message role=agent). */
  finalText: string;
  handoff: { reason: string } | null;
  errored: boolean;
}

/**
 * Executa um turno completo do agente: loop manual de tool use com streaming.
 *
 * Por que loop manual (ADR-004): cada tool_use é interceptado para guardrails
 * e trilha de auditoria ANTES de executar — o Tool Runner do SDK não dá esse
 * controle sem hooks beta. Contratos da API respeitados:
 * - todos os tool_results de uma rodada voltam numa única mensagem user;
 * - tool com falha → is_error: true (o modelo se recupera);
 * - prompt caching no último bloco do system (cobre tools + system).
 *
 * Emite AgentEvents neutros de canal; quem traduz para SSE/WhatsApp é o
 * ChannelAdapter. Nunca lança: qualquer falha vira evento `error`.
 */
export async function* runAgentTurn(
  ctx: ToolContext,
  history: Anthropic.MessageParam[],
  deps: AgentTurnDeps,
): AsyncGenerator<AgentEvent, AgentTurnOutcome> {
  const knowledge = await loadKnowledge(ctx.resort.id);
  const system = buildSystemBlocks(ctx.resort.name, knowledge);
  const tools = deps.registry.toAnthropicTools();

  const messages: Anthropic.MessageParam[] = [...history];
  const textSegments: string[] = [];
  let handoff: { reason: string } | null = null;

  try {
    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      const stream = deps.anthropic.messages.stream({
        model: AGENT_MODEL,
        max_tokens: MAX_TOKENS,
        system,
        tools,
        messages,
      });

      let segment = "";
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          segment += event.delta.text;
          yield { type: "text_delta", text: event.delta.text };
        }
      }
      if (segment.trim()) textSegments.push(segment);

      const response = await stream.finalMessage();

      if (response.stop_reason !== "tool_use") break;

      // Ecoa o turno do assistant (com os tool_use blocks) e executa as tools.
      messages.push({ role: "assistant", content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type !== "tool_use") continue;

        yield { type: "tool_started", toolName: block.name };
        const result = await deps.registry.execute(block.name, block.input, ctx);

        if (result.card) {
          yield { type: "card", kind: result.card.kind, data: result.card.data };
        }
        if (result.handoff) {
          handoff = result.handoff;
          yield { type: "handoff", reason: result.handoff.reason };
        }

        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(result.outputForModel),
          ...(result.ok ? {} : { is_error: true }),
        });
      }

      messages.push({ role: "user", content: toolResults });
    }

    return { finalText: joinSegments(textSegments), handoff, errored: false };
  } catch (err) {
    deps.logger?.error(err, "falha na chamada à Anthropic API");
    const friendly =
      err instanceof Anthropic.APIConnectionError || err instanceof Anthropic.RateLimitError
        ? "Estou com instabilidade momentânea. Pode tentar de novo em instantes?"
        : "Tive um problema técnico aqui. Já avisei a equipe — tente novamente em instantes.";
    yield { type: "error", code: "agent_failure", message: friendly };
    return { finalText: joinSegments(textSegments), handoff, errored: true };
  }
}
