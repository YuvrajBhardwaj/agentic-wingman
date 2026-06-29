import type { ChatChunk, ModelRouter } from '@forgewright/types';

import type { ParsedDocument } from './types.js';

export interface SummarizeOptions {
  readonly maxChars?: number;
  readonly instructions?: string;
}

/** Summarize a parsed document with the reasoning model. */
export const summarizeDocument = async (
  doc: ParsedDocument,
  router: ModelRouter,
  options: SummarizeOptions = {},
): Promise<string> => {
  const provider = router.forRole('reasoning');
  const content = doc.text.slice(0, options.maxChars ?? 12000);
  const instructions =
    options.instructions ??
    'Summarize this document clearly: key points, decisions, and any action items. Be concise.';
  let text = '';
  const stream = provider.chat({
    messages: [
      { role: 'system', content: instructions },
      { role: 'user', content },
    ],
  }) as AsyncIterable<ChatChunk>;
  for await (const chunk of stream) {
    if (chunk.type === 'text') text += chunk.delta;
  }
  return text.trim();
};

export interface DocumentDiff {
  readonly added: readonly string[];
  readonly removed: readonly string[];
  readonly unchanged: number;
}

/** Compare two document versions by line membership. */
export const compareDocuments = (before: ParsedDocument, after: ParsedDocument): DocumentDiff => {
  const beforeLines = before.text.split('\n');
  const afterLines = after.text.split('\n');
  const beforeSet = new Set(beforeLines);
  const afterSet = new Set(afterLines);
  return {
    added: afterLines.filter((l) => !beforeSet.has(l) && l.trim() !== ''),
    removed: beforeLines.filter((l) => !afterSet.has(l) && l.trim() !== ''),
    unchanged: afterLines.filter((l) => beforeSet.has(l)).length,
  };
};

/** Render a parsed document's tables as Markdown (for reports/export). */
export const tablesToMarkdown = (doc: ParsedDocument): string =>
  doc.tables
    .map((table) => {
      const header = `| ${table.headers.join(' | ')} |`;
      const sep = `| ${table.headers.map(() => '---').join(' | ')} |`;
      const body = table.rows.map((r) => `| ${r.join(' | ')} |`).join('\n');
      return `${table.name ? `### ${table.name}\n` : ''}${header}\n${sep}\n${body}`;
    })
    .join('\n\n');
