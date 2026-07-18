import { ToolRegistry } from "./registry.js";
import { escalateToHuman } from "./escalate-to-human/index.js";

/**
 * Registry padrão do agente. Registrar tool nova = 1 import + 1 linha aqui;
 * o core (agent.ts) não muda. As 6 tools do MVP entram na Fase 3.
 */
export function buildDefaultRegistry(): ToolRegistry {
  return new ToolRegistry().register(escalateToHuman);
}
