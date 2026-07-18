/**
 * Rede de segurança determinística para handoff (ADR-009).
 * Complementa a tool escalate_to_human (que o modelo aciona por instrução):
 * mesmo que o modelo falhe em escalar, estas heurísticas garantem o handoff.
 */

const EXPLICIT_REQUEST_PATTERNS: RegExp[] = [
  /falar com (um |uma )?(atendente|humano|pessoa|gerente|recep[cç][aã]o)/i,
  /quero (um |uma )?(atendente|humano|gerente)/i,
  /chama (o|a) (gerente|recep[cç][aã]o)/i,
  /atendimento humano/i,
];

const FRUSTRATION_PATTERNS: RegExp[] = [
  /\b(absurdo|rid[ií]culo|inaceit[aá]vel|p[eé]ssimo|horr[ií]vel|vergonha|palha[cç]ada)\b/i,
  /\b(ningu[eé]m (me )?(ajuda|responde|resolve))\b/i,
  /\b(cansad[oa] de esperar|j[aá] pedi (isso )?v[aá]rias vezes)\b/i,
  /\b(vou processar|procon|reclame aqui)\b/i,
];

export function detectHandoffReason(text: string): string | null {
  if (EXPLICIT_REQUEST_PATTERNS.some((p) => p.test(text))) {
    return "Hóspede pediu explicitamente atendimento humano";
  }
  if (FRUSTRATION_PATTERNS.some((p) => p.test(text))) {
    return "Sinais de frustração detectados na mensagem do hóspede";
  }
  return null;
}
