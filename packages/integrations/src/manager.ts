import { ForgewrightError } from '@forgewright/shared';

import type {
  IncomingMessage,
  Integration,
  OutgoingFile,
  OutgoingMessage,
  SendResult,
} from './types.js';

/** Approval gate for outgoing actions (wire to the permission broker). */
export type SendGate = (integrationId: string, summary: string, target: string) => Promise<boolean>;

export interface IntegrationSummary {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly capabilities: readonly string[];
}

/**
 * Registers integrations, gates outgoing actions through an approval callback,
 * and provides deduplicated background sync of incoming messages.
 */
export class IntegrationManager {
  private readonly integrations = new Map<string, Integration>();
  private readonly seen = new Map<string, Set<string>>();

  constructor(private readonly gate?: SendGate) {}

  register(integration: Integration): void {
    this.integrations.set(integration.id, integration);
  }

  get(id: string): Integration | undefined {
    return this.integrations.get(id);
  }

  list(): readonly IntegrationSummary[] {
    return [...this.integrations.values()].map((i) => ({
      id: i.id,
      name: i.name,
      kind: i.kind,
      capabilities: i.capabilities,
    }));
  }

  private require(id: string): Integration {
    const integration = this.integrations.get(id);
    if (!integration)
      throw new ForgewrightError('NOT_FOUND', `Unknown integration "${id}"`, { id });
    return integration;
  }

  async sendMessage(
    id: string,
    message: OutgoingMessage,
    signal?: AbortSignal,
  ): Promise<SendResult> {
    const integration = this.require(id);
    if (!integration.sendMessage) {
      throw new ForgewrightError('PERMISSION_DENIED', `"${id}" cannot send messages`, { id });
    }
    if (this.gate && !(await this.gate(id, message.text, message.target))) {
      return { ok: false, error: 'send not approved' };
    }
    return integration.sendMessage(message, signal);
  }

  async sendFile(id: string, file: OutgoingFile, signal?: AbortSignal): Promise<SendResult> {
    const integration = this.require(id);
    if (!integration.sendFile) {
      throw new ForgewrightError('PERMISSION_DENIED', `"${id}" cannot send files`, { id });
    }
    if (this.gate && !(await this.gate(id, `file: ${file.filename}`, file.target))) {
      return { ok: false, error: 'send not approved' };
    }
    return integration.sendFile(file, signal);
  }

  /** Fetch messages and return only those not seen on a previous sync. */
  async sync(id: string, limit = 20, signal?: AbortSignal): Promise<readonly IncomingMessage[]> {
    const integration = this.require(id);
    if (!integration.readMessages) return [];
    const messages = await integration.readMessages(limit, signal);
    const seen = this.seen.get(id) ?? new Set<string>();
    const fresh = messages.filter((m) => !seen.has(m.id));
    for (const m of messages) seen.add(m.id);
    this.seen.set(id, seen);
    return fresh;
  }
}
