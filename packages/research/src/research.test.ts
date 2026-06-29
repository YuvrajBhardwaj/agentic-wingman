import { DefaultModelRouter, FakeLlmProvider } from '@forgewright/llm';
import type { ModelRole } from '@forgewright/types';
import { describe, expect, it } from 'vitest';

import { Crawler } from './crawler.js';
import type { FetchedPage, Fetcher } from './fetcher.js';
import { ResearchAgent, type SearchProvider, type SearchResult } from './research-agent.js';

const ROUTES: Record<ModelRole, string> = {
  cheap: 'fake',
  coding: 'fake',
  reasoning: 'fake',
  verification: 'fake',
};

const pages: Record<string, string> = {
  'https://site.com/':
    '<title>Home</title><a href="/a">A</a><a href="/b">B</a><a href="https://other.com/x">ext</a>',
  'https://site.com/a': '<title>A</title><p>Page A content</p><a href="/b">B</a>',
  'https://site.com/b': '<title>B</title><p>Page B content</p>',
};

const fakeFetcher: Fetcher = {
  async fetch(url): Promise<FetchedPage> {
    const body = pages[url];
    if (body === undefined) throw new Error(`404 ${url}`);
    return { url, status: 200, body, contentType: 'text/html' };
  },
};

describe('Crawler', () => {
  it('crawls same-host pages breadth-first up to the limit', async () => {
    const crawler = new Crawler(fakeFetcher);
    const result = await crawler.crawl('https://site.com/', { maxPages: 3 });
    const urls = result.map((p) => p.url);
    expect(urls).toEqual(['https://site.com/', 'https://site.com/a', 'https://site.com/b']);
    // External host is filtered out by default.
    expect(urls.some((u) => u.includes('other.com'))).toBe(false);
    expect(result[1]?.title).toBe('A');
  });

  it('respects the page limit', async () => {
    const crawler = new Crawler(fakeFetcher);
    const result = await crawler.crawl('https://site.com/', { maxPages: 1 });
    expect(result).toHaveLength(1);
  });
});

describe('ResearchAgent', () => {
  const searchProvider: SearchProvider = {
    async search(): Promise<readonly SearchResult[]> {
      return [
        { title: 'Home', url: 'https://site.com/', snippet: 'home' },
        { title: 'A', url: 'https://site.com/a' },
      ];
    },
  };

  it('plans queries, reads sources, and produces a cited report', async () => {
    const provider = new FakeLlmProvider(
      [
        [
          { type: 'text', delta: '["topic basics", "topic advanced"]' },
          { type: 'done', finishReason: 'stop' },
        ],
        [
          {
            type: 'text',
            delta: 'Executive summary here.\n\nDetailed findings citing [1] and [2].',
          },
          { type: 'done', finishReason: 'stop' },
        ],
      ],
      'fake',
    );
    const router = new DefaultModelRouter([provider], ROUTES);
    const agent = new ResearchAgent(router, searchProvider, fakeFetcher);

    const report = await agent.research('a topic', { maxSources: 2 });
    expect(report.sources).toEqual(['https://site.com/', 'https://site.com/a']);
    expect(report.citations).toHaveLength(2);
    expect(report.executiveSummary).toBe('Executive summary here.');
    expect(report.report).toContain('[1]');
    expect(report.confidence).toBeGreaterThan(0);
    expect(report.confidence).toBeLessThanOrEqual(1);
  });
});
