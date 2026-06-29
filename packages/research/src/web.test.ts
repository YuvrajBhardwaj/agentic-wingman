import { describe, expect, it } from 'vitest';

import { extractJsonLd, extractLinks, htmlToText, parseSitemap } from './web.js';

describe('web utilities', () => {
  it('strips HTML to readable text', () => {
    const html =
      '<html><head><style>x{}</style></head><body><h1>Title</h1><p>Hello &amp; welcome</p><script>bad()</script></body></html>';
    const text = htmlToText(html);
    expect(text).toContain('Title');
    expect(text).toContain('Hello & welcome');
    expect(text).not.toContain('bad()');
    expect(text).not.toContain('x{}');
  });

  it('extracts and absolutizes links', () => {
    const html = '<a href="/about">a</a><a href="https://other.com/x">b</a><a href="#frag">c</a>';
    const links = extractLinks(html, 'https://example.com/page');
    expect(links).toContain('https://example.com/about');
    expect(links).toContain('https://other.com/x');
    expect(links.some((l) => l.includes('#frag'))).toBe(false);
  });

  it('extracts JSON-LD structured data', () => {
    const html = '<script type="application/ld+json">{"@type":"Article","name":"X"}</script>';
    const data = extractJsonLd(html) as { name?: string }[];
    expect(data[0]?.name).toBe('X');
  });

  it('parses sitemap locations', () => {
    const xml =
      '<urlset><url><loc>https://a.com/1</loc></url><url><loc>https://a.com/2</loc></url></urlset>';
    expect(parseSitemap(xml)).toEqual(['https://a.com/1', 'https://a.com/2']);
  });
});
