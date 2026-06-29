import type { Fetcher } from './fetcher.js';
import { extractLinks, htmlToText, sameHost } from './web.js';

export interface CrawlOptions {
  readonly maxPages?: number;
  readonly sameHostOnly?: boolean;
  readonly signal?: AbortSignal;
}

export interface CrawledPage {
  readonly url: string;
  readonly title?: string;
  readonly text: string;
  readonly links: readonly string[];
}

const extractTitle = (html: string): string | undefined => {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return match ? match[1]?.trim() : undefined;
};

/**
 * Breadth-first multi-page crawler. JS rendering, login, infinite scroll, and
 * CAPTCHA handoff are provided by a Playwright-backed {@link Fetcher}; the crawl
 * logic itself is transport-agnostic.
 */
export class Crawler {
  constructor(private readonly fetcher: Fetcher) {}

  async crawl(start: string, options: CrawlOptions = {}): Promise<readonly CrawledPage[]> {
    const maxPages = options.maxPages ?? 10;
    const sameHostOnly = options.sameHostOnly ?? true;
    const visited = new Set<string>();
    const queue: string[] = [start];
    const pages: CrawledPage[] = [];

    while (queue.length > 0 && pages.length < maxPages) {
      if (options.signal?.aborted) break;
      const url = queue.shift() as string;
      if (visited.has(url)) continue;
      visited.add(url);

      let body: string;
      try {
        const page = await this.fetcher.fetch(url, options.signal);
        body = page.body;
      } catch {
        continue;
      }

      const links = extractLinks(body, url);
      const title = extractTitle(body);
      pages.push({ url, ...(title ? { title } : {}), text: htmlToText(body), links });

      for (const link of links) {
        if (visited.has(link) || queue.includes(link)) continue;
        if (sameHostOnly && !sameHost(start, link)) continue;
        queue.push(link);
      }
    }

    return pages;
  }
}
