import type { KnowledgeArticle } from "./types.js";

/**
 * Compila os artigos coletados num único markdown por resort — o formato que
 * o system prompt consome (com prompt caching, ADR-010).
 */
export function compileKnowledge(
  resortName: string,
  articles: KnowledgeArticle[],
  generatedAt: Date,
): string {
  const header =
    `# ${resortName} — Base de conhecimento\n\n` +
    `> Gerado por knowledge:sync em ${generatedAt.toISOString()}. ` +
    `NÃO edite este arquivo: edite as fontes em data/knowledge-sources/ e rode o sync.\n`;

  const body = articles
    .map((a) => {
      const content = a.content.trim();
      // Artigo sem heading próprio ganha o título como seção.
      const withTitle = content.startsWith("#") ? content : `## ${a.title}\n\n${content}`;
      return `${withTitle}\n\n<!-- fonte: ${a.origin} -->`;
    })
    .join("\n\n");

  return `${header}\n${body}\n`;
}
