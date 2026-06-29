import type { ChatChunk, ModelRouter } from '@forgewright/types';

import type { Fetcher } from './fetcher.js';
import { htmlToText } from './web.js';

export interface SearchResult {
  readonly title: string;
  readonly url: string;
  readonly snippet?: string;
}

export interface SearchProvider {
  search(query: string, limit: number, signal?: AbortSignal): Promise<readonly SearchResult[]>;
}

export interface Citation {
  readonly url: string;
  readonly title: string;
  readonly snippet?: string;
}

export interface ResearchReport {
  readonly topic: string;
  readonly executiveSummary: string;
  readonly report: string;
  readonly citations: readonly Citation[];
  readonly confidence: number;
  readonly sources: readonly string[];
}

export interface ResearchOptions {
  readonly maxSources?: number;
  readonly signal?: AbortSignal;
}

const collectText = async (stream: AsyncIterable<ChatChunk>): Promise<string> => {
  let text = '';
  for await (const chunk of stream) if (chunk.type === 'text') text += chunk.delta;
  return text.trim();
};

const parseQueries = (text: string, fallback: string): string[] => {
  try {
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start !== -1 && end > start) {
      const parsed = JSON.parse(text.slice(start, end + 1));
      if (Array.isArray(parsed)) {
        const queries = parsed.filter((q): q is string => typeof q === 'string');
        if (queries.length > 0) return queries;
      }
    }
  } catch {
    // fall through to line parsing
  }
  const lines = text
    .split('\n')
    .map((l) => l.replace(/^[-*\d.)\s]+/, '').trim())
    .filter((l) => l.length > 0);
  return lines.length > 0 ? lines : [fallback];
};

const confidenceFrom = (sources: number, target: number): number => {
  const ratio = Math.min(1, sources / Math.max(1, target));
  return Math.round((0.2 + 0.8 * ratio) * 100) / 100;
};

/**
 * Researches a topic: plans search queries, retrieves and reads sources, and
 * synthesizes a cited report with an executive summary and a confidence score.
 * Search and fetch are injected, so it works with any provider (web search API,
 * the http tool, or a browser driver).
 */
export class ResearchAgent {
  constructor(
    private readonly router: ModelRouter,
    private readonly search: SearchProvider,
    private readonly fetcher: Fetcher,
  ) {}

  async research(topic: string, options: ResearchOptions = {}): Promise<ResearchReport> {
    const maxSources = options.maxSources ?? 5;
    const queries = await this.planQueries(topic, options.signal);

    const seen = new Set<string>();
    const found: SearchResult[] = [];
    for (const query of queries) {
      if (found.length >= maxSources) break;
      const results = await this.search.search(query, maxSources, options.signal);
      for (const result of results) {
        if (seen.has(result.url)) continue;
        seen.add(result.url);
        found.push(result);
        if (found.length >= maxSources) break;
      }
    }

    const documents: { source: SearchResult; text: string }[] = [];
    for (const source of found) {
      try {
        const page = await this.fetcher.fetch(source.url, options.signal);
        documents.push({ source, text: htmlToText(page.body).slice(0, 4000) });
      } catch {
        // skip unreachable sources
      }
    }

    const report = await this.synthesize(topic, documents, options.signal);
    const citations: Citation[] = documents.map((d) => ({
      url: d.source.url,
      title: d.source.title,
      ...(d.source.snippet ? { snippet: d.source.snippet } : {}),
    }));

    return {
      topic,
      executiveSummary: report.split('\n\n')[0] ?? report,
      report,
      citations,
      confidence: confidenceFrom(documents.length, maxSources),
      sources: documents.map((d) => d.source.url),
    };
  }

  private async planQueries(topic: string, signal?: AbortSignal): Promise<string[]> {
    const provider = this.router.forRole('reasoning');
    const text = await collectText(
      provider.chat({
        messages: [
          {
            role: 'system',
            content:
              'Produce 3-5 focused web search queries to research the topic. Reply with ONLY a JSON array of strings.',
          },
          { role: 'user', content: topic },
        ],
        ...(signal ? { signal } : {}),
      }) as AsyncIterable<ChatChunk>,
    );
    return parseQueries(text, topic);
  }

  private async synthesize(
    topic: string,
    documents: readonly { source: SearchResult; text: string }[],
    signal?: AbortSignal,
  ): Promise<string> {
    const provider = this.router.forRole('reasoning');
    const sources = documents
      .map((d, i) => `[${i + 1}] ${d.source.title} (${d.source.url})\n${d.text}`)
      .join('\n\n');
    return collectText(
      provider.chat({
        messages: [
          {
            role: 'system',
            content:
              'You are a research analyst. Write an executive summary followed by a technical report. Cite sources inline as [n]. Be accurate and note uncertainty.',
          },
          { role: 'user', content: `Topic: ${topic}\n\nSources:\n${sources}` },
        ],
        ...(signal ? { signal } : {}),
      }) as AsyncIterable<ChatChunk>,
    );
  }
}
