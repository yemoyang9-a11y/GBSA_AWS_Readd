const QUOTE_MARKER = '\n\n선택한 문장: ';

/** Preserve reader-selected text as user context; this format confers no source trust. */
export function formatConversationInput(query: string, quote?: string): string {
  return quote === undefined ? query : `${query}${QUOTE_MARKER}${JSON.stringify(quote)}`;
}

/** Legacy and malformed text remains intact instead of losing part of the user's question. */
export function parseConversationInput(text: string): { query: string; quote?: string } {
  const marker = text.lastIndexOf(QUOTE_MARKER);
  if (marker <= 0) return { query: text };
  try {
    const quote: unknown = JSON.parse(text.slice(marker + QUOTE_MARKER.length));
    if (typeof quote === 'string') return { query: text.slice(0, marker), quote };
  } catch {
    // A marker inside ordinary user wording is not a serialized quote.
  }
  return { query: text };
}
