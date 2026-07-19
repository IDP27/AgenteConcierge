/**
 * Pipeline de ingestão da base de conhecimento (inspirado no gap observado
 * na análise competitiva: centenas de artigos de FAQ presos num portal que
 * o hóspede precisa garimpar — aqui eles viram respostas do agente).
 *
 * KnowledgeSource é plugável: arquivos locais hoje, portal de ajuda/CMS
 * amanhã — o compilador e o agente não mudam.
 */
export interface KnowledgeArticle {
  /** Título do artigo (vira âncora de seção no markdown compilado). */
  title: string;
  /** Conteúdo em markdown/texto. */
  content: string;
  /** De onde veio (arquivo, URL) — registrado no compilado para auditoria. */
  origin: string;
}

export interface KnowledgeSource {
  name: string;
  fetchArticles(resortId: string): Promise<KnowledgeArticle[]>;
}
