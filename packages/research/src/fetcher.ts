export interface FetchedPage {
  readonly url: string;
  readonly status: number;
  readonly contentType?: string;
  readonly body: string;
}

/** Fetches a URL's content. Implemented over `fetch` or a browser driver. */
export interface Fetcher {
  fetch(url: string, signal?: AbortSignal): Promise<FetchedPage>;
}

/** Plain HTTP fetcher (no JS rendering). Inject a Playwright driver for SPAs. */
export class HttpFetcher implements Fetcher {
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}

  async fetch(url: string, signal?: AbortSignal): Promise<FetchedPage> {
    const response = await this.fetchImpl(url, signal ? { signal } : {});
    const contentType = response.headers.get('content-type');
    const body = await response.text();
    return {
      url,
      status: response.status,
      ...(contentType ? { contentType } : {}),
      body,
    };
  }
}
