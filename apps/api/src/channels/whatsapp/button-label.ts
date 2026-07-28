import { WA_LIMITS } from "./client.js";

/**
 * Preposições/conjunções que não devem sobrar penduradas no fim do rótulo
 * ("Cesta de frutas e…" fica pior que "Cesta de frutas…").
 */
const TRAILING_STOPWORDS = new Set([
  "de", "da", "do", "das", "dos",
  "e", "ou",
  "no", "na", "nos", "nas",
  "em", "com", "para", "por", "sem",
  "a", "o", "as", "os", "ao", "à",
]);

/**
 * Título de oferta → rótulo de botão do WhatsApp (máx. 20 caracteres).
 *
 * A Cloud API corta em 20 caracteres SEM dó, no meio da palavra: "Massagem
 * relaxante no Spa Mar Azul" virava "Massagem relaxante n". Aqui o corte
 * respeita a fronteira de palavra e sinaliza com reticência.
 *
 * O rótulo curto não perde informação: o título completo e o preço estão no
 * corpo da mensagem, logo acima dos botões — o botão só precisa identificar
 * qual linha o hóspede está tocando.
 *
 * Vive no adapter, e não como campo da oferta: o limite é uma restrição do
 * WhatsApp, e o título cru continua correto no catálogo, no painel e no web.
 */
export function toButtonLabel(title: string, max: number = WA_LIMITS.buttonTitle): string {
  const clean = title.trim().replace(/\s+/g, " ");
  if (clean.length <= max) return clean;

  const budget = max - 1; // reserva 1 caractere para a reticência
  const kept: string[] = [];
  let length = 0;

  for (const word of clean.split(" ")) {
    const next = kept.length === 0 ? word.length : length + 1 + word.length;
    if (next > budget) break;
    kept.push(word);
    length = next;
  }

  while (kept.length > 1 && TRAILING_STOPWORDS.has((kept.at(-1) as string).toLowerCase())) {
    kept.pop();
  }

  // Palavra única maior que o limite: não há fronteira para respeitar.
  if (kept.length === 0) return `${clean.slice(0, budget)}…`;
  return `${kept.join(" ")}…`;
}
