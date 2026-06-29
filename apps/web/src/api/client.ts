import type { Memory, MemoryKind } from '@forgewright/types';

import { authHeader } from './auth.ts';
import type { AppEvent } from './events.ts';
import { parseEventStream } from './sse.ts';

export interface CurrentUser {
  readonly user: { id: string; email: string; name?: string } | null;
  readonly connections: { google: boolean };
}

export interface IntegrationInfo {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly capabilities: readonly string[];
}

export interface RunAgentParams {
  readonly input: string;
  readonly conversationId?: string;
  readonly focusPaths?: readonly string[];
  readonly maxSteps?: number;
  readonly signal?: AbortSignal;
  readonly onEvent: (event: AppEvent) => void;
}

export interface NewMemory {
  readonly kind: MemoryKind;
  readonly content: string;
  readonly tags?: readonly string[];
  readonly importance?: number;
}

export interface ForgewrightClient {
  runAgent(params: RunAgentParams): Promise<void>;
  resolveApproval(runId: string, approvalId: string, approved: boolean): Promise<void>;
  listMemories(): Promise<readonly Memory[]>;
  searchMemories(query: string, limit?: number): Promise<readonly Memory[]>;
  addMemory(memory: NewMemory): Promise<Memory>;
  forgetMemory(id: string): Promise<void>;
  authProviders(): Promise<{ google: boolean }>;
  me(): Promise<CurrentUser>;
  listIntegrations(): Promise<readonly IntegrationInfo[]>;
  logout(): Promise<void>;
}

/** Create an API client. `fetchImpl` is injectable for tests. */
export const createClient = (fetchImpl: typeof fetch = fetch): ForgewrightClient => {
  const json = async <T>(response: Response): Promise<T> => {
    if (!response.ok) throw new Error(`Request failed (${response.status})`);
    return (await response.json()) as T;
  };

  return {
    async runAgent(params) {
      const body: Record<string, unknown> = { input: params.input };
      if (params.conversationId) body.conversationId = params.conversationId;
      if (params.focusPaths) body.focusPaths = params.focusPaths;
      if (params.maxSteps !== undefined) body.maxSteps = params.maxSteps;

      const init: RequestInit = {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...authHeader() },
        body: JSON.stringify(body),
      };
      if (params.signal) init.signal = params.signal;

      const response = await fetchImpl('/agent/runs', init);
      if (!response.ok || !response.body) {
        throw new Error(`Agent run failed (${response.status})`);
      }
      for await (const event of parseEventStream(response.body)) {
        params.onEvent(event);
      }
    },

    async resolveApproval(runId, approvalId, approved) {
      await fetchImpl(`/agent/runs/${runId}/approvals/${approvalId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ approved }),
      });
    },

    async listMemories() {
      const data = await json<{ memories: Memory[] }>(await fetchImpl('/memory'));
      return data.memories;
    },

    async searchMemories(query, limit = 5) {
      const url = `/memory/search?q=${encodeURIComponent(query)}&limit=${limit}`;
      const data = await json<{ results: Memory[] }>(await fetchImpl(url));
      return data.results;
    },

    async addMemory(memory) {
      return json<Memory>(
        await fetchImpl('/memory', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(memory),
        }),
      );
    },

    async forgetMemory(id) {
      await fetchImpl(`/memory/${id}`, { method: 'DELETE' });
    },

    async authProviders() {
      try {
        return await json<{ google: boolean }>(await fetchImpl('/auth/providers'));
      } catch {
        return { google: false };
      }
    },

    async me() {
      const response = await fetchImpl('/me', { headers: authHeader() });
      if (response.status === 401) return { user: null, connections: { google: false } };
      return json<CurrentUser>(response);
    },

    async listIntegrations() {
      const data = await json<{ integrations: IntegrationInfo[] }>(
        await fetchImpl('/integrations'),
      );
      return data.integrations;
    },

    async logout() {
      await fetchImpl('/auth/logout', { method: 'POST', headers: authHeader() });
    },
  };
};
