import type { SearchChunk } from '../../shared/types';
import * as repo from './repository';
import { embedQuery, EMBEDDING_DIM, EMBEDDING_MODEL } from '../llm-gateway/embedding';

const SEARCH_CONFIG = { topN: 6, embeddingDim: EMBEDDING_DIM, embeddingModel: EMBEDDING_MODEL };

/** Reader wording plus resolved conversational subject; every source is bounded by K. */
export async function vectorSearch(
  bookId: string,
  query: string,
  K: number,
  subjectHint?: string
): Promise<SearchChunk[]> {
  // Alias occurrence does not prove when a same-person identity became known.
  // Preserve reader wording instead of injecting an unproven canonical identity.
  const retrievalQuery = subjectHint
    ? `${query.slice(0, 500)}\n${subjectHint.slice(0, 500)}`
    : query;
  const lexical = await repo.lexicalSearch(bookId, retrievalQuery, K, SEARCH_CONFIG.topN);
  let queryEmbedding: number[];
  try {
    queryEmbedding = await embedQuery(retrievalQuery);
  } catch {
    // Catch only provider failure. Database failures remain visible errors.
    console.warn('[VectorSearch] Embedding unavailable; using cutoff-bounded lexical evidence', {
      bookId,
      cutoff: K,
    });
    const results = boundedResults(lexical, K);
    logSearchResults(bookId, K, results);
    return results;
  }
  const vector = await repo.vectorSearch(bookId, queryEmbedding, K, SEARCH_CONFIG.topN);
  // Preserve semantic retrieval quality when frequent lexical words fill the budget.
  const merged: SearchChunk[] = [];
  for (let i = 0; i < Math.max(lexical.length, vector.length); i++) {
    if (lexical[i]) merged.push(lexical[i]);
    if (vector[i]) merged.push(vector[i]);
  }
  const results = boundedResults(merged, K);
  logSearchResults(bookId, K, results);
  return results;
}

function boundedResults(chunks: SearchChunk[], K: number): SearchChunk[] {
  const pages = new Set<number>();
  return chunks
    .filter((chunk) => {
      if (chunk.page_no < 1 || chunk.page_no > K || pages.has(chunk.page_no)) return false;
      pages.add(chunk.page_no);
      return true;
    })
    .slice(0, SEARCH_CONFIG.topN);
}

function logSearchResults(bookId: string, K: number, results: SearchChunk[]): void {
  console.log('[VectorSearch] Results', {
    timestamp: new Date().toISOString(),
    bookId,
    cutoff: K,
    resultCount: results.length,
    selectedPages: results.map((r) => r.page_no),
    distances: results.map((r) => r.distance),
  });
}

export function validateSearchResults(
  results: SearchChunk[],
  K: number
): { valid: boolean; violations: number[] } {
  const violations = results.filter((r) => r.page_no > K).map((r) => r.page_no);
  return { valid: violations.length === 0, violations };
}

export function getSearchStats(): { config: typeof SEARCH_CONFIG } {
  return { config: SEARCH_CONFIG };
}
