import { ForgewrightError } from '@forgewright/shared';
import type { ChatChunk, ModelRouter } from '@forgewright/types';

import type { RoleDefinition } from './roles.js';
import { roleMap } from './roles.js';

export interface AgentContribution {
  readonly role: string;
  readonly title: string;
  readonly content: string;
}

export interface CollaborationResult {
  readonly goal: string;
  readonly contributions: readonly AgentContribution[];
  readonly synthesis: string;
}

/** Merges the team's contributions into a final answer. */
export type Synthesizer = (
  goal: string,
  contributions: readonly AgentContribution[],
) => Promise<string>;

export interface CollaborateOptions {
  /** 'parallel' (independent) or 'sequential' (each sees prior contributions). */
  readonly mode?: 'parallel' | 'sequential';
  readonly synthesize?: Synthesizer;
  readonly signal?: AbortSignal;
}

const collect = async (
  router: ModelRouter,
  role: RoleDefinition,
  goal: string,
  priorContext: string,
  signal?: AbortSignal,
): Promise<AgentContribution> => {
  const provider = router.forRole(role.modelRole);
  const userContent = priorContext
    ? `Goal: ${goal}\n\nWhat the team has said so far:\n${priorContext}`
    : `Goal: ${goal}`;
  let text = '';
  const request = {
    messages: [
      { role: 'system' as const, content: role.systemPrompt },
      { role: 'user' as const, content: userContent },
    ],
    ...(signal ? { signal } : {}),
  };
  for await (const chunk of provider.chat(request) as AsyncIterable<ChatChunk>) {
    if (chunk.type === 'text') text += chunk.delta;
  }
  return { role: role.id, title: role.title, content: text.trim() };
};

const renderContributions = (contributions: readonly AgentContribution[]): string =>
  contributions.map((c) => `## ${c.title}\n${c.content}`).join('\n\n');

/** Default synthesizer: asks the reasoning model to merge contributions. */
export const llmSynthesizer =
  (router: ModelRouter): Synthesizer =>
  async (goal, contributions) => {
    const provider = router.forRole('reasoning');
    let text = '';
    const stream = provider.chat({
      messages: [
        {
          role: 'system',
          content:
            "You are the lead synthesizing your team's contributions into one clear, actionable result. Resolve conflicts, remove redundancy, and present a single coherent plan.",
        },
        {
          role: 'user',
          content: `Goal: ${goal}\n\nTeam contributions:\n${renderContributions(contributions)}`,
        },
      ],
    }) as AsyncIterable<ChatChunk>;
    for await (const chunk of stream) {
      if (chunk.type === 'text') text += chunk.delta;
    }
    return text.trim();
  };

/**
 * Coordinates specialized role-agents on a shared goal and merges their
 * structured contributions. Agents communicate through the structured
 * {@link AgentContribution} records the coordinator collects and renders.
 */
export class AgentCoordinator {
  private readonly roles: Map<string, RoleDefinition>;

  constructor(
    private readonly router: ModelRouter,
    roles?: Map<string, RoleDefinition>,
  ) {
    this.roles = roles ?? roleMap();
  }

  availableRoles(): readonly string[] {
    return [...this.roles.keys()];
  }

  async collaborate(
    goal: string,
    agentIds: readonly string[],
    options: CollaborateOptions = {},
  ): Promise<CollaborationResult> {
    if (agentIds.length === 0) {
      throw new ForgewrightError('CONFIG_INVALID', 'collaborate requires at least one agent');
    }
    const defs = agentIds.map((id) => {
      const def = this.roles.get(id);
      if (!def) throw new ForgewrightError('NOT_FOUND', `Unknown agent role "${id}"`, { id });
      return def;
    });

    const contributions: AgentContribution[] = [];
    if (options.mode === 'sequential') {
      for (const def of defs) {
        const context = renderContributions(contributions);
        contributions.push(await collect(this.router, def, goal, context, options.signal));
      }
    } else {
      const results = await Promise.all(
        defs.map((def) => collect(this.router, def, goal, '', options.signal)),
      );
      contributions.push(...results);
    }

    const synthesize = options.synthesize ?? llmSynthesizer(this.router);
    const synthesis = await synthesize(goal, contributions);
    return { goal, contributions, synthesis };
  }
}
