import { ForgewrightError } from '@forgewright/shared';
import type {
  ChatChunk,
  ModelRole,
  ModelRouter,
  Plan,
  Planner,
  PlanNode,
} from '@forgewright/types';
import { z } from 'zod';

const planSchema = z.object({
  tasks: z
    .array(
      z.object({
        title: z.string().min(1),
        description: z.string().default(''),
        subtasks: z
          .array(z.object({ title: z.string().min(1), description: z.string().default('') }))
          .default([]),
      }),
    )
    .min(1),
});

export interface LlmPlannerOptions {
  readonly router: ModelRouter;
  readonly role?: ModelRole;
  readonly now?: () => number;
  readonly generateId?: () => string;
}

const SYSTEM = [
  'You are a senior engineer breaking a goal into an actionable hierarchical plan.',
  'Respond with ONLY JSON of the form:',
  '{"tasks":[{"title":"...","description":"...","subtasks":[{"title":"...","description":"..."}]}]}',
  'Keep it concise: 2-6 top-level tasks, each with 0-4 subtasks. No prose outside the JSON.',
].join('\n');

/** Extract the outermost JSON object from a possibly fenced/explained response. */
const extractJson = (text: string): string => {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? (fenced[1] as string) : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new ForgewrightError('INTERNAL', 'Planner response contained no JSON object');
  }
  return candidate.slice(start, end + 1);
};

/**
 * Hierarchical planner backed by an LLM. Produces a goal → tasks → subtasks tree
 * that the autonomous runner (or a human) can execute and verify.
 */
export class LlmPlanner implements Planner {
  private readonly router: ModelRouter;
  private readonly role: ModelRole;
  private readonly now: () => number;
  private readonly generateId: () => string;

  constructor(options: LlmPlannerOptions) {
    this.router = options.router;
    this.role = options.role ?? 'reasoning';
    this.now = options.now ?? (() => Date.now());
    this.generateId = options.generateId ?? (() => crypto.randomUUID());
  }

  async plan(goal: string, signal?: AbortSignal): Promise<Plan> {
    const provider = this.router.forRole(this.role);
    let text = '';
    const request = {
      messages: [
        { role: 'system' as const, content: SYSTEM },
        { role: 'user' as const, content: `Goal: ${goal}` },
      ],
      ...(signal ? { signal } : {}),
    };
    for await (const chunk of provider.chat(request) as AsyncIterable<ChatChunk>) {
      if (chunk.type === 'text') text += chunk.delta;
    }

    const parsed = planSchema.safeParse(JSON.parse(extractJson(text)));
    if (!parsed.success) {
      throw new ForgewrightError(
        'INTERNAL',
        `Planner produced an invalid plan: ${parsed.error.message}`,
      );
    }

    const children: PlanNode[] = parsed.data.tasks.map((task) => ({
      id: this.generateId(),
      title: task.title,
      description: task.description,
      status: 'pending',
      children: task.subtasks.map((sub) => ({
        id: this.generateId(),
        title: sub.title,
        description: sub.description,
        status: 'pending' as const,
        children: [],
      })),
    }));

    const root: PlanNode = {
      id: this.generateId(),
      title: goal,
      description: goal,
      status: 'pending',
      children,
    };

    return { id: this.generateId(), goal, root, createdAt: this.now() };
  }
}
