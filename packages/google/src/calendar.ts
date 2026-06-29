import type { GoogleOAuth } from './oauth.js';

export interface CalendarEvent {
  readonly id?: string;
  readonly summary: string;
  /** ISO 8601 start/end (dateTime). */
  readonly start: string;
  readonly end: string;
  readonly description?: string;
}

interface ApiEvent {
  readonly id?: string;
  readonly summary?: string;
  readonly description?: string;
  readonly start?: { dateTime?: string; date?: string };
  readonly end?: { dateTime?: string; date?: string };
}

/** Google Calendar API client: list and create events. */
export class CalendarClient {
  constructor(
    private readonly oauth: GoogleOAuth,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async authHeader(): Promise<Record<string, string>> {
    return { authorization: `Bearer ${await this.oauth.getAccessToken()}` };
  }

  /** List events in a time window (ISO strings), ordered by start time. */
  async listEvents(
    timeMin: string,
    timeMax: string,
    calendarId = 'primary',
  ): Promise<readonly CalendarEvent[]> {
    const url =
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events` +
      `?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}` +
      `&singleEvents=true&orderBy=startTime`;
    const response = await this.fetchImpl(url, { headers: await this.authHeader() });
    const data = (await response.json()) as { items?: ApiEvent[] };
    return (data.items ?? []).map((e) => ({
      ...(e.id ? { id: e.id } : {}),
      summary: e.summary ?? '(no title)',
      start: e.start?.dateTime ?? e.start?.date ?? '',
      end: e.end?.dateTime ?? e.end?.date ?? '',
      ...(e.description ? { description: e.description } : {}),
    }));
  }

  async createEvent(event: CalendarEvent, calendarId = 'primary'): Promise<{ id: string }> {
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
    const response = await this.fetchImpl(url, {
      method: 'POST',
      headers: { ...(await this.authHeader()), 'content-type': 'application/json' },
      body: JSON.stringify({
        summary: event.summary,
        ...(event.description ? { description: event.description } : {}),
        start: { dateTime: event.start },
        end: { dateTime: event.end },
      }),
    });
    const data = (await response.json()) as { id?: string };
    return { id: data.id ?? '' };
  }
}
