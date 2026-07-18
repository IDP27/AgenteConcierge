import type Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { AgentTool, ToolCard, ToolContext } from "./types.js";

export interface ToolExecutionResult {
  /** false → tool_result com is_error (o modelo se recupera e explica ao hóspede). */
  ok: boolean;
  /** Conteúdo do tool_result enviado ao modelo (será serializado em JSON). */
  outputForModel: unknown;
  card?: ToolCard;
  handoff?: { reason: string };
}

/**
 * Registro de tools como plugins. O core itera o registry — não conhece
 * nenhuma tool individualmente. Toda execução passa por:
 *   validação Zod → guardrail → handler → trilha de auditoria (agent_actions).
 */
export class ToolRegistry {
  private readonly tools = new Map<string, AgentTool>();

  register<S extends z.ZodTypeAny>(tool: AgentTool<S>): this {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool duplicada no registry: ${tool.name}`);
    }
    // Type erasure intencional: internamente o input é unknown até o safeParse.
    this.tools.set(tool.name, tool as unknown as AgentTool);
    return this;
  }

  list(): AgentTool[] {
    return [...this.tools.values()];
  }

  /** Converte os schemas Zod para o formato de tools da Anthropic API. */
  toAnthropicTools(): Anthropic.Tool[] {
    return this.list().map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: zodToJsonSchema(tool.inputSchema, {
        $refStrategy: "none",
      }) as Anthropic.Tool.InputSchema,
    }));
  }

  async execute(name: string, rawInput: unknown, ctx: ToolContext): Promise<ToolExecutionResult> {
    const audit = (status: "success" | "error" | "blocked_by_guardrail", output: unknown) =>
      ctx.repos.agentActions.record({
        conversationId: ctx.conversationId,
        toolName: name,
        input: rawInput,
        output,
        status,
      });

    const tool = this.tools.get(name);
    if (!tool) {
      const output = { error: `Ferramenta desconhecida: ${name}` };
      await audit("error", output);
      return { ok: false, outputForModel: output };
    }

    const parsed = tool.inputSchema.safeParse(rawInput);
    if (!parsed.success) {
      const output = {
        error: "Parâmetros inválidos",
        details: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      };
      await audit("error", output);
      return { ok: false, outputForModel: output };
    }

    if (tool.guardrail) {
      const verdict = await tool.guardrail(parsed.data, ctx);
      if (!verdict.allowed) {
        const output = { allowed: false, reason: verdict.reasonForModel };
        await audit("blocked_by_guardrail", output);
        // ok:true de propósito — não é erro; o modelo deve comunicar o motivo.
        return { ok: true, outputForModel: output };
      }
    }

    try {
      const result = await tool.handler(parsed.data, ctx);
      await audit("success", result.output);
      return {
        ok: true,
        outputForModel: result.output,
        card: result.card,
        handoff: result.handoff,
      };
    } catch (err) {
      const output = {
        error: "A ferramenta falhou. Diga ao hóspede que você vai verificar com a equipe.",
      };
      await audit("error", { message: err instanceof Error ? err.message : String(err) });
      return { ok: false, outputForModel: output };
    }
  }
}
