import type { KnowledgeArticle, KnowledgeSource } from "../types.js";

const FETCH_TIMEOUT_MS = 8000;

/**
 * Fonte remota: URLs de artigos (ex.: central de ajuda pública do resort)
 * configuradas em resort.settings.knowledgeSourceUrls. O HTML é reduzido a
 * texto — bom o bastante para FAQ; um extractor melhor pluga aqui depois.
 */
export class UrlSource implements KnowledgeSource {
  readonly name = "urls";

  constructor(private readonly urls: string[]) {}

  async fetchArticles(_resortId: string): Promise<KnowledgeArticle[]> {
    const articles: KnowledgeArticle[] = [];
    for (const url of this.urls) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
        if (!res.ok) continue;
        const html = await res.text();
        const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ?? url;
        const text = htmlToText(html);
        if (!text) continue;
        articles.push({ title, content: text, origin: url });
      } catch {
        // URL fora do ar não derruba o sync das demais fontes
      }
    }
    return articles;
  }
}

/** Extração simples: prefere <main>/<article>, remove script/style, limpa tags. */
export function htmlToText(html: string): string {
  const scoped =
    html.match(/<main[\s\S]*?<\/main>/i)?.[0] ??
    html.match(/<article[\s\S]*?<\/article>/i)?.[0] ??
    html.match(/<body[\s\S]*?<\/body>/i)?.[0] ??
    html;

  return scoped
    .replace(/<(script|style|noscript|nav|footer|header)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}
