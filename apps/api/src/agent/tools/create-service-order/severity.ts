import type { Priority } from "@prisma/client";

/**
 * Prioridade automática por palavras-chave de severidade (determinística —
 * não delegada ao modelo). A descrição da reclamação é analisada e a pior
 * severidade encontrada vence.
 */
const URGENT_PATTERNS: RegExp[] = [
  /\b(alagad[oa]|alagamento|vazamento grande|inunda[çc][ãa]o)\b/i,
  // Água acumulada no piso: risco de escorregão + dano — escala mesmo sem a
  // palavra "alagado" (ex.: nota visual "poça d'água grande no piso").
  /\bpo[çc]a[s]? d'?[áa]gua\b/i,
  /\b[áa]gua (no|pelo) (piso|ch[ãa]o)\b/i,
  /\b(inc[êe]ndio|fogo|fuma[çc]a|cheiro de g[áa]s|g[áa]s vazando)\b/i,
  /\b(ferid[oa]|machucad[oa]|acidente|emerg[êe]ncia|passando mal)\b/i,
  /\b(sem energia|queda de energia|curto[- ]circuito|fia[çc][ãa]o exposta)\b/i,
  /\b(porta n[ãa]o tranca|fechadura quebrada|trancad[oa] (para )?fora)\b/i,
];

const HIGH_PATTERNS: RegExp[] = [
  /\b(vazando|vazamento|pingando|entupid[oa])\b/i,
  /\b(n[ãa]o funciona|parou de funcionar|quebrad[oa]|com defeito)\b/i,
  /\b(ar[- ]condicionado|chuveiro|frigobar|televis[ãa]o|tv)\b/i,
  /\b(sem [áa]gua|[áa]gua fria|sem wi[- ]?fi|internet ca(iu|indo))\b/i,
  /\b(barulho|barulhent[oa]|festa|m[úu]sica alta)\b/i,
];

const LOW_PATTERNS: RegExp[] = [
  /\b(sugest[ãa]o|sugerir|seria legal|poderia(m)? melhorar|feedback)\b/i,
  /\b(quando puder(em)?|sem pressa|n[ãa]o [ée] urgente)\b/i,
];

/**
 * Severidade por palavras-chave. Quando há foto do problema, a descrição do
 * que o agente VIU (visualNote) entra na análise junto com o texto do hóspede
 * — uma foto de alagamento escala mesmo se o hóspede digitar pouco.
 */
export function inferPriority(description: string, visualNote?: string | null): Priority {
  const text = visualNote ? `${description} ${visualNote}` : description;
  if (URGENT_PATTERNS.some((p) => p.test(text))) return "urgent";
  if (HIGH_PATTERNS.some((p) => p.test(text))) return "high";
  if (LOW_PATTERNS.some((p) => p.test(text))) return "low";
  return "medium";
}

/**
 * Prioridade por perfil do hóspede: membros do clube de férias têm suas
 * reclamações tratadas com prioridade mínima "high" (SLA mais curto).
 * Emergências reais continuam "urgent" — a severidade nunca é rebaixada.
 */
export function applyGuestProfileBoost(priority: Priority, profile: Record<string, unknown>): Priority {
  const isClubMember = profile.clubMember === true;
  if (isClubMember && (priority === "low" || priority === "medium")) return "high";
  return priority;
}

/** SLA = agora + horas configuradas por prioridade no resort (settings). */
export function computeSlaDueAt(
  now: Date,
  priority: Priority,
  slaHoursByPriority: Record<Priority, number>,
): Date {
  return new Date(now.getTime() + slaHoursByPriority[priority] * 60 * 60 * 1000);
}
