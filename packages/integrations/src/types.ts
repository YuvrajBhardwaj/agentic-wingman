export type IntegrationKind = 'communication' | 'document' | 'webhook';

export type IntegrationCapability =
  'send-message' | 'send-file' | 'read-messages' | 'search-messages';

export interface OutgoingMessage {
  /** Channel, chat id, address, or recipient — interpreted by the integration. */
  readonly target: string;
  readonly text: string;
}

export interface OutgoingFile {
  readonly target: string;
  readonly filename: string;
  readonly bytes: Buffer;
  readonly caption?: string;
}

export interface IncomingMessage {
  readonly id: string;
  readonly from: string;
  readonly text: string;
  readonly timestamp: number;
}

export interface SendResult {
  readonly ok: boolean;
  readonly id?: string;
  readonly error?: string;
}

/**
 * An external service plugin. Each integration implements the subset of methods
 * its `capabilities` advertise. Authentication is the integration's concern
 * (constructed with its credentials); the manager handles permission gating and
 * background sync.
 */
export interface Integration {
  readonly id: string;
  readonly name: string;
  readonly kind: IntegrationKind;
  readonly capabilities: readonly IntegrationCapability[];
  sendMessage?(message: OutgoingMessage, signal?: AbortSignal): Promise<SendResult>;
  sendFile?(file: OutgoingFile, signal?: AbortSignal): Promise<SendResult>;
  readMessages?(limit: number, signal?: AbortSignal): Promise<readonly IncomingMessage[]>;
  searchMessages?(
    query: string,
    limit: number,
    signal?: AbortSignal,
  ): Promise<readonly IncomingMessage[]>;
}
