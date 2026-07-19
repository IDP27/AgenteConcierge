import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { repos } from "../repositories/index.js";
import { NotFoundError } from "../lib/errors.js";
import { invalidateKnowledge } from "../agent/prompt.js";
import { compileKnowledge } from "./compile.js";
import { FileSource } from "./sources/file-source.js";
import { UrlSource } from "./sources/url-source.js";
import type { KnowledgeSource } from "./types.js";

const DATA_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../data");
const SOURCES_DIR = join(DATA_DIR, "knowledge-sources");
const OUTPUT_DIR = join(DATA_DIR, "knowledge");

export interface SyncResult {
  resortId: string;
  articles: number;
  bySource: Record<string, number>;
  outputPath: string;
}

/**
 * Sincroniza a base de conhecimento de um resort: coleta das fontes
 * plugadas, compila num markdown único e invalida o cache do agente —
 * a próxima conversa já responde com o conteúdo novo, sem restart.
 */
export async function syncResortKnowledge(resortId: string): Promise<SyncResult> {
  const resort = await repos.resorts.findById(resortId);
  if (!resort) throw new NotFoundError("Resort");

  const sources: KnowledgeSource[] = [new FileSource(SOURCES_DIR)];
  if (resort.settings.knowledgeSourceUrls.length > 0) {
    sources.push(new UrlSource(resort.settings.knowledgeSourceUrls));
  }

  const bySource: Record<string, number> = {};
  const articles = [];
  for (const source of sources) {
    const found = await source.fetchArticles(resortId);
    bySource[source.name] = found.length;
    articles.push(...found);
  }

  if (articles.length === 0) {
    // Sem fontes: preserva o compilado atual em vez de gerar um arquivo vazio.
    return { resortId, articles: 0, bySource, outputPath: join(OUTPUT_DIR, `${resortId}.md`) };
  }

  const outputPath = join(OUTPUT_DIR, `${resortId}.md`);
  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(outputPath, compileKnowledge(resort.name, articles, new Date()), "utf-8");
  invalidateKnowledge(resortId);

  return { resortId, articles: articles.length, bySource, outputPath };
}
