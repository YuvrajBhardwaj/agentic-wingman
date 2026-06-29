import type { ModelRole } from '@forgewright/types';

export interface RoleDefinition {
  readonly id: string;
  readonly title: string;
  readonly systemPrompt: string;
  /** Which routed model tier this role prefers. */
  readonly modelRole: ModelRole;
}

const role = (
  id: string,
  title: string,
  focus: string,
  modelRole: ModelRole = 'reasoning',
): RoleDefinition => ({
  id,
  title,
  modelRole,
  systemPrompt: `You are the ${title} on a collaborating engineering team. ${focus} Be concise and concrete. Output only your contribution; another agent will synthesize the team's work.`,
});

/** Built-in specialized agents. Extend by registering more {@link RoleDefinition}s. */
export const BUILTIN_ROLES: readonly RoleDefinition[] = [
  role(
    'planner',
    'Planner',
    'Break the goal into an ordered set of concrete tasks and call out risks and dependencies.',
  ),
  role(
    'researcher',
    'Researcher',
    'Gather the facts, prior art, and constraints needed to do this well; cite what you rely on.',
  ),
  role(
    'software-engineer',
    'Software Engineer',
    'Propose the implementation approach, key modules, and the diff-level plan.',
    'coding',
  ),
  role(
    'ui-engineer',
    'UI Engineer',
    'Design the user-facing surface: components, states, and interactions.',
    'coding',
  ),
  role(
    'ai-engineer',
    'AI Engineer',
    'Design any model/prompt/retrieval aspects and how to evaluate them.',
  ),
  role(
    'devops-engineer',
    'DevOps Engineer',
    'Cover build, deploy, CI, observability, and rollout/rollback.',
  ),
  role(
    'reviewer',
    'Reviewer',
    'Critique the proposed approach: correctness, edge cases, and simpler alternatives.',
  ),
  role(
    'tester',
    'Tester',
    'Define the test plan: cases, fixtures, and how success is verified.',
    'verification',
  ),
  role(
    'qa-engineer',
    'QA Engineer',
    'Find failure modes and acceptance criteria a user would care about.',
    'verification',
  ),
  role(
    'security-auditor',
    'Security Auditor',
    'Identify security and privacy risks and required mitigations.',
  ),
  role(
    'data-analyst',
    'Data Analyst',
    'Identify the metrics, data needed, and how to measure impact.',
  ),
  role(
    'product-manager',
    'Product Manager',
    'Clarify the user value, scope, and what to cut for an MVP.',
  ),
  role(
    'technical-writer',
    'Technical Writer',
    'Outline the docs/changelog needed and write key user-facing copy.',
  ),
  role(
    'research-analyst',
    'Research Analyst',
    'Synthesize external sources into an executive summary with citations.',
  ),
];

export const roleMap = (
  roles: readonly RoleDefinition[] = BUILTIN_ROLES,
): Map<string, RoleDefinition> => new Map(roles.map((r) => [r.id, r]));
