import type { ChatMessage } from '@forgewright/types';

/**
 * In-memory conversation history keyed by conversation id, so a session has
 * multi-turn continuity (each new run sees the prior user/assistant turns).
 * Swap for a durable store (SQLite/Postgres) for persistence across restarts.
 */
export class ConversationStore {
  private readonly conversations = new Map<string, ChatMessage[]>();

  constructor(private readonly maxTurns = 24) {}

  history(conversationId: string): readonly ChatMessage[] {
    return this.conversations.get(conversationId) ?? [];
  }

  /** Append a completed user→assistant exchange, trimming to the most recent turns. */
  append(conversationId: string, userInput: string, assistantText: string): void {
    const existing = this.conversations.get(conversationId) ?? [];
    existing.push({ role: 'user', content: userInput });
    if (assistantText.trim() !== '') {
      existing.push({ role: 'assistant', content: assistantText });
    }
    // Keep the last N messages so context stays bounded.
    const trimmed = existing.slice(-this.maxTurns * 2);
    this.conversations.set(conversationId, trimmed);
  }

  clear(conversationId: string): void {
    this.conversations.delete(conversationId);
  }
}
