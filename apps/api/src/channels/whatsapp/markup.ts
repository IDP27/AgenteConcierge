const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_SEPARATOR = /^\s*\|[\s:|-]+\|\s*$/;

/**
 * Tabela markdown → linhas de texto. O WhatsApp não tem tabelas: `| a | b |`
 * chega ao aparelho como pipes e traços crus. A linha de cabeçalho (a que
 * precede o separador) vira negrito; as demais viram itens.
 */
function tablesToLines(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string;
    if (TABLE_SEPARATOR.test(line)) continue; // |---|---| não existe no WhatsApp
    if (!TABLE_ROW.test(line)) {
      out.push(line);
      continue;
    }
    const cells = line
      .trim()
      .slice(1, -1)
      .split("|")
      .map((c) => c.trim())
      .filter(Boolean);
    if (cells.length === 0) continue;

    const isHeader = TABLE_SEPARATOR.test(lines[i + 1] ?? "");
    out.push(isHeader ? `*${cells.join(" — ")}*` : `• ${cells.join(" — ")}`);
  }
  return out.join("\n");
}

/**
 * Markdown do modelo → marcação do WhatsApp.
 *
 * O agente escreve como um LLM escreve: `**negrito**`, títulos `## assim` e,
 * às vezes, tabelas. O WhatsApp usa `*negrito*` (asterisco SIMPLES) e não tem
 * títulos nem tabelas — sem esta conversão, o hóspede vê a marcação literal
 * no aparelho. Ambos os casos foram descobertos no simulador de canal.
 *
 * A conversão vive AQUI, no adapter, e não no prompt: o chat web renderiza
 * markdown corretamente, então proibir markdown no prompt pioraria o outro
 * canal. Cada canal adapta o mesmo texto ao seu suporte.
 */
export function toWhatsAppMarkup(text: string): string {
  return (
    tablesToLines(text)
      // **negrito** e __negrito__ → *negrito* (o WhatsApp usa asterisco simples)
      .replace(/\*\*([^*\n]+)\*\*/g, "*$1*")
      .replace(/__([^_\n]+)__/g, "*$1*")
      // Títulos markdown não existem no WhatsApp: viram texto em negrito.
      .replace(/^#{1,6}\s+(.+)$/gm, "*$1*")
  );
}
