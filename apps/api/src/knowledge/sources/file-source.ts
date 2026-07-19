import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { KnowledgeArticle, KnowledgeSource } from "../types.js";

/**
 * Fonte local: data/knowledge-sources/<resortId>/*.md — um arquivo por tema,
 * ordenados pelo nome (prefixo numérico controla a ordem). É a fonte "dona"
 * do conteúdo editorial do resort.
 */
export class FileSource implements KnowledgeSource {
  readonly name = "files";

  constructor(private readonly baseDir: string) {}

  async fetchArticles(resortId: string): Promise<KnowledgeArticle[]> {
    const dir = join(this.baseDir, resortId);
    let files: string[];
    try {
      files = (await readdir(dir)).filter((f) => f.endsWith(".md")).sort();
    } catch {
      return []; // resort sem fontes locais — não é erro
    }

    const articles: KnowledgeArticle[] = [];
    for (const file of files) {
      const content = await readFile(join(dir, file), "utf-8");
      const heading = content.match(/^#+\s+(.+)$/m);
      articles.push({
        title: heading?.[1] ?? file.replace(/^\d+[-_]?/, "").replace(/\.md$/, ""),
        content,
        origin: `file:${file}`,
      });
    }
    return articles;
  }
}
