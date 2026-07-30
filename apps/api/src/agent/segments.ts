/**
 * Segmentos de texto de um turno — um por rodada do loop de tool use.
 *
 * Depois do resultado de uma ferramenta o modelo às vezes REESCREVE o que já
 * havia dito antes de chamá-la, às vezes acrescentando uma frase. Como o texto
 * anterior já foi entregue ao hóspede, o resultado no celular é a mesma frase
 * duas vezes — foi o que apareceu em 2 de 9 turnos da jornada de check-in.
 *
 * A regra é conservadora de propósito: só descarta um segmento quando um
 * posterior COMEÇA com ele. Assim fica a versão mais completa, e uma retomada
 * que apenas continue o assunto não é confundida com repetição.
 */

/** Abaixo disto a "repetição" é curta demais para valer o risco de falso positivo. */
const MIN_CHARS = 12;

const norm = (s: string): string => s.replace(/\s+/g, " ").trim();

export function mergeSegments(segments: string[]): string[] {
  const parts = segments.map((s) => s.trim()).filter(Boolean);
  return parts.filter((part, i) => {
    if (norm(part).length < MIN_CHARS) return true;
    const seguintes = parts.slice(i + 1);
    return !seguintes.some((later) => norm(later).startsWith(norm(part)));
  });
}

/** Texto final do turno, já sem as repetições. */
export function joinSegments(segments: string[]): string {
  return mergeSegments(segments).join("\n\n");
}
