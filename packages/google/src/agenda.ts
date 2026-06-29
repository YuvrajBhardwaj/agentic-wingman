import type { CalendarEvent } from './calendar.js';

const formatTime = (iso: string): string => {
  const match = /T(\d{2}:\d{2})/.exec(iso);
  if (match) return match[1] as string;
  return iso || 'all-day';
};

/**
 * Build a plain-text daily agenda from calendar events and an unread-email
 * count — the kind of briefing a scheduled job can send to the user each
 * morning (e.g. via Telegram/WhatsApp/email).
 */
export const buildDailyAgenda = (
  events: readonly CalendarEvent[],
  unreadEmails: number,
): string => {
  const lines: string[] = [
    `You have ${events.length} event(s) today and ${unreadEmails} unread email(s).`,
  ];
  if (events.length === 0) {
    lines.push('No events scheduled — a clear day.');
  } else {
    for (const event of events) {
      lines.push(`• ${formatTime(event.start)} — ${event.summary}`);
    }
  }
  return lines.join('\n');
};
