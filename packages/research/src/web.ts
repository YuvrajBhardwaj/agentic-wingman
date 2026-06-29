const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
};

const decodeEntities = (text: string): string =>
  text.replace(/&[a-z#0-9]+;/gi, (entity) => ENTITIES[entity] ?? entity);

/** Strip HTML to readable plain text (drops script/style, collapses whitespace). */
export const htmlToText = (html: string): string => {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const withBreaks = withoutScripts
    .replace(/<\/(p|div|h[1-6]|li|tr|br)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n');
  const text = withBreaks.replace(/<[^>]+>/g, ' ');
  return decodeEntities(text)
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .trim();
};

/** Extract absolute links from HTML, resolved against `baseUrl`. */
export const extractLinks = (html: string, baseUrl: string): string[] => {
  const links = new Set<string>();
  const regex = /href\s*=\s*["']([^"']+)["']/gi;
  for (let m = regex.exec(html); m !== null; m = regex.exec(html)) {
    const href = m[1] as string;
    if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('javascript:'))
      continue;
    try {
      links.add(new URL(href, baseUrl).toString());
    } catch {
      // ignore malformed URLs
    }
  }
  return [...links];
};

/** Parse JSON-LD structured-data blocks from HTML. */
export const extractJsonLd = (html: string): unknown[] => {
  const out: unknown[] = [];
  const regex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (let m = regex.exec(html); m !== null; m = regex.exec(html)) {
    try {
      out.push(JSON.parse((m[1] as string).trim()));
    } catch {
      // ignore invalid JSON-LD
    }
  }
  return out;
};

/** Extract `<loc>` URLs from a sitemap.xml document. */
export const parseSitemap = (xml: string): string[] => {
  const urls: string[] = [];
  const regex = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  for (let m = regex.exec(xml); m !== null; m = regex.exec(xml)) {
    urls.push((m[1] as string).trim());
  }
  return urls;
};

export const sameHost = (a: string, b: string): boolean => {
  try {
    return new URL(a).host === new URL(b).host;
  } catch {
    return false;
  }
};
